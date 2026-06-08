from __future__ import annotations

def local_answer(prompt: str) -> str:
    text = (prompt or "").strip()
    if not text:
        return "Malik AI дайын. Сұрағыңды жаз."
    return (
        "Malik AI route дайын. Бұл fallback жауап: нақты provider қосылғанда жауап AI provider арқылы келеді. "
        f"Prompt: {text[:500]}"
    )
