KNOWN = {"typescript", "javascript", "python", "react", "go", "rust", "java", "cpp", "php", "sql"}

def resolve_language(value: str):
    clean = (value or "typescript").strip().lower()
    return {"id": clean, "known": clean in KNOWN, "mode": "native" if clean in KNOWN else "custom-2000-plus"}
