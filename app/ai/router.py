from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

try:
    import requests
except Exception:  # Render normally installs requests; fallback remains safe.
    requests = None  # type: ignore


def _env(name: str, fallback: str = "") -> str:
    return os.environ.get(name, fallback).strip()


def _bool_env(name: str, default: bool = False) -> bool:
    value = _env(name)
    if not value:
        return default
    return value.lower() in {"1", "true", "yes", "on", "enabled"}


def _int_env(name: str, fallback: int, *, min_value: int = 1, max_value: int = 120000) -> int:
    try:
        value = int(_env(name, str(fallback)))
    except Exception:
        return fallback
    return max(min_value, min(max_value, value))


def _now_ms() -> int:
    return int(time.time() * 1000)


def _safe_preview(value: str, limit: int = 260) -> str:
    clean = " ".join(str(value or "").split())
    return clean[:limit] + ("…" if len(clean) > limit else "")


def _normalize_role(role: str) -> str:
    value = str(role or "user").lower()
    if value in {"assistant", "ai", "bot", "system", "tool"}:
        return "assistant" if value in {"ai", "bot"} else value
    return "user"


@dataclass(frozen=True)
class TextProvider:
    id: str
    title: str
    api_key_env: str
    endpoint_env: str
    default_endpoint: str
    model_env: str
    default_model: str
    mode: str = "openai-compatible"
    tier: str = "standard"
    docs_url: str = ""
    key_url: str = ""
    base_url_style: bool = False

    def key(self) -> str:
        return _env(self.api_key_env)

    def endpoint(self) -> str:
        raw = _env(self.endpoint_env, self.default_endpoint).rstrip("/")
        if self.base_url_style and raw and not raw.endswith("/chat/completions"):
            return f"{raw}/chat/completions"
        return raw

    def model(self) -> str:
        return _env(self.model_env, self.default_model)

    def configured(self) -> bool:
        return bool(self.key() and self.endpoint())

    def public_status(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "configured": self.configured(),
            "keyConfigured": bool(self.key()),
            "endpointConfigured": bool(self.endpoint()),
            "keyEnv": self.api_key_env,
            "endpointEnv": self.endpoint_env,
            "model": self.model(),
            "modelEnv": self.model_env,
            "mode": self.mode,
            "tier": self.tier,
            "docsUrl": self.docs_url,
            "keyUrl": self.key_url,
        }


TEXT_PROVIDERS: List[TextProvider] = [
    TextProvider(
        id="groq",
        title="Groq Speed Engine",
        api_key_env="GROQ_API_KEY",
        endpoint_env="GROQ_CHAT_URL",
        default_endpoint="https://api.groq.com/openai/v1/chat/completions",
        model_env="GROQ_MODEL",
        default_model="llama-3.1-8b-instant",
        tier="speed",
        docs_url="https://console.groq.com/docs",
        key_url="https://console.groq.com/keys",
    ),
    TextProvider(
        id="amazon-bedrock-api",
        title="Amazon Bedrock OpenAI-Compatible Engine",
        api_key_env="OPENAI_API_KEY",
        endpoint_env="OPENAI_BASE_URL",
        default_endpoint="https://bedrock-mantle.eu-west-1.api.aws/v1",
        model_env="OPENAI_MODEL",
        default_model="openai.gpt-oss-120b",
        tier="amazon-quality",
        docs_url="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html",
        key_url="https://console.aws.amazon.com/bedrock/home#/quickstart",
        base_url_style=True,
    ),
    TextProvider(
        id="openai-direct",
        title="OpenAI Direct Backup",
        api_key_env="OPENAI_DIRECT_API_KEY",
        endpoint_env="OPENAI_CHAT_URL",
        default_endpoint="https://api.openai.com/v1/chat/completions",
        model_env="OPENAI_TEXT_MODEL",
        default_model="gpt-4o-mini",
        tier="backup",
        docs_url="https://platform.openai.com/docs",
        key_url="https://platform.openai.com/api-keys",
    ),
    TextProvider(
        id="xai",
        title="xAI Grok Backup",
        api_key_env="XAI_API_KEY",
        endpoint_env="XAI_CHAT_URL",
        default_endpoint="https://api.x.ai/v1/chat/completions",
        model_env="XAI_MODEL",
        default_model="grok-2-latest",
        tier="backup",
        docs_url="https://docs.x.ai/docs",
        key_url="https://console.x.ai/",
    ),
]


class PromptIntent:
    CHAT = "chat"
    CODE = "code"
    WEBSITE = "website"
    IMAGE = "image"
    VIDEO = "video"
    DOCUMENT = "document"
    PRESENTATION = "presentation"
    CODEX = "codex"
    DEBUG = "debug"


def detect_prompt_intent(prompt: str, mode: str = "auto") -> str:
    text = (prompt or "").strip().lower()
    mode_value = (mode or "auto").strip().lower()

    # COST GUARD:
    # Normal chat must NEVER trigger paid image/video generation by keywords.
    # Words like "launch video", "photo", "image", "cinematic" stay CHAT.
    # Media generation is allowed only through explicit slash commands or dedicated mode/studio.
    if text.startswith(("/video ", "/video:", "/veo ")):
        return PromptIntent.VIDEO
    if text.startswith(("/image ", "/photo ", "/img ", "/image:", "/photo:")):
        return PromptIntent.IMAGE

    # COST GUARD:
    # Do not trust hidden UI mode for paid media.
    # Only explicit /image or /video commands can trigger media.

    if text.startswith(("/codex ", "/agent ")):
        return PromptIntent.CODEX
    if text.startswith(("/debug ", "/fix ")):
        return PromptIntent.DEBUG
    if text.startswith(("/code ",)):
        return PromptIntent.CODE
    if text.startswith(("/website ", "/site ", "/landing ")):
        return PromptIntent.WEBSITE
    if text.startswith(("/slides ", "/presentation ")):
        return PromptIntent.PRESENTATION
    if text.startswith(("/document ", "/pdf ", "/word ")):
        return PromptIntent.DOCUMENT

    return PromptIntent.CHAT



def token_budget_for_intent(intent: str) -> int:
    if intent in {PromptIntent.CODE, PromptIntent.DEBUG, PromptIntent.CODEX, PromptIntent.WEBSITE}:
        return _int_env("MAX_CODE_OUTPUT_TOKENS", 8000, min_value=512, max_value=16000)
    if intent in {PromptIntent.DOCUMENT, PromptIntent.PRESENTATION}:
        return _int_env("MAX_DOCUMENT_OUTPUT_TOKENS", 4200, min_value=512, max_value=12000)
    return _int_env("MAX_OUTPUT_TOKENS", 2600, min_value=256, max_value=12000)


def provider_order_for_intent(intent: str) -> List[str]:
    raw = _env("MALIK_TEXT_PROVIDER_ORDER")
    if intent == PromptIntent.CHAT:
        raw = _env("MALIK_FAST_PROVIDER_ORDER", raw or "groq,amazon-bedrock-api,openai-direct,xai")
    elif intent in {PromptIntent.CODE, PromptIntent.DEBUG, PromptIntent.CODEX, PromptIntent.WEBSITE}:
        raw = _env("MALIK_SMART_PROVIDER_ORDER", raw or "amazon-bedrock-api,groq,openai-direct,xai")
    else:
        raw = raw or "amazon-bedrock-api,groq,openai-direct,xai"
    return [item.strip() for item in raw.split(",") if item.strip()]


def ordered_text_providers(intent: str) -> List[TextProvider]:
    order = provider_order_for_intent(intent)
    index = {provider_id: i for i, provider_id in enumerate(order)}
    return sorted(TEXT_PROVIDERS, key=lambda provider: index.get(provider.id, 100))


def compact_history(history: Iterable[Dict[str, Any]] | None) -> List[Dict[str, str]]:
    window = _int_env("CHAT_HISTORY_WINDOW", 32, min_value=4, max_value=80)
    items = list(history or [])[-window:]
    compacted: List[Dict[str, str]] = []
    for item in items:
        content = str(item.get("content") or item.get("text") or item.get("message") or "").strip()
        if not content:
            continue
        compacted.append({"role": _normalize_role(str(item.get("role") or "user")), "content": content[:12000]})
    return compacted


def build_system_prompt(intent: str, mode: str) -> str:
    if intent in {PromptIntent.CODE, PromptIntent.DEBUG, PromptIntent.CODEX, PromptIntent.WEBSITE}:
        return (
            "You are MALIK AI Sovereign, a world-class senior full-stack engineer, product architect and code generator. "
            "Answer in the user's language. Build production-ready solutions, not toy examples. "
            "For code/project requests: give exact files, complete code blocks when needed, architecture, edge cases, deploy notes, and safe diagnostics. "
            "Never expose secrets. Never invent API keys. Avoid spam and filler. Prefer robust fallbacks, retries, logging and Render-safe code. "
            f"Current intent: {intent}. Current mode: {mode}."
        )
    return (
        "You are MALIK AI Sovereign, a fast premium assistant with long-chat context. "
        "Answer in the user's language. Be direct, useful and strong, but do not spam or repeat yourself. "
        "Never reveal secrets or API keys. "
        f"Current intent: {intent}. Current mode: {mode}."
    )


def build_messages(prompt: str, intent: str, mode: str, history: Iterable[Dict[str, Any]] | None = None) -> List[Dict[str, str]]:
    messages = [{"role": "system", "content": build_system_prompt(intent, mode)}]
    messages.extend(compact_history(history))
    messages.append({"role": "user", "content": str(prompt or "")[:_int_env("MAX_PROMPT_CHARS", 30000, min_value=500, max_value=80000)]})
    return messages


def humanize_ai_error(error: Any) -> Dict[str, str]:
    text = str(error or "")
    low = text.lower()
    if "401" in low or "unauthorized" in low or "invalid api key" in low:
        return {"code": "invalid_key", "message": "AI provider key is invalid or expired.", "hint": "Rotate the provider API key in Render Environment."}
    if "429" in low or "rate limit" in low or "too many" in low:
        return {"code": "rate_limited", "message": "AI provider rate limit reached.", "hint": "Wait a bit or switch provider order."}
    if "402" in low or "credits" in low or "billing" in low or "quota" in low:
        return {"code": "billing_required", "message": "AI provider requires credits or billing.", "hint": "Check provider billing dashboard."}
    if "timeout" in low or "timed out" in low:
        return {"code": "timeout", "message": "AI provider took too long to answer.", "hint": "Use a faster provider or reduce prompt size."}
    if "400" in low or "bad request" in low:
        return {"code": "bad_request", "message": "Provider rejected the request payload.", "hint": "Check model name, endpoint and token limits."}
    return {"code": "provider_failed", "message": "AI provider failed.", "hint": _safe_preview(text, 220)}


class SafeAIRouter:
    """Server-only text router: Groq speed + Amazon quality.

    Chat has no artificial daily limit here. Media limits are enforced in the media bridge.
    """

    def __init__(self, providers: Iterable[str] | None = None):
        self.providers = list(providers or [provider.id for provider in TEXT_PROVIDERS])
        self.retries = _int_env("AI_PROVIDER_RETRIES", 1, min_value=0, max_value=3)
        self.timeout_seconds = _int_env("AI_REQUEST_TIMEOUT_SECONDS", 75, min_value=5, max_value=240)

    def status(self) -> Dict[str, Any]:
        return {
            "ok": True,
            "router": "SafeAIRouter",
            "strategy": "chat=groq-first, code=amazon-first, media=amazon-bedrock-media",
            "chatLimit": "unlimited-no-spam",
            "requestsInstalled": requests is not None,
            "historyWindow": _int_env("CHAT_HISTORY_WINDOW", 32, min_value=4, max_value=80),
            "maxOutputTokens": _int_env("MAX_OUTPUT_TOKENS", 2600, min_value=256, max_value=12000),
            "maxCodeOutputTokens": _int_env("MAX_CODE_OUTPUT_TOKENS", 8000, min_value=512, max_value=16000),
            "providers": [provider.public_status() for provider in TEXT_PROVIDERS],
            "secretsExposed": False,
        }

    def route(
        self,
        prompt: str,
        mode: str = "chat",
        *,
        history: Iterable[Dict[str, Any]] | None = None,
        user: str = "guest",
        stream: bool = False,
    ) -> Dict[str, Any]:
        started = _now_ms()
        clean_prompt = str(prompt or "").strip()
        if not clean_prompt:
            return {"ok": False, "error": "missing_prompt", "message": "Prompt is required.", "latencyMs": _now_ms() - started}

        intent = detect_prompt_intent(clean_prompt, mode)
        if intent in {PromptIntent.IMAGE, PromptIntent.VIDEO}:
            return {
                "ok": True,
                "provider": "media-router",
                "mode": mode,
                "intent": intent,
                "fallback": False,
                "latencyMs": _now_ms() - started,
                "content": "Media request detected. Use /api/generate/photo or /api/generate/video.",
                "mediaEndpoint": "/api/generate/video" if intent == PromptIntent.VIDEO else "/api/generate/photo",
            }

        errors: List[Dict[str, str]] = []
        for provider in ordered_text_providers(intent):
            if provider.id not in self.providers or not provider.configured():
                continue
            for attempt in range(self.retries + 1):
                try:
                    content = self._call_openai_compatible(provider, clean_prompt, intent, mode, history)
                    return {
                        "ok": True,
                        "provider": provider.id,
                        "providerTitle": provider.title,
                        "model": provider.model(),
                        "mode": mode,
                        "intent": intent,
                        "fallback": False,
                        "attempt": attempt + 1,
                        "latencyMs": _now_ms() - started,
                        "content": content,
                    }
                except Exception as exc:
                    human = humanize_ai_error(exc)
                    errors.append({"provider": provider.id, **human})

        return self._local_fallback(clean_prompt, intent, mode, started, errors)

    def _call_openai_compatible(self, provider: TextProvider, prompt: str, intent: str, mode: str, history: Iterable[Dict[str, Any]] | None) -> str:
        if requests is None:
            raise RuntimeError("requests is not installed")
        body = {
            "model": provider.model(),
            "messages": build_messages(prompt, intent, mode, history),
            "temperature": float(_env("AI_TEMPERATURE", "0.45") or 0.45),
            "max_tokens": token_budget_for_intent(intent),
            "stream": False,
        }
        response = requests.post(
            provider.endpoint(),
            headers={"Authorization": f"Bearer {provider.key()}", "Content-Type": "application/json"},
            json=body,
            timeout=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"{provider.title} HTTP {response.status_code}: {response.text[:700]}")
        data = response.json()
        choices = data.get("choices") or []
        first = choices[0] if choices else {}
        message = first.get("message") or {}
        content = message.get("content") or first.get("text") or data.get("content") or ""
        if isinstance(content, list):
            content = "\n".join(str(part.get("text") or part.get("content") or part) if isinstance(part, dict) else str(part) for part in content)
        if not content:
            raise RuntimeError(f"{provider.title} returned empty content: {json.dumps(data)[:500]}")
        return str(content)

    def _local_fallback(self, prompt: str, intent: str, mode: str, started_ms: int, errors: List[Dict[str, str]]) -> Dict[str, Any]:
        if intent in {PromptIntent.CODE, PromptIntent.DEBUG, PromptIntent.WEBSITE, PromptIntent.CODEX}:
            content = (
                "Malik AI local fallback activated.\n\n"
                f"Intent: {intent}\n"
                f"Prompt: {_safe_preview(prompt, 500)}\n\n"
                "No configured text provider answered. Check GROQ_API_KEY and Amazon Bedrock OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL in Render."
            )
        else:
            content = prompt
        return {
            "ok": True,
            "provider": "local",
            "mode": mode,
            "intent": intent,
            "fallback": True,
            "latencyMs": _now_ms() - started_ms,
            "content": content,
            "errors": errors[-8:],
            "note": "Safe local fallback. Chat is unlimited here; media has daily photo/video quotas.",
        }


ai_router = SafeAIRouter()


__all__ = ["SafeAIRouter", "ai_router", "detect_prompt_intent", "humanize_ai_error"]
