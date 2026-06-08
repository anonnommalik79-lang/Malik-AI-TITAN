from __future__ import annotations

from typing import Any, Dict, List


TASK_PRESETS: Dict[str, Dict[str, str]] = {
    "audit": {
        "title": "Audit Project",
        "prompt": "Audit project structure, broken imports, empty buttons, build issues, API contracts, and Render deploy readiness.",
    },
    "fix-bugs": {
        "title": "Fix Bugs",
        "prompt": "Fix TypeScript, React, Python and route bugs without removing old logic.",
    },
    "generate-feature": {
        "title": "Generate Feature",
        "prompt": "Create a connected feature with UI, action handler, backend hook, registry entry and fallback.",
    },
    "refactor": {
        "title": "Refactor Files",
        "prompt": "Extract components, clean duplication and preserve compatibility.",
    },
    "create-ui": {
        "title": "Create UI",
        "prompt": "Create premium dark glass UI with responsive states, loading and empty states.",
    },
    "connect-backend": {
        "title": "Connect Backend",
        "prompt": "Connect frontend buttons to safe backend endpoints with loading, errors and fallback.",
    },
    "render-deploy": {
        "title": "Render Deploy Fix",
        "prompt": "Check package scripts, render.yaml, build command, start command and deploy checklist.",
    },
    "full-boss": {
        "title": "Full Boss Mode",
        "prompt": "Full audit, feature architecture, 300+ registry, UI/backend connection and Render readiness. Requires confirmation.",
    },
}


def build_plan(mode: str, prompt: str, files: List[str] | None = None) -> Dict[str, Any]:
    preset = TASK_PRESETS.get(mode, TASK_PRESETS["audit"])
    selected_files = files or []
    steps = [
        "Read protected files and active feature registry",
        "Classify task risk and required modules",
        "Prepare isolated plan before file changes",
        "Generate patch preview and changed-files list",
        "Wait for apply confirmation before destructive work",
        "Run Python/TypeScript/build checks when available",
    ]
    if mode == "full-boss":
        steps.insert(0, "Show huge-task warning and request explicit confirmation")
    return {
        "ok": True,
        "mode": mode,
        "title": preset["title"],
        "prompt": prompt or preset["prompt"],
        "files": selected_files,
        "steps": steps,
        "issues": [
            "API provider fallback is disabled by default",
            "No Git push or destructive command runs without confirmation",
            "Frontend can run in local safe mode without API keys",
        ],
    }


def build_boss_prompt(payload: Dict[str, Any]) -> str:
    mode = payload.get("mode") or "audit"
    preset = TASK_PRESETS.get(mode, TASK_PRESETS["audit"])
    files = payload.get("files") or []
    features = payload.get("features") or []
    provider = payload.get("provider") or "local"
    user_prompt = payload.get("prompt") or preset["prompt"]
    lines = [
        "MALIK CODEX 1.0 BOSS PROMPT",
        "",
        f"Task mode: {preset['title']}",
        f"Provider: {provider}",
        f"User request: {user_prompt}",
        "",
        "Selected files:",
        *(f"- {item}" for item in files[:80]),
        "",
        "Selected feature modules:",
        *(f"- {item}" for item in features[:80]),
        "",
        "Safety rules:",
        "- Do not hardcode API keys.",
        "- Do not auto-push to Git.",
        "- Ask before huge tasks and destructive actions.",
        "- Keep ai_model.py, run.py, app/routes.py and current canvas/chat logic compatible.",
        "- Render deploy must keep static export and gunicorn run:app ready.",
    ]
    return "\n".join(lines)

