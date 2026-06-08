from __future__ import annotations

from flask import jsonify, request

from .providers import estimate_cost_placeholder, get_public_provider_configs, provider_ready
from .security import check_usage, public_policy, reset_stop, stop_session
from .tasks import TASK_PRESETS, build_boss_prompt, build_plan


def register_codex_routes(app):
    @app.route("/api/codex/health", methods=["GET", "OPTIONS"])
    def codex_health():
        if request.method == "OPTIONS":
            return "", 204
        return jsonify({"ok": True, "module": "Malik Codex 1.0", "mode": "safe-local", "policy": public_policy()})

    @app.route("/api/codex/providers", methods=["GET", "OPTIONS"])
    def codex_providers():
        if request.method == "OPTIONS":
            return "", 204
        return jsonify({"ok": True, "providers": get_public_provider_configs(), "policy": public_policy()})

    @app.route("/api/codex/usage", methods=["GET", "POST", "OPTIONS"])
    def codex_usage():
        if request.method == "OPTIONS":
            return "", 204
        data = request.get_json(silent=True) or {}
        session_id = data.get("sessionId") or request.args.get("sessionId") or "guest"
        if data.get("stop"):
            state = stop_session(session_id)
        elif data.get("resume"):
            state = reset_stop(session_id)
        else:
            state = check_usage(session_id, "status").get("state", {})
        return jsonify({"ok": True, "state": state, "policy": public_policy()})

    @app.route("/api/codex/plan", methods=["POST", "OPTIONS"])
    def codex_plan():
        if request.method == "OPTIONS":
            return "", 204
        data = request.get_json(silent=True) or {}
        return jsonify(build_plan(data.get("mode") or "audit", data.get("prompt") or "", data.get("files") or []))

    @app.route("/api/codex/run", methods=["POST", "OPTIONS"])
    def codex_run():
        if request.method == "OPTIONS":
            return "", 204
        data = request.get_json(silent=True) or {}
        session_id = data.get("sessionId") or "guest"
        mode = data.get("mode") or "audit"
        usage = check_usage(session_id, mode)
        if not usage["ok"]:
            return jsonify({"ok": False, "error": usage["reason"], "usage": usage}), 429
        if mode == "full-boss" and not data.get("confirmed"):
            return jsonify({"ok": False, "requiresConfirmation": True, "warning": "Full Boss Mode can be expensive. Confirm before running."}), 202
        provider = data.get("provider") or "local"
        ready = provider_ready(provider)
        plan = build_plan(mode, data.get("prompt") or "", data.get("files") or [])
        return jsonify(
            {
                "ok": True,
                "mode": "api-ready" if ready else "safe-local",
                "provider": provider,
                "providerReady": ready,
                "plan": plan,
                "prompt": build_boss_prompt(data),
                "cost": estimate_cost_placeholder(provider, data.get("prompt") or ""),
                "changedFilesPreview": [],
                "message": "Safe local response. Real provider execution can be enabled after API keys and confirmation.",
            }
        )

    @app.route("/api/codex/apply", methods=["POST", "OPTIONS"])
    def codex_apply():
        if request.method == "OPTIONS":
            return "", 204
        return jsonify(
            {
                "ok": True,
                "applied": False,
                "message": "Apply hook prepared. Browser UI must send reviewed patches; backend will require confirmation before writes.",
            }
        )

    @app.route("/api/codex/tasks", methods=["GET", "OPTIONS"])
    def codex_tasks():
        if request.method == "OPTIONS":
            return "", 204
        return jsonify({"ok": True, "tasks": TASK_PRESETS})

