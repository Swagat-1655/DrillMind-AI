"""Process-wide singletons.

The corpus, retrieval index and copilot are built once at import time. On this
dataset that costs well under a second, which keeps request handling free of
warm-up logic (and makes ``uvicorn --reload`` painless).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from .config import settings
from .data.corpus import Corpus, generate_corpus
from .services.llm import Copilot
from .services.rag import KnowledgeBase

corpus: Corpus = generate_corpus(settings.seed)
knowledge_base: KnowledgeBase = KnowledgeBase(corpus)
copilot: Copilot = Copilot(corpus, knowledge_base, settings)
booted_at: datetime = datetime.now(timezone.utc)


def resolve_well(well_id: Optional[str]) -> dict:
    """Return the requested well, falling back to the flagship active well."""
    if well_id:
        well = corpus.wells_by_id.get(well_id)
        if well is not None:
            return well
    return corpus.primary_well()


def well_summary(well: dict) -> dict:
    """Light projection used by tables, lists and the GIS map."""
    from collections import Counter

    top_events = Counter(event["type"] for event in well["events"]).most_common(4)
    return {
        "id": well["id"],
        "name": well["name"],
        "field": well["field"],
        "basin": well["basin"],
        "state": well["state"],
        "operator": well["operator"],
        "lat": well["lat"],
        "lon": well["lon"],
        "status": well["status"],
        "wellType": well["wellType"],
        "formation": well["formation"],
        "reservoir": well["reservoir"],
        "currentDepthMd": well["currentDepthMd"],
        "totalDepthMd": well["totalDepthMd"],
        "mudWeight": well["mudWeight"],
        "poreEmw": well["poreEmw"],
        "fracEmw": well["fracEmw"],
        "overbalancePpg": well["overbalancePpg"],
        "fracMarginPpg": well["fracMarginPpg"],
        "lithology": well["lithology"],
        "rpm": well["rpm"],
        "wob": well["wob"],
        "rop": well["rop"],
        "flowRate": well["flowRate"],
        "torque": well["torque"],
        "bottomHoleTempC": well["bottomHoleTempC"],
        "riskScore": well["riskScore"],
        "riskBand": well["riskBand"],
        "eventCount": well["eventCount"],
        "criticalEventCount": well["criticalEventCount"],
        "totalNptHours": well["totalNptHours"],
        "totalCostUsd": well["totalCostUsd"],
        "spudDate": well["spudDate"],
        "completionDate": well["completionDate"],
        "isDeviated": well["isDeviated"],
        "targetInclination": well["targetInclination"],
        "topEvents": [{"type": t, "count": c} for t, c in top_events],
    }
