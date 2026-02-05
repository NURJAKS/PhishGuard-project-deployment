import os
import subprocess
from typing import Dict, Any


WORKSPACE_ROOT = "/home/n/projects/PhishGuard project"
PINKERTON_DIR = os.path.join(WORKSPACE_ROOT, "Pinkerton")


def run_pinkerton(url: str, timeout_secs: int = 60) -> Dict[str, Any]:
    """Run Pinkerton CLI if present and return captured stdout/stderr and exit code."""
    if not os.path.isdir(PINKERTON_DIR):
        return {"available": False, "reason": "Pinkerton directory not found"}
    main_py = os.path.join(PINKERTON_DIR, "main.py")
    if not os.path.isfile(main_py):
        return {"available": False, "reason": "Pinkerton main.py not found"}

    try:
        proc = subprocess.run(
            ["python3", main_py, "-u", url],
            cwd=PINKERTON_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_secs,
        )
        return {
            "available": True,
            "exit_code": proc.returncode,
            "stdout": (proc.stdout or "")[:100000],
            "stderr": (proc.stderr or "")[:20000],
        }
    except subprocess.TimeoutExpired:
        return {"available": True, "error": "timeout"}
    except Exception as e:
        return {"available": True, "error": str(e)}


