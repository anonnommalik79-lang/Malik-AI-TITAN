# MALIK AI — Режим Бога (куда вставлять API)

## Шаг 1 — один файл для всех ключей

Все ключи вставляются **только** сюда:

```
app/templates/sovereign-hub-ui/.env.local
```

**Не** в код. **Не** в GitHub. **Не** в браузер.

### Быстрый старт

```powershell
cd "app\templates\sovereign-hub-ui"
copy .env.god-mode.example .env.local
notepad .env.local
```

Вставь ключи после `=` и сохрани.

---

## Шаг 2 — что обязательно для «полного ИИ»

### Минимум (чат заработает сразу)

Хотя бы **один** из трёх:

| Переменная | Где взять |
|------------|-----------|
| `GROQ_API_KEY` | https://console.groq.com |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |

### Режим бога — чат (текст, код, умный роутинг)

| Переменная | Где взять | Зачем |
|------------|-----------|-------|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | GPT |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com | Claude |
| `GROQ_API_KEY` | https://console.groq.com | Быстрый бесплатный |
| `GEMINI_API_KEY` | https://aistudio.google.com | Vision + текст |
| `OPENROUTER_API_KEY` | https://openrouter.ai | Много моделей |
| `XAI_API_KEY` | https://console.x.ai | Grok |
| `DEEPSEEK_API_KEY` | https://platform.deepseek.com | Код/анализ |

В `.env.local` обязательно:

```env
AI_FREE_MODE=false
```

Иначе платные провайдеры **заблокированы**.

### Режим бога — картинки

| Переменная | Где взять |
|------------|-----------|
| `STABILITY_API_KEY` | https://platform.stability.ai/account/keys |

Fallback без ключа: Pollinations (автоматически).

Тест: `POST /api/media/image` или Photo Generation в дашборде.

### Режим бога — видео

| Переменная | Где взять |
|------------|-----------|
| `POLLO_API_KEY` | https://pollo.ai/api-platform/keys |

Плюс в `.env.local`:

```env
POLLO_VIDEO_ENABLED=true
```

Тест: `POST /api/media/video` → poll `/api/media/video/status?taskId=...`

### Режим бога — логин и OAuth

| Переменная | Где взять |
|------------|-----------|
| `WORKOS_CLIENT_ID` | WorkOS Dashboard → Configuration |
| `WORKOS_API_KEY` | WorkOS Dashboard → API Keys (только сервер!) |
| `WORKOS_COOKIE_PASSWORD` | случайная строка минимум 32 символа |

Добавь `http://localhost:3000/callback` в Redirect URIs WorkOS.

### Amazon / AWS (опционально)

Только для **текста/кода** через Bedrock — **не** для `/api/media/*`:

```env
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## Шаг 3 — запуск

```powershell
npm install
npm run dev
```

Или:

```powershell
.\START-MALIK.bat
```

Открой: http://localhost:3000/dashboard

---

## Шаг 4 — проверка что всё живое

```text
GET http://localhost:3000/api/health
GET http://localhost:3000/api/health/providers      ← чат-провайдеры
GET http://localhost:3000/api/health/media-providers  ← Stability, Pollo, Pollinations
GET http://localhost:3000/api/health/auth           ← WorkOS AuthKit
```

Если `stability: configured`, `groq: configured` и т.д. — ключ принят.

---

## Карта: что куда идёт

```
.env.local
    │
    ├─ GROQ / GEMINI / OPENROUTER / OPENAI / CLAUDE / GROK
    │       → /api/stream, /api/ai/chat, /api/ai/brain  (чат в дашборде)
    │
    ├─ STABILITY_API_KEY (+ Pollinations fallback)
    │       → /api/media/image  (Photo, «Создай изображение»)
    │
    ├─ POLLO_API_KEY + POLLO_VIDEO_ENABLED=true
    │       → /api/media/video  (Video, «Создай видео»)
    │
    └─ WORKOS_*
            → /auth, /sign-in, /callback, защищённая сессия
```

---

## Безлимит для себя

В `.env.local`:

```env
MALIK_ADMIN_USERS=твой@email.com
```

Этот email обходит дневные лимиты.

---

## Важно

- Ключи **только** в `.env.local`
- `.env.local` уже в `.gitignore` — в GitHub не попадёт
- `AI_FREE_MODE=true` = только бесплатные модели чата
- `POLLO_VIDEO_ENABLED=false` = видео не генерируется (даже с ключом)
- Amazon для медиа **выключен** — картинки через Stability, видео через Pollo
