"""Domain reference data: fields, basins, formations and hazard taxonomy.

Everything here is *reference* data (public stratigraphy for the Assam-Arakan,
Cambay and Krishna-Godavari basins). The well-by-well corpus is generated
deterministically on top of it in :mod:`app.data.corpus`.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

# --------------------------------------------------------------------------
# Hazard taxonomy
# --------------------------------------------------------------------------

HAZARDS: Tuple[str, ...] = (
    "MUDFLOSS",
    "KICK",
    "OVERPRESSURE",
    "TORQUE_SPIKE",
    "STUCK_PIPE",
    "CEMENTING_FAILURE",
)

#: Operational events that are recorded but not forecast as a hazard.
EXTRA_EVENT_TYPES: Tuple[str, ...] = ("BIT_DAMAGE",)

EVENT_TYPES: Tuple[str, ...] = HAZARDS + EXTRA_EVENT_TYPES

EVENT_LABELS: Dict[str, str] = {
    "MUDFLOSS": "Mud Loss",
    "KICK": "Kick / Influx",
    "OVERPRESSURE": "Overpressure",
    "TORQUE_SPIKE": "Torque Spike",
    "STUCK_PIPE": "Stuck Pipe",
    "CEMENTING_FAILURE": "Cementing Failure",
    "BIT_DAMAGE": "Bit Damage",
}

EVENT_LABELS_HI: Dict[str, str] = {
    "MUDFLOSS": "मड लॉस",
    "KICK": "किक / अंतर्वाह",
    "OVERPRESSURE": "अति दाब",
    "TORQUE_SPIKE": "टॉर्क स्पाइक",
    "STUCK_PIPE": "स्टक पाइप",
    "CEMENTING_FAILURE": "सीमेंटिंग विफलता",
    "BIT_DAMAGE": "बिट क्षति",
}

SEVERITIES: Tuple[str, ...] = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

RISK_BANDS: Tuple[str, ...] = ("LOW", "MODERATE", "HIGH", "CRITICAL")


def band_for(score: float) -> str:
    """Map a 0-100 risk score onto a four-level band."""
    if score >= 78:
        return "CRITICAL"
    if score >= 58:
        return "HIGH"
    if score >= 34:
        return "MODERATE"
    return "LOW"


# --------------------------------------------------------------------------
# Fields / basins
# --------------------------------------------------------------------------

FIELDS: List[dict] = [
    {"name": "Naharkatiya", "prefix": "NHK", "lat": 27.283, "lon": 95.552, "operator": "ONGC", "basin": "Assam-Arakan", "state": "Assam", "discovered": 1953},
    {"name": "Moran", "prefix": "MRN", "lat": 27.152, "lon": 94.961, "operator": "ONGC", "basin": "Assam-Arakan", "state": "Assam", "discovered": 1956},
    {"name": "Rudrasagar", "prefix": "RDS", "lat": 26.981, "lon": 94.862, "operator": "ONGC", "basin": "Assam-Arakan", "state": "Assam", "discovered": 1961},
    {"name": "Lakwa", "prefix": "LKW", "lat": 26.948, "lon": 94.762, "operator": "ONGC", "basin": "Assam-Arakan", "state": "Assam", "discovered": 1964},
    {"name": "Geleki", "prefix": "GLK", "lat": 26.902, "lon": 94.981, "operator": "ONGC", "basin": "Assam-Arakan", "state": "Assam", "discovered": 1968},
    {"name": "Nazira", "prefix": "NZR", "lat": 26.921, "lon": 94.733, "operator": "ONGC", "basin": "Assam-Arakan", "state": "Assam", "discovered": 1967},
    {"name": "Digboi", "prefix": "DGB", "lat": 27.381, "lon": 95.631, "operator": "Oil India", "basin": "Assam-Arakan", "state": "Assam", "discovered": 1889},
    {"name": "Agaratala", "prefix": "AGT", "lat": 23.782, "lon": 91.279, "operator": "ONGC", "basin": "Assam-Arakan", "state": "Tripura", "discovered": 1972},
    {"name": "Mehsana", "prefix": "MHS", "lat": 23.601, "lon": 72.401, "operator": "ONGC", "basin": "Cambay", "state": "Gujarat", "discovered": 1961},
    {"name": "Ahmedabad", "prefix": "AMD", "lat": 22.982, "lon": 72.503, "operator": "ONGC", "basin": "Cambay", "state": "Gujarat", "discovered": 1958},
    {"name": "Rajahmundry", "prefix": "RJM", "lat": 17.004, "lon": 81.804, "operator": "ONGC", "basin": "Krishna-Godavari", "state": "Andhra Pradesh", "discovered": 1980},
    {"name": "Kakinada", "prefix": "KKD", "lat": 16.962, "lon": 82.238, "operator": "ONGC", "basin": "Krishna-Godavari", "state": "Andhra Pradesh", "discovered": 1994},
]

FIELDS_BY_NAME: Dict[str, dict] = {f["name"]: f for f in FIELDS}


# --------------------------------------------------------------------------
# Formation stacks per basin
# --------------------------------------------------------------------------
# ``pore_emw`` / ``frac_emw`` are equivalent mud weights in ppg.
# ``window`` is the characteristic depth band where the primary hazard bites.

FORMATION_STACKS: Dict[str, List[dict]] = {
    "Assam-Arakan": [
        {
            "name": "Tipam Sandstone",
            "top": 1400, "base": 2500,
            "lithology": "Friable fluvial sandstone with shale interbeds",
            "reservoir": "Tipam-A", "porosity": 0.228, "perm_md": 880,
            "pore_emw": 8.6, "frac_emw": 13.2, "temp_grad": 1.42,
            "primary_hazard": "MUDFLOSS", "window": (1580, 1880),
            "priors": {"MUDFLOSS": 0.40, "STUCK_PIPE": 0.17, "TORQUE_SPIKE": 0.13, "KICK": 0.11, "CEMENTING_FAILURE": 0.11, "OVERPRESSURE": 0.08},
            "headline": "Friable sands with high matrix permeability; classic thief zone for light mud systems.",
        },
        {
            "name": "Girujan Clay",
            "top": 2350, "base": 3160,
            "lithology": "Overpressured plastic clay and siltstone",
            "reservoir": "Girujan-1", "porosity": 0.171, "perm_md": 42,
            "pore_emw": 8.9, "frac_emw": 13.6, "temp_grad": 1.55,
            "primary_hazard": "STUCK_PIPE", "window": (2600, 2980),
            "priors": {"STUCK_PIPE": 0.36, "TORQUE_SPIKE": 0.18, "MUDFLOSS": 0.15, "KICK": 0.12, "OVERPRESSURE": 0.12, "CEMENTING_FAILURE": 0.07},
            "headline": "Reactive swelling clay; hole closure and pack-off drive most stuck-pipe events.",
        },
        {
            "name": "Namsang Formation",
            "top": 3050, "base": 3660,
            "lithology": "Alternating sandstone and carbonaceous shale",
            "reservoir": "Namsang", "porosity": 0.196, "perm_md": 210,
            "pore_emw": 9.1, "frac_emw": 14.0, "temp_grad": 1.68,
            "primary_hazard": "TORQUE_SPIKE", "window": (3200, 3500),
            "priors": {"TORQUE_SPIKE": 0.29, "STUCK_PIPE": 0.22, "MUDFLOSS": 0.18, "KICK": 0.14, "CEMENTING_FAILURE": 0.09, "OVERPRESSURE": 0.08},
            "headline": "Interbedded sequence causes erratic torque response when ROP is pushed.",
        },
        {
            "name": "Bokabil Formation",
            "top": 3400, "base": 3960,
            "lithology": "Shaly sandstone with thin limestone stringers",
            "reservoir": "Bokabil-2", "porosity": 0.184, "perm_md": 128,
            "pore_emw": 9.6, "frac_emw": 14.6, "temp_grad": 1.79,
            "primary_hazard": "KICK", "window": (3520, 3820),
            "priors": {"KICK": 0.27, "MUDFLOSS": 0.21, "TORQUE_SPIKE": 0.16, "STUCK_PIPE": 0.15, "OVERPRESSURE": 0.13, "CEMENTING_FAILURE": 0.08},
            "headline": "Thin high-permeability stringers produce fast, small-volume influxes.",
        },
        {
            "name": "Barail Sandstone",
            "top": 3600, "base": 4260,
            "lithology": "Tight deltaic sandstone, hard streaks",
            "reservoir": "Barail-Main", "porosity": 0.142, "perm_md": 26,
            "pore_emw": 11.2, "frac_emw": 15.8, "temp_grad": 1.94,
            "primary_hazard": "OVERPRESSURE", "window": (3880, 4210),
            "priors": {"OVERPRESSURE": 0.31, "KICK": 0.24, "TORQUE_SPIKE": 0.16, "STUCK_PIPE": 0.12, "MUDFLOSS": 0.11, "CEMENTING_FAILURE": 0.06},
            "headline": "Transition into HPHT; narrow mud-weight window between 11.4 and 12.6 ppg.",
        },
        {
            "name": "Kopili Shale",
            "top": 4000, "base": 4660,
            "lithology": "Laminated calcareous shale with limestone bands",
            "reservoir": "Kopili-LS", "porosity": 0.098, "perm_md": 6,
            "pore_emw": 12.1, "frac_emw": 16.4, "temp_grad": 2.05,
            "primary_hazard": "MUDFLOSS", "window": (4180, 4345),
            "priors": {"MUDFLOSS": 0.34, "OVERPRESSURE": 0.21, "KICK": 0.19, "STUCK_PIPE": 0.12, "CEMENTING_FAILURE": 0.08, "TORQUE_SPIKE": 0.06},
            "headline": "Fractured limestone bands take heavy losses above 12.4 ppg; the 4180-4345 m interval is the worst offender.",
        },
        {
            "name": "Sylhet Limestone",
            "top": 4400, "base": 5100,
            "lithology": "Fractured shelf limestone, karstic intervals",
            "reservoir": "Sylhet-Karst", "porosity": 0.076, "perm_md": 340,
            "pore_emw": 10.0, "frac_emw": 15.0, "temp_grad": 2.18,
            "primary_hazard": "MUDFLOSS", "window": (4520, 4860),
            "priors": {"MUDFLOSS": 0.44, "CEMENTING_FAILURE": 0.22, "STUCK_PIPE": 0.13, "KICK": 0.09, "OVERPRESSURE": 0.07, "TORQUE_SPIKE": 0.05},
            "headline": "Karst voids swallow whole mud volumes; cement tops are frequently below plan.",
        },
        {
            "name": "Basement Complex",
            "top": 4900, "base": 5600,
            "lithology": "Weathered granite-gneiss",
            "reservoir": "Basement-Frac", "porosity": 0.041, "perm_md": 2,
            "pore_emw": 8.8, "frac_emw": 14.4, "temp_grad": 2.3,
            "primary_hazard": "TORQUE_SPIKE", "window": (5000, 5350),
            "priors": {"TORQUE_SPIKE": 0.34, "BIT_DAMAGE": 0.0, "MUDFLOSS": 0.16, "STUCK_PIPE": 0.18, "KICK": 0.11, "CEMENTING_FAILURE": 0.12, "OVERPRESSURE": 0.09},
            "headline": "Highly abrasive; bit and BHA damage dominates non-productive time.",
        },
    ],
    "Cambay": [
        {
            "name": "Kalol Formation",
            "top": 850, "base": 1520,
            "lithology": "Coal-bearing sandstone and shale",
            "reservoir": "Kalol-I", "porosity": 0.241, "perm_md": 640,
            "pore_emw": 8.4, "frac_emw": 12.6, "temp_grad": 1.31,
            "primary_hazard": "MUDFLOSS", "window": (980, 1240),
            "priors": {"MUDFLOSS": 0.38, "STUCK_PIPE": 0.19, "KICK": 0.14, "TORQUE_SPIKE": 0.13, "CEMENTING_FAILURE": 0.09, "OVERPRESSURE": 0.07},
            "headline": "Coal seams and depleted sands cause severe circulation losses.",
        },
        {
            "name": "Tarapur Shale",
            "top": 1400, "base": 2120,
            "lithology": "Reactive montmorillonitic shale",
            "reservoir": "Tarapur", "porosity": 0.166, "perm_md": 31,
            "pore_emw": 8.9, "frac_emw": 13.4, "temp_grad": 1.44,
            "primary_hazard": "STUCK_PIPE", "window": (1620, 1980),
            "priors": {"STUCK_PIPE": 0.39, "TORQUE_SPIKE": 0.19, "MUDFLOSS": 0.14, "KICK": 0.11, "OVERPRESSURE": 0.11, "CEMENTING_FAILURE": 0.06},
            "headline": "Highly swelling shale; inhibited mud systems are mandatory.",
        },
        {
            "name": "Cambay Shale",
            "top": 1900, "base": 2620,
            "lithology": "Organic-rich source shale",
            "reservoir": "Cambay-Source", "porosity": 0.112, "perm_md": 9,
            "pore_emw": 10.4, "frac_emw": 14.9, "temp_grad": 1.62,
            "primary_hazard": "OVERPRESSURE", "window": (2140, 2480),
            "priors": {"OVERPRESSURE": 0.3, "KICK": 0.26, "STUCK_PIPE": 0.17, "MUDFLOSS": 0.12, "TORQUE_SPIKE": 0.09, "CEMENTING_FAILURE": 0.06},
            "headline": "Generating overpressure; casing seat placement is critical.",
        },
        {
            "name": "Deccan Trap",
            "top": 2400, "base": 3120,
            "lithology": "Basaltic flows and volcaniclastics",
            "reservoir": "Trap-Frac", "porosity": 0.058, "perm_md": 4,
            "pore_emw": 8.8, "frac_emw": 14.2, "temp_grad": 1.71,
            "primary_hazard": "TORQUE_SPIKE", "window": (2600, 2980),
            "priors": {"TORQUE_SPIKE": 0.33, "MUDFLOSS": 0.22, "STUCK_PIPE": 0.18, "CEMENTING_FAILURE": 0.12, "KICK": 0.09, "OVERPRESSURE": 0.06},
            "headline": "Hard, fractured flows; erratic torque and total losses at flow boundaries.",
        },
    ],
    "Krishna-Godavari": [
        {
            "name": "Rajahmundry Sandstone",
            "top": 780, "base": 1620,
            "lithology": "Clean aeolian and fluvial sandstone",
            "reservoir": "RJM-Main", "porosity": 0.262, "perm_md": 1240,
            "pore_emw": 8.3, "frac_emw": 12.4, "temp_grad": 1.28,
            "primary_hazard": "MUDFLOSS", "window": (900, 1180),
            "priors": {"MUDFLOSS": 0.41, "KICK": 0.15, "STUCK_PIPE": 0.16, "TORQUE_SPIKE": 0.12, "CEMENTING_FAILURE": 0.1, "OVERPRESSURE": 0.06},
            "headline": "Very high permeability; fluid-loss control is the primary design driver.",
        },
        {
            "name": "Vadaparru Shale",
            "top": 1500, "base": 2420,
            "lithology": "Overpressured marine shale",
            "reservoir": "Vadaparru", "porosity": 0.134, "perm_md": 14,
            "pore_emw": 10.8, "frac_emw": 15.2, "temp_grad": 1.58,
            "primary_hazard": "KICK", "window": (1780, 2140),
            "priors": {"KICK": 0.31, "OVERPRESSURE": 0.27, "STUCK_PIPE": 0.16, "MUDFLOSS": 0.12, "TORQUE_SPIKE": 0.08, "CEMENTING_FAILURE": 0.06},
            "headline": "Dual-gradient drilling used historically to tame this interval.",
        },
        {
            "name": "Godavari Clay",
            "top": 2200, "base": 3010,
            "lithology": "Plastic clay with thin silts",
            "reservoir": "Godavari", "porosity": 0.158, "perm_md": 22,
            "pore_emw": 9.2, "frac_emw": 13.8, "temp_grad": 1.66,
            "primary_hazard": "STUCK_PIPE", "window": (2400, 2780),
            "priors": {"STUCK_PIPE": 0.35, "TORQUE_SPIKE": 0.2, "MUDFLOSS": 0.16, "KICK": 0.12, "OVERPRESSURE": 0.1, "CEMENTING_FAILURE": 0.07},
            "headline": "Hole cleaning and wiper trip discipline determine stuck-pipe exposure.",
        },
        {
            "name": "Basement Complex",
            "top": 2800, "base": 3700,
            "lithology": "Granitic basement with fracture corridors",
            "reservoir": "Basement-Frac", "porosity": 0.048, "perm_md": 3,
            "pore_emw": 9.0, "frac_emw": 14.6, "temp_grad": 1.82,
            "primary_hazard": "MUDFLOSS", "window": (2980, 3320),
            "priors": {"MUDFLOSS": 0.37, "TORQUE_SPIKE": 0.21, "STUCK_PIPE": 0.17, "CEMENTING_FAILURE": 0.13, "KICK": 0.07, "OVERPRESSURE": 0.05},
            "headline": "Fracture corridors take losses; suspected high-permeability streaks below 3000 m.",
        },
    ],
}

FORMATION_INDEX: Dict[str, dict] = {
    formation["name"]: {**formation, "basin": basin}
    for basin, stack in FORMATION_STACKS.items()
    for formation in stack
}

RESERVOIRS: List[str] = sorted(
    {formation["reservoir"] for stack in FORMATION_STACKS.values() for formation in stack}
)
