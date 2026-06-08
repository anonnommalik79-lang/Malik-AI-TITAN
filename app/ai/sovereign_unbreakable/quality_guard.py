def quality_score(prompt: str, provider: bool = False, fallback: bool = True):
    score = 20
    if prompt and len(prompt) > 10: score += 25
    if provider: score += 35
    if fallback: score += 20
    return min(score, 100)
