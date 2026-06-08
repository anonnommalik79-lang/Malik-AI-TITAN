from __future__ import annotations

import os
from typing import Any, Dict, List

from .security import safe_provider_enabled


PROVIDER_DEFAULTS = [
    {"id": "openai", "label": "OpenAI", "env": "OPENAI_API_KEY", "model": os.environ.get("MALIK_CODEX_MODEL", "gpt-5.5")},
    {"id": "anthropic", "label": "Anthropic", "env": "ANTHROPIC_API_KEY", "model": "claude-sonnet"},
    {"id": "google", "label": "Google Gemini", "env": "GOOGLE_API_KEY", "model": "gemini-pro"},
    {"id": "groq", "label": "Groq", "env": "GROQ_API_KEY", "model": "llama-3.3-70b"},
    {"id": "openrouter", "label": "OpenRouter", "env": "OPENROUTER_API_KEY", "model": "openrouter/auto"},
]


def get_public_provider_configs() -> List[Dict[str, Any]]:
    active = os.environ.get("MALIK_CODEX_PROVIDER", "openai")
    rows = []
    for item in PROVIDER_DEFAULTS:
        provider_id = item["id"]
        rows.append(
            {
                "id": provider_id,
                "label": item["label"],
                "model": item["model"],
                "enabled": safe_provider_enabled(provider_id),
                "active": provider_id == active,
                "apiKeyConfigured": bool(os.environ.get(item["env"])),
                "fallbackEnabled": False,
                "autoModeEnabled": False,
            }
        )
    return rows


def estimate_cost_placeholder(provider: str, prompt: str, max_tokens: int = 2000) -> Dict[str, Any]:
    tokens = max(1, int(len(prompt or "") / 4) + max_tokens)
    return {
        "provider": provider,
        "estimatedTokens": tokens,
        "estimatedUsd": round(tokens * 0.000002, 4),
        "note": "Placeholder estimate only. Real billing should be calculated by the provider response later.",
    }


def provider_ready(provider: str) -> bool:
    return safe_provider_enabled(provider)

