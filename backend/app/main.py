"""DrillMind AI backend — application entrypoint.

Run from the ``backend`` directory:

    uvicorn app.main:app --reload --port 8000

Interactive API docs: http://localhost:8000/docs

In production this process also serves the built SPA (``frontend/dist``), so
one container on one port answers both the UI and ``/api``. Disable that with
``DRILLMIND_SERVE_SPA=0``.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.staticfiles import StaticFiles

from . import __version__
from .api import router
from .config import PROJECT_DIR, settings
from .state import booted_at, corpus, knowledge_base

# The built single-page app. When this exists the API also serves the UI, so a
# deployment needs one process, one origin and no reverse proxy: the browser's
# relative `/api` calls land on the same server that answers them.
FRONTEND_DIST = Path(os.environ.get("DRILLMIND_FRONTEND_DIST") or PROJECT_DIR / "frontend" / "dist")
SPA_INDEX = FRONTEND_DIST / "index.html"

# Only take over the non-API routes when a build is actually present, so the
# bare `uvicorn app.main:app` developer loop behaves exactly as before.
SPA_ENABLED = settings.serve_spa and SPA_INDEX.is_file()

DESCRIPTION = """
**DrillMind AI — Nearby Wells Intelligence System (NWIS)**

An AI-powered geospatial drilling intelligence platform that turns a field's
historical well record into real-time operational insight: predictive hazard
intelligence, offset-well similarity, incident replay, formation memory and
proactive decision support for drilling engineers.

* **Predictive risk engine** — six hazards, calibrated logistic model with exact
  additive feature attributions (SHAP-consistent for the linear case).
* **Similarity engine** — five explicit evidence groups, fully explainable.
* **Knowledge graph** — wells, formations, reservoirs, hazards and the
  mitigations that actually worked.
* **Copilot** — retrieval-augmented generation over the platform's own
  completion reports, daily drilling reports and lessons learned.
"""

app = FastAPI(
    title="DrillMind AI — Nearby Wells Intelligence System",
    description=DESCRIPTION,
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "drillmind", "description": "All DrillMind AI intelligence endpoints"},
    ],
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins) or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/", include_in_schema=False)
def root():
    if SPA_ENABLED:
        return FileResponse(SPA_INDEX)
    return JSONResponse(
        {
            "name": "DrillMind AI — Nearby Wells Intelligence System",
            "version": __version__,
            "docs": "/docs",
            "health": "/api/health",
            "dataset": {
                "wells": len(corpus.wells),
                "events": len(corpus.events),
                "documents": knowledge_base.stats()["documents"],
            },
            "llm": settings.llm_status,
            "bootedAt": booted_at.isoformat(),
        }
    )


# Vite emits hashed bundles under /assets; serve them directly and let every
# other non-API path fall back to index.html so client-side routes deep-link.
if SPA_ENABLED:
    _assets = FRONTEND_DIST / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    if not SPA_ENABLED:
        raise HTTPException(status_code=404, detail="Not Found")
    # `/api/...` typos must stay JSON 404s, never an HTML shell.
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    candidate = (FRONTEND_DIST / full_path).resolve()
    if candidate.is_file() and candidate.is_relative_to(FRONTEND_DIST.resolve()):
        return FileResponse(candidate)
    return FileResponse(SPA_INDEX)


def _emit(line: str = "") -> None:
    """Print a banner line without ever dying on a legacy console codec.

    The Windows console often defaults to cp1252, which cannot encode the
    box-drawing characters used below; a failed print here would abort
    application startup, so fall back to a lossy re-encode instead.
    """
    try:
        print(line)
    except UnicodeEncodeError:
        encoding = getattr(sys.stdout, "encoding", None) or "ascii"
        print(line.encode(encoding, "replace").decode(encoding, "replace"))


@app.on_event("startup")
def _startup() -> None:
    stats = knowledge_base.stats()
    _emit("─" * 68)
    _emit("  DrillMind AI — Nearby Wells Intelligence System")
    _emit(f"  corpus    : {len(corpus.wells)} wells · {len(corpus.events)} events · seed {corpus.seed}")
    _emit(f"  retrieval : {stats['documents']} documents · {stats['vocabulary']} terms (BM25)")
    _emit(f"  llm       : {settings.llm_status} · {settings.groq_model if settings.llm_enabled else 'local analytical engine'}")
    _emit("  docs      : http://localhost:8000/docs")
    _emit("─" * 68)
