# MALIK AI Stage 5 — Database / Memory / Scale

This stage adds production-ready architecture without breaking static frontend:

- Database-ready layer
- Memory API helpers
- Usage limits by plan
- Queue abstraction with Redis-ready status
- Storage abstraction with S3/R2-ready status
- Safe logger with secret redaction
- Backend `/api/ai/scale/status`
- Backend `/api/ai/usage`
- Usage / Limits UI panel
- PostgreSQL/Supabase schema

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE5_DATABASE_MEMORY_SCALE.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\CONNECT_STAGE5_SCALE.ps1"
python -m py_compile run.py
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Add MALIK AI stage 5 database memory scale"
git push
```

## Routes

- `GET /api/ai/scale/status`
- `GET /api/ai/usage?userId=guest&plan=free`
- `POST /api/ai/usage/increment`

## Security

No secrets are returned in public status routes. Logger redacts keys, secrets, tokens and authorization fields.
