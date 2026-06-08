from __future__ import annotations

from typing import Dict, Any
from .intent_engine import detect_intent
from .media_director import enhance_media_prompt, storyboard
from .code_architect import build_code_plan
from .local_answer_kernel import local_answer

def final_route(prompt: str) -> Dict[str, Any]:
    intent = detect_intent(prompt)
    kind = intent["kind"]
    if kind in {"image", "video"}:
        return {
            "ok": True,
            "intent": intent,
            "mediaPrompt": enhance_media_prompt(prompt, "video" if kind == "video" else "image"),
            "storyboard": storyboard(prompt),
        }
    if kind in {"code", "website"}:
        return {
            "ok": True,
            "intent": intent,
            "codePlan": build_code_plan(prompt),
        }
    return {
        "ok": True,
        "intent": intent,
        "answer": local_answer(prompt),
    }
