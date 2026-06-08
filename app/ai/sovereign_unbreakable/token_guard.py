def token_policy(kind: str = "chat"):
    return {"historyWindow": 8 if kind == "code" else 12, "maxOutputTokens": 4000 if kind == "code" else 1200}
