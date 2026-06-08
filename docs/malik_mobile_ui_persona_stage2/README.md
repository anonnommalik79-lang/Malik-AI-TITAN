# MALIK Stage 2 — Mobile UI / Responsive + Persona Fix

This patch focuses only on:
- mobile toolbar overflow
- Deploy button clipping
- bottom composer height/width
- message/code wrapping
- reduced mobile heavy effects
- persona/system prompt cleanup

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_FIX_MOBILE_UI_PERSONA_STAGE2.zip' -DestinationPath '.' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\APPLY_MOBILE_UI_PERSONA_STAGE2.ps1"
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Fix mobile UI responsiveness and AI persona"
git push
```

Manual checks:
- 360px: no horizontal page scroll
- 375px: toolbar scrolls internally, Deploy not clipped
- 390px/430px: composer compact and safe-area aware
- Prompt: "Создай простой React компонент кнопки" stays component/code
- Ask about Gemini: MALIK AI answers normally, without “I do not know Gemini”
