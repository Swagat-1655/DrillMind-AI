#!/usr/bin/env bash
# DrillMind AI — start the FastAPI backend and the Vite frontend together.
# Usage:  ./run.sh          (Ctrl-C stops both)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PYTHON:-python}"

if [ -x "$ROOT/backend/.venv/bin/python" ]; then
  PY="$ROOT/backend/.venv/bin/python"
elif [ -x "$ROOT/backend/.venv/Scripts/python.exe" ]; then
  PY="$ROOT/backend/.venv/Scripts/python.exe"
fi

if [ ! -f "$ROOT/backend/.env" ] && [ -f "$ROOT/backend/.env.example" ]; then
  echo "! backend/.env is missing — copying .env.example (add your GROQ_API_KEY)."
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
fi

echo "Starting DrillMind AI backend on http://127.0.0.1:8000 ..."
(cd "$ROOT/backend" && "$PY" -m uvicorn app.main:app --port 8000 --host 127.0.0.1) &
BACKEND_PID=$!

cleanup() {
  echo
  echo "Stopping backend (pid $BACKEND_PID) ..."
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Give the corpus/index time to build before the first request.
sleep 3

echo "Starting DrillMind AI frontend on http://127.0.0.1:5173 ..."
cd "$ROOT/frontend"
npm run dev
