"""Formation Time Machine.

Collapses every offset well's experience in a formation into a single
intelligence record: where hazards actually occurred, which mitigation worked,
how confident the industry's memory is, and a plain-language AI summary.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Dict, List, Optional

from ..data import (
    EVENT_LABELS,
    FORMATION_INDEX,
    FORMATION_STACKS,
    HAZARDS,
    band_for,
)

SUCCESS_CREDIT = {"SUCCESS": 1.0, "PARTIAL": 0.45, "FAILURE": 0.0}


def _percentile(values: List[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = fraction * (len(ordered) - 1)
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[int(position)]
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def formation_records(corpus) -> List[dict]:
    """Build an intelligence record for every formation present in the corpus."""
    by_formation: Dict[str, List[dict]] = defaultdict(list)
    for well in corpus.wells:
        for entry in well["formations"]:
            by_formation[entry["name"]].append(well)

    records: List[dict] = []
    for name, wells in by_formation.items():
        events = [e for e in corpus.events if e["formation"] == name]
        meta = FORMATION_INDEX.get(name, {})
        hazard_counts = Counter(e["type"] for e in events)
        total_events = len(events) or 1

        # Characteristic depth window per hazard from the p20-p80 band.
        windows: Dict[str, dict] = {}
        for hazard in HAZARDS:
            depths = [e["depth"] for e in events if e["type"] == hazard]
            if not depths:
                continue
            lo = _percentile(depths, 0.18)
            hi = _percentile(depths, 0.82)
            if hi - lo < 25.0:
                hi = lo + 25.0
            windows[hazard] = {
                "hazard": hazard,
                "label": EVENT_LABELS[hazard],
                "low": round(lo, 0),
                "high": round(hi, 0),
                "count": len(depths),
                "median": round(_percentile(depths, 0.5), 0),
                "share": round(100.0 * len(depths) / total_events, 1),
            }

        # Mitigation effectiveness: what actually worked, per hazard.
        mitigation_stats: Dict[tuple[str, str], dict] = {}
        for event in events:
            key = (event["type"], event["mitigation"])
            entry = mitigation_stats.setdefault(
                key, {"attempts": 0, "credit": 0.0, "npt": 0.0, "outcomes": Counter()}
            )
            entry["attempts"] += 1
            entry["credit"] += SUCCESS_CREDIT[event["outcome"]]
            entry["npt"] += event["nptHours"]
            entry["outcomes"][event["outcome"]] += 1

        ranked: List[dict] = []
        for (event_type, mitigation), stats in mitigation_stats.items():
            ranked.append(
                {
                    "eventType": event_type,
                    "label": EVENT_LABELS[event_type],
                    "strategy": mitigation,
                    "attempts": stats["attempts"],
                    "successRate": round(100.0 * stats["credit"] / stats["attempts"], 1),
                    "avgNpt": round(stats["npt"] / stats["attempts"], 1),
                    "outcomes": dict(stats["outcomes"]),
                    "score": round(
                        (stats["credit"] / stats["attempts"]) * math.log1p(stats["attempts"]), 3
                    ),
                }
            )
        ranked.sort(key=lambda row: row["score"], reverse=True)

        best_overall = ranked[0] if ranked else None
        best_by_hazard: Dict[str, dict] = {}
        for hazard in HAZARDS:
            candidates = [row for row in ranked if row["eventType"] == hazard]
            if candidates:
                best_by_hazard[hazard] = candidates[0]

        # Timeline
        years = Counter(e["date"][:4] for e in events)
        timeline = [
            {"year": int(year), "events": count}
            for year, count in sorted(years.items())
        ]

        severity_mix = Counter(e["severity"] for e in events)
        primary = max(windows.values(), key=lambda w: w["count"]) if windows else None

        # Intelligence score: how much usable memory exists here.
        volume = min(1.0, len(wells) / 16.0) * 34.0
        density = min(1.0, len(events) / 34.0) * 24.0
        spread = 0.0
        if primary and primary["count"] > 1:
            depths = [e["depth"] for e in events if e["type"] == primary["hazard"]]
            mean = sum(depths) / len(depths)
            variance = sum((d - mean) ** 2 for d in depths) / len(depths)
            sigma = math.sqrt(variance)
            spread = max(0.0, 1.0 - sigma / 520.0) * 20.0
        effectiveness = (best_overall["successRate"] / 100.0 if best_overall else 0.4) * 22.0
        intelligence = round(min(100.0, volume + density + spread + effectiveness), 1)

        hazard_rate = round(100.0 * len(events) / max(1, len(wells)), 1)

        records.append(
            {
                "name": name,
                "basin": meta.get("basin", wells[0]["basin"]),
                "lithology": meta.get("lithology", wells[0]["lithology"]),
                "reservoir": meta.get("reservoir", ""),
                "porosity": meta.get("porosity"),
                "permMd": meta.get("perm_md"),
                "poreEmw": meta.get("pore_emw"),
                "fracEmw": meta.get("frac_emw"),
                "depthRange": [meta.get("top"), meta.get("base")],
                "headline": meta.get("headline", ""),
                "wellCount": len(wells),
                "eventCount": len(events),
                "hazardRate": hazard_rate,
                "riskBand": band_for(min(100.0, hazard_rate * 1.6 + len(events) * 0.35)),
                "intelligenceScore": intelligence,
                "hazardCounts": {h: hazard_counts.get(h, 0) for h in EVENT_LABELS},
                "hazardRates": {
                    h: round(100.0 * hazard_counts.get(h, 0) / total_events, 1)
                    for h in EVENT_LABELS
                },
                "windows": sorted(windows.values(), key=lambda w: -w["count"]),
                "primaryHazard": primary,
                "mitigations": ranked[:8],
                "bestMitigation": best_overall,
                "bestByHazard": list(best_by_hazard.values()),
                "severityMix": {level: severity_mix.get(level, 0) for level in ("LOW", "MEDIUM", "HIGH", "CRITICAL")},
                "timeline": timeline,
                "totalNptHours": round(sum(e["nptHours"] for e in events), 1),
                "totalCostUsd": round(sum(e["costUsd"] for e in events), 0),
                "offsetWells": [
                    {
                        "id": w["id"],
                        "name": w["name"],
                        "field": w["field"],
                        "operator": w["operator"],
                        "year": (w["completionDate"] or w["spudDate"])[:4],
                        "riskBand": w["riskBand"],
                        "riskScore": w["riskScore"],
                        "events": len([e for e in w["events"] if e["formation"] == name]),
                        "primaryEvent": (
                            Counter(e["type"] for e in w["events"] if e["formation"] == name).most_common(1)[0][0]
                            if any(e["formation"] == name for e in w["events"])
                            else None
                        ),
                    }
                    for w in sorted(wells, key=lambda w: w["riskScore"], reverse=True)[:24]
                ],
                "summary": _summary(name, wells, events, windows, best_overall, meta),
            }
        )

    records.sort(key=lambda row: row["eventCount"], reverse=True)
    return records


def _summary(
    name: str,
    wells: List[dict],
    events: List[dict],
    windows: Dict[str, dict],
    best: Optional[dict],
    meta: dict,
) -> str:
    if not events:
        return (
            f"{name} has {len(wells)} offset wells on record and no recorded hazard events "
            f"in this basin — the historical risk evidence base is thin. Treat the first "
            f"penetration as a data-gathering run."
        )

    primary = max(windows.values(), key=lambda w: w["count"])
    parts = [
        f"{name} has been penetrated by {len(wells)} wells carrying {len(events)} recorded events."
    ]
    parts.append(
        f"It historically produced {primary['label'].lower()} between {primary['low']:.0f} m and "
        f"{primary['high']:.0f} m ({primary['count']} events, median {primary['median']:.0f} m, "
        f"{primary['share']:.0f}% of all events here)."
    )
    secondary = [w for w in windows.values() if w["hazard"] != primary["hazard"]]
    secondary.sort(key=lambda w: -w["count"])
    if secondary:
        second = secondary[0]
        parts.append(
            f"The next strongest signal is {second['label'].lower()} around {second['median']:.0f} m "
            f"({second['count']} events)."
        )
    if best:
        parts.append(
            f"The most successful mitigation on record is: {best['strategy']} "
            f"({best['successRate']:.0f}% success across {best['attempts']} attempts, "
            f"average {best['avgNpt']:.0f} hr of non-productive time)."
        )
    if meta.get("headline"):
        parts.append(meta["headline"])
    return " ".join(parts)


def formation_detail(corpus, name: str) -> Optional[dict]:
    records = formation_records(corpus)
    for record in records:
        if record["name"].lower() == name.lower():
            record["depthHistogram"] = _depth_histogram(corpus, name)
            record["analogueWells"] = _analogue_wells(corpus, name)
            return record
    return None


def _depth_histogram(corpus, name: str, bin_size: float = 100.0) -> List[dict]:
    """Stacked event counts per 100 m bin — drives the time-machine strip."""
    meta = FORMATION_INDEX.get(name, {})
    top = float(meta.get("top", 0) or 0)
    base = float(meta.get("base", top + 1200) or top + 1200)
    events = [e for e in corpus.events if e["formation"] == name]
    if events:
        top = min(top, min(e["depth"] for e in events))
        base = max(base, max(e["depth"] for e in events))
    start = math.floor(top / bin_size) * bin_size
    end = math.ceil(base / bin_size) * bin_size
    bins: Dict[float, Dict[str, float]] = {}
    depth = start
    while depth <= end:
        bins[depth] = {hazard: 0.0 for hazard in EVENT_LABELS}
        depth += bin_size
    for event in events:
        key = math.floor(event["depth"] / bin_size) * bin_size
        if key in bins:
            bins[key][event["type"]] += 1
    return [
        {
            "depth": int(depth),
            "label": f"{int(depth)}-{int(depth + bin_size)} m",
            "total": int(sum(counts.values())),
            **{hazard: int(value) for hazard, value in counts.items()},
        }
        for depth, counts in sorted(bins.items())
    ]


def _analogue_wells(corpus, name: str, limit: int = 10) -> List[dict]:
    rows = []
    for well in corpus.wells_with_formation(name):
        in_formation = [e for e in well["events"] if e["formation"] == name]
        rows.append(
            {
                "id": well["id"],
                "name": well["name"],
                "field": well["field"],
                "operator": well["operator"],
                "status": well["status"],
                "riskBand": well["riskBand"],
                "riskScore": well["riskScore"],
                "depth": round(
                    next(
                        (f["baseMd"] for f in well["formations"] if f["name"] == name),
                        well["totalDepthMd"],
                    ),
                    1,
                ),
                "eventTypes": sorted({e["type"] for e in in_formation}),
                "eventCount": len(in_formation),
                "worstEvent": max(
                    in_formation,
                    key=lambda e: {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}[e["severity"]],
                    default=None,
                ),
                "lat": well["lat"],
                "lon": well["lon"],
                "year": (well["completionDate"] or well["spudDate"])[:4],
            }
        )
    rows.sort(key=lambda row: row["riskScore"], reverse=True)
    return rows[:limit]


def formation_names() -> List[str]:
    names = sorted(FORMATION_INDEX)
    return names


def basin_taxonomy() -> List[dict]:
    return [
        {
            "basin": basin,
            "formations": [
                {
                    "name": f["name"],
                    "top": f["top"],
                    "base": f["base"],
                    "lithology": f["lithology"],
                    "reservoir": f["reservoir"],
                    "primaryHazard": f["primary_hazard"],
                    "headline": f["headline"],
                }
                for f in stack
            ],
        }
        for basin, stack in FORMATION_STACKS.items()
    ]
