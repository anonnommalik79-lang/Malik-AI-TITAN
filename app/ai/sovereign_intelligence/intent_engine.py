from __future__ import annotations

import re
from typing import Dict, Any

RULES = [
    ("video", re.compile(r"видео|video|ролик|clip|motion|veo|luma|runway", re.I), "media"),
    ("image", re.compile(r"фото|image|photo|картин|нарисуй|poster|avatar", re.I), "media"),
    ("code", re.compile(r"код|code|react|tsx|python|javascript|debug|api|component", re.I), "code"),
    ("website", re.compile(r"сайт|website|landing|лендинг|dashboard|ui|page", re.I), "code"),
    ("presentation", re.compile(r"презентац|slides|deck|pitch", re.I), "workflow"),
    ("document", re.compile(r"документ|document|pdf|word|report|отч", re.I), "workflow"),
    ("agent", re.compile(r"codex|agent|repo|папк|файл|архитект", re.I), "workflow"),
]

def detect_intent(prompt: str) -> Dict[str, Any]:
    text = (prompt or "").strip()
    for kind, rule, group in RULES:
        if rule.search(text):
            return {"kind": kind, "prompt": text, "confidence": 0.92, "providerGroup": group}
    return {"kind": "chat", "prompt": text, "confidence": 0.5, "providerGroup": "text"}
