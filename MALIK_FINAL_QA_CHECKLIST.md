# MALIK AI Final QA Checklist

## Build
- `npm run build` must pass.
- `python -m py_compile run.py` must pass.

## Mobile widths
Check with Chrome DevTools:
- 360px
- 375px
- 390px
- 430px
- 768px

Expected:
- no horizontal page scroll
- toolbar scrolls internally
- Deploy not clipped
- bottom composer compact
- messages readable
- code blocks do not expand page
- no heavy lag on mobile

## AI behavior
Expected:
- `Знаешь Gemini AI?` -> normal answer about Gemini
- `Кто ты?` -> short MALIK AI description, only because user asked
- `Создай простой React компонент кнопки` -> single Button.tsx component
- `Создай landing page для Sovereign Hub` -> project/full output
- `Исправь ошибку Maximum update depth exceeded` -> debug cause + fix
- `Сделай аву Sovereign Hub` -> image task
- `Сделай видео рекламу MALIK AI` -> video task

## Admin / paywall
Expected:
- admin email is not blocked
- dev bypass works only in development/local
- production free user limits still work
- no secrets in frontend or responses

## Console
No:
- Maximum update depth exceeded
- Hydration failed
- Cannot read properties of undefined
- Module not found
- infinite rerender warnings

## Network
Expected:
- API routes return JSON
- no tight infinite polling
- provider missing returns clean error
- no secret values exposed
