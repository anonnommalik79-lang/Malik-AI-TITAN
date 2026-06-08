# MALIK AI Stage 3 — Image / Video Jobs

This pack adds Stage 3 safely:

- image provider router
- video provider router
- in-memory job system
- generation history local UI component
- Flask backend blueprint for `/api/ai/image`, `/api/ai/video`, `/api/ai/job/<id>`, `/api/ai/history`
- disabled Next route templates for static-export safety

## Why disabled Next routes?

Your current UI build is static. Active Next route handlers can break Render static export. So real routes are added as Flask blueprint under:

`app/ai/media_jobs/`

To activate in `run.py`, register:

```python
from app.ai.media_jobs import media_jobs_bp
app.register_blueprint(media_jobs_bp)
```

Only do this after Stage 3 build passes.

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE3_IMAGE_VIDEO_JOBS.zip' -DestinationPath '.' -Force"
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Add MALIK AI stage 3 image video jobs"
git push
```
