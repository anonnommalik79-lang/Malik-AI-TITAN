# Malik Codex 1.0

Malik Codex 1.0 is a safe AI coding cockpit inside Malik AI.

## UI

Frontend files:

- `components/sovereign/codex/malik-codex-modal.tsx`
- `components/sovereign/codex/malik-codex-agent.tsx`
- `components/sovereign/codex/malik-codex-terminal.tsx`
- `components/sovereign/codex/malik-codex-files.tsx`
- `components/sovereign/codex/malik-codex-settings.tsx`

## Backend

Backend files:

- `app/codex/router.py`
- `app/codex/providers.py`
- `app/codex/tasks.py`
- `app/codex/security.py`

## Safety

- Safe local mode when API keys are missing
- Provider fallback disabled by default
- Auto mode disabled by default
- Session and task request limits
- Full Boss Mode requires confirmation
- No automatic Git push
- No hardcoded keys

