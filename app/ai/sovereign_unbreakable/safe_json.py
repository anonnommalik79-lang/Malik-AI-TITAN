import json

def safe_loads(value, fallback):
    try:
        return json.loads(value)
    except Exception:
        return fallback

def safe_dumps(value):
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return "{}"
