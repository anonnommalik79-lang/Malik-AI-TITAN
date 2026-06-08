import os

def token_policy(kind: str = "chat") -> dict:
    return {
        "historyWindow": int(os.environ.get("CHAT_HISTORY_WINDOW", "12")),
        "maxOutputTokens": int(os.environ.get("MAX_CODE_OUTPUT_TOKENS" if kind in {"code", "website"} else "MAX_OUTPUT_TOKENS", "1200")),
        "summaryEnabled": os.environ.get("CHAT_SUMMARY_ENABLED", "true").lower() != "false",
    }
