import os

PROVIDERS = {
    "openai": ["OPENAI_API_KEY"],
    "groq": ["GROQ_API_KEY"],
    "xai": ["XAI_API_KEY"],
    "luma": ["LUMA_API_KEY"],
    "fal": ["FAL_KEY"],
    "runway": ["RUNWAYML_API_SECRET", "RUNWAY_API_KEY"],
    "google-veo": ["GOOGLE_VEO_API_KEY", "GEMINI_API_KEY"],
}

def provider_status():
    return {
        "ok": True,
        "secretsExposed": False,
        "providers": [
            {"id": key, "configured": any(os.environ.get(name, "").strip() for name in names), "requiredEnv": names}
            for key, names in PROVIDERS.items()
        ],
    }
