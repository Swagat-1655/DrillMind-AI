"""Knowledge Graph Intelligence + Institutional Memory Score.

The graph is the platform's *institutional drilling memory*: it connects
offset wells to the formations they penetrated, the formations to the hazards
they host, hazards to the mitigations that worked, and formations to their
reservoirs. Every edge carries a weight so the UI can rank what actually
matters around the bit.
"""

from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from typing import Dict, List, Optional

from ..data import EVENT_LABELS, FORMATION_INDEX, HAZARDS
from .analytics import nearby_wells
from .risk import formation_hazard_priors, offset_risk_load, predict, well_risk_summary
from .similarity import similarity

NODE_KINDS = (
    "well",
    "formation",
    "hazard",
    "reservoir",
    "mitigation",
    "operator",
)


def knowledge_graph(corpus, focus_well_id: Optional[str] = None, limit_wells: int = 22) -> dict:
    well = corpus.wells_by_id.get(focus_well_id) if focus_well_id else None
    well = well or corpus.primary_well()

    scored = sorted(
        (
            (similarity(well, other)["similarity"], other)
            for other in corpus.wells
            if other["id"] != well["id"]
        ),
        key=lambda row: row[0],
        reverse=True,
    )
    related = [other for _, other in scored[:limit_wells]]
    related_ids = {other["id"] for other in related} | {well["id"]}

    nodes: Dict[str, dict] = {}
    edges: List[dict] = []

    def add_node(node_id: str, kind: str, label: str, **extra) -> None:
        existing = nodes.get(node_id)
        if existing is None:
            nodes[node_id] = {"id": node_id, "kind": kind, "label": label, **extra}
        else:
            # Late-arriving attributes (e.g. focusFormation) refine the node.
            existing.update({k: v for k, v in extra.items() if v is not None})

    def add_edge(source: str, target: str, relation: str, weight: float, **extra) -> None:
        edges.append(
            {
                "id": f"{source}->{target}:{relation}",
                "source": source,
                "target": target,
                "relation": relation,
                "weight": round(weight, 3),
                **extra,
            }
        )

    add_node(well["id"], "well", well["name"], focus=True, riskBand=well["riskBand"], status=well["status"])
    add_node(f"op::{well['operator']}", "operator", well["operator"])
    add_edge(well["id"], f"op::{well['operator']}", "OPERATED_BY", 1.0)

    formation_events: Dict[str, Counter] = defaultdict(Counter)
    formation_wells: Dict[str, set] = defaultdict(set)
    formation_mitigations: Dict[str, Counter] = defaultdict(Counter)

    for other in corpus.wells:
        for entry in other["formations"]:
            formation_wells[entry["name"]].add(other["id"])
        for event in other["events"]:
            formation_events[event["formation"]][event["type"]] += 1
            formation_mitigations[event["formation"]][event["mitigation"]] += 1

    focus_formations = [entry["name"] for entry in well["formations"]]

    for other in related:
        add_node(
            other["id"],
            "well",
            other["name"],
            riskBand=other["riskBand"],
            status=other["status"],
            similarity=next((s for s, w in scored if w["id"] == other["id"]), None),
        )
        add_edge(
            well["id"],
            other["id"],
            "ANALOGOUS_TO",
            next((s / 100.0 for s, w in scored if w["id"] == other["id"]), 0.3),
            label="similarity",
        )
        add_node(f"op::{other['operator']}", "operator", other["operator"])
        add_edge(other["id"], f"op::{other['operator']}", "OPERATED_BY", 1.0)

        for entry in other["formations"]:
            formation_id = f"fm::{entry['name']}"
            add_node(
                formation_id,
                "formation",
                entry["name"],
                basin=FORMATION_INDEX.get(entry["name"], {}).get("basin", other["basin"]),
                focusFormation=entry["name"] in focus_formations,
            )
            add_edge(other["id"], formation_id, "INTERSECTED", 0.85 if entry["name"] in focus_formations else 0.55)

            reservoir_id = f"rs::{entry['reservoir']}"
            add_node(reservoir_id, "reservoir", entry["reservoir"])
            add_edge(formation_id, reservoir_id, "CONTAINS", 0.7)

            add_edge(well["id"], formation_id, "TARGETS", 1.0 if entry["name"] == well["formation"] else 0.6)

    # Hazards and mitigations, weighted by real event counts.
    for formation in {f for other in related for f in [e["name"] for e in other["formations"]]} | set(focus_formations):
        formation_id = f"fm::{formation}"
        add_node(formation_id, "formation", formation, **{
            "basin": FORMATION_INDEX.get(formation, {}).get("basin", well["basin"]),
            "focusFormation": formation in focus_formations,
        })
        total = sum(formation_events[formation].values())
        for hazard, count in formation_events[formation].most_common():
            hazard_id = f"hz::{hazard}"
            add_node(hazard_id, "hazard", EVENT_LABELS[hazard], hazard=hazard)
            add_edge(formation_id, hazard_id, "HOSTS", min(1.0, count / max(1.0, total)), count=count)
            if hazard in HAZARDS:
                for mitigation, attempts in formation_mitigations[formation].most_common(3):
                    if attempts < 2:
                        continue
                    # Attribute a mitigation to the hazard it was used against.
                    matching = [
                        e
                        for e in corpus.events
                        if e["formation"] == formation
                        and e["type"] == hazard
                        and e["mitigation"] == mitigation
                    ]
                    if not matching:
                        continue
                    success = sum(
                        {"SUCCESS": 1.0, "PARTIAL": 0.45, "FAILURE": 0.0}[e["outcome"]]
                        for e in matching
                    ) / len(matching)
                    mitigation_id = "mt::" + hashlib.sha1(mitigation.encode("utf-8")).hexdigest()[:10]
                    add_node(
                        mitigation_id,
                        "mitigation",
                        mitigation,
                        successRate=round(success * 100.0, 1),
                        attempts=len(matching),
                    )
                    add_edge(
                        hazard_id,
                        mitigation_id,
                        "MITIGATED_BY",
                        round(success, 3),
                        successRate=round(success * 100.0, 1),
                        attempts=len(matching),
                    )

    # Attach the focus well's own incidents as evidence.
    for event in well["events"]:
        hazard_id = f"hz::{event['type']}"
        add_node(hazard_id, "hazard", event["label"], hazard=event["type"])
        add_edge(
            well["id"],
            hazard_id,
            "EXPERIENCED",
            {"LOW": 0.3, "MEDIUM": 0.55, "HIGH": 0.8, "CRITICAL": 1.0}[event["severity"]],
            depth=event["depth"],
            severity=event["severity"],
        )

    degree: Counter = Counter()
    for edge in edges:
        degree[edge["source"]] += 1
        degree[edge["target"]] += 1
    for node in nodes.values():
        node["degree"] = degree.get(node["id"], 0)

    kind_counts = Counter(node["kind"] for node in nodes.values())
    relation_counts = Counter(edge["relation"] for edge in edges)

    return {
        "focus": well["id"],
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": {
            "nodes": len(nodes),
            "edges": len(edges),
            "byKind": dict(kind_counts),
            "byRelation": dict(relation_counts),
        },
    }


def institutional_memory(corpus, well: dict) -> dict:
    """Score how much hard-won history stands behind the current decisions."""
    nearby = nearby_wells(corpus, well, radius_km=18.0, limit=200)
    related = [corpus.wells_by_id[row["id"]] for row in nearby]

    focus_formations = {entry["name"] for entry in well["formations"]}
    relevant_events = [
        event
        for other in related
        for event in other["events"]
        if event["formation"] in focus_formations
    ]

    from .formation_intel import formation_records

    records = {record["name"]: record for record in formation_records(corpus)}
    formation_scores = [
        records[name]["intelligenceScore"]
        for name in focus_formations
        if name in records
    ]
    formation_intelligence = (
        round(sum(formation_scores) / len(formation_scores), 1) if formation_scores else 0.0
    )

    # Knowledge reuse: how many predictions are backed by real incidences.
    reuses = 0
    total_predictions = 0
    per_hazard = []
    for hazard in HAZARDS:
        result = predict(well, corpus, hazard=hazard, depth=well["currentDepthMd"])
        total_predictions += 1
        support = len(result["supportingIncidents"])
        if support:
            reuses += 1
        per_hazard.append(
            {
                "hazard": hazard,
                "label": result["label"],
                "probabilityPct": result["probabilityPct"],
                "supportingIncidents": support,
                "supportingWells": len(result["supportingWells"]),
                "confidencePct": result["confidencePct"],
            }
        )

    knowledge_reuse = round(100.0 * reuses / max(1, total_predictions), 1)

    # Institutional score: volume of usable memory, weighted by how much of it
    # the platform can actually bind to the current drilling decision.
    wells_term = min(1.0, len(nearby) / 46.0) * 34.0
    events_term = min(1.0, len(relevant_events) / 150.0) * 26.0
    formation_term = formation_intelligence / 100.0 * 24.0
    reuse_term = knowledge_reuse / 100.0 * 16.0
    score = round(min(100.0, wells_term + events_term + formation_term + reuse_term), 1)

    grade = (
        "Excellent" if score >= 88 else "Strong" if score >= 74 else "Adequate" if score >= 58 else "Thin"
    )

    risk = well_risk_summary(corpus, well)

    return {
        "wellId": well["id"],
        "wellName": well["name"],
        "score": score,
        "grade": grade,
        "metrics": [
            {
                "key": "historicalWells",
                "label": "Historical Wells Used",
                "value": len(nearby),
                "unit": "offset wells within 18 km",
                "tone": "cyan",
            },
            {
                "key": "relevantEvents",
                "label": "Relevant Events",
                "value": len(relevant_events),
                "unit": "in the target formations",
                "tone": "orange",
            },
            {
                "key": "formationIntelligence",
                "label": "Formation Intelligence",
                "value": formation_intelligence,
                "unit": "% memory coverage",
                "tone": "violet",
            },
            {
                "key": "knowledgeReuse",
                "label": "Knowledge Reuse Score",
                "value": knowledge_reuse,
                "unit": "% of predictions evidenced",
                "tone": "green",
            },
            {
                "key": "institutionalMemory",
                "label": "Institutional Memory Score",
                "value": score,
                "unit": f"{grade} — bind it to the programme",
                "tone": "blue",
            },
        ],
        "breakdown": [
            {"component": "Offset well volume", "contribution": round(wells_term, 1), "max": 34},
            {"component": "Relevant incident volume", "contribution": round(events_term, 1), "max": 26},
            {"component": "Formation intelligence", "contribution": round(formation_term, 1), "max": 24},
            {"component": "Knowledge reuse", "contribution": round(reuse_term, 1), "max": 16},
        ],
        "perHazard": per_hazard,
        "narrative": (
            f"{len(nearby)} offset wells within 18 km carry {len(relevant_events)} logged events in the "
            f"formations this well will penetrate. Formation intelligence averages {formation_intelligence:.0f}% "
            f"and {knowledge_reuse:.0f}% of the live hazard predictions are backed by a real offset-well "
            f"incidence. Overall institutional memory is {score:.0f}/100 ({grade.lower()}). "
            f"The dominant forward risk remains {risk['worst']['label']} at {risk['worst']['probabilityPct']:.0f}%."
        ),
        "evidenceSample": [
            {
                "id": event["id"],
                "wellId": event["wellId"],
                "wellName": corpus.wells_by_id[event["wellId"]]["name"],
                "type": event["type"],
                "label": event["label"],
                "formation": event["formation"],
                "depth": event["depth"],
                "severity": event["severity"],
                "date": event["date"],
                "mitigation": event["mitigation"],
                "outcome": event["outcome"],
            }
            for event in sorted(
                relevant_events,
                key=lambda e: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}[e["severity"]],
            )[:10]
        ],
    }
