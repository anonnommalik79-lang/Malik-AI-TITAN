# MALIK AI Stage 4 — Project Builder

This stage adds a minimal working Project Builder:

- `POST /api/ai/project`
- `GET /api/ai/project/<id>`
- `GET /api/ai/projects`
- project job status: queued / processing / completed / failed
- project plan
- folder structure
- files
- package.json
- setup commands
- Project Builder UI component
- disabled Next route templates for static/export safety

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE4_PROJECT_BUILDER.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\CONNECT_STAGE4_PROJECT_BUILDER.ps1"
python -m py_compile run.py
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Add MALIK AI stage 4 project builder"
git push
```

## Notes

The backend does not execute generated code. It only returns files and commands.
If premium provider keys are missing, it uses safe local fallback project generation.
