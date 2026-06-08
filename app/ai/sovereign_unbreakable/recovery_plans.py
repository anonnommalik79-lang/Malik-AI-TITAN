def recovery_plan(error: object):
    value = str(error or "").lower()
    if "401" in value:
        return {"title": "Invalid key", "steps": ["check env", "redeploy"], "auto": False}
    if "402" in value or "credit" in value:
        return {"title": "No credits", "steps": ["add balance", "fallback provider"], "auto": False}
    if "429" in value:
        return {"title": "Rate limit", "steps": ["retry backoff"], "auto": True}
    if "timeout" in value:
        return {"title": "Timeout", "steps": ["increase poll seconds", "retry"], "auto": True}
    return {"title": "Unknown", "steps": ["check logs"], "auto": False}
