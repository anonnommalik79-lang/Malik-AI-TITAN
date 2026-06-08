from .provider_guard import provider_status

def readiness():
    status = provider_status()
    count = sum(1 for p in status["providers"] if p["configured"])
    return {"ok": True, "score": min(100, count * 14), "providersConfigured": count}
