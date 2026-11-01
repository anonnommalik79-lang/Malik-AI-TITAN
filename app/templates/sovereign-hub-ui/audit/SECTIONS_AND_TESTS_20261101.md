# MALIK AI — что сломано, а что нет (1 ноября 2026, часть 1 из 2)

Проверено на `main` = `3328f73b`: production-сборка локально, гость, без ключей моделей.
Этот отчёт — только поиск; код приложения в этом шаге не менялся.

Повторить проверку:

```bash
node scripts/audit-all-tests.mjs
MALIK_QA_BASE_URL=http://localhost:3018 node scripts/audit-sections-live.mjs
```

## 1. Все автотесты по одному: 128 из 139 проходят

| Тест | Что значит | Причина |
| --- | --- | --- |
| `universal-intelligence` | **Поломка.** Новая тема наследует язык прошлой (`{ language: "ru" }` вместо `{}`) | Коммиты «conversation continuity» (`8dc8d956`, `73381c29`): на `2078e5f1` проходил, на `61dee8dc` уже нет |
| `on-topic` | **Поломка.** «the chat router uses the follow-up, the user's context and the resolved question» | Те же коммиты: на `2078e5f1` проходил |
| `chat-activity` | Падал и до сегодняшних правок: у прочитанной страницы нет `readAt` в квитанции поиска | Не разобрано: баг или устаревший тест |
| `network` | Падал и раньше: ожидается 404, приходит 401 | Не разобрано; может зависеть от окружения |
| `auth-server` | Падал и раньше: `ECONNRESET` | Не разобрано; похоже на окружение |
| `website-engine` | Не поломка: упал под нагрузкой параллельной сборки, отдельно проходит (0 падений) | Нестабилен под нагрузкой |
| `work-ui-freeze` | Не поломка: «заморозка» UI с давнего коммита, падает при любой правке интерфейса | Устаревший тест |
| `illustrated-answers`, `mobile-thinking` | Не поломка: на этой машине нет пакета `playwright` | Окружение |
| `petroleum-stream`, `petroleum-documents` | Не поломка: нет `pdfinfo` / `pdftotext` | Окружение |

Все 17 тестов, которые запускает `npm run build` (сборка на Render), проходят.

## 2. Отдельные страницы в браузере: ошибок нет

`/taxi`, `/translator`, `/shorts`, `/shorts/library`, `/shorts/history`, `/business`,
`/business/dashboard`, `/media`, `/status`, `/capabilities`, `/security`, `/investors`,
`/contact`, `/press-kit`, `/benchmarks`, `/research-lab`, `/compute`, `/demo`, `/clone`, `/auth`
на 1440 и 375 px: ни одной ошибки JavaScript, ни одного ответа 5xx, нет прокрутки вбок.
Все «упавшие» запросы в журнале — `ERR_ABORTED`, то есть прерванные предзагрузки при уходе со страницы.

Без ключей моделей локально ожидаемо отвечает 503 `/api/voice/gemini-live-token` (голосовой режим).

## 3. Разделы дашборда: не проверено

Первый обход сломался о сам тест: окно голосового режима перекрывало следующие клики.
Скрипт исправлен (каждый раздел в свежей странице), но прогон не закончен.

## Что осталось (часть 2)

1. Прогнать `scripts/audit-sections-live.mjs` по разделам: Библиотека, Проекты, Задачи, Бизнес под ключ,
   Malik Work, Malik Shorts, Сайты, Генерация видео, Создать трек, Презентации, Генерация изображений.
2. Починить `universal-intelligence` и `on-topic`, не откатывая работу Codex над контекстом разговора.
3. Разобрать `chat-activity`, `network`, `auth-server`.
4. Тесты, `npm run build`, коммит.
