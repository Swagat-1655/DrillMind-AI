"""What-If Simulation Lab.

Engineers perturb mud weight / RPM / WOB / ROP and the engine re-runs the full
hazard ensemble at the current depth and at the forward prediction windows,
returning signed risk deltas plus a sweep curve for each manipulated variable.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..data import HAZARDS
from .risk import formation_hazard_priors, offset_risk_load, predict

PARAMETER_RANGES: Dict[str, dict] = {
    "mudWeight": {"label": "Mud Weight", "unit": "ppg", "min": 8.2, "max": 17.5, "step": 0.1, "key": "mudWeight"},
    "rpm": {"label": "Rotary Speed", "unit": "rpm", "min": 40.0, "max": 220.0, "step": 5.0, "key": "rpm"},
    "wob": {"label": "Weight on Bit", "unit": "klbf", "min": 2.0, "max": 45.0, "step": 0.5, "key": "wob"},
    "rop": {"label": "Rate of Penetration", "unit": "m/hr", "min": 1.0, "max": 42.0, "step": 0.5, "key": "rop"},
    "flowRate": {"label": "Flow Rate", "unit": "gpm", "min": 320.0, "max": 1100.0, "step": 20.0, "key": "flowRate"},
}


def baseline_state(well: dict) -> Dict[str, float]:
    return {
        "mudWeight": well["mudWeight"],
        "rpm": well["rpm"],
        "wob": well["wob"],
        "rop": well["rop"],
        "flowRate": well["flowRate"],
    }


def _evaluate(corpus, well: dict, state: Dict[str, float]) -> Dict[str, float]:
    depth = well["currentDepthMd"]
    priors = formation_hazard_priors(corpus, well, depth)
    load = offset_risk_load(corpus, well, depth)
    out: Dict[str, float] = {}
    for hazard in HAZARDS:
        result = predict(
            well,
            corpus,
            hazard=hazard,
            depth=depth,
            window_label="whatif",
            mud_weight=state.get("mudWeight"),
            rpm=state.get("rpm"),
            wob=state.get("wob"),
            rop=state.get("rop"),
            formation_prior=priors,
            offset_load=load,
        )
        out[hazard] = result["probabilityPct"]
    return out


def _delta_label(before: float, after: float) -> str:
    delta = after - before
    if abs(delta) < 0.5:
        return "unchanged"
    return f"{'↑' if delta > 0 else '↓'} {abs(delta):.1f}%"


def simulate(corpus, well: dict, overrides: Optional[Dict[str, float]] = None, sweep: bool = True) -> dict:
    """Run the what-if scenario and return deltas plus sweep curves."""
    overrides = {k: float(v) for k, v in (overrides or {}).items() if v is not None}
    base = baseline_state(well)
    scenario = {**base, **{k: v for k, v in overrides.items() if k in base}}

    before = _evaluate(corpus, well, base)
    after = _evaluate(corpus, well, scenario)

    deltas: List[dict] = []
    for hazard in HAZARDS:
        b, a = before[hazard], after[hazard]
        change = a - b
        deltas.append(
            {
                "hazard": hazard,
                "before": round(b, 1),
                "after": round(a, 1),
                "delta": round(change, 1),
                "deltaPct": round(100.0 * change / b, 1) if b else 0.0,
                "direction": "down" if change < -0.5 else ("up" if change > 0.5 else "flat"),
                "label": _delta_label(b, a),
            }
        )
    deltas.sort(key=lambda row: row["delta"])

    charts: List[dict] = []
    if sweep:
        for key, spec in PARAMETER_RANGES.items():
            lo = max(spec["min"], base[key] - 2.5 * (spec["max"] - spec["min"]) / 10.0)
            hi = min(spec["max"], base[key] + 2.5 * (spec["max"] - spec["min"]) / 10.0)
            steps = 11
            points = []
            for index in range(steps):
                value = lo + (hi - lo) * index / (steps - 1)
                probe_base = {**scenario}
                probe_base[key] = round(value, 2)
                hazards = _evaluate(corpus, well, probe_base)
                points.append(
                    {
                        "x": round(value, 3),
                        "mudLoss": hazards["MUDFLOSS"],
                        "kick": hazards["KICK"],
                        "stuckPipe": hazards["STUCK_PIPE"],
                        "torqueSpike": hazards["TORQUE_SPIKE"],
                        "overpressure": hazards["OVERPRESSURE"],
                        "cementing": hazards["CEMENTING_FAILURE"],
                        "composite": round(
                            sum(hazards[h] for h in HAZARDS) / len(HAZARDS), 1
                        ),
                    }
                )
            charts.append(
                {
                    "parameter": key,
                    "label": spec["label"],
                    "unit": spec["unit"],
                    "baseline": base[key],
                    "current": scenario[key],
                    "points": points,
                }
            )

    # A plain-language verdict, mirroring what the copilot would say.
    biggest_win = min(deltas, key=lambda row: row["delta"])
    biggest_risk = max(deltas, key=lambda row: row["delta"])
    parts = []
    if biggest_win["delta"] < -0.5:
        parts.append(
            f"{biggest_win['hazard'].replace('_', ' ').title()} risk falls {abs(biggest_win['delta']):.0f}% "
            f"({biggest_win['before']:.0f}% → {biggest_win['after']:.0f}%)."
        )
    if biggest_risk["delta"] > 0.5:
        parts.append(
            f"Watch {biggest_risk['hazard'].replace('_', ' ').title()}: rises {biggest_risk['delta']:.0f}% "
            f"({biggest_risk['before']:.0f}% → {biggest_risk['after']:.0f}%)."
        )
    if not parts:
        parts.append("No material change to the hazard profile at this depth.")

    return {
        "wellId": well["id"],
        "wellName": well["name"],
        "depth": well["currentDepthMd"],
        "formation": well["formation"],
        "baseline": base,
        "scenario": scenario,
        "changed": {
            key: {"before": base[key], "after": scenario[key]}
            for key in scenario
            if abs(scenario[key] - base[key]) > 1e-9
        },
        "deltas": deltas,
        "charts": charts,
        "verdict": " ".join(parts),
        "ranges": PARAMETER_RANGES,
    }
