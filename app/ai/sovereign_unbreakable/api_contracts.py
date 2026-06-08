def success(**kwargs):
    return {"ok": True, **kwargs}

def failure(error: str, message: str = ""):
    return {"ok": False, "error": error, "message": message or error}
