"""MALIK Sovereign Final Intelligence helpers.

Safe additive backend modules for media/code routing and provider diagnostics.
They do not replace ai_model.py or app/routes.py until you wire them manually.
"""

from .intent_engine import detect_intent
from .language_engine import resolve_language
from .media_director import enhance_media_prompt, storyboard
from .code_architect import build_code_plan
from .provider_diagnostics import provider_status

__all__ = [
    "detect_intent",
    "resolve_language",
    "enhance_media_prompt",
    "storyboard",
    "build_code_plan",
    "provider_status",
]
