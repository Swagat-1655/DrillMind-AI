# DrillMind AI — single-image deployment.
#
# Stage 1 builds the React/Vite SPA; stage 2 runs FastAPI and serves that build
# from the same origin, so `/api` needs no reverse proxy and no CORS config.
#
#   docker build -t drillmind .
#   docker run --rm -p 8000:8000 --env-file backend/.env drillmind
#
# The Groq key is deliberately NOT baked into the image — it is read from the
# environment at runtime.

# syntax=docker/dockerfile:1

# ---------- stage 1: build the frontend ----------
FROM node:22-alpine AS web

WORKDIR /web

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------- stage 2: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    DRILLMIND_FRONTEND_DIST=/app/frontend/dist

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=web /web/dist ./frontend/dist

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 drillmind \
    && chown -R drillmind:drillmind /app
USER drillmind

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
