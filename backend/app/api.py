"""HTTP API for DrillMind AI.

Route groups mirror the product surfaces: platform metadata, KPI cards, wells,
the GIS map feed, formation intelligence, similarity, incident replay,
predictive risk, what-if simulation, knowledge graph, analytics, alerts,
institutional memory, reports and the AI copilot.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from .config import settings
from .data import (
    EVENT_LABELS,
    EVENT_LABELS_HI,
    EVENT_TYPES,
    FIELDS,
    HAZARDS,
    RISK_BANDS,
)
from .services import analytics, formation_intel, knowledge, reports, risk, telemetry
from .services.llm import SUGGESTIONS
from .services.similarity import similar_wells, similarity_network
from .services.whatif import PARAMETER_RANGES, baseline_state, simulate
from .state import booted_at, copilot, corpus, knowledge_base, well_summary

router = APIRouter(prefix="/api", tags=["drillmind"])


# --------------------------------------------------------------------------
# Platform metadata
# --------------------------------------------------------------------------


@router.get("/health", summary="Liveness + service capability probe")
def health() -> dict:
    return {
        "status": "ok",
        "service": "DrillMind AI — Nearby Wells Intelligence System",
        "version": "1.0.0",
        "bootedAt": booted_at.isoformat(),
        "dataset": {"seed": corpus.seed, "wells": len(corpus.wells), "events": len(corpus.events)},
        "llm": {
            "status": settings.llm_status,
            "model": settings.groq_model if settings.llm_enabled else None,
            "offlineFallback": settings.allow_offline_copilot,
        },
        "retrieval": knowledge_base.stats(),
    }


@router.get("/platform", summary="Landing-page statistics and taxonomy")
def platform() -> dict:
    stats = corpus.stats()
    alerts = analytics.generate_alerts(corpus)
    predicted = 0
    for well in corpus.active_wells[:24]:
        summary = risk.well_risk_summary(corpus, well)
        predicted += sum(
            1 for prediction in summary["predictions"] if prediction["probabilityPct"] >= 52.0
        )
    return {
        "stats": [
            {
                "key": "activeWells",
                "label": "Active Wells",
                "labelHi": "सक्रिय कुएँ",
                "value": stats["activeWells"],
                "tone": "cyan",
                "detail": "currently drilling or completing",
            },
            {
                "key": "historicalWells",
                "label": "Historical Wells",
                "labelHi": "ऐतिहासिक कुएँ",
                "value": stats["historicalWells"],
                "tone": "blue",
                "detail": "institutional memory on record",
            },
            {
                "key": "formationRecords",
                "label": "Formation Intelligence Records",
                "labelHi": "संरचना बुद्धिमत्ता रिकॉर्ड",
                "value": stats["formationRecords"],
                "tone": "violet",
                "detail": "formation intersections analysed",
            },
            {
                "key": "eventsAnalyzed",
                "label": "Drilling Events Analyzed",
                "labelHi": "विश्लेषित ड्रिलिंग घटनाएँ",
                "value": stats["eventsAnalyzed"],
                "tone": "orange",
                "detail": f"{stats['totalNptHours']:,.0f} hours of non-productive time",
            },
            {
                "key": "predictedRisks",
                "label": "Predicted Risks",
                "labelHi": "पूर्वानुमानित जोखिम",
                "value": predicted,
                "tone": "amber",
                "detail": "live hazard flags across the fleet",
            },
            {
                "key": "activeAlerts",
                "label": "Active Alerts",
                "labelHi": "सक्रिय अलर्ट",
                "value": len(alerts),
                "tone": "red",
                "detail": f"{sum(1 for a in alerts if a['severity'] == 'CRITICAL')} critical",
            },
        ],
        "totals": stats,
        "fields": [
            {"name": f["name"], "operator": f["operator"], "basin": f["basin"], "lat": f["lat"], "lon": f["lon"]}
            for f in FIELDS
        ],
        "taxonomy": {
            "hazards": [{"key": h, "label": EVENT_LABELS[h], "labelHi": EVENT_LABELS_HI[h]} for h in HAZARDS],
            "eventTypes": [{"key": t, "label": EVENT_LABELS[t], "labelHi": EVENT_LABELS_HI[t]} for t in EVENT_TYPES],
            "bands": list(RISK_BANDS),
        },
        "llm": {"status": settings.llm_status, "model": settings.groq_model if settings.llm_enabled else None},
    }


@router.get("/kpis", summary="Mission Control KPI cards")
def kpis(wellId: Optional[str] = Query(default=None)) -> dict:
    return analytics.kpis(corpus, wellId)


# --------------------------------------------------------------------------
# Wells
# --------------------------------------------------------------------------


@router.get("/wells", summary="Searchable, filterable well catalogue")
def list_wells(
    q: Optional[str] = None,
    status: Optional[str] = None,
    formation: Optional[str] = None,
    field: Optional[str] = None,
    basin: Optional[str] = None,
    operator: Optional[str] = None,
    minRisk: Optional[float] = None,
    sort: str = Query(default="risk", pattern="^(risk|depth|name|events|recent)$"),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    rows = [well_summary(well) for well in corpus.wells]
    if q:
        needle = q.lower()
        rows = [
            row
            for row in rows
            if needle in row["name"].lower()
            or needle in row["id"].lower()
            or needle in row["field"].lower()
            or needle in row["formation"].lower()
            or needle in row["operator"].lower()
        ]
    if status:
        wanted = {value.strip().upper() for value in status.split(",") if value.strip()}
        rows = [row for row in rows if row["status"] in wanted]
    if formation:
        rows = [
            row
            for row in rows
            if any(
                entry["name"] == formation
                for entry in corpus.wells_by_id[row["id"]]["formations"]
            )
        ]
    if field:
        rows = [row for row in rows if row["field"] == field]
    if basin:
        rows = [row for row in rows if row["basin"] == basin]
    if operator:
        rows = [row for row in rows if row["operator"] == operator]
    if minRisk is not None:
        rows = [row for row in rows if row["riskScore"] >= minRisk]

    if sort == "risk":
        rows.sort(key=lambda row: row["riskScore"], reverse=True)
    elif sort == "depth":
        rows.sort(key=lambda row: row["totalDepthMd"], reverse=True)
    elif sort == "events":
        rows.sort(key=lambda row: row["eventCount"], reverse=True)
    elif sort == "recent":
        rows.sort(key=lambda row: row["spudDate"], reverse=True)
    else:
        rows.sort(key=lambda row: row["name"])

    return {
        "count": len(rows),
        "total": len(corpus.wells),
        "wells": rows[:limit],
        "facets": {
            "status": sorted({w["status"] for w in corpus.wells}),
            "formation": formation_intel.formation_names(),
            "field": sorted({w["field"] for w in corpus.wells}),
            "basin": sorted({w["basin"] for w in corpus.wells}),
            "operator": sorted({w["operator"] for w in corpus.wells}),
        },
    }


@router.get("/wells/{well_id}", summary="Full well record")
def well_detail(well_id: str) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    return {
        **well_summary(well),
        "lessonsLearned": well["lessonsLearned"],
        "formations": well["formations"],
        "trajectory": well["trajectory"],
        "events": [
            {
                "id": event["id"],
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
            }
            for event in well["events"]
        ],
        "riskSummary": risk.well_risk_summary(corpus, well),
    }


@router.get("/wells/{well_id}/risk", summary="Six-hazard prediction with explainability")
def well_risk(well_id: str, depth: Optional[float] = None) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    summary = risk.well_risk_summary(corpus, well)
    priors = risk.formation_hazard_priors(corpus, well, depth or well["currentDepthMd"])
    load = risk.offset_risk_load(corpus, well, depth or well["currentDepthMd"])
    detailed = [
        risk.predict(
            well,
            corpus,
            hazard=hazard,
            depth=depth or well["currentDepthMd"],
            formation_prior=priors,
            offset_load=load,
        )
        for hazard in HAZARDS
    ]
    return {
        "summary": summary,
        "predictions": detailed,
        "windows": risk.upcoming_windows(corpus, well),
        "modelCard": risk.model_card(),
        "sequenceAnalogues": {
            hazard: risk.sequence_analogues(corpus, well, hazard) for hazard in HAZARDS
        },
    }


@router.get("/wells/{well_id}/risk/profile", summary="Risk heatmap along depth")
def well_risk_profile(well_id: str, step: float = Query(default=50.0, ge=10.0, le=200.0)) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    return risk.depth_profile(corpus, well, step=step)


@router.get("/wells/{well_id}/similar", summary="AI Similarity Engine results")
def well_similar(well_id: str, limit: int = Query(default=10, ge=1, le=50)) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    rows = similar_wells(corpus, well, limit=limit)
    return {
        "well": well_summary(well),
        "matches": rows,
        "network": similarity_network(corpus, well, limit=min(9, limit)),
        "method": {
            "groups": [
                {"key": "formation", "label": "Formation / stratigraphy", "weight": 0.28},
                {"key": "depth", "label": "Depth & trajectory", "weight": 0.16},
                {"key": "pressure", "label": "Pore & fracture pressure", "weight": 0.16},
                {"key": "parameters", "label": "Drilling parameters", "weight": 0.18},
                {"key": "events", "label": "Historical events", "weight": 0.22},
            ],
            "note": "Group scores are blended with the published weights, then nudged 6% by geographic proximity as a tie-breaker.",
        },
    }


@router.get("/wells/{well_id}/network", summary="Similarity network graph only")
def well_network(well_id: str, limit: int = Query(default=9, ge=2, le=16)) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    return similarity_network(corpus, well, limit=limit)


@router.get("/wells/{well_id}/telemetry", summary="Live WITS-style channel feed")
def well_telemetry(
    well_id: str,
    samples: int = Query(default=90, ge=10, le=400),
    interval: float = Query(default=2.0, ge=0.25, le=30.0),
) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    return telemetry.live_snapshot(well, samples=samples, interval_s=interval)


@router.get("/wells/{well_id}/twin", summary="3D digital twin payload")
def well_twin(well_id: str, radius: float = Query(default=12.0, ge=1.0, le=60.0)) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    return telemetry.digital_twin(corpus, well, radius_km=radius)


@router.get("/wells/{well_id}/memory", summary="Institutional Memory Score")
def well_memory(well_id: str) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    return knowledge.institutional_memory(corpus, well)


@router.post("/wells/{well_id}/whatif", summary="What-If Simulation Lab")
def well_whatif(
    well_id: str,
    overrides: Dict[str, float] = Body(default_factory=dict),
    sweep: bool = True,
) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    cleaned: Dict[str, float] = {}
    for key, value in (overrides or {}).items():
        if key not in PARAMETER_RANGES:
            continue
        spec = PARAMETER_RANGES[key]
        cleaned[key] = max(spec["min"], min(spec["max"], float(value)))
    return simulate(corpus, well, cleaned, sweep=sweep)


@router.get("/wells/{well_id}/whatif/baseline", summary="What-If baseline state + slider ranges")
def well_whatif_baseline(well_id: str) -> dict:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    return {
        "wellId": well["id"],
        "wellName": well["name"],
        "depth": well["currentDepthMd"],
        "formation": well["formation"],
        "baseline": baseline_state(well),
        "ranges": PARAMETER_RANGES,
    }


@router.get("/wells/{well_id}/report", summary="Drilling Intelligence Report (json | docx | html)")
def well_report(
    well_id: str,
    format: str = Query(default="json", pattern="^(json|docx|html)$"),
    narrative: bool = Query(default=False),
) -> Any:
    well = corpus.wells_by_id.get(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
    text = None
    if narrative:
        import asyncio

        question = (
            "Write the executive summary section of the drilling intelligence report for this well. "
            "Cover: the current position, the forward hazard profile, what the offset wells teach us, "
            "and the top three recommendations. Use short paragraphs and bullets, cite evidence numbers."
        )
        try:
            text = asyncio.run(_narrative(question, well_id))
        except RuntimeError:
            text = None
    payload = reports.build_report(corpus, well, narrative=text)

    if format == "docx":
        blob = reports.render_docx(payload)
        filename = f"DrillMind-{well['id']}-Drilling-Intelligence-Report.docx"
        return Response(
            content=blob,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    if format == "html":
        return Response(content=reports.render_html(payload), media_type="text/html; charset=utf-8")
    return payload


async def _narrative(question: str, well_id: str) -> str:
    return await copilot.complete(question, focus_well_id=well_id, max_tokens=700)


# --------------------------------------------------------------------------
# Formations — Formation Time Machine
# --------------------------------------------------------------------------


@router.get("/formations", summary="All formation intelligence records")
def formations(q: Optional[str] = None, basin: Optional[str] = None) -> dict:
    records = formation_intel.formation_records(corpus)
    if q:
        needle = q.lower()
        records = [r for r in records if needle in r["name"].lower()]
    if basin:
        records = [r for r in records if r["basin"] == basin]
    return {
        "count": len(records),
        "formations": records,
        "taxonomy": formation_intel.basin_taxonomy(),
    }


@router.get("/formations/taxonomy", summary="Basin / formation stratigraphy")
def formation_taxonomy() -> dict:
    return {"basins": formation_intel.basin_taxonomy()}


@router.get("/formations/{name}", summary="Formation Time Machine detail")
def formation_detail(name: str) -> dict:
    record = formation_intel.formation_detail(corpus, name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Formation {name} not found")
    return record


# --------------------------------------------------------------------------
# Incidents — Replay Center
# --------------------------------------------------------------------------


@router.get("/incidents", summary="Filterable incident feed")
def incidents(
    type: Optional[str] = None,
    severity: Optional[str] = None,
    formation: Optional[str] = None,
    basin: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = Query(default="severity", pattern="^(severity|depth|recent|cost)$"),
    limit: int = Query(default=60, ge=1, le=400),
) -> dict:
    rows = analytics.incident_feed(
        corpus,
        event_type=type,
        severity=severity,
        formation=formation,
        basin=basin,
        query=q,
        sort=sort,
        limit=limit,
    )
    return {"count": len(rows), "incidents": rows}


@router.get("/incidents/{event_id}", summary="Incident replay timeline")
def incident_detail(event_id: str) -> dict:
    event = corpus.events_by_id.get(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Incident {event_id} not found")
    well = corpus.wells_by_id[event["wellId"]]
    return {
        "id": event["id"],
        "type": event["type"],
        "label": event["label"],
        "well": well_summary(well),
        "formation": event["formation"],
        "depth": event["depth"],
        "severity": event["severity"],
        "date": event["date"],
        "nptHours": event["nptHours"],
        "costUsd": event["costUsd"],
        "mitigation": event["mitigation"],
        "outcome": event["outcome"],
        "insight": event["insight"],
        "mudWeightBefore": event["mudWeightBefore"],
        "mudWeightAfter": event["mudWeightAfter"],
        "replay": event["replay"],
        "lessons": well["lessonsLearned"],
        "related": [
            {
                "id": other["id"],
                "wellId": other["wellId"],
                "wellName": corpus.wells_by_id[other["wellId"]]["name"],
                "depth": other["depth"],
                "severity": other["severity"],
                "date": other["date"],
                "outcome": other["outcome"],
            }
            for other in corpus.events
            if other["type"] == event["type"] and 0 < abs(other["depth"] - event["depth"]) <= 250
        ][:6],
    }


# --------------------------------------------------------------------------
# Alerts, analytics, knowledge graph
# --------------------------------------------------------------------------


@router.get("/alerts", summary="Real-time alert center")
def alerts(
    severity: Optional[str] = None,
    hazard: Optional[str] = None,
    limit: int = Query(default=80, ge=1, le=300),
) -> dict:
    rows = analytics.generate_alerts(corpus, limit=300)
    if severity:
        rows = [row for row in rows if row["severity"] == severity]
    if hazard:
        rows = [row for row in rows if row["hazard"] == hazard]
    counts = {
        level: sum(1 for row in rows if row["severity"] == level)
        for level in ("CRITICAL", "HIGH", "MEDIUM")
    }
    return {
        "count": len(rows),
        "counts": counts,
        "alerts": rows[:limit],
        "threshold": analytics.ALERT_THRESHOLD,
    }


@router.get("/analytics", summary="Historical analytics workspace")
def analytics_overview() -> dict:
    return analytics.analytics_overview(corpus)


@router.get("/knowledge-graph", summary="Knowledge Graph Intelligence")
def knowledge_graph(wellId: Optional[str] = None, limit: int = Query(default=22, ge=4, le=60)) -> dict:
    return knowledge.knowledge_graph(corpus, wellId, limit_wells=limit)


@router.get("/model", summary="Model card, feature importance, playbooks")
def model_card() -> dict:
    return {
        **risk.model_card(),
        "playbooks": risk.PLAYBOOK,
        "hazardWeights": risk.HAZARD_SEVERITY_WEIGHT,
        "parameters": PARAMETER_RANGES,
        "alertThreshold": analytics.ALERT_THRESHOLD,
    }


# --------------------------------------------------------------------------
# AI Copilot
# --------------------------------------------------------------------------


@router.get("/copilot/config", summary="Copilot capabilities and suggestions")
def copilot_config() -> dict:
    return {
        "status": settings.llm_status,
        "model": settings.groq_model if settings.llm_enabled else "drillmind-analytical",
        "provider": "Groq" if settings.llm_enabled else "Local analytical engine",
        "offlineFallback": settings.allow_offline_copilot,
        "suggestions": SUGGESTIONS,
        "retrieval": knowledge_base.stats(),
        "capabilities": [
            "Offset-well and formation questions answered with cited report extracts",
            "Live hazard explanation with additive feature attributions",
            "Mud-loss / kick / stuck-pipe / cementing mitigation playbooks",
            "Similarity and lessons-learned transfer from analogue wells",
            "Report drafting and Hindi-language responses",
        ],
    }


@router.post("/copilot/chat", summary="Streaming copilot (Server-Sent Events)")
def copilot_chat(payload: Dict[str, Any] = Body(...)) -> StreamingResponse:
    question = str(payload.get("message") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="A 'message' field is required")
    focus = payload.get("wellId") or None
    language = "hi" if str(payload.get("language", "en")).lower().startswith("hi") else "en"
    history = payload.get("history") or []

    async def event_stream():
        async for chunk in copilot.stream(
            question, focus_well_id=focus, language=language, history=history
        ):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/copilot/ask", summary="Non-streaming copilot answer")
def copilot_ask(payload: Dict[str, Any] = Body(...)) -> dict:
    import asyncio

    question = str(payload.get("message") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="A 'message' field is required")
    focus = payload.get("wellId") or None
    language = "hi" if str(payload.get("language", "en")).lower().startswith("hi") else "en"
    answer = asyncio.run(_narrative(question, focus or corpus.primary_well()["id"]))
    _, _, _, hits = copilot.build_messages(
        question, focus_well_id=focus, language=language
    )
    return {
        "answer": answer,
        "language": language,
        "sources": [
            {"index": i, "title": hit["title"], "kind": hit["kind"], "docId": hit["docId"]}
            for i, hit in enumerate(hits, start=1)
        ],
    }


@router.get("/search", summary="Retrieval search over the document corpus")
def search(q: str, k: int = Query(default=8, ge=1, le=30)) -> dict:
    hits = knowledge_base.search(q, k=k)
    return {"query": q, "count": len(hits), "results": hits}


@router.get("/datasets", summary="Dataset integration catalogue")
def datasets() -> dict:
    return {
        "sources": [
            {"id": "wcr", "name": "Well Completion Reports", "format": "PDF / DOCX / structured JSON", "records": len(corpus.wells), "status": "ingested"},
            {"id": "ddr", "name": "Daily Drilling Reports", "format": "WITSML / PDF", "records": len(corpus.events), "status": "ingested"},
            {"id": "mudlog", "name": "Mud Logging Data", "format": "WITS / LAS", "records": len(corpus.wells), "status": "streaming"},
            {"id": "reservoir", "name": "Reservoir Data", "format": "Petrel export / CSV", "records": sum(len(w["formations"]) for w in corpus.wells), "status": "ingested"},
            {"id": "ertmac", "name": "eRTMAC Real-Time Streams", "format": "WITSML 1.4.1.1 / MQTT", "records": len(corpus.active_wells) * len(telemetry.CHANNELS), "status": "live"},
            {"id": "survey", "name": "Survey Data", "format": "CSV / ISCWSA", "records": sum(len(w["trajectory"]) for w in corpus.wells), "status": "ingested"},
            {"id": "cement", "name": "Cementing Records", "format": "PDF / job ticket", "records": len([e for e in corpus.events if e["type"] == "CEMENTING_FAILURE"]), "status": "ingested"},
            {"id": "lessons", "name": "Lessons Learned", "format": "Structured knowledge base", "records": sum(len(w["lessonsLearned"]) for w in corpus.wells), "status": "indexed"},
        ],
        "retrieval": knowledge_base.stats(),
    }
