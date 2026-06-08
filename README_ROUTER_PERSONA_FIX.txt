This fixes the earlier PowerShell -replace error and safely patches:

app/templates/sovereign-hub-ui/lib/ai/router.ts

Run from repository root:

powershell -NoProfile -ExecutionPolicy Bypass -File ".\PATCH_ROUTER_PERSONA_SAFE.ps1"
cd app\templates\sovereign-hub-ui
npm run build
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Connect clean AI persona to router"
git push
