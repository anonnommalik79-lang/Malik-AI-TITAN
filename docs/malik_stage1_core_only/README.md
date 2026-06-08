# MALIK AI — Stage 1 Core Only

This ZIP adds ONLY Stage 1:

- `lib/ai/types.ts`
- `lib/ai/detect-task.ts`
- `lib/ai/errors.ts`
- `lib/ai/models.ts`
- `lib/ai/usage.ts`
- `lib/ai/rate-limit.ts`
- `lib/ai/fallback.ts`
- `lib/ai/router.ts`
- providers: Gemini, Groq, OpenRouter
- disabled API route template
- `.env.stage1.example`

It does NOT add image/video/project/database/memory stages.

## Important

The active `app/api/ai/chat/route.ts` is not enabled in this ZIP because your current Next app previously broke Render with active API routes under static export.

A safe disabled template is included:

`app/templates/sovereign-hub-ui/app/_disabled_api_stage1/ai/chat/route.ts.disabled`

Enable it only after switching this Next app to server runtime or confirming active route handlers pass build.

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE1_CORE_ONLY.zip' -DestinationPath '.' -Force"
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Add MALIK AI stage 1 core router"
git push
```
