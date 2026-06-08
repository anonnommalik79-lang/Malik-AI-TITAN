Stage 3 safe router patch.

This fixes the PowerShell -replace error from APPLY_STAGE3_INTENT_ROUTER_FIX.ps1.

Run from repo root:

cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_FIX_STAGE3_ROUTER_PATCH_SAFE.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\FIX_STAGE3_ROUTER_PATCH_SAFE.ps1"
cd app\templates\sovereign-hub-ui
npm run build
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Fix stage 3 router task prompts"
git push
