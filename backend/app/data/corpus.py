"""Deterministic synthetic drilling corpus.

Generates the well-by-well institutional memory used by every screen of
DrillMind AI: wells, formation intersections, historical events with full
incident replays, lessons learned and non-productive-time economics.

The corpus is *synthetic but structurally faithful*: stratigraphy, pore /
fracture gradients, hazard priors and casing philosophy follow the published
Assam-Arakan, Cambay and Krishna-Godavari basin character. Every value is
derived from a seed so the platform is fully reproducible.
"""

from __future__ import annotations

import hashlib
import math
import random
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Sequence

from . import (
    EVENT_LABELS,
    EVENT_TYPES,
    FIELDS,
    FORMATION_STACKS,
    HAZARDS,
    band_for,
)

#: Modelled length of the currently open (uncased) hole section, in metres.
#: 1300 m is representative of a long 8.5" section in these basins and is what
#: the mud-weight programme below is designed against.
OPEN_HOLE_LENGTH = 1300.0


# --------------------------------------------------------------------------
# Deterministic helpers
# --------------------------------------------------------------------------


def stable_rng(*parts: object) -> random.Random:
    """A ``random.Random`` seeded from a stable hash of ``parts``.

    ``hash()`` is salted per-process for strings, so we use SHA-256 to keep the
    corpus byte-identical across restarts and machines.
    """
    key = "|".join(str(p) for p in parts)
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def _round(value: float, digits: int = 2) -> float:
    return round(value + 0.0, digits)


# --------------------------------------------------------------------------
# Directional survey maths
# --------------------------------------------------------------------------


def _min_curvature(
    md1: float, inc1: float, azi1: float, md2: float, inc2: float, azi2: float
) -> tuple[float, float, float]:
    """Return (northing, easting, tvd) deltas between two survey stations."""
    i1, i2 = math.radians(inc1), math.radians(inc2)
    a1, a2 = math.radians(azi1), math.radians(azi2)
    dmd = md2 - md1
    cos_dogleg = math.cos(i2 - i1) - math.sin(i1) * math.sin(i2) * (1 - math.cos(a2 - a1))
    dogleg = math.acos(max(-1.0, min(1.0, cos_dogleg)))
    ratio = 2.0 * math.tan(dogleg / 2.0) / dogleg if dogleg > 1e-9 else 1.0
    dn = (dmd / 2.0) * (math.sin(i1) * math.cos(a1) + math.sin(i2) * math.cos(a2)) * ratio
    de = (dmd / 2.0) * (math.sin(i1) * math.sin(a1) + math.sin(i2) * math.sin(a2)) * ratio
    dv = (dmd / 2.0) * (math.cos(i1) + math.cos(i2)) * ratio
    return dn, de, dv


def build_trajectory(
    td_md: float,
    kop_md: float,
    target_inc: float,
    target_azi: float,
    build_rate: float,
    step_m: float = 25.0,
    kickoff_azi: Optional[float] = None,
) -> List[dict]:
    """Build a build-and-hold directional survey down to ``td_md``."""
    kickoff_azi = target_azi if kickoff_azi is None else kickoff_azi
    stations: List[dict] = []
    northing = easting = tvd = 0.0
    inc = 0.0
    azi = kickoff_azi
    md = 0.0
    stations.append({"md": 0.0, "tvd": 0.0, "inc": 0.0, "azi": round(azi, 2), "northing": 0.0, "easting": 0.0, "dls": 0.0})

    while md < td_md - 1e-6:
        next_md = min(md + step_m, td_md)
        dmd = next_md - md
        if md >= kop_md and inc < target_inc:
            inc = min(target_inc, inc + build_rate * (dmd / 30.0))
            # rotate azimuth progressively while building
            if abs(target_azi - azi) > 1e-6:
                azi += (target_azi - kickoff_azi) * (dmd / max(td_md - kop_md, 1.0))
        dls = 0.0 if dmd <= 0 else (inc - stations[-1]["inc"]) * (30.0 / dmd)
        dn, de, dv = _min_curvature(md, stations[-1]["inc"], stations[-1]["azi"], next_md, inc, azi)
        northing += dn
        easting += de
        tvd += dv
        md = next_md
        stations.append(
            {
                "md": round(md, 1),
                "tvd": round(abs(tvd), 1),
                "inc": round(inc, 2),
                "azi": round(azi % 360.0, 2),
                "northing": round(northing, 1),
                "easting": round(easting, 1),
                "dls": round(abs(dls), 2),
            }
        )
    return stations


# --------------------------------------------------------------------------
# Events
# --------------------------------------------------------------------------

#: Non-productive-time ranges in hours keyed by (event type, severity).
_NPT_RANGES: Dict[tuple[str, str], tuple[float, float]] = {
    ("MUDFLOSS", "LOW"): (1.5, 6.0),
    ("MUDFLOSS", "MEDIUM"): (6.0, 18.0),
    ("MUDFLOSS", "HIGH"): (18.0, 52.0),
    ("MUDFLOSS", "CRITICAL"): (52.0, 140.0),
    ("LOST_CIRCULATION", "HIGH"): (20.0, 60.0),
    ("KICK", "LOW"): (2.0, 5.0),
    ("KICK", "MEDIUM"): (5.0, 16.0),
    ("KICK", "HIGH"): (16.0, 48.0),
    ("KICK", "CRITICAL"): (48.0, 120.0),
    ("OVERPRESSURE", "MEDIUM"): (4.0, 14.0),
    ("OVERPRESSURE", "HIGH"): (14.0, 40.0),
    ("OVERPRESSURE", "CRITICAL"): (40.0, 96.0),
    ("TORQUE_SPIKE", "LOW"): (1.0, 4.0),
    ("TORQUE_SPIKE", "MEDIUM"): (4.0, 12.0),
    ("TORQUE_SPIKE", "HIGH"): (12.0, 34.0),
    ("TORQUE_SPIKE", "CRITICAL"): (34.0, 84.0),
    ("STUCK_PIPE", "LOW"): (2.0, 8.0),
    ("STUCK_PIPE", "MEDIUM"): (8.0, 24.0),
    ("STUCK_PIPE", "HIGH"): (24.0, 72.0),
    ("STUCK_PIPE", "CRITICAL"): (72.0, 220.0),
    ("CEMENTING_FAILURE", "LOW"): (6.0, 16.0),
    ("CEMENTING_FAILURE", "MEDIUM"): (16.0, 44.0),
    ("CEMENTING_FAILURE", "HIGH"): (44.0, 110.0),
    ("CEMENTING_FAILURE", "CRITICAL"): (110.0, 260.0),
    ("BIT_DAMAGE", "LOW"): (4.0, 10.0),
    ("BIT_DAMAGE", "MEDIUM"): (10.0, 28.0),
    ("BIT_DAMAGE", "HIGH"): (28.0, 64.0),
    ("BIT_DAMAGE", "CRITICAL"): (64.0, 140.0),
}

_RIG_RATE_USD_PER_DAY = {"Assam-Arakan": 96_000.0, "Cambay": 48_000.0, "Krishna-Godavari": 62_000.0}


MITIGATIONS: Dict[str, List[str]] = {
    "MUDFLOSS": [
        "Spot LCM pill (blend of fine + medium + coarse carbonate) across the loss zone",
        "Reduce equivalent circulating density and control ROP through the interval",
        "Switch to a thixotropic high-fluid-loss-squeeze mud while drilling ahead",
        "Pump gunk / bentonite-diesel squeeze to seal the fractured band",
        "Set casing early and drill ahead with a reduced mud weight design",
    ],
    "KICK": [
        "Shut in and record SIDPP/SICP, then circulate out on a driller's method kill sheet",
        "Increase mud weight to achieve 0.5 ppg trip margin over the pore pressure",
        "Install a rotating control device and drill ahead with a managed pressure window",
        "Tighten connection gas monitoring and reduce flow-check thresholds",
    ],
    "OVERPRESSURE": [
        "Revise the pore pressure prediction using offset well D-exponent analysis",
        "Set a protective casing seat ahead of the pressure ramp",
        "Raise mud weight in controlled steps with full mud-logging surveillance",
        "Migrate to a managed pressure drilling system with a closed-loop chokeman",
    ],
    "TORQUE_SPIKE": [
        "Reduce weight on bit and optimise RPM to damp torsional oscillation",
        "Run a torque-and-drag model before the next stand and reamer the interval",
        "Switch to a PDC bit with a shock sub and recondition the BHA stabilisation",
        "Wiper trip with high-viscosity sweeps to clear the hole",
    ],
    "STUCK_PIPE": [
        "Spot a lubricant / pipe-freeing pill and work the string with controlled jarring",
        "Back-off and fish with a washover assembly after jarring is exhausted",
        "Mechanically clean the hole with wiper trips before running casing",
        "Adopt inhibited mud chemistry and maintain a minimum 1500 lb overpull margin",
    ],
    "CEMENTING_FAILURE": [
        "Stage the job with a light lead slurry and a gas-tight tail below the shoe",
        "Wash and ream the hole, then run a centraliser-dense liner with spacer trains",
        "Perform a remedial squeeze after a top-job verification log",
        "Reduce mud weight ahead of the job to prevent losses during displacement",
    ],
    "BIT_DAMAGE": [
        "Trip for bit inspection and switch to an abrasion-resistant cutter grade",
        "Reduce rotary speed and monitor torque harmonics with a downhole vibration sub",
        "Optimise WOB with a bit-specific performance curve before drilling ahead",
    ],
}

REPLAY_ACTIONS: Dict[str, List[tuple[float, str]]] = {
    "MUDFLOSS": [(0.30, "Partial losses detected — pit volume down 3 m³"), (0.55, "Spot LCM pill and pump across the loss zone"), (0.78, "Reduce mud weight and control ROP")],
    "KICK": [(0.22, "Pit gain flagged on the flow check"), (0.38, "Shut in — record SIDPP / SICP"), (0.58, "Raise mud weight and circulate out the influx"), (0.82, "Resume drilling with a trip margin")],
    "OVERPRESSURE": [(0.25, "Connection gas trend increasing"), (0.48, "Raise mud weight in controlled steps"), (0.72, "Recompute pore pressure and set casing seat")],
    "TORQUE_SPIKE": [(0.28, "Torque oscillation exceeds the high alarm"), (0.50, "Reduce WOB, optimise RPM"), (0.74, "Re-ream the interval and stabilise the BHA")],
    "STUCK_PIPE": [(0.20, "Torque climbs 18 → 34 kN·m with rising drag"), (0.40, "String jammed — activate the jar"), (0.62, "Spot pipe-freeing pill, work the string"), (0.85, "Recovered — wiper trip and ream the interval")],
    "CEMENTING_FAILURE": [(0.30, "Pump pressure anomaly during displacement"), (0.52, "Partial losses with no returns at the shoe"), (0.76, "Remedial squeeze job scheduled")],
    "BIT_DAMAGE": [(0.26, "ROP declines with erratic torque"), (0.52, "Trip for bit inspection"), (0.78, "New bit run on bottom")],
}

OUTCOME_WEIGHTS = {"SUCCESS": 0.62, "PARTIAL": 0.28, "FAILURE": 0.10}


def _severity_for(rng: random.Random, hazard: str, risk_pressure: float) -> str:
    """Draw a severity, biased upward by the local risk pressure (0-1)."""
    weights = [
        max(0.02, 0.52 - 0.45 * risk_pressure),
        max(0.05, 0.30 - 0.08 * risk_pressure),
        0.12 + 0.28 * risk_pressure,
        0.02 + 0.30 * risk_pressure**1.5,
    ]
    return rng.choices(list(("LOW", "MEDIUM", "HIGH", "CRITICAL")), weights=weights, k=1)[0]


def _npt_hours(event_type: str, severity: str, rng: random.Random) -> float:
    low, high = _NPT_RANGES.get((event_type, severity), (2.0, 12.0))
    return _round(rng.uniform(low, high), 1)


def _build_replay(
    rng: random.Random,
    event_type: str,
    start_md: float,
    mud_weight: float,
    base_torque: float,
    base_rop: float,
    base_spp: float,
    severity: str,
) -> dict:
    """Synthesise a 1 Hz-style parameter log around a historical incident."""
    samples = 42
    actions = REPLAY_ACTIONS.get(event_type, [(0.4, "Engineer intervention"), (0.75, "Outcome recorded")])
    severity_scale = {"LOW": 0.55, "MEDIUM": 0.8, "HIGH": 1.1, "CRITICAL": 1.45}[severity]
    steps = []
    md = start_md - rng.uniform(6.0, 18.0)
    torque = base_torque
    mw = mud_weight
    spp = base_spp
    rop = base_rop
    hookload = rng.uniform(120.0, 190.0)
    pit = rng.uniform(148.0, 172.0)
    gas = rng.uniform(0.2, 1.1)

    action_at = {max(1, int(frac * samples)): label for frac, label in actions}
    fired: List[str] = []

    for index in range(samples):
        t = index / (samples - 1)
        if index in action_at:
            fired.append(action_at[index])

        if event_type == "MUDFLOSS":
            md += 0.09
            pit -= 0.55 * severity_scale * (1.0 + t)
            spp -= 6.5 * severity_scale
            rop *= 0.985
        elif event_type == "KICK":
            md += 0.14
            pit += 0.62 * severity_scale
            gas += 0.34 * severity_scale
            spp += 5.0 * severity_scale
            rop *= 0.94
        elif event_type == "OVERPRESSURE":
            md += 0.16
            gas += 0.22 * severity_scale
            spp += 3.2 * severity_scale
            rop *= 0.97
        elif event_type == "TORQUE_SPIKE":
            torque += 5.5 * severity_scale * math.sin(index * 0.9) + 2.4 * severity_scale
            rop *= 0.95
        elif event_type == "STUCK_PIPE":
            torque += 7.2 * severity_scale * (1.0 - t) + 1.2
            hookload -= 9.0 * severity_scale + index * 0.4
            rop *= 0.82
            md -= 0.35
        elif event_type == "CEMENTING_FAILURE":
            spp += 9.0 * severity_scale * math.sin(index * 0.5)
            pit -= 0.34 * severity_scale
        elif event_type == "BIT_DAMAGE":
            rop *= 0.93
            torque += 3.4 * severity_scale

        if t > 0.62:
            torque *= 0.985
            rop *= 1.012

        steps.append(
            {
                "t": index,
                "md": _round(md, 1),
                "torque": _round(max(2.0, torque), 1),
                "mudWeight": _round(mw, 2),
                "spp": _round(max(80.0, spp), 0),
                "rop": _round(max(0.2, rop), 2),
                "hookload": _round(max(20.0, hookload), 1),
                "pitVolume": _round(max(96.0, pit), 1),
                "gas": _round(max(0.0, gas), 2),
                "action": action_at.get(index),
            }
        )

    return {
        "samples": steps,
        "actions": [{"at": max(1, int(frac * samples)), "label": label} for frac, label in actions],
        "signature": [step["action"] for step in steps if step["action"]],
        "firedActions": fired,
    }


# --------------------------------------------------------------------------
# Well construction
# --------------------------------------------------------------------------


def _choose_target_depth(rng: random.Random, stack: Sequence[dict], well_index: int) -> float:
    """Pick the total depth, biased toward the deeper prospects for newer wells."""
    # Deeper formations attract more exploration drilling in recent wells.
    depth_bias = [0.35, 0.2, 0.14, 0.11, 0.08, 0.05, 0.04, 0.03][: len(stack)]
    if well_index % 4 == 0:  # deeper exploration wells
        depth_bias = list(reversed(depth_bias))
    total = sum(depth_bias)
    weights = [b / total for b in depth_bias]
    formation = rng.choices(list(stack), weights=weights, k=1)[0]
    span = formation["base"] - formation["top"]
    return _round(rng.uniform(formation["top"] + 0.35 * span, formation["base"] - 0.02 * span), 1)


def _generate_well(
    rng: random.Random,
    field: dict,
    index: int,
    status: str,
    today: datetime,
) -> dict:
    stack = FORMATION_STACKS[field["basin"]]
    td_md = _choose_target_depth(rng, stack, index)
    is_active = status == "ACTIVE"

    # Casing / trajectory philosophy
    deviated = rng.random() < 0.68
    kop_md = _round(rng.uniform(260.0, 980.0), 1) if deviated else 0.0
    target_inc = _round(rng.uniform(12.0, 62.0), 1) if deviated else 0.0
    target_azi = _round(rng.uniform(15.0, 340.0), 1)
    build_rate = _round(rng.uniform(1.4, 3.1), 2)
    survey = build_trajectory(td_md, kop_md, target_inc, target_azi, build_rate)

    # Which formations are actually intersected
    formation_hits = [
        f for f in stack
        if f["top"] < td_md
    ]
    intersected: List[dict] = []
    for formation in formation_hits:
        top = formation["top"] + rng.uniform(-45.0, 45.0)
        base = min(td_md, formation["base"] + rng.uniform(-45.0, 45.0))
        if base <= top:
            continue
        intersected.append(
            {
                "name": formation["name"],
                "topMd": _round(top, 1),
                "baseMd": _round(base, 1),
                "lithology": formation["lithology"],
                "reservoir": formation["reservoir"],
                "porosity": formation["porosity"],
                "permMd": formation["perm_md"],
                "poreEmw": _round(formation["pore_emw"] + rng.uniform(-0.15, 0.15), 2),
                "fracEmw": _round(formation["frac_emw"] + rng.uniform(-0.2, 0.2), 2),
                "primaryHazard": formation["primary_hazard"],
            }
        )

    if not intersected:
        intersected = [{
            "name": stack[0]["name"], "topMd": stack[0]["top"], "baseMd": td_md,
            "lithology": stack[0]["lithology"], "reservoir": stack[0]["reservoir"],
            "porosity": stack[0]["porosity"], "permMd": stack[0]["perm_md"],
            "poreEmw": stack[0]["pore_emw"], "fracEmw": stack[0]["frac_emw"],
            "primaryHazard": stack[0]["primary_hazard"],
        }]

    target_formation = intersected[-1]

    if is_active:
        current_depth = _round(td_md * rng.uniform(0.42, 0.94), 1)
    else:
        current_depth = td_md

    # Mud weight programme. The mud currently in the hole has to cover the pore
    # pressure of *every* formation the open section penetrates, not just the
    # target. The Assam-Arakan stack is deliberately non-monotonic (the
    # overpressured Kopili Shale sits above the Basement), so designing against
    # the deepest zone alone would leave the bit several ppg underbalanced and
    # the well on a kick. Equally the mud must stay below the tightest fracture
    # gradient in that section. The open section is modelled as the deepest
    # OPEN_HOLE_LENGTH metres of drilled hole.
    section_top = max(intersected[0]["topMd"], current_depth - OPEN_HOLE_LENGTH)
    open_hole = [
        f for f in intersected
        if f["baseMd"] > section_top and f["topMd"] < current_depth
    ] or [target_formation]
    pore_envelope = max(f["poreEmw"] for f in open_hole)
    frac_envelope = min(f["fracEmw"] for f in open_hole)

    design_margin = rng.uniform(0.30, 0.95)
    mud_weight = min(
        frac_envelope - rng.uniform(0.15, 0.75),
        pore_envelope + design_margin,
    )
    mud_weight = _round(max(pore_envelope + 0.08, mud_weight), 2)

    overpressure_margin = _round(mud_weight - pore_envelope, 2)
    frac_margin = _round(frac_envelope - mud_weight, 2)

    # Operating parameters drift with depth and formation hardness.
    rock_factor = 1.0 + 0.55 * (target_formation["name"] in {"Basement Complex", "Deccan Trap", "Barail Sandstone"})
    rop = _round(max(1.4, rng.gauss(16.0, 5.5) / rock_factor), 2)
    rpm = _round(rng.uniform(70.0, 165.0), 0)
    wob = _round(rng.uniform(8.0, 34.0), 1)
    flow_rate = _round(rng.uniform(520.0, 940.0), 0)
    spp = _round(rng.uniform(2100.0, 4200.0), 0)
    torque = _round(rng.uniform(11.0, 31.0) * rock_factor, 1)
    # HPHT Assam wells run hotter than the Cambay / KG onshore acreage.
    bha_temp = _round(
        30.0 + (td_md * 0.026) * (1.0 + 0.12 * (field["basin"] == "Assam-Arakan")), 1
    )

    # ---- Events -----------------------------------------------------------
    events: List[dict] = []
    hazard_risk_pressure = 0.0
    event_counter = 0

    for formation in intersected:
        exposure = formation["baseMd"] - formation["topMd"]
        if exposure <= 0:
            continue
        # Longer exposure and higher historical priors mean more events.
        intensity = (exposure / 900.0) * rng.uniform(0.55, 1.55)
        priors: Dict[str, float] = next(
            f["priors"] for f in stack if f["name"] == formation["name"]
        )
        for event_type, prior in priors.items():
            if prior <= 0:
                continue
            expected = prior * intensity * 2.4
            count = int(expected) + (1 if rng.random() < (expected % 1.0) else 0)
            for _ in range(count):
                is_primary = event_type == formation["primaryHazard"]
                if is_primary:
                    low, high = next(
                        f["window"] for f in stack if f["name"] == formation["name"]
                    )
                    low = max(formation["topMd"], low)
                    high = min(formation["baseMd"], high)
                    if high <= low:
                        low, high = formation["topMd"], formation["baseMd"]
                    depth = rng.uniform(low, high)
                else:
                    depth = rng.uniform(formation["topMd"], formation["baseMd"])
                risk_pressure = min(1.0, 0.25 + 0.55 * intensity + (0.2 if is_primary else 0.0))
                hazard_risk_pressure = max(hazard_risk_pressure, risk_pressure if is_primary else risk_pressure * 0.7)
                severity = _severity_for(rng, event_type, risk_pressure)
                event_counter += 1
                event_id = f"{field['prefix']}-E{index:02d}{event_counter:03d}"
                npt = _npt_hours(event_type, severity, rng)
                rig_rate = _RIG_RATE_USD_PER_DAY[field["basin"]]
                outcome = rng.choices(
                    list(OUTCOME_WEIGHTS), weights=list(OUTCOME_WEIGHTS.values()), k=1
                )[0]
                mitigation = MITIGATIONS[event_type][
                    rng.randrange(len(MITIGATIONS[event_type]))
                ]
                mud_before = _round(max(8.2, mud_weight - rng.uniform(0.0, 0.9)), 2)
                if event_type in {"MUDFLOSS", "KICK"}:
                    mud_after = _round(mud_before + rng.uniform(0.2, 1.1), 2)
                else:
                    mud_after = _round(mud_before + rng.uniform(-0.15, 0.45), 2)

                replay = _build_replay(
                    rng, event_type, depth, mud_before, torque, rop, spp, severity
                )
                event_date = today - timedelta(
                    days=int(rng.uniform(30, 2600) * (0.15 if is_active else 1.0))
                )
                events.append(
                    {
                        "id": event_id,
                        "wellId": "",  # filled in by the caller
                        "type": event_type,
                        "label": EVENT_LABELS[event_type],
                        "formation": formation["name"],
                        "depth": _round(depth, 1),
                        "severity": severity,
                        "date": event_date.strftime("%Y-%m-%d"),
                        "nptHours": npt,
                        "costUsd": _round(npt * rig_rate / 24.0, 0),
                        "mitigation": mitigation,
                        "outcome": outcome,
                        "mudWeightBefore": mud_before,
                        "mudWeightAfter": mud_after,
                        "insight": (
                            f"{EVENT_LABELS[event_type]} in {formation['name']} at {_round(depth, 0):.0f} m. "
                            f"{mitigation} — outcome {outcome.lower()}."
                        ),
                        "replay": replay,
                    }
                )

    events.sort(key=lambda e: e["depth"])

    # ---- Dates & lifecycle ------------------------------------------------
    field_age = max(4, today.year - field["discovered"])
    spud = today - timedelta(days=int(rng.uniform(60, 360) * field_age / 6.0))
    if not is_active:
        spud = today - timedelta(days=int(rng.uniform(420, field_age * 365.0)))
    completion = spud + timedelta(days=int(rng.uniform(45, 260)))

    if is_active:
        status = "ACTIVE"
    else:
        # Historical wells become RISK / CRITICAL wells based on their record
        if not events:
            status = "HISTORICAL"
        else:
            worst = sum(
                1 for e in events if e["severity"] in {"HIGH", "CRITICAL"}
            )
            if worst >= 4 and rng.random() < 0.55:
                status = "CRITICAL"
            elif worst >= 1 and rng.random() < 0.62:
                status = "RISK"
            else:
                status = "HISTORICAL"

    well_id = f"{field['prefix']}-{chr(65 + (index % 6))}{index:02d}"

    # Composite offset risk score. Incident counts are normalised per 1000 m of
    # hole so a deep well is not penalised merely for drilling more footage, and
    # the pressure terms are evaluated *at the bit* — where the next hazard
    # actually sits — rather than against the whole-well envelope. The previous
    # formulation leaned on `hazard_risk_pressure` and a per-formation event
    # load, both of which saturate for the median well and so flattened the
    # fleet into a single band.
    footage_km = max(1.0, td_md / 1000.0)
    event_load = sum(
        {"LOW": 1.0, "MEDIUM": 2.2, "HIGH": 4.4, "CRITICAL": 7.5}[e["severity"]] for e in events
    )
    hazard_per_km = event_load / footage_km
    high_critical_per_km = (
        sum(1 for e in events if e["severity"] in {"HIGH", "CRITICAL"}) / footage_km
    )
    critical_events = sum(1 for e in events if e["severity"] == "CRITICAL")

    bit_formation = next(
        (f for f in intersected if f["topMd"] - 25.0 <= current_depth <= f["baseMd"] + 25.0),
        intersected[-1],
    )
    bit_overbalance = mud_weight - bit_formation["poreEmw"]
    bit_frac_margin = bit_formation["fracEmw"] - (
        mud_weight + 0.22 + 0.35 * (flow_rate / 900.0)
    )

    def _unit(value: float) -> float:
        return max(0.0, min(1.0, value))

    risk_score = (
        6.0
        + 1.9 * min(16.0, hazard_per_km)
        + 9.0 * min(3.0, high_critical_per_km)
        + 1.5 * min(6.0, float(critical_events))
        + 7.0 * _unit((bit_overbalance - 0.4) / 2.2)
        + 6.0 * _unit(td_md / 5500.0)
        + 4.0 * _unit((bit_frac_margin - 0.5) / 3.0)
        + (5.0 if is_active else 0.0)
    )
    if status == "CRITICAL":
        risk_score += 6.0
    elif status == "RISK":
        risk_score += 3.0
    risk_score = _round(max(4.0, min(99.0, risk_score)), 1)

    # Cumulative cost of the well's historic incidents
    total_npt = _round(sum(e["nptHours"] for e in events), 1)
    total_cost = _round(sum(e["costUsd"] for e in events), 0)

    lessons = []
    seen: set[str] = set()
    for event in sorted(events, key=lambda e: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}[e["severity"]]):
        if event["type"] in seen:
            continue
        seen.add(event["type"])
        lessons.append(
            {
                "eventType": event["type"],
                "formation": event["formation"],
                "depth": event["depth"],
                "severity": event["severity"],
                "outcome": event["outcome"],
                "text": event["mitigation"],
                "nptHours": event["nptHours"],
            }
        )

    return {
        "id": well_id,
        "name": f"{field['name']} {chr(65 + (index % 6))}{index:02d}",
        "field": field["name"],
        "basin": field["basin"],
        "state": field["state"],
        "operator": field["operator"],
        "lat": _round(field["lat"] + rng.uniform(-0.085, 0.085), 5),
        "lon": _round(field["lon"] + rng.uniform(-0.085, 0.085), 5),
        "status": status,
        "wellType": rng.choices(
            ["Development", "Exploration", "Appraisal"], weights=[0.68, 0.2, 0.12], k=1
        )[0],
        "spudDate": spud.strftime("%Y-%m-%d"),
        "completionDate": None if is_active else completion.strftime("%Y-%m-%d"),
        "totalDepthMd": td_md,
        "currentDepthMd": current_depth,
        "formation": target_formation["name"],
        "formationTopMd": target_formation["topMd"],
        "reservoir": target_formation["reservoir"],
        "lithology": target_formation["lithology"],
        "isDeviated": deviated,
        "kopMd": kop_md,
        "targetInclination": target_inc,
        "targetAzimuth": target_azi,
        "buildRate": build_rate,
        "mudWeight": mud_weight,
        "overbalancePpg": overpressure_margin,
        "fracMarginPpg": frac_margin,
        "poreEmw": pore_envelope,
        "fracEmw": frac_envelope,
        "rpm": rpm,
        "wob": wob,
        "rop": rop,
        "flowRate": flow_rate,
        "spp": spp,
        "torque": torque,
        "bottomHoleTempC": bha_temp,
        "riskScore": risk_score,
        "riskBand": band_for(risk_score),
        "hazardPressure": _round(hazard_risk_pressure, 3),
        "eventCount": len(events),
        "criticalEventCount": sum(1 for e in events if e["severity"] == "CRITICAL"),
        "totalNptHours": total_npt,
        "totalCostUsd": total_cost,
        "formations": intersected,
        "trajectory": survey,
        "events": events,
        "lessonsLearned": lessons,
    }


# --------------------------------------------------------------------------
# Corpus assembly
# --------------------------------------------------------------------------


class Corpus:
    """In-memory drilling corpus with fast lookups."""

    def __init__(self, wells: List[dict], seed: int) -> None:
        self.seed = seed
        self.wells = wells
        self.wells_by_id: Dict[str, dict] = {w["id"]: w for w in wells}
        self.events: List[dict] = []
        for well in wells:
            for event in well["events"]:
                event["wellId"] = well["id"]
                self.events.append(event)
        self.events_by_id: Dict[str, dict] = {e["id"]: e for e in self.events}
        # Active wells carry live telemetry; keep them ordered for stable output.
        self.active_wells = [w for w in wells if w["status"] == "ACTIVE"]
        self.active_wells.sort(key=lambda w: w["riskScore"], reverse=True)

    # -- query helpers ------------------------------------------------------

    def events_for_well(self, well_id: str) -> List[dict]:
        return self.wells_by_id.get(well_id, {}).get("events", [])

    def formation_names(self) -> List[str]:
        return sorted({w["formation"] for w in self.wells})

    def wells_with_formation(self, formation: str) -> List[dict]:
        return [w for w in self.wells if any(f["name"] == formation for f in w["formations"])]

    def primary_well(self) -> dict:
        """The flagship active well used by Mission Control and the digital twin.

        Chosen for a blend of live activity, hazard severity and stratigraphic
        richness, so every panel has substantive content on first load.
        """
        if not self.active_wells:
            return max(self.wells, key=lambda w: w["riskScore"])
        return max(
            self.active_wells,
            key=lambda w: 0.55 * w["riskScore"] + 0.45 * (w["totalDepthMd"] / 60.0),
        )

    def stats(self) -> dict:
        return {
            "activeWells": sum(1 for w in self.wells if w["status"] == "ACTIVE"),
            "historicalWells": sum(1 for w in self.wells if w["status"] != "ACTIVE"),
            "totalWells": len(self.wells),
            "formationRecords": sum(len(w["formations"]) for w in self.wells),
            "eventsAnalyzed": len(self.events),
            "totalNptHours": _round(sum(e["nptHours"] for e in self.events), 1),
            "totalCostUsd": _round(sum(e["costUsd"] for e in self.events), 0),
            "fields": len({w["field"] for w in self.wells}),
            "basins": len({w["basin"] for w in self.wells}),
        }


def generate_corpus(seed: int = 20260214) -> Corpus:
    """Build the full deterministic corpus."""
    today = datetime(2026, 8, 15)
    wells: List[dict] = []

    # Allocation of wells per field: mature Assam fields carry the richest memory.
    allocation = {
        "Naharkatiya": 18, "Moran": 15, "Rudrasagar": 13, "Lakwa": 14, "Geleki": 12,
        "Nazira": 11, "Digboi": 9, "Agaratala": 7, "Mehsana": 12, "Ahmedabad": 11,
        "Rajahmundry": 10, "Kakinada": 8,
    }

    global_index = 1
    for field in FIELDS:
        count = allocation.get(field["name"], 8)
        for local in range(count):
            rng = stable_rng(seed, field["name"], local)
            # Roughly 1 in 6 wells is currently being drilled somewhere.
            is_active = (global_index % 6 == 0) or (local < 2 and global_index % 11 == 0)
            status = "ACTIVE" if is_active else "HISTORICAL"
            well = _generate_well(rng, field, global_index, status, today)
            wells.append(well)
            global_index += 1

    # Guarantee a healthy number of live wells for the mission-control screens.
    actives = [w for w in wells if w["status"] == "ACTIVE"]
    if len(actives) < 22:
        needed = 22 - len(actives)
        candidates = [w for w in wells if w["status"] != "ACTIVE"]
        candidates.sort(key=lambda w: w["riskScore"], reverse=True)
        for well in candidates[:needed]:
            rng = stable_rng(seed, "promote", well["id"])
            well["status"] = "ACTIVE"
            well["completionDate"] = None
            well["currentDepthMd"] = _round(
                well["totalDepthMd"] * rng.uniform(0.38, 0.93), 1
            )

    return Corpus(wells, seed)
