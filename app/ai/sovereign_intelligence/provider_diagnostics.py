from __future__ import annotations

import os
from typing import List, Dict, Any

PROVIDERS = [
    ("openai", "OpenAI", ["OPENAI_API_KEY"], "text"),
    ("groq", "Groq", ["GROQ_API_KEY"], "text"),
    ("xai", "xAI Grok", ["XAI_API_KEY"], "text"),
    ("luma", "Luma", ["LUMA_API_KEY"], "media"),
    ("fal", "fal.ai", ["FAL_KEY"], "media"),
    ("runway", "Runway", ["RUNWAYML_API_SECRET", "RUNWAY_API_KEY"], "media"),
    ("google-veo", "Google Veo", ["GOOGLE_VEO_API_KEY", "GEMINI_API_KEY"], "media"),
]

def configured(names: List[str]) -> bool:
    return any(os.environ.get(name, "").strip() for name in names)

def provider_status() -> Dict[str, Any]:
    providers = [
        {
            "id": pid,
            "title": title,
            "configured": configured(envs),
            "requiredEnv": envs,
            "group": group,
            "secretsExposed": False,
        }
        for pid, title, envs, group in PROVIDERS
    ]
    return {
        "ok": True,
        "secretsExposed": False,
        "providers": providers,
        "configuredCount": sum(1 for item in providers if item["configured"]),
    }
