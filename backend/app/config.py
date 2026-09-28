"""Runtime configuration for the DrillMind AI backend.

Deliberately dependency-free: a tiny ``.env`` reader keeps the service
runnable with nothing but FastAPI + uvicorn installed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


def load_env_file(path: Path, *, override: bool = False) -> None:
    """Populate ``os.environ`` from a simple ``KEY=VALUE`` file."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if override or key not in os.environ:
            os.environ[key] = value


def _bootstrap_env() -> None:
    # backend/.env wins over a repository-root .env
    load_env_file(PROJECT_DIR / ".env")
    load_env_file(BACKEND_DIR / ".env", override=True)


_bootstrap_env()


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    seed: int = 20260214
    cors_origins: tuple[str, ...] = ()
    allow_offline_copilot: bool = True
    # Serve the built SPA from this process when frontend/dist exists.
    serve_spa: bool = True
    report_dir: Path = field(default_factory=lambda: BACKEND_DIR / "generated_reports")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.groq_api_key.strip())

    @property
    def llm_status(self) -> str:
        if self.llm_enabled:
            return "groq"
        return "offline-analytical" if self.allow_offline_copilot else "disabled"


def get_settings() -> Settings:
    origins = tuple(
        origin.strip()
        for origin in os.environ.get(
            "DRILLMIND_CORS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
        ).split(",")
        if origin.strip()
    )
    return Settings(
        groq_api_key=os.environ.get("GROQ_API_KEY", ""),
        groq_model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
        groq_base_url=os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        seed=int(os.environ.get("DRILLMIND_SEED", "20260214")),
        cors_origins=origins,
        allow_offline_copilot=_as_bool(os.environ.get("DRILLMIND_ALLOW_OFFLINE_COPILOT"), True),
        serve_spa=_as_bool(os.environ.get("DRILLMIND_SERVE_SPA"), True),
    )


settings = get_settings()
