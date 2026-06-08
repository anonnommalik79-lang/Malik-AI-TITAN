def fallback_answer(prompt: str):
    return {"ok": True, "fallback": True, "answer": f"MALIK fallback ready: {(prompt or '')[:500]}"}
