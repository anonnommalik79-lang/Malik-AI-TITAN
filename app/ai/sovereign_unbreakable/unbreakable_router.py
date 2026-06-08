from .intent_guard import detect_kind
from .media_guard import media_contract
from .code_guard import code_contract
from .fallback_answer import fallback_answer

def route(prompt: str):
    kind = detect_kind(prompt)
    if kind in {"image", "video"}:
        return {"ok": True, "kind": kind, "media": media_contract(prompt, kind)}
    if kind in {"code", "website"}:
        return {"ok": True, "kind": kind, "code": code_contract(prompt)}
    return fallback_answer(prompt)
