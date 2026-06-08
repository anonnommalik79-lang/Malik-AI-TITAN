# MALIK Stage 3 — Intent Detection / Smart Task Router Fix

This patch makes MALIK AI correctly distinguish:

- simple component/code → `code`
- landing page/full app/site/project → `project`
- bug/fix/error → `debug`
- photo/avatar/image/logo → `image`
- video/animation/clip → `video`
- file/PDF/document analysis → `file_analysis`
- ordinary requests → `chat`

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE3_INTENT_ROUTER_FIX.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\APPLY_STAGE3_INTENT_ROUTER_FIX.ps1"
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Fix smart intent detection and task routing"
git push
```

## Critical expected behavior

`Создай простой React компонент кнопки` must route to `code`, not `project`.

Code task rules:
- one component/file
- no full site
- no package.json
- no folder tree unless explicitly requested

Project task rules:
- file tree
- files
- package.json
- commands
