from __future__ import annotations

import re
import secrets
import time
from pathlib import Path


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_name(name: str, default: str = "file") -> str:
    """Filename with no path components or odd characters."""
    base = Path(name.replace("\\", "/")).name
    base = _SAFE.sub("_", base).strip("._")
    return (base or default)[:120]


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))
