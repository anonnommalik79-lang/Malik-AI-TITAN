# MALIK Mobile + Intent + Admin Bypass Fix

This patch fixes the first 3 critical production blocks:

1. Mobile overflow/performance guard
2. Simple component vs full project intent detection
3. Admin/dev bypass for usage/paywall logic

## Adds/updates

- `lib/ai/detect-task.ts`
- `lib/ai/admin-bypass.ts`
- `lib/ai/usage-limits.ts`
- `lib/ai/rate-limit.ts`
- appends mobile safety CSS to `app/globals.css`
- appends `export * from "./admin-bypass"` to `lib/ai/index.ts`

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_FIX_MOBILE_INTENT_ADMIN_STAGE.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\APPLY_MOBILE_INTENT_ADMIN_FIX.ps1"
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Fix mobile overflow intent routing and admin bypass"
git push
```

## Manual intent checks

Expected:

- `Создай простой React компонент кнопки` → `code`
- `Создай premium dashboard card компонент` → `code`
- `Создай landing page для Sovereign Hub` → `project`
- `Создай полный проект AI dashboard` → `project`
- `Исправь ошибку в этом компоненте` → `debug`
- `Создай сайт для MALIK AI` → `project`

## Env

Local test:

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
