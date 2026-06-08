def code_contract(prompt: str, language: str = "typescript"):
    return {
        "prompt": (prompt or "").strip()[:12000],
        "language": language,
        "rules": ["production-ready", "no secrets", "small files", "error handling", "mobile-safe"],
    }
