"""Live drilling telemetry.

The platform is wired to a synthetic but physically-plausible WITS-style
channel set. Values advance with wall-clock time so the Mission Control
screens genuinely move, and they are derived from the well's own state so the
numbers agree with the corpus everywhere else in the product.
"""

from __future__ import annotations

import math
import time
from typing import Dict, List, Optional

from ..data.corpus import stable_rng

CHANNELS = (
    ("depth", "Bit Depth", "m", 1),
    ("rop", "Rate of Penetration", "m/hr", 2),
    ("wob", "Weight on Bit", "klbf", 1),
    ("rpm", "Rotary Speed", "rpm", 0),
    ("torque", "Surface Torque", "kN·m", 1),
    ("spp", "Standpipe Pressure", "psi", 0),
    ("flowRate", "Flow Rate", "gpm", 0),
    ("mudWeight", "Mud Weight In", "ppg", 2),
    ("mudWeightOut", "Mud Weight Out", "ppg", 2),
    ("ecd", "Equivalent Circulating Density", "ppg", 2),
    ("hookload", "Hookload", "klbf", 1),
    ("gas", "Total Gas", "%", 2),
    ("pitVolume", "Active Pit Volume", "m³", 1),
    ("bhaTemp", "BHA Temperature", "°C", 1),
    ("vibration", "Downhole Vibration", "g", 2),
)


def _wave(phase: float, amplitude: float, period: float, offset: float = 0.0) -> float:
    return offset + amplitude * math.sin(2 * math.pi * phase / period)


def live_snapshot(
    well: dict,
    *,
    samples: int = 90,
    interval_s: float = 2.0,
    now: Optional[float] = None,
) -> dict:
    """Return current channel readings plus a rolling history window."""
    now = time.time() if now is None else now
    rng = stable_rng("telemetry", well["id"])
    jitter = [rng.uniform(-1.0, 1.0) for _ in range(24)]

    # A slow "drilling ahead" drift: 0.35-1.1 m per interval depending on ROP.
    advance_per_tick = max(0.05, well["rop"] * interval_s / 3600.0) * 1.0
    tail = [
        {
            "t": round(now - (samples - 1 - index) * interval_s, 2),
            "depth": round(
                well["currentDepthMd"] - (samples - 1 - index) * advance_per_tick, 2
            ),
            "rop": round(
                max(
                    0.4,
                    well["rop"]
                    + _wave(now - (samples - 1 - index) * interval_s, well["rop"] * 0.12, 47.0)
                    + jitter[index % len(jitter)] * 0.9,
                ),
                2,
            ),
            "wob": round(
                max(
                    1.0,
                    well["wob"]
                    + _wave(now - (samples - 1 - index) * interval_s, 2.1, 63.0)
                    + jitter[(index + 3) % len(jitter)] * 0.7,
                ),
                1,
            ),
            "rpm": round(
                max(20.0, well["rpm"] + _wave(now - (samples - 1 - index) * interval_s, 5.0, 91.0)),
                0,
            ),
            "torque": round(
                max(
                    2.0,
                    well["torque"]
                    + _wave(now - (samples - 1 - index) * interval_s, well["torque"] * 0.12, 71.0)
                    + jitter[(index + 7) % len(jitter)] * 0.9,
                ),
                1,
            ),
            "spp": round(
                max(
                    500.0,
                    well["spp"]
                    + _wave(now - (samples - 1 - index) * interval_s, 90.0, 83.0)
                    + jitter[(index + 11) % len(jitter)] * 55.0,
                ),
                0,
            ),
            "gas": round(
                max(
                    0.0,
                    0.6
                    + 0.5 * well["hazardPressure"]
                    + _wave(now - (samples - 1 - index) * interval_s, 0.32, 121.0)
                    + abs(jitter[(index + 5) % len(jitter)]) * 0.25,
                ),
                2,
            ),
        }
        for index in range(samples)
    ]

    last = tail[-1]
    depth = last["depth"]
    ecd = well["mudWeight"] + 0.22 + 0.35 * (well["flowRate"] / 900.0)
    hookload = 150.0 + well["wob"] * 1.4 + _wave(now, 6.0, 137.0)
    # Mud weight out picks up drilled solids and formation fluid; the drift is
    # signed by the well's own hazard pressure so losses read lighter and
    # influxes read heavier.
    mud_out = (
        well["mudWeight"]
        + _wave(now, 0.11, 211.0)
        + 0.16 * (well["hazardPressure"] - 0.5)
    )
    pit_baseline = 158.0
    pit = pit_baseline + _wave(now, 2.6, 173.0) - 6.0 * max(0.0, well["hazardPressure"] - 0.6)
    vibration = 0.42 + 0.30 * well["hazardPressure"] + _wave(now, 0.18, 57.0)
    bha_temp = well["bottomHoleTempC"] * (
        0.55 + 0.45 * min(1.0, depth / max(1.0, well["totalDepthMd"]))
    )

    current = {
        "depth": round(depth, 2),
        "rop": last["rop"],
        "wob": last["wob"],
        "rpm": last["rpm"],
        "torque": last["torque"],
        "spp": last["spp"],
        "flowRate": round(well["flowRate"] + _wave(now, 14.0, 97.0), 0),
        "mudWeight": well["mudWeight"],
        "mudWeightOut": round(mud_out + 0.05, 2),
        "ecd": round(ecd, 2),
        "hookload": round(max(30.0, hookload), 1),
        "gas": last["gas"],
        "pitVolume": round(pit, 1),
        "bhaTemp": round(bha_temp, 1),
        "vibration": round(max(0.05, vibration), 2),
    }

    layout = [
        {
            "key": key,
            "label": label,
            "unit": unit,
            "precision": precision,
            "value": current[key],
        }
        for key, label, unit, precision in CHANNELS
    ]

    # Control-limit surveillance: flag channels outside their operating envelope.
    alarms = []
    if current["gas"] > 1.6:
        alarms.append({"channel": "gas", "level": "HIGH", "message": "Total gas above the connection-gas threshold"})
    if current["vibration"] > 0.95:
        alarms.append({"channel": "vibration", "level": "HIGH", "message": "Downhole vibration outside the stable window"})
    if current["torque"] > well["torque"] * 1.35:
        alarms.append({"channel": "torque", "level": "MEDIUM", "message": "Torque excursion above the trend band"})
    if current["ecd"] > well["fracEmw"] - 0.25:
        alarms.append({"channel": "ecd", "level": "CRITICAL", "message": "ECD approaching the fracture gradient"})
    pit_drift = current["pitVolume"] - pit_baseline
    if abs(pit_drift) > 2.2:
        alarms.append(
            {
                "channel": "pitVolume",
                "level": "MEDIUM" if abs(pit_drift) < 4.0 else "HIGH",
                "message": (
                    "Active pit volume falling — possible losses"
                    if pit_drift < 0
                    else "Active pit volume rising — possible influx"
                ),
            }
        )

    return {
        "wellId": well["id"],
        "wellName": well["name"],
        "formation": well["formation"],
        "timestamp": round(now, 3),
        "intervalSeconds": interval_s,
        "current": current,
        "channels": layout,
        "history": tail,
        "alarms": alarms,
        "status": "CRITICAL" if any(a["level"] == "CRITICAL" for a in alarms) else ("WARNING" if alarms else "NORMAL"),
    }


def channel_catalog() -> List[dict]:
    return [
        {"key": key, "label": label, "unit": unit, "precision": precision}
        for key, label, unit, precision in CHANNELS
    ]


def digital_twin(corpus, well: dict, radius_km: float = 12.0) -> Dict[str, object]:
    """3D payload: active well + offsets + formation zones + risk + plan."""
    from .analytics import nearby_wells
    from .risk import depth_profile

    nearby = nearby_wells(corpus, well, radius_km=radius_km, limit=18)
    profile = depth_profile(corpus, well)

    # Planned trajectory: project the current build-and-hold to TD.
    from ..data.corpus import build_trajectory

    planned = build_trajectory(
        well["totalDepthMd"],
        well["kopMd"],
        well["targetInclination"],
        well["targetAzimuth"],
        well["buildRate"],
        step_m=40.0,
    )
    actual = well["trajectory"]
    planned = [station for station in planned if station["md"] > well["currentDepthMd"]] or planned[-1:]

    formation_zones = [
        {
            "name": entry["name"],
            "top": entry["topMd"],
            "base": entry["baseMd"],
            "lithology": entry["lithology"],
            "reservoir": entry["reservoir"],
            "poreEmw": entry["poreEmw"],
            "fracEmw": entry["fracEmw"],
            "primaryHazard": entry["primaryHazard"],
            "riskBand": next(
                (
                    row["band"]
                    for row in profile["bands"]
                    if entry["topMd"] <= row["depth"] <= entry["baseMd"]
                ),
                "LOW",
            ),
        }
        for entry in well["formations"]
    ]

    neighbours = []
    for row in nearby:
        other = corpus.wells_by_id[row["id"]]
        neighbours.append(
            {
                "id": other["id"],
                "name": other["name"],
                "lat": other["lat"],
                "lon": other["lon"],
                "dx": round((other["lon"] - well["lon"]) * 92.0, 1),
                "dy": round((other["lat"] - well["lat"]) * 111.0, 1),
                "status": other["status"],
                "riskBand": other["riskBand"],
                "totalDepthMd": other["totalDepthMd"],
                "formation": other["formation"],
                "distanceKm": row["distanceKm"],
                "trajectory": other["trajectory"][:: max(1, len(other["trajectory"]) // 24)],
            }
        )

    return {
        "activeWell": {
            "id": well["id"],
            "name": well["name"],
            "field": well["field"],
            "basin": well["basin"],
            "operator": well["operator"],
            "formation": well["formation"],
            "totalDepthMd": well["totalDepthMd"],
            "currentDepthMd": well["currentDepthMd"],
            "kopMd": well["kopMd"],
            "targetInclination": well["targetInclination"],
            "targetAzimuth": well["targetAzimuth"],
            "riskBand": well["riskBand"],
            "riskScore": well["riskScore"],
            "mudWeight": well["mudWeight"],
            "poreEmw": well["poreEmw"],
            "fracEmw": well["fracEmw"],
        },
        "trajectory": actual,
        "plannedTrajectory": planned,
        "formationZones": formation_zones,
        "riskBands": profile["bands"],
        "nearbyWells": neighbours,
        "reservoir": {
            "name": well["reservoir"],
            "porosity": well["formations"][-1]["porosity"],
            "permMd": well["formations"][-1]["permMd"],
        },
    }
