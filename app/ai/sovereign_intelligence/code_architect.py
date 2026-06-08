from __future__ import annotations

from typing import Dict, Any
from .language_engine import resolve_language

def build_code_plan(prompt: str, language: str = "typescript", framework: str = "") -> Dict[str, Any]:
    lang = resolve_language(language)
    content = "\n".join([
        f"{lang.comment} MALIK AI Code Architect",
        f"{lang.comment} Task: {prompt}",
        f"{lang.comment} Language: {lang.title}",
        f"{lang.comment} Run: {lang.run_hint}",
        "",
        "/* Provider should replace this starter with full production code when connected. */" if lang.comment == "//" else "# Provider should replace this starter with full production code when connected.",
    ])
    return {
        "ok": True,
        "language": lang.title,
        "framework": framework,
        "files": [
            {
                "path": lang.default_file,
                "language": lang.id,
                "content": content,
                "purpose": "Safe code generation starter",
            }
        ],
        "warnings": ["Custom language: verify syntax with official compiler."] if lang.family.startswith("custom") else [],
    }
