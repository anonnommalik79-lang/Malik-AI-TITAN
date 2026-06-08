from __future__ import annotations

from dataclasses import dataclass

@dataclass(frozen=True)
class LanguageProfile:
    id: str
    title: str
    family: str
    extension: str
    default_file: str
    comment: str
    run_hint: str

LANG = {
    "typescript": LanguageProfile("typescript", "TypeScript", "web", ".ts", "index.ts", "//", "npm run build"),
    "react": LanguageProfile("react", "React TSX", "web", ".tsx", "App.tsx", "//", "npm run build"),
    "javascript": LanguageProfile("javascript", "JavaScript", "web", ".js", "index.js", "//", "node index.js"),
    "python": LanguageProfile("python", "Python", "backend", ".py", "main.py", "#", "python main.py"),
    "go": LanguageProfile("go", "Go", "backend", ".go", "main.go", "//", "go run ."),
    "rust": LanguageProfile("rust", "Rust", "systems", ".rs", "main.rs", "//", "cargo run"),
    "java": LanguageProfile("java", "Java", "backend", ".java", "Main.java", "//", "javac Main.java && java Main"),
    "cpp": LanguageProfile("cpp", "C++", "systems", ".cpp", "main.cpp", "//", "g++ main.cpp -o app"),
    "php": LanguageProfile("php", "PHP", "backend", ".php", "index.php", "//", "php index.php"),
    "sql": LanguageProfile("sql", "SQL", "data", ".sql", "query.sql", "--", "run in database"),
}

ALIASES = {"ts": "typescript", "tsx": "react", "js": "javascript", "py": "python", "golang": "go", "rs": "rust", "c++": "cpp"}

def normalize(value: str) -> str:
    return "".join(ch for ch in (value or "typescript").strip().lower() if ch.isalnum() or ch in "+#")

def resolve_language(value: str) -> LanguageProfile:
    key = ALIASES.get(normalize(value), normalize(value))
    if key in LANG:
        return LANG[key]
    return LanguageProfile(key or "custom", value or "Custom Language", "custom-2000-plus", ".txt", f"{key or 'custom'}-solution.txt", "#", "verify with official runtime")
