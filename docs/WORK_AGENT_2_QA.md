# Malik Work Agent 2 — проверка 5 октября 2026

История: запрос в «Работе» → выбор чата/потока → реальный исполнитель → сохранённые события и артефакты → скачивание. Срезы коммитились отдельно в `feature/malik-work-agent-2` и отправлены в `main` по явному разрешению владельца. Изменения founder/audit не затронуты.

## Срезы

| Срез | Статус реализации | Коммит |
|---|---|---|
| A: изоляция фоновых ответов | Готово, серверная сессия, чужому/гостю 404 | 77a1948e |
| B: документы и скачивание | Готово, 9 форматов + PPTX артефакта | b569b83c |
| C: маршрутизация запросов | Готово, обычный код остаётся в чате | 9165f6a5 |
| D: журнал реального исполнения | Готово, хранение и SSE, до 200 событий | bcda08e7 |
| E: навыки | Готово, 18 записей, реальный статус, запуск только engine | c887f24a |
| F: GitHub | Готово на уровне API: токен пользователя, preview/HMAC/execute, постоянная идемпотентность | b602977c |
| G: сложные расчёты | Готово: один JSON-план ≤6 задач, тайм-аут 6 с, проверенные квитанции | 82d99817 |
| H: QA и handoff | Частично: локальные проверки завершены; полная сборка и production-проверка не подтверждены | Финальный QA-коммит |

«Готово» выше означает реализацию и перечисленные локальные проверки, **не успешный production-деплой**. GitHub API не подключён автоматически к вызовам модели/новому диалогу подтверждения в чате. Внешние действия не выполнялись.

## Реальные запуски

- 42/42 тестовых команды: все составляющие `test:release-core`, `test:os`, mobile-send, chat-v7, work-mode, brain и новые проверки. Superpowers и claude-class входят в release-core. Подробные exit-коды и логи: локальная QA-папка `C:/Users/HUAWEI/Documents/Codex/QA/work-agent-2-20261005/release-results.json`.
- Новые проверки: A 11/11, B 15/15, C 108/108 (36 фраз × work/chat/guest), D 6/6, E 5/5, F 11/11, G 6/6; суммарно 162/162.
- Существующие проверки: OS 18/18 + 12/12 + 12/12; math 19/19; documents 7/7; presentations 69/69; MAX 22/22; answer-sheet 7/7. Не складываются с количеством команд как отдельные уникальные тесты.
- Playwright Chromium: 3/3 — 1440×900, 390×844, 390×844 reduced-motion. Реальные React-компоненты меню/журнала → настоящий POST экспорта → реальное скачивание DOCX. Нет pageerror/переполнения; проверены русские надписи и отключение анимации. Это компонентная QA-страница, **не полный dashboard**, Safari или реальный телефон.
- Экспорт PDF проверен pdf-lib и pypdf; кириллица извлекается, A4 и ссылки присутствуют. 11-страничная таблица имеет повторяющийся заголовок. PNG первой страницы отрендерен Poppler и просмотрен. pdftotext локально отсутствует.
- DOCX открыт python-docx, XLSX — openpyxl. PPTX — настоящий OOXML с двумя слайдами, честной подписью «без изображений»; клиентские URL не скачиваются.
- Независимый `verify-work-files.py`: 6/6 (DOCX, XLSX, PDF, многостраничный PDF, PPTX, ZIP с 8 вложенными форматами); файлы в ZIP повторно открыты читателями.

Первые запуски выявили Windows-проблемы тестового окружения. Исправления не меняют проверки: CRLF нормализован только при поиске границы меню, абсолютный import answer-sheet заменён file URL, POSIX-синтаксис `test:max` заменён переносимым Node-runner. `MALIK_QA_DEPS`/`NODE_PATH` указывают на реальные пакеты в отдельной QA-папке; это не declaration-заглушки. Общий node_modules другого checkout не менялся. HTML QA-стенда получил UTF-8, после чего русские надписи проверены и скриншоты пересняты.

## Матрица 20 сценариев: ожидание → факт

PASS здесь относится только к названному реальному изолированному запуску. Авторизация в route-тестах подменена; model/provider/Pipes/fetch подменены там, где это прямо указано. Хранилище тестов — настоящий OS JSON-store с memoryBackend; не боевой S3/R2.

| № | Сценарий / ожидание | Факт и граница проверки | Статус |
|---|---|---|---|
| 1 | Математика: вычислить, проверить | Реальный mathjs: 19/19; unsafe-ввод отклоняется | PASS |
| 2 | Физика: сохранить размерности | 5 kg × 9.81 m/s² = 49.05 N; противоречивые единицы отклонены; план модели — заглушка | PASS |
| 3 | DOCX из чата | Настоящий POST, реальные байты, python-docx; browser скачал DOCX | PASS |
| 4 | PDF из чата | Настоящий генератор, pdf-lib загрузил, pypdf извлёк кириллицу | PASS |
| 5 | XLSX из чата | Настоящий генератор, openpyxl прочитал текст и число | PASS |
| 6 | DOCX/PDF/XLSX из артефакта | Настоящий owner-store и GET вернули 200 для всех трёх | PASS |
| 7 | Чужой артефакт: 404 | Чужая сессия и гость получили 404 | PASS |
| 8 | Гость: чат и экспорт, не Superflow | Маршрутизация guest → chat; экспорт доступен; userId в body отвергнут | PASS |
| 9 | Superflow: документ | Реальный executor сохранил результат/проверенные переходы; сам document-tool — заглушка в journal-тесте | PASS |
| 10 | Superflow: презентация | Существующий OS-flow тест выполнил граф и сохранил 11 слайдов; provider — заглушка; отдельный GET экспортировал настоящий PPTX | PASS |
| 11 | Superflow: сайт | Существующий executor/tool/validator сохранил website, validation.ok; model/site-provider — заглушки | PASS |
| 12 | Отмена: не выдавать успех | Реальный cancelFlow, task.cancelled, нет tool.completed | PASS |
| 13 | Повтор: честные попытки | start → retry → start → complete, attempt=2; симулированный сбой внешнего инструмента | PASS |
| 14 | Перезагрузка во время работы | Пока инструмент удерживается заглушкой, очищен process-cache и дважды открыт настоящий SSE; сохранённый running-журнал совпал; затем отмена | PASS |
| 15 | GitHub без подключения | Настоящий driver/route вернул честное «не подключён»; credential-boundary — заглушка | PASS |
| 16 | GitHub preview/execute | 11/11: порядок API, HMAC, TTL, подмена, чужой owner, non-force, повторная идемпотентность, fail-closed записи storage; fetch — mock | PASS |
| 17 | Мобильная вёрстка 390px | Playwright: реальное меню/журнал, 5 форматов, без горизонтального скролла | PASS |
| 18 | Reduced-motion | Chromium эмуляция: animationName=none, журнал доступен, скачать можно | PASS |
| 19 | Слишком большой ввод | Реальный POST >400 КБ вернул 413; чужие поля 400 | PASS |
| 20 | Частота запросов | 6 guest-экспортов проходят, седьмой — 429 | PASS |

## Блокеры сборки и что не проверено

1. `npx tsc --noEmit` не проходит в текущем shared node_modules: отсутствуют mathjs, pptxgenjs, pdf-lib, @pdf-lib/fontkit. Пакеты объявлены в package.json и согласованном lock-файле.
2. Полная TypeScript-проверка с **настоящими типами всех четырёх пакетов** (`verify-work-types.mjs`) находит одну оставшуюся ошибку: `lib/server/founder-message-log.ts:182:37`, TS7006, параметр `item`. Этот чужой файл по заданию не менялся. Ошибки не подавляются, strict не выключен.
3. `MALIK_BUILD_NO_CACHE=1 npx next build --webpack`: без QA-пакетов webpack останавливается на missing modules. С NODE_PATH реальных QA-пакетов webpack **Compiled successfully in 3.1min**, затем Next TypeScript останавливается на отсутствии локального типа pptxgenjs (NODE_PATH не добавляет TypeScript paths). Полной успешной сборки нет.
4. Не проверены production-сайт, Render-деплой, настоящий WorkOS login, живые ответы моделей, реальные Pipes/GitHub операции, чтение/запись боевого S3/R2. Нет безопасной подтверждённой тестовой сессии/подключения; токены пользователя не подменялись общим GITHUB_TOKEN, внешние записи не делались.
5. Screenshot QA — Chromium component fixture; полный dashboard, Safari/iPhone и Android физически не проверены. PDF просмотрен; DOCX/XLSX/PPTX проверены читателями/структурой, не GUI Word/Excel/PowerPoint.
6. Журнал восстанавливается из configured store. Без S3/R2 memory fallback не переживает перезапуск процесса. GitHub execute намеренно запрещён без постоянного приватного хранилища: иначе идемпотентность была бы ложной.

## Render и оставшаяся работа

- `npm ci --legacy-peer-deps` установит два новых production-пакета: pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1. Других новых production-зависимостей нет. Шрифты и лицензия закоммичены; настроен tracing.
- Для GitHub write: `WORK_CONFIRMATION_SECRET` ≥32 символов **либо** уже настроенный WORKOS_COOKIE_PASSWORD ≥32; существующее приватное S3/R2; подключение GitHub самого пользователя через WorkOS Pipes. GITHUB_TOKEN не используется для операций пользователя.
- Не переносить MALIK_QA_DEPS, NODE_PATH и MALIK_BUILD_NO_CACHE в production: это локальное QA-окружение.
- Следующий обязательный шаг: инженер founder исправляет свою TS7006; чистый npm ci + полный typecheck/build; затем production QA с тестовым аккаунтом, реальными провайдерами и R2. Только после этого можно подтвердить production-ready.
- Отдельный будущий срез: включить GitHub действия в model tool-calling и дать UI предпросмотра/подтверждения. Текущий F реализует безопасный API, не автономное выполнение произвольного запроса моделью.

## Изменённые файлы (внутри app/templates/sovereign-hub-ui)

- API: `api/stream/background/route.ts`, `api/stream/background/[turnId]/route.ts`; `api/os/flows/route.ts`, `api/os/flows/[id]/events/route.ts`, `api/os/artifacts/[id]/export/route.ts`; `api/work/export/route.ts`, `api/work/github/route.ts`, `api/work/skills/route.ts`, `api/work/skills/run/route.ts` — все под `app/`.
- UI: `components/sovereign/{dashboard.tsx,chat-view.tsx,WorkDownloadMenu.tsx,work-download.css}`; `components/sovereign/os/{ArtifactViewer.tsx,SuperflowBlock.tsx,WorkJournal.tsx,os-client.ts,work-journal.css}`.
- Сервер/исполнитель: `lib/server/{background-chat-turns.ts,request-frequency.ts}`, `lib/os/{executor.ts,http.ts,types.ts}`, `lib/malik-god-router.ts`.
- Work: `lib/work/{orchestrator.ts,activity-log.ts,github.ts}`, `lib/work/skills/registry.ts`, `lib/work/math/{schema.ts,model-plan.ts}`, `lib/work/documents/{pdf.ts,export.ts,formats.ts,http.ts}`.
- Упаковка: `package.json`, `package-lock.json`, `next.config.mjs`, четыре `assets/fonts/DejaVu*.ttf` и `LICENSE-DejaVu.txt`.
- QA: `scripts/{work-test-loader.mjs,verify-work-types.mjs,verify-background-ownership.mjs,verify-work-export.mjs,verify-work-orchestrator.mjs,verify-work-journal.mjs,verify-work-skills.mjs,verify-work-github.mjs,verify-work-math-plan.mjs,verify-work-browser.mjs,verify-work-release.mjs,verify-work-files.py,run-malik-max.mjs,ts-resolve-hooks.mjs,verify-attachment-menu.mjs,verify-answer-sheet.mjs}`.
- Этот отчёт: `docs/WORK_AGENT_2_QA.md` в корне репозитория. Полный diff: git range `f5743b47..feature/malik-work-agent-2`.

## Git / ссылки

Ветка main получила срезы по прямому разрешению владельца. PR не создавался; после синхронного push main и feature совпадают, поэтому сравнение может быть пустым.

[История main](https://github.com/anonnommalik79-lang/Malik-AI-TITAN/commits/main/) · [Ссылка сравнения из задания](https://github.com/anonnommalik79-lang/Malik-AI-TITAN/compare/main...feature/malik-work-agent-2?expand=1)

Что проверено реально: 42/42 тестовых команды, 162/162 новых проверок, 3/3 Chromium-сценария; границы с заглушками и блокеры полной сборки указаны выше.
