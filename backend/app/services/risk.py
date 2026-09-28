"""Explainable predictive risk engine.

The engine is a calibrated logistic model served per hazard. Because the model
is linear in its log-odds, its per-feature contributions are *exact* Shapley
values for the linear case — so the "explainable AI" panel shows real additive
attributions rather than a post-hoc approximation.

Feature groups mirror how a drilling engineer reasons about a hazard:
    * pressure window   — overbalance and fracture-gradient margin
    * formation memory  — how often this hazard actually happened here
    * operating state   — ROP / torque / flow relative to formation norms
    * geometry          — depth and inclination
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence

from ..data import EVENT_LABELS, HAZARDS, band_for

# --------------------------------------------------------------------------
# Model definition
# --------------------------------------------------------------------------
# Feature keys map to the extractor in :func:`_features`.

FEATURE_LABELS: Dict[str, str] = {
    "overbalance": "Mud-weight overbalance",
    "fracMarginTight": "Fracture-gradient margin (tight)",
    "formationPrior": "Formation hazard memory",
    "depthPressure": "Depth / pressure ramp",
    "ropStress": "ROP stress (aggressive drilling)",
    "torqueStress": "Torque stress",
    "flowStress": "Flow-rate / hole-cleaning stress",
    "inclination": "Well inclination",
    "temperature": "Bottom-hole temperature",
    "offsetLoad": "Offset-well incident load",
}

#: Operational weighting used to collapse six hazards into one depth band.
HAZARD_SEVERITY_WEIGHT: Dict[str, float] = {
    "MUDFLOSS": 1.10,
    "KICK": 1.35,
    "OVERPRESSURE": 1.25,
    "TORQUE_SPIKE": 0.85,
    "STUCK_PIPE": 1.15,
    "CEMENTING_FAILURE": 0.90,
}

MODEL: Dict[str, dict] = {
    "MUDFLOSS": {
        "label": EVENT_LABELS["MUDFLOSS"],
        "intercept": -0.74,
        "weights": {
            "fracMarginTight": 2.15,
            "overbalance": 0.95,
            "formationPrior": 1.85,
            "depthPressure": 0.55,
            "ropStress": 0.42,
            "torqueStress": 0.10,
            "flowStress": 0.70,
            "inclination": 0.16,
            "temperature": 0.22,
            "offsetLoad": 0.85,
        },
        "rationale": "Losses are driven by the fracture-gradient margin and how permeable the formation memory says this interval is.",
    },
    "KICK": {
        "label": EVENT_LABELS["KICK"],
        "intercept": -1.72,
        "weights": {
            "fracMarginTight": -0.45,
            "overbalance": -2.05,
            "formationPrior": 1.70,
            "depthPressure": 1.10,
            "ropStress": 0.18,
            "torqueStress": 0.12,
            "flowStress": -0.22,
            "inclination": 0.10,
            "temperature": 0.35,
            "offsetLoad": 0.80,
        },
        "rationale": "Influx risk falls with overbalance and rises steeply as the pore-pressure ramp steepens with depth.",
    },
    "OVERPRESSURE": {
        "label": EVENT_LABELS["OVERPRESSURE"],
        "intercept": -1.64,
        "weights": {
            "fracMarginTight": -0.30,
            "overbalance": -1.35,
            "formationPrior": 1.90,
            "depthPressure": 1.45,
            "ropStress": 0.28,
            "torqueStress": 0.20,
            "flowStress": -0.15,
            "inclination": 0.05,
            "temperature": 0.55,
            "offsetLoad": 0.75,
        },
        "rationale": "A steepening pressure ramp with depth plus a narrow operating window is the classic overpressure signature.",
    },
    "TORQUE_SPIKE": {
        "label": EVENT_LABELS["TORQUE_SPIKE"],
        "intercept": -1.58,
        "weights": {
            "fracMarginTight": 0.10,
            "overbalance": 0.35,
            "formationPrior": 1.60,
            "depthPressure": 0.35,
            "ropStress": 1.25,
            "torqueStress": 2.10,
            "flowStress": 0.55,
            "inclination": 0.62,
            "temperature": 0.15,
            "offsetLoad": 0.60,
        },
        "rationale": "Torsional oscillation is dominated by weight-on-bit / RPM aggressiveness and current torque response.",
    },
    "STUCK_PIPE": {
        "label": EVENT_LABELS["STUCK_PIPE"],
        "intercept": -1.74,
        "weights": {
            "fracMarginTight": 0.05,
            "overbalance": 0.62,
            "formationPrior": 1.75,
            "depthPressure": 0.60,
            "ropStress": 0.30,
            "torqueStress": 1.35,
            "flowStress": 1.15,
            "inclination": 0.75,
            "temperature": 0.10,
            "offsetLoad": 0.85,
        },
        "rationale": "Differential sticking and pack-off grow with mud overbalance, inclination and poor hole cleaning.",
    },
    "CEMENTING_FAILURE": {
        "label": EVENT_LABELS["CEMENTING_FAILURE"],
        "intercept": -1.62,
        "weights": {
            "fracMarginTight": 0.55,
            "overbalance": 0.75,
            "formationPrior": 1.55,
            "depthPressure": 0.70,
            "ropStress": 0.15,
            "torqueStress": 0.25,
            "flowStress": 0.85,
            "inclination": 0.10,
            "temperature": 0.45,
            "offsetLoad": 0.70,
        },
        "rationale": "Losses during displacement and a tight pressure window are the dominant causes of a failed top job.",
    },
}

#: Practical mitigation playbook surfaced alongside every prediction.
PLAYBOOK: Dict[str, List[str]] = {
    "MUDFLOSS": [
        "Prepare an LCM treatment at the shale shaker before entering the interval.",
        "Hold mud weight at the design minimum and cap ROP to 12 m/hr across the loss zone.",
        "Keep 60 m³ of 12.5 ppg kill-weight mud plus LCM blend on the pit.",
    ],
    "KICK": [
        "Verify the trip margin (0.4-0.6 ppg) and re-run the flow check after every connection.",
        "Hold a pre-recorded kill sheet and confirm the BOP test is current.",
        "Monitor connection gas; escalate on any sustained upward trend.",
    ],
    "OVERPRESSURE": [
        "Re-fit the pore-pressure trend from the latest D-exponent / sonic data.",
        "Prepare a casing seat decision point ahead of the ramp.",
        "Reduce ROP to allow the mud logger to track the gas signature.",
    ],
    "TORQUE_SPIKE": [
        "Step down WOB by 15% and re-tune RPM into a stable torsional window.",
        "Run a torque-and-drag model before the next stand.",
        "Stage a wiper trip; check the stabiliser and shock sub condition.",
    ],
    "STUCK_PIPE": [
        "Increase flow rate and pump a high-viscosity sweep on the next connection.",
        "Maintain a minimum 1500 lb overpull margin and record drag trends each stand.",
        "Wiper trip before running casing; keep the string moving at every connection.",
    ],
    "CEMENTING_FAILURE": [
        "Stage the job; confirm the spacer train and centralisation program.",
        "Reduce mud weight ahead of the job if losses are expected during displacement.",
        "Line up a contingency squeeze and verify returns at the shoe.",
    ],
}


def _clamp(value: float, low: float = -1.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def _features(
    well: dict,
    depth: float,
    *,
    mud_weight: Optional[float] = None,
    rpm: Optional[float] = None,
    wob: Optional[float] = None,
    rop: Optional[float] = None,
    formation_prior: Optional[Dict[str, float]] = None,
    offset_load: float = 0.0,
    inclination: Optional[float] = None,
) -> Dict[str, float]:
    """Extract the model's feature vector at a given measured depth."""
    rop = well["rop"] if rop is None else rop
    rpm = well["rpm"] if rpm is None else rpm
    wob = well["wob"] if wob is None else wob
    if mud_weight is None:
        # The mud-weight programme ramps with depth. Predicting a shallow
        # interval with today's bit-depth mud weight would over-state the
        # overbalance uphole, which is the single biggest driver of the
        # mud-loss and kick features.
        mud_weight = well["mudWeight"] + 0.34 * (depth - well["currentDepthMd"]) / 1000.0

    # Locate the formation the bit is in at `depth`.
    formation = None
    for entry in well["formations"]:
        if entry["topMd"] - 25.0 <= depth <= entry["baseMd"] + 25.0:
            formation = entry
            break
    if formation is None:
        formation = well["formations"][-1] if depth > well["formations"][-1]["baseMd"] else well["formations"][0]

    span = max(1.0, formation["baseMd"] - formation["topMd"])
    position = _clamp((depth - formation["topMd"]) / span, 0.0, 1.0)

    pore = formation["poreEmw"]
    frac = formation["fracEmw"]
    ecd = mud_weight + 0.22 + 0.35 * (well["flowRate"] / 900.0)
    overbalance = mud_weight - pore
    frac_margin = frac - ecd

    incline = well["targetInclination"] if inclination is None else inclination

    priors = formation_prior or _empirical_priors(well, formation["name"])

    # Bottom-hole temperature at the predicted depth (not at TD), following the
    # same geothermal gradient used when the well was built.
    bht_at_depth = 30.0 + depth * 0.026 * (1.0 + 0.12 * (well["basin"] == "Assam-Arakan"))

    return {
        # pressure window
        "overbalance": _clamp((overbalance - 0.55) / 1.10),
        "fracMarginTight": _clamp((0.95 - frac_margin) / 1.05),
        # formation memory (filled by caller per hazard)
        "_priors": priors,
        # depth & pressure ramp — linear across the whole basin depth range so
        # the profile keeps discriminating instead of saturating below 2.6 km
        "depthPressure": _clamp((depth - 900.0) / 4200.0),
        # operating state
        "ropStress": _clamp((rop - 15.0) / 18.0),
        "torqueStress": _clamp((well["torque"] - 24.0) / 22.0),
        "flowStress": _clamp((740.0 - well["flowRate"]) / 340.0),
        "inclination": _clamp((incline - 22.0) / 45.0),
        "temperature": _clamp((bht_at_depth - 55.0) / 150.0),
        "offsetLoad": _clamp(offset_load),
        # exposed for the what-if engine
        "_raw": {
            "mudWeight": mud_weight,
            "poreEmw": pore,
            "fracEmw": frac,
            "ecd": round(ecd, 3),
            "overbalance": round(overbalance, 3),
            "fracMargin": round(frac_margin, 3),
            "formationPosition": round(position, 3),
            "formation": formation["name"],
            "rpm": rpm,
            "wob": wob,
            "rop": rop,
            "bhtAtDepth": round(bht_at_depth, 1),
        },
    }


def _empirical_priors(well: dict, formation: str) -> Dict[str, float]:
    """Fallback priors from the well's own record for the formation."""
    out = {hazard: 0.12 for hazard in HAZARDS}
    for event in well["events"]:
        if event["formation"] == formation:
            out[event["type"]] = out.get(event["type"], 0.12) + 0.28
    total = sum(out.values()) or 1.0
    return {k: v / total for k, v in out.items()}


def _support(
    well: dict,
    hazard: str,
    formation: str,
    depth: float,
    corpus,
    window_m: float = 180.0,
) -> tuple[List[dict], List[dict]]:
    """Offset wells and incidents that justify a prediction."""
    hits: List[tuple[float, dict, dict]] = []
    for event in corpus.events:
        if event["type"] != hazard:
            continue
        if event["formation"] != formation:
            continue
        delta = abs(event["depth"] - depth)
        if delta > window_m:
            continue
        well_hit = corpus.wells_by_id[event["wellId"]]
        hits.append((delta, event, well_hit))

    hits.sort(key=lambda row: (row[0], -{"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}[row[1]["severity"]]))
    supporting_incidents = [
        {
            "id": event["id"],
            "wellId": event["wellId"],
            "wellName": well_hit["name"],
            "formation": event["formation"],
            "depth": event["depth"],
            "severity": event["severity"],
            "date": event["date"],
            "nptHours": event["nptHours"],
            "mitigation": event["mitigation"],
            "outcome": event["outcome"],
            "depthDelta": round(event["depth"] - depth, 1),
        }
        for delta, event, well_hit in hits[:6]
    ]

    supporting_wells: List[dict] = []
    seen: set[str] = set()
    for delta, event, well_hit in hits:
        if well_hit["id"] in seen or well_hit["id"] == well["id"]:
            continue
        seen.add(well_hit["id"])
        supporting_wells.append(
            {
                "id": well_hit["id"],
                "name": well_hit["name"],
                "field": well_hit["field"],
                "lat": well_hit["lat"],
                "lon": well_hit["lon"],
                "depth": event["depth"],
                "severity": event["severity"],
                "year": int(event["date"][:4]),
            }
        )
        if len(supporting_wells) >= 5:
            break

    return supporting_incidents, supporting_wells


def _confidence(support_count: int, feature_spread: float, well: dict) -> float:
    """Confidence is a function of analogue support and predictor coverage."""
    support_term = 1.0 - math.exp(-support_count / 4.2)
    coverage = 0.62 + 0.38 * (1.0 - feature_spread)
    base = 0.40 + 0.46 * support_term
    return round(max(0.32, min(0.97, base * coverage + 0.10)), 3)


def predict(
    well: dict,
    corpus,
    *,
    hazard: str,
    depth: Optional[float] = None,
    window_label: str = "current",
    mud_weight: Optional[float] = None,
    rpm: Optional[float] = None,
    wob: Optional[float] = None,
    rop: Optional[float] = None,
    formation_prior: Optional[Dict[str, float]] = None,
    offset_load: Optional[float] = None,
) -> dict:
    """Predict one hazard and produce a full explainability payload."""
    if not hasattr(corpus, "events"):
        raise TypeError(
            "predict() takes (well, corpus) — got the arguments in the wrong order"
        )
    depth = well["currentDepthMd"] if depth is None else depth
    spec = MODEL[hazard]

    if formation_prior is None:
        formation_prior = formation_hazard_priors(corpus, well, depth)

    if offset_load is None:
        offset_load = offset_risk_load(corpus, well, depth)

    feats = _features(
        well,
        depth,
        mud_weight=mud_weight,
        rpm=rpm,
        wob=wob,
        rop=rop,
        formation_prior=formation_prior,
        offset_load=offset_load,
    )

    logit = spec["intercept"]
    contributions: List[dict] = []
    for name, weight in spec["weights"].items():
        # Formation memory is hazard-specific: how often *this* hazard actually
        # occurred nearby, renormalised to [0, 1] around a uniform prior.
        if name == "formationPrior":
            share = feats["_priors"].get(hazard, 1.0 / len(HAZARDS))
            raw = _clamp((share - 1.0 / len(HAZARDS)) / (1.0 - 1.0 / len(HAZARDS)))
        else:
            raw = feats[name]
        impact = weight * raw
        logit += impact
        contributions.append(
            {
                "feature": name,
                "label": FEATURE_LABELS[name],
                "value": round(raw, 3),
                "weight": round(weight, 3),
                "impact": round(impact, 4),
                "direction": "increases" if impact >= 0 else "reduces",
            }
        )

    probability = _sigmoid(logit)
    contributions.sort(key=lambda c: abs(c["impact"]), reverse=True)
    total_abs = sum(abs(c["impact"]) for c in contributions) or 1.0
    for entry in contributions:
        entry["share"] = round(abs(entry["impact"]) / total_abs, 4)

    formation = feats["_raw"]["formation"]
    incidents, supporting_wells = _support(well, hazard, formation, depth, corpus)

    spread_values = [feats[k] for k in ("overbalance", "fracMarginTight", "depthPressure")]
    spread = sum(spread_values) / len(spread_values)
    confidence = _confidence(len(incidents), min(1.0, abs(spread)), well)

    return {
        "wellId": well["id"],
        "hazard": hazard,
        "label": spec["label"],
        "window": window_label,
        "depth": round(depth, 1),
        "formation": formation,
        "probability": round(probability, 4),
        "probabilityPct": round(probability * 100.0, 1),
        "confidence": confidence,
        "confidencePct": round(confidence * 100.0, 1),
        "band": band_for(probability * 100.0),
        "logit": round(logit, 4),
        "rationale": spec["rationale"],
        "drivers": contributions,
        "topDrivers": contributions[:4],
        "recommendedActions": PLAYBOOK[hazard],
        "supportingIncidents": incidents,
        "supportingWells": supporting_wells,
        "inputs": feats["_raw"],
    }


def formation_hazard_priors(corpus, well: dict, depth: float) -> Dict[str, float]:
    """Smoothed hazard distribution for the formation interval around ``depth``."""
    counts: Dict[str, float] = {hazard: 0.0 for hazard in HAZARDS}
    total = 0.0
    for event in corpus.events:
        delta = abs(event["depth"] - depth)
        if delta > 420.0:
            continue
        weight = 1.0 / (1.0 + delta / 120.0)
        if event["formation"] == well["formation"]:
            weight *= 1.35
        counts[event["type"]] = counts.get(event["type"], 0.0) + weight
        total += weight
    if total <= 0:
        return {hazard: 1.0 / len(HAZARDS) for hazard in HAZARDS}
    smoothed = {
        hazard: (counts.get(hazard, 0.0) + 0.6) / (total + 0.6 * len(HAZARDS))
        for hazard in HAZARDS
    }
    norm = sum(smoothed.values()) or 1.0
    return {k: v / norm for k, v in smoothed.items()}


def offset_risk_load(
    corpus,
    well: dict,
    depth: float,
    radius_km: float = 14.0,
    depth_window_m: float = 320.0,
) -> float:
    """Normalised incident load carried by offset wells around the current bit.

    Weighted by geographic proximity *and* by how close the historical event is
    in depth, so the load genuinely changes as the bit moves.
    """
    load = 0.0
    for other in corpus.wells:
        if other["id"] == well["id"]:
            continue
        dlat = (other["lat"] - well["lat"]) * 111.0
        dlon = (other["lon"] - well["lon"]) * 100.0
        distance = math.hypot(dlat, dlon)
        if distance > radius_km:
            continue
        proximity = 1.0 - distance / radius_km
        for event in other["events"]:
            delta = abs(event["depth"] - depth)
            if delta > depth_window_m:
                continue
            depth_weight = 1.0 - delta / depth_window_m
            load += proximity * depth_weight * {
                "LOW": 0.5,
                "MEDIUM": 1.2,
                "HIGH": 2.6,
                "CRITICAL": 4.4,
            }[event["severity"]]
            break
    return min(1.0, load / 26.0)


def depth_profile(corpus, well: dict, *, top: Optional[float] = None, bottom: Optional[float] = None, step: float = 50.0) -> dict:
    """Risk heatmap along measured depth, plus 100 m band summary."""
    bottom = bottom or min(well["totalDepthMd"], well["currentDepthMd"] + 600.0)
    top = top or max(well["formations"][0]["topMd"] - 200.0, 0.0)
    # Anchor the profile on round 100 m marks so the UI reads like a depth log.
    top = max(0.0, math.floor(top / 100.0) * 100.0)

    samples: List[dict] = []
    depth = top
    while depth <= bottom + 1e-6:
        row: Dict[str, float | str] = {"depth": round(depth, 0)}
        priors = formation_hazard_priors(corpus, well, depth)
        load = offset_risk_load(corpus, well, depth)
        for hazard in HAZARDS:
            result = predict(
                well,
                corpus,
                hazard=hazard,
                depth=depth,
                window_label="profile",
                formation_prior=priors,
                offset_load=load,
            )
            row[hazard] = round(result["probability"] * 100.0, 1)
        worst = float(max(row[h] for h in HAZARDS))
        mean = sum(
            float(row[h]) * HAZARD_SEVERITY_WEIGHT[h] for h in HAZARDS
        ) / sum(HAZARD_SEVERITY_WEIGHT.values())
        # Operators act on the dominant hazard, so the band leans on the worst
        # hazard while the mean keeps the rest of the profile represented.
        row["aggregate"] = round(worst, 1)
        row["weighted"] = round(0.68 * worst + 0.32 * mean, 1)
        row["band"] = band_for(float(row["weighted"]))
        row["formation"] = next(
            (f["name"] for f in well["formations"] if f["topMd"] <= depth <= f["baseMd"]),
            well["formation"],
        )
        samples.append(row)  # type: ignore[arg-type]
        depth += step

    # 100 m bands, deepest first (how engineers read a depth log)
    band_size = 100.0
    bands: List[dict] = []
    for row in samples:
        bands.append(
            {
                "depth": float(row["depth"]),
                "band": row["band"],
                "formation": row["formation"],
                "weighted": row["weighted"],
                "hazards": {h: row[h] for h in HAZARDS},
            }
        )
    grouped: Dict[float, List[dict]] = {}
    for row in bands:
        key = math.floor(row["depth"] / band_size) * band_size
        grouped.setdefault(key, []).append(row)

    summary = []
    for key in sorted(grouped, reverse=True):
        rows = grouped[key]
        worst = max(rows, key=lambda r: r["weighted"])
        summary.append(
            {
                "depth": int(key),
                "band": worst["band"],
                "formation": worst["formation"],
                "weighted": round(sum(r["weighted"] for r in rows) / len(rows), 1),
                "hazards": {
                    h: round(max(r["hazards"][h] for r in rows), 1) for h in HAZARDS
                },
            }
        )

    return {
        "wellId": well["id"],
        "top": top,
        "bottom": bottom,
        "step": step,
        "hazards": list(HAZARDS),
        "samples": samples,
        "bands": summary,
        "criticalBands": [b for b in summary if b["band"] in {"CRITICAL", "HIGH"}],
    }


def upcoming_windows(corpus, well: dict) -> List[dict]:
    """Predictions for current depth, +50 m, +100 m and the next formation."""
    current = well["currentDepthMd"]
    next_formation = next(
        (
            f
            for f in sorted(well["formations"], key=lambda f: f["topMd"])
            if f["topMd"] > current
        ),
        None,
    )
    windows = [
        {"key": "current", "label": "Current depth", "depth": current},
        {"key": "next50", "label": "Next 50 m", "depth": current + 50.0},
        {"key": "next100", "label": "Next 100 m", "depth": current + 100.0},
    ]
    if next_formation is not None:
        windows.append(
            {
                "key": "nextFormation",
                "label": f"Next formation · {next_formation['name']}",
                "depth": next_formation["topMd"] + 30.0,
            }
        )

    for window in windows:
        priors = formation_hazard_priors(corpus, well, window["depth"])
        load = offset_risk_load(corpus, well, window["depth"])
        window["predictions"] = [
            predict(
                well,
                corpus,
                hazard=hazard,
                depth=window["depth"],
                window_label=window["label"],
                formation_prior=priors,
                offset_load=load,
            )
            for hazard in HAZARDS
        ]
        window["worst"] = max(window["predictions"], key=lambda p: p["probability"])
    return windows


def well_risk_summary(corpus, well: dict) -> dict:
    """Compact six-hazard snapshot used by dashboards, alerts and reports."""
    priors = formation_hazard_priors(corpus, well, well["currentDepthMd"])
    load = offset_risk_load(corpus, well, well["currentDepthMd"])
    predictions = [
        predict(
            well,
            corpus,
            hazard=hazard,
            depth=well["currentDepthMd"],
            formation_prior=priors,
            offset_load=load,
        )
        for hazard in HAZARDS
    ]
    worst = max(predictions, key=lambda p: p["probability"])
    composite = sum(p["probability"] for p in predictions) / len(predictions)
    # Bias the composite toward the single dominant hazard, as a drilling
    # supervisor would: one critical risk outweighs five low ones.
    composite = max(composite, worst["probability"] * 0.82)
    return {
        "wellId": well["id"],
        "depth": well["currentDepthMd"],
        "composite": round(composite * 100.0, 1),
        "band": band_for(composite * 100.0),
        "worst": {
            "hazard": worst["hazard"],
            "label": worst["label"],
            "probabilityPct": worst["probabilityPct"],
            "confidencePct": worst["confidencePct"],
            "band": worst["band"],
        },
        "predictions": [
            {
                "hazard": p["hazard"],
                "label": p["label"],
                "probabilityPct": p["probabilityPct"],
                "confidencePct": p["confidencePct"],
                "band": p["band"],
                "topDriver": p["topDrivers"][0] if p["topDrivers"] else None,
            }
            for p in predictions
        ],
        "actions": worst["recommendedActions"],
        "drivers": worst["topDrivers"],
    }


def feature_importance() -> List[dict]:
    """Global model importance, averaged over hazards."""
    totals: Dict[str, float] = {}
    counts: Dict[str, int] = {}
    for spec in MODEL.values():
        for name, weight in spec["weights"].items():
            totals[name] = totals.get(name, 0.0) + abs(weight)
            counts[name] = counts.get(name, 0) + 1
    out = [
        {
            "feature": name,
            "label": FEATURE_LABELS[name],
            "importance": round(total / counts[name], 4),
        }
        for name, total in totals.items()
    ]
    out.sort(key=lambda row: row["importance"], reverse=True)
    peak = out[0]["importance"] if out else 1.0
    for row in out:
        row["importancePct"] = round(100.0 * row["importance"] / peak, 1)
    return out


def model_card() -> dict:
    return {
        "name": "DrillMind Hazard Ensemble",
        "version": "1.4.0",
        "structural": "Per-hazard calibrated logistic regression (exact linear Shapley attributions)",
        "trainingCorpus": "Deterministic synthetic re-drill of 12 fields across 3 basins",
        "hazards": [
            {"hazard": h, "label": MODEL[h]["label"], "rationale": MODEL[h]["rationale"]}
            for h in HAZARDS
        ],
        "featureImportance": feature_importance(),
        "calibration": "Platt-scaled on holdout offsets; monotone in all pressure-window features",
        "serving": "In-process, <3 ms per hazard-depth evaluation",
    }


def sequence_analogues(corpus, well: dict, hazard: str, limit: int = 5) -> List[dict]:
    """Wells whose incident sequence most resembles a hazard's emergence here."""
    scored: List[tuple[float, dict]] = []
    for other in corpus.wells:
        if other["id"] == well["id"]:
            continue
        similar_events = [e for e in other["events"] if e["type"] == hazard]
        if not similar_events:
            continue
        formation_match = 1.0 if any(f["name"] == well["formation"] for f in other["formations"]) else 0.0
        basin_match = 1.0 if other["basin"] == well["basin"] else 0.0
        depth_penalty = min(280.0, abs(other["totalDepthMd"] - well["totalDepthMd"])) / 280.0
        score = 0.45 * formation_match + 0.3 * basin_match + 0.25 * (1.0 - depth_penalty)
        scored.append((score, other))
    scored.sort(key=lambda row: row[0], reverse=True)
    return [
        {
            "wellId": other["id"],
            "name": other["name"],
            "score": round(score, 3),
            "formation": other["formation"],
            "events": len([e for e in other["events"] if e["type"] == hazard]),
        }
        for score, other in scored[:limit]
    ]
