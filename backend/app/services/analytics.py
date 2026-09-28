"""KPIs, alert generation, incident feeds and historical analytics."""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Dict, List, Optional

from ..data import EVENT_LABELS, EVENT_TYPES, HAZARDS, band_for
from .risk import (
    PLAYBOOK,
    formation_hazard_priors,
    offset_risk_load,
    predict,
    sequence_analogues,
    well_risk_summary,
)

#: Probability (% at the bit) above which an alert is raised.
ALERT_THRESHOLD = 38.0
#: Live probability above which an alert escalates to warning status.
CRITICAL_THRESHOLD = 68.0
#: Live probability above which an alert is ranked HIGH severity.
HIGH_THRESHOLD = 55.0


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def nearby_wells(corpus, well: dict, radius_km: float = 15.0, limit: int = 40) -> List[dict]:
    rows = []
    for other in corpus.wells:
        if other["id"] == well["id"]:
            continue
        distance = _haversine(well["lat"], well["lon"], other["lat"], other["lon"])
        if distance > radius_km:
            continue
        rows.append(
            {
                "id": other["id"],
                "name": other["name"],
                "field": other["field"],
                "operator": other["operator"],
                "status": other["status"],
                "basin": other["basin"],
                "lat": other["lat"],
                "lon": other["lon"],
                "formation": other["formation"],
                "totalDepthMd": other["totalDepthMd"],
                "currentDepthMd": other["currentDepthMd"],
                "riskScore": other["riskScore"],
                "riskBand": other["riskBand"],
                "eventCount": other["eventCount"],
                "criticalEventCount": other["criticalEventCount"],
                "distanceKm": round(distance, 2),
                "spudDate": other["spudDate"],
                "completionDate": other["completionDate"],
                "mudWeight": other["mudWeight"],
                "topEvents": Counter(e["type"] for e in other["events"]).most_common(3),
            }
        )
    rows.sort(key=lambda row: row["distanceKm"])
    return rows[:limit]


def generate_alerts(corpus, limit: int = 60) -> List[dict]:
    """Evaluate every live well and raise ranked, explained alerts."""
    alerts: List[dict] = []
    for well in corpus.active_wells:
        for hazard in HAZARDS:
            result = predict(well, corpus, hazard=hazard, depth=well["currentDepthMd"])
            if result["probabilityPct"] < ALERT_THRESHOLD:
                continue

            incidents = result["supportingIncidents"]
            nearest = incidents[0] if incidents else None
            severity = (
                "CRITICAL"
                if result["probabilityPct"] >= CRITICAL_THRESHOLD and result["confidence"] >= 0.7
                else "HIGH"
                if result["probabilityPct"] >= HIGH_THRESHOLD
                else "MEDIUM"
            )
            if result["band"] == "CRITICAL" and result["probabilityPct"] >= CRITICAL_THRESHOLD:
                severity = "CRITICAL"

            alerts.append(
                {
                    "id": f"ALT-{well['id']}-{hazard[:4]}",
                    "wellId": well["id"],
                    "wellName": well["name"],
                    "field": well["field"],
                    "basin": well["basin"],
                    "operator": well["operator"],
                    "lat": well["lat"],
                    "lon": well["lon"],
                    "hazard": hazard,
                    "label": result["label"],
                    "severity": severity,
                    "probabilityPct": result["probabilityPct"],
                    "confidencePct": result["confidencePct"],
                    "band": result["band"],
                    "depth": result["depth"],
                    "formation": result["formation"],
                    "patternMatch": (
                        {
                            "wellId": nearest["wellId"],
                            "wellName": nearest["wellName"],
                            "depth": nearest["depth"],
                            "severity": nearest["severity"],
                            "date": nearest["date"],
                            "mitigation": nearest["mitigation"],
                            "outcome": nearest["outcome"],
                            "depthDelta": nearest["depthDelta"],
                        }
                        if nearest
                        else None
                ),
                    "recommendedAction": result["recommendedActions"][0],
                    "playbook": result["recommendedActions"],
                    "drivers": result["topDrivers"],
                    "supportingIncidents": incidents[:3],
                    "analogues": sequence_analogues(corpus, well, hazard),
                    "title": f"{result['label']} risk",
                }
            )
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    alerts.sort(key=lambda row: (order[row["severity"]], -row["probabilityPct"]))
    return alerts[:limit]


def kpis(corpus, focus_well_id: Optional[str] = None) -> dict:
    """KPI cards for Mission Control, centred on a focus well."""
    well = (
        corpus.wells_by_id.get(focus_well_id)
        if focus_well_id
        else corpus.primary_well()
    ) or corpus.primary_well()

    nearby = nearby_wells(corpus, well, radius_km=15.0)
    summary = well_risk_summary(corpus, well)
    from .similarity import similar_wells

    analogues = similar_wells(corpus, well, limit=10)
    strong = [row for row in analogues if row["similarity"] >= 82.0]

    nearby_events = sum(row["eventCount"] for row in nearby)
    formation_risks = sum(
        1
        for prediction in summary["predictions"]
        if prediction["band"] in {"HIGH", "CRITICAL", "MODERATE"}
    )
    alerts = generate_alerts(corpus)
    well_alerts = [a for a in alerts if a["wellId"] == well["id"]]

    # Expected incidents over the next 500 m of hole.
    expected = 0.0
    for prediction in summary["predictions"]:
        expected += prediction["probabilityPct"] / 100.0 * 1.35
    predicted_incidents = round(expected, 1)

    recommendations = len(summary["actions"]) + len(strong)

    return {
        "focusWell": {
            "id": well["id"],
            "name": well["name"],
            "field": well["field"],
            "basin": well["basin"],
            "operator": well["operator"],
            "status": well["status"],
            "formation": well["formation"],
            "lat": well["lat"],
            "lon": well["lon"],
            "totalDepthMd": well["totalDepthMd"],
            "currentDepthMd": well["currentDepthMd"],
            "riskBand": well["riskBand"],
            "riskScore": well["riskScore"],
        },
        "cards": [
            {
                "key": "activeDepth",
                "label": "Active Well Depth",
                "value": well["currentDepthMd"],
                "unit": "m",
                "sub": f"TD target {well['totalDepthMd']:.0f} m",
                "tone": "cyan",
                "progress": round(100.0 * well["currentDepthMd"] / max(1.0, well["totalDepthMd"]), 1),
            },
            {
                "key": "nearbyWells",
                "label": "Nearby Wells",
                "value": len(nearby),
                "unit": "within 15 km",
                "sub": f"{sum(1 for r in nearby if r['status'] == 'ACTIVE')} currently drilling",
                "tone": "blue",
            },
            {
                "key": "similarWells",
                "label": "Similar Wells Found",
                "value": len(strong),
                "unit": "≥ 82% match",
                "sub": f"best match {analogues[0]['name']} · {analogues[0]['similarity']:.0f}%" if analogues else "no analogues",
                "tone": "violet",
            },
            {
                "key": "historicalEvents",
                "label": "Historical Events",
                "value": nearby_events,
                "unit": "in local offsets",
                "sub": f"{sum(r['criticalEventCount'] for r in nearby)} critical severity",
                "tone": "orange",
            },
            {
                "key": "formationRisks",
                "label": "Formation Risks",
                "value": formation_risks,
                "unit": "of 6 tracked hazards",
                "sub": f"worst: {summary['worst']['label']} · {summary['worst']['probabilityPct']:.0f}%",
                "tone": "amber",
            },
            {
                "key": "activeAlerts",
                "label": "Active Alerts",
                "value": len(well_alerts),
                "unit": "on this well",
                "sub": f"{sum(1 for a in alerts if a['severity'] == 'CRITICAL')} critical fleet-wide",
                "tone": "red",
            },
            {
                "key": "predictedIncidents",
                "label": "Predicted Incidents",
                "value": predicted_incidents,
                "unit": "next 500 m",
                "sub": f"composite {summary['composite']:.0f}% · {summary['band']}",
                "tone": "orange",
            },
            {
                "key": "recommendations",
                "label": "AI Recommendations",
                "value": recommendations,
                "unit": "actions ready",
                "sub": "from the offset-well evidence base",
                "tone": "green",
            },
        ],
        "riskSummary": summary,
        "alerts": well_alerts,
        "nearby": nearby[:12],
        "analogues": analogues[:6],
    }


def incident_feed(
    corpus,
    *,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    formation: Optional[str] = None,
    basin: Optional[str] = None,
    query: Optional[str] = None,
    sort: str = "severity",
    limit: int = 60,
) -> List[dict]:
    rows: List[dict] = []
    for event in corpus.events:
        well = corpus.wells_by_id[event["wellId"]]
        if event_type and event["type"] != event_type:
            continue
        if severity and event["severity"] != severity:
            continue
        if formation and event["formation"] != formation:
            continue
        if basin and well["basin"] != basin:
            continue
        if query:
            haystack = f"{event['id']} {well['name']} {event['formation']} {event['label']} {event['mitigation']}".lower()
            if query.lower() not in haystack:
                continue
        rows.append(
            {
                "id": event["id"],
                "wellId": well["id"],
                "wellName": well["name"],
                "field": well["field"],
                "basin": well["basin"],
                "operator": well["operator"],
                "lat": well["lat"],
                "lon": well["lon"],
                "type": event["type"],
                "label": event["label"],
                "formation": event["formation"],
                "depth": event["depth"],
                "severity": event["severity"],
                "date": event["date"],
                "nptHours": event["nptHours"],
                "costUsd": event["costUsd"],
                "mitigation": event["mitigation"],
                "outcome": event["outcome"],
                "insight": event["insight"],
                "samples": len(event["replay"]["samples"]),
            }
        )

    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    if sort == "depth":
        rows.sort(key=lambda row: row["depth"], reverse=True)
    elif sort == "recent":
        rows.sort(key=lambda row: row["date"], reverse=True)
    elif sort == "cost":
        rows.sort(key=lambda row: row["costUsd"], reverse=True)
    else:
        rows.sort(key=lambda row: (severity_order[row["severity"]], -row["depth"]))
    return rows[:limit]


def analytics_overview(corpus) -> dict:
    """Every chart the Historical Analytics workspace needs, in one payload."""
    events = corpus.events
    total_events = len(events) or 1

    hazard_frequency = []
    for hazard in EVENT_TYPES:
        subset = [e for e in events if e["type"] == hazard]
        if not subset:
            continue
        hazard_frequency.append(
            {
                "hazard": hazard,
                "label": EVENT_LABELS[hazard],
                "count": len(subset),
                "share": round(100.0 * len(subset) / total_events, 1),
                "nptHours": round(sum(e["nptHours"] for e in subset), 1),
                "costUsd": round(sum(e["costUsd"] for e in subset), 0),
                "avgDepth": round(sum(e["depth"] for e in subset) / len(subset), 1),
                "criticalCount": sum(1 for e in subset if e["severity"] == "CRITICAL"),
            }
        )
    hazard_frequency.sort(key=lambda row: row["count"], reverse=True)

    by_formation: Dict[str, Counter] = defaultdict(Counter)
    formation_meta: Dict[str, dict] = {}
    for event in events:
        by_formation[event["formation"]][event["type"]] += 1
    for well in corpus.wells:
        for entry in well["formations"]:
            formation_meta.setdefault(
                entry["name"],
                {
                    "basin": well["basin"],
                    "poreEmw": entry["poreEmw"],
                    "fracEmw": entry["fracEmw"],
                    "reservoir": entry["reservoir"],
                    "lithology": entry["lithology"],
                },
            )

    incidents_by_formation = []
    for formation, counter in by_formation.items():
        total = sum(counter.values())
        meta = formation_meta.get(formation, {})
        incidents_by_formation.append(
            {
                "formation": formation,
                "basin": meta.get("basin", ""),
                "reservoir": meta.get("reservoir", ""),
                "total": total,
                "band": band_for(min(100.0, total * 1.4)),
                "MUDFLOSS": counter.get("MUDFLOSS", 0),
                "KICK": counter.get("KICK", 0),
                "OVERPRESSURE": counter.get("OVERPRESSURE", 0),
                "TORQUE_SPIKE": counter.get("TORQUE_SPIKE", 0),
                "STUCK_PIPE": counter.get("STUCK_PIPE", 0),
                "CEMENTING_FAILURE": counter.get("CEMENTING_FAILURE", 0),
                "BIT_DAMAGE": counter.get("BIT_DAMAGE", 0),
            }
        )
    incidents_by_formation.sort(key=lambda row: row["total"], reverse=True)

    year_counts: Counter = Counter()
    year_npt: Dict[str, float] = defaultdict(float)
    for event in events:
        year = event["date"][:4]
        year_counts[year] += 1
        year_npt[year] += event["nptHours"]
    events_by_year = [
        {"year": int(year), "events": year_counts[year], "nptHours": round(year_npt[year], 1)}
        for year in sorted(year_counts)
    ]

    outcome_counter: Counter = Counter()
    outcome_by_formation: Dict[str, Counter] = defaultdict(Counter)
    for event in events:
        outcome_counter[event["outcome"]] += 1
        outcome_by_formation[event["formation"]][event["outcome"]] += 1

    success_rate = [
        {
            "name": label,
            "value": outcome_counter.get(label, 0),
            "share": round(100.0 * outcome_counter.get(label, 0) / total_events, 1),
        }
        for label in ("SUCCESS", "PARTIAL", "FAILURE")
    ]

    formation_success = []
    for formation, counter in outcome_by_formation.items():
        attempts = sum(counter.values())
        if attempts < 4:
            continue
        formation_success.append(
            {
                "formation": formation,
                "attempts": attempts,
                "successRate": round(100.0 * (counter["SUCCESS"] + 0.45 * counter["PARTIAL"]) / attempts, 1),
                "failureRate": round(100.0 * counter["FAILURE"] / attempts, 1),
            }
        )
    formation_success.sort(key=lambda row: row["successRate"], reverse=True)

    severity_mix = Counter(e["severity"] for e in events)
    basin_mix: Dict[str, Counter] = defaultdict(Counter)
    for event in events:
        basin_mix[corpus.wells_by_id[event["wellId"]]["basin"]][event["type"]] += 1

    from .formation_intel import formation_records

    records = formation_records(corpus)
    formation_risk_ranking = [
        {
            "formation": record["name"],
            "basin": record["basin"],
            "eventCount": record["eventCount"],
            "wellCount": record["wellCount"],
            "hazardRate": record["hazardRate"],
            "intelligenceScore": record["intelligenceScore"],
            "band": record["riskBand"],
            "primaryHazard": (record["primaryHazard"] or {}).get("hazard"),
            "primaryHazardLabel": (record["primaryHazard"] or {}).get("label"),
            "window": (record["primaryHazard"] or {}).get("median"),
            "totalNptHours": record["totalNptHours"],
        }
        for record in records
    ]

    depth_bins: Dict[int, Counter] = defaultdict(Counter)
    for event in events:
        key = int(math.floor(event["depth"] / 250.0) * 250)
        depth_bins[key][event["type"]] += 1
    depth_distribution = [
        {
            "depth": key,
            "label": f"{key}-{key + 250} m",
            "total": sum(counter.values()),
            **{hazard: counter.get(hazard, 0) for hazard in EVENT_TYPES},
        }
        for key, counter in sorted(depth_bins.items())
    ]

    top_risk_wells = sorted(corpus.wells, key=lambda w: w["riskScore"], reverse=True)[:12]

    return {
        "totals": {
            **corpus.stats(),
            "rigDaysLost": round(sum(e["nptHours"] for e in events) / 24.0, 1),
            "avgNptPerEvent": round(sum(e["nptHours"] for e in events) / total_events, 1),
            "criticalEvents": severity_mix.get("CRITICAL", 0),
            "successRate": round(
                100.0 * outcome_counter.get("SUCCESS", 0) / total_events, 1
            ),
        },
        "hazardFrequency": hazard_frequency,
        "incidentsByFormation": incidents_by_formation,
        "eventsByYear": events_by_year,
        "successRate": success_rate,
        "formationSuccess": formation_success,
        "severityMix": [
            {"name": level, "value": severity_mix.get(level, 0), "order": index}
            for index, level in enumerate(("LOW", "MEDIUM", "HIGH", "CRITICAL"))
        ],
        "basinMix": [
            {
                "basin": basin,
                "total": sum(counter.values()),
                **{hazard: counter.get(hazard, 0) for hazard in EVENT_TYPES},
            }
            for basin, counter in basin_mix.items()
        ],
        "formationRiskRanking": formation_risk_ranking,
        "depthDistribution": depth_distribution,
        "topRiskWells": [
            {
                "id": w["id"],
                "name": w["name"],
                "field": w["field"],
                "basin": w["basin"],
                "status": w["status"],
                "riskScore": w["riskScore"],
                "riskBand": w["riskBand"],
                "eventCount": w["eventCount"],
                "totalNptHours": w["totalNptHours"],
                "totalCostUsd": w["totalCostUsd"],
            }
            for w in top_risk_wells
        ],
    }
