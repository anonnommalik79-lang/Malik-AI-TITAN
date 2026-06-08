# Malik AI Sovereign Architecture

Malik AI is organized as a Flask backend serving a static Next.js export.

## Roots

- Backend entry for Render: `run.py`
- Alternative Flask package entry: `app/__init__.py` and `app/routes.py`
- Frontend root: `app/templates/sovereign-hub-ui`
- Static photo storage: `app/static/storage/photos`
- Project storage fallback: `app/static/storage/projects`

## Product Layers

- Chat and streaming: `/api/stream`
- Canvas preview: `components/sovereign/preview-panel.tsx`
- Feature registry: `components/sovereign/core/feature-registry.ts`
- Generators: `/api/generate/*`
- Malik Codex 1.0: `components/sovereign/codex/*` and `/api/codex/*`

## Safety

Existing `ai_model.py`, `run.py`, `app/routes.py`, auth, chat and canvas are preserved. New modules use safe local fallbacks when providers are unavailable.

