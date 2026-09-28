"""AI Well Similarity Engine.

Comparison is deliberately *explicit* rather than a black-box embedding: an
engineer must be able to see why Well-Y is 93% similar. Five named groups are
scored independently and blended with published weights, and the groups drive
the similarity network graph and the "lessons learned" transfer.
"""

from __future__ import annotations

import math
from typing import Dict, List, Sequence

from ..data import EVENT_TYPES, HAZARDS

GROUP_WEIGHTS: Dict[str, float] = {
    "formation": 0.28,
    "depth": 0.16,
    "pressure": 0.16,
    "parameters": 0.18,
    "events": 0.22,
}

GROUP_LABELS: Dict[str, str] = {
    "formation": "Formation / stratigraphy",
    "depth": "Depth & trajectory",
    "pressure": "Pore & fracture pressure",
    "parameters": "Drilling parameters",
    "events": "Historical events",
}


def _closeness(a: float, b: float, scale: float) -> float:
    """1.0 when identical, decaying smoothly with the normalised difference."""
    return max(0.0, 1.0 - abs(a - b) / scale)


def _jaccard(a: Sequence[str], b: Sequence[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    return len(sa & sb) / max(1, len(sa | sb))


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _event_vector(well: dict) -> List[float]:
    counts = {t: 0.0 for t in EVENT_TYPES}
    for event in well["events"]:
        counts[event["type"]] = counts.get(event["type"], 0.0) + {
            "LOW": 1.0,
            "MEDIUM": 2.0,
            "HIGH": 3.5,
            "CRITICAL": 5.5,
        }[event["severity"]]
    return [counts[t] for t in EVENT_TYPES]


def similarity(source: dict, target: dict) -> dict:
    """Score how closely ``target`` resembles ``source``."""
    source_formations = [f["name"] for f in source["formations"]]
    target_formations = [f["name"] for f in target["formations"]]

    groups = {
        "formation": _jaccard(source_formations, target_formations),
        "depth": (
            0.72 * _closeness(source["totalDepthMd"], target["totalDepthMd"], 2600.0)
            + 0.28 * _closeness(source["targetInclination"], target["targetInclination"], 70.0)
        ),
        "pressure": (
            0.5 * _closeness(source["poreEmw"], target["poreEmw"], 3.4)
            + 0.5 * _closeness(source["fracEmw"], target["fracEmw"], 3.4)
        ),
        "parameters": (
            0.34 * _closeness(source["mudWeight"], target["mudWeight"], 4.2)
            + 0.18 * _closeness(source["rpm"], target["rpm"], 140.0)
            + 0.18 * _closeness(source["wob"], target["wob"], 34.0)
            + 0.30 * _closeness(source["rop"], target["rop"], 26.0)
        ),
        "events": _cosine(_event_vector(source), _event_vector(target)),
    }

    overall = sum(GROUP_WEIGHTS[key] * value for key, value in groups.items())
    # Geographic proximity is a tie-breaker, never a driver.
    distance_km = _haversine(source["lat"], source["lon"], target["lat"], target["lon"])
    proximity = max(0.0, 1.0 - distance_km / 240.0)
    overall = overall * 0.94 + 0.06 * proximity

    breakdown = [
        {
            "group": key,
            "label": GROUP_LABELS[key],
            "score": round(value * 100.0, 1),
            "weight": GROUP_WEIGHTS[key],
        }
        for key, value in groups.items()
    ]
    breakdown.sort(key=lambda row: row["score"] * row["weight"], reverse=True)

    shared_events = [
        {
            "type": event["type"],
            "label": event["label"],
            "formation": event["formation"],
            "depth": event["depth"],
            "severity": event["severity"],
            "mitigation": event["mitigation"],
            "outcome": event["outcome"],
            "nptHours": event["nptHours"],
        }
        for event in source["events"]
        if event["formation"] in target_formations
    ]

    transferable_lessons = [
        {
            "eventType": event["type"],
            "label": event["label"],
            "text": event["mitigation"],
            "outcome": event["outcome"],
            "severity": event["severity"],
            "depth": event["depth"],
            "formation": event["formation"],
        }
        for event in sorted(
            target["events"],
            key=lambda e: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}[e["severity"]],
        )[:6]
    ]

    return {
        "wellId": target["id"],
        "name": target["name"],
        "field": target["field"],
        "operator": target["operator"],
        "basin": target["basin"],
        "lat": target["lat"],
        "lon": target["lon"],
        "status": target["status"],
        "formation": target["formation"],
        "totalDepthMd": target["totalDepthMd"],
        "riskBand": target["riskBand"],
        "riskScore": target["riskScore"],
        "distanceKm": round(distance_km, 1),
        "similarity": round(overall * 100.0, 1),
        "groups": breakdown,
        "sharedEvents": shared_events[:6],
        "lessonsLearned": transferable_lessons,
        "eventCount": target["eventCount"],
        "criticalEventCount": target["criticalEventCount"],
        "totalNptHours": target["totalNptHours"],
    }


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def similar_wells(corpus, well: dict, limit: int = 8, exclude_self: bool = True) -> List[dict]:
    rows = []
    for other in corpus.wells:
        if exclude_self and other["id"] == well["id"]:
            continue
        rows.append(similarity(well, other))
    rows.sort(key=lambda row: row["similarity"], reverse=True)
    return rows[:limit]


def similarity_network(corpus, well: dict, limit: int = 9) -> dict:
    """Nodes + weighted edges for the interactive similarity network graph."""
    near = similar_wells(corpus, well, limit=limit)
    nodes = [
        {
            "id": well["id"],
            "name": well["name"],
            "kind": "focus",
            "formation": well["formation"],
            "similarity": 100.0,
            "riskBand": well["riskBand"],
            "lat": well["lat"],
            "lon": well["lon"],
            "depth": well["currentDepthMd"],
        }
    ]
    edges = []
    for row in near:
        nodes.append(
            {
                "id": row["wellId"],
                "name": row["name"],
                "kind": "analogue",
                "formation": row["formation"],
                "similarity": row["similarity"],
                "riskBand": row["riskBand"],
                "lat": row["lat"],
                "lon": row["lon"],
                "depth": row["totalDepthMd"],
            }
        )
        edges.append(
            {
                "source": well["id"],
                "target": row["wellId"],
                "weight": round(row["similarity"] / 100.0, 3),
                "similarity": row["similarity"],
            }
        )

    # Secondary edges strengthen the visual clustering.
    ids = [node["id"] for node in nodes]
    for index, source_id in enumerate(ids[1:], start=1):
        for target_id in ids[index + 1:]:
            left = corpus.wells_by_id[source_id]
            right = corpus.wells_by_id[target_id]
            shared = len(
                {f["name"] for f in left["formations"]} & {f["name"] for f in right["formations"]}
            )
            if shared >= 2:
                edges.append(
                    {
                        "source": source_id,
                        "target": target_id,
                        "weight": round(min(0.62, 0.18 * shared + right["hazardPressure"] * 0.4), 3),
                        "similarity": round(min(88.0, 40.0 + shared * 12.0), 1),
                        "secondary": True,
                    }
                )
    return {"focus": well["id"], "nodes": nodes, "edges": edges}
