[API_CONTRACTS.md](https://github.com/user-attachments/files/27952032/API_CONTRACTS.md)
# API Contracts

## Stream

`POST /api/stream`

SSE response with `data: {"content":"..."}` chunks.

## Generators

`POST /api/generate/photo`

Payload:

```json
{
  "prompt": "premium ai dashboard",
  "style": "cinematic",
  "size": "1024x1024",
  "quality": "high"
}
```

Response:

```json
{
  "ok": true,
  "kind": "photo",
  "url": "/api/storage/photos/malik_photo_123.svg",
  "fallback": true
}
```

Other generator endpoints:

- `/api/generate/video`
- `/api/generate/code`
- `/api/generate/website`
- `/api/generate/landing`
- `/api/generate/dashboard`
- `/api/generate/document`
- `/api/generate/presentation`
- `/api/generate/template`

`GET /api/runtime/env-check`

Returns provider readiness without exposing secret values:

```json
{
  "ok": true,
  "secretsExposed": false,
  "providers": [
    {
      "id": "openai-image",
      "configured": false,
      "requiredEnv": ["OPENAI_API_KEY"]
    }
  ]
}
```

## Projects

`POST /api/projects/save`

Stores safe JSON project snapshots under `app/static/storage/projects`.

## Malik Codex

- `GET /api/codex/health`
- `GET /api/codex/providers`
- `POST /api/codex/run`
- `POST /api/codex/plan`
- `POST /api/codex/apply`
- `GET|POST /api/codex/usage`
