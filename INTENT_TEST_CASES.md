# MALIK Intent Detection Manual Checks

Expected:

| Prompt | Expected |
|---|---|
| Создай простой React компонент кнопки | code |
| Создай premium dashboard card компонент | code |
| Создай landing page для Sovereign Hub | project |
| Создай полный проект AI dashboard | project |
| Исправь ошибку Maximum update depth exceeded | debug |
| Сделай аву Sovereign Hub | image |
| Сделай видео рекламу MALIK AI | video |

After applying patch run:

```cmd
cd app\templates\sovereign-hub-ui
npm run build
```

Then manually test in chat.
