# MALIK Stage 5 — Final Testing / Production Polish

This is a small final QA patch. It does not add huge features.

It adds:
- stricter clean persona behavior
- final mobile polish CSS
- QA smoke test script
- final QA checklist

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE5_FINAL_QA_POLISH.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\APPLY_FINAL_QA_POLISH.ps1"
python -m py_compile run.py
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Final QA polish for production stability"
git push
```

## Smoke test after Render live

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\MALIK_QA_SMOKE_TEST.ps1" -BaseUrl "https://YOUR-RENDER-URL.onrender.com"
```

## What still needs real env keys

- AI text providers need `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, or `OPENROUTER_API_KEY`.
- Image/video providers need their provider keys.
- Persistent history needs `DATABASE_URL`.
- Distributed jobs need `REDIS_URL`.
- File persistence needs S3/R2/storage config.
