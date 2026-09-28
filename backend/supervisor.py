"""Tiny watchdog for the DrillMind AI API.

Launches uvicorn as a child process and restarts it whenever it dies,
recording the exit code so silent terminations are visible in the log.
Run detached from the project root:

    python supervisor.py
"""

from __future__ import annotations

import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

LOG = Path(__file__).with_name("supervisor.log")
UVICORN = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"]


def note(message: str) -> None:
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(f"{datetime.now().isoformat(timespec='seconds')}  {message}\n")


def main() -> None:
    note(f"supervisor starting (python {sys.version.split()[0]})")
    while True:
        note("launching uvicorn")
        child = subprocess.Popen(
            UVICORN,
            cwd=str(Path(__file__).parent),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB
            # (the breakaway is what keeps the console hoster's job object from
            # tearing the server down when the launching command finishes).
            creationflags=0x00000008 | 0x00000200 | 0x01000000,
        )
        code = child.wait()
        note(f"uvicorn exited with code {code} — restarting in 1.5 s")
        time.sleep(1.5)


if __name__ == "__main__":
    main()
