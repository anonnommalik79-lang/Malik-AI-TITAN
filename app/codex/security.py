from __future__ import annotations

import os
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict


SESSION_LIMITS: Dict[str, Dict[str, Any]] = {}


@dataclass
class CodexSafetyPolicy:
    max_requests_per_session: int = 20
    max_requests_per_task: int = 6
    huge_task_requires_confirmation: bool = True
    provider_fallback_enabled: bool = False
    auto_mode_enabled: bool = False
    monthly_limit_usd: float = 0.0


def get_policy() -> CodexSafetyPolicy:
    return CodexSafetyPolicy(
        max_requests_per_session=int(os.environ.get("MALIK_CODEX_SESSION_LIMIT", "20")),
        max_requests_per_task=int(os.environ.get("MALIK_CODEX_TASK_LIMIT", "6")),
        provider_fallback_enabled=os.environ.get("MALIK_CODEX_PROVIDER_FALLBACK", "0") == "1",
        auto_mode_enabled=os.environ.get("MALIK_CODEX_AUTO_MODE", "0") == "1",
        monthly_limit_usd=float(os.environ.get("MALIK_CODEX_MONTHLY_LIMIT_USD", "0") or 0),
    )


def public_policy() -> Dict[str, Any]:
    return asdict(get_policy())


def safe_provider_enabled(provider: str) -> bool:
    env_map = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GOOGLE_API_KEY",
        "groq": "GROQ_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    return bool(os.environ.get(env_map.get(provider, "")))


def check_usage(session_id: str, task_id: str = "default") -> Dict[str, Any]:
    policy = get_policy()
    key = session_id or "guest"
    now = int(time.time())
    state = SESSION_LIMITS.setdefault(
        key,
        {
            "created_at": now,
            "requests": 0,
            "tasks": {},
            "stopped": False,
            "usage_log": [],
        },
    )
    task = state["tasks"].setdefault(task_id or "default", {"requests": 0})

    if state.get("stopped"):
        return {"ok": False, "reason": "STOPPED", "state": state, "policy": public_policy()}
    if state["requests"] >= policy.max_requests_per_session:
        return {"ok": False, "reason": "SESSION_LIMIT", "state": state, "policy": public_policy()}
    if task["requests"] >= policy.max_requests_per_task:
        return {"ok": False, "reason": "TASK_LIMIT", "state": state, "policy": public_policy()}

    state["requests"] += 1
    task["requests"] += 1
    state["usage_log"].append({"ts": now, "task": task_id, "event": "request"})
    return {"ok": True, "state": state, "policy": public_policy()}


def stop_session(session_id: str) -> Dict[str, Any]:
    key = session_id or "guest"
    state = SESSION_LIMITS.setdefault(
        key,
        {"created_at": int(time.time()), "requests": 0, "tasks": {}, "stopped": False, "usage_log": []},
    )
    state["stopped"] = True
    state["usage_log"].append({"ts": int(time.time()), "event": "stopped"})
    return state


def reset_stop(session_id: str) -> Dict[str, Any]:
    key = session_id or "guest"
    state = SESSION_LIMITS.setdefault(
        key,
        {"created_at": int(time.time()), "requests": 0, "tasks": {}, "stopped": False, "usage_log": []},
    )
    state["stopped"] = False
    state["usage_log"].append({"ts": int(time.time()), "event": "resumed"})
    return state

