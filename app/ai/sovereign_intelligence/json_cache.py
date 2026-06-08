from __future__ import annotations

import json
from pathlib import Path
from typing import Any

def read_cache(path: str | Path, fallback: Any):
    target = Path(path)
    if not target.exists():
        return fallback
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return fallback

def write_cache(path: str | Path, data: Any):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
