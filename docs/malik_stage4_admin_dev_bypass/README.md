# MALIK Stage 4 — Admin Dev Bypass / Paywall Fix

This patch keeps production subscriptions and limits, but adds safe owner/dev bypass.

## Backend routes

- `GET /api/ai/admin/status?userEmail=...`
- `GET /api/ai/limits/status?userEmail=...&plan=free`
- `POST /api/ai/limits/check`
- `POST /api/ai/limits/increment`

## Env

Local:

```env
ADMIN_EMAILS=amangeldymalik38@gmail.com
DEV_BYPASS_LIMITS=true
NEXT_PUBLIC_APP_ENV=development
```

Production:

```env
DEV_BYPASS_LIMITS=false
NEXT_PUBLIC_APP_ENV=production
```

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE4_ADMIN_DEV_BYPASS_PAYWALL.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\CONNECT_STAGE4_ADMIN_BYPASS.ps1"
python -m py_compile run.py
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Fix admin dev bypass and paywall limits"
git push
```

## Expected

- admin email: no paywall, all features unlocked
- dev local: limits disabled only when `DEV_BYPASS_LIMITS=true` and env is development/local
- production normal user: free/pro/ultra limits stay active
- no secrets exposed
