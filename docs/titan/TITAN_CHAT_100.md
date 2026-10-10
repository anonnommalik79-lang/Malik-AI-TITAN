# MALIK AI — TITAN CHAT 100: покрытие и отчёт

Ветка: `titan-chat-100` (от `main` 271c7997). Деплой не запускался, Render не трогался.

## Как считаются статусы

| Статус | Значение |
|---|---|
| **VERIFIED** | проверено на живом сайте или приёмочным сценарием end-to-end |
| **TESTED** | есть код и автотест, который его исполняет (офлайн, фикстуры вместо провайдеров) |
| **IMPLEMENTED** | есть код, автотеста нет |
| **PARTIAL** | код есть, но закрывает функцию не полностью (статус вне списка ТЗ, введён ради честности) |
| **NOT STARTED** | нет реализации |
| **BLOCKED** | нельзя сделать без решения владельца (платный API, доступ) |

Источник: аудит кода 5 агентами (только чтение) + изменения этапа A. Важно: многие старые `verify-*.mjs` проверяют исходный текст регулярками, а не поведение.

## Итог

| | Кол-во |
|---|---|
| VERIFIED | **0** (на живом сайте ничего не проверялось: деплой запрещён ТЗ) |
| TESTED | 51 |
| IMPLEMENTED | 1 |
| PARTIAL | 38 |
| NOT STARTED | 10 |
| BLOCKED | 0 |

Полностью готово с автотестами: **52 из 100 (52%)**; до этапа A было 48. Полностью VERIFIED: **0%**.
20 приёмочных сценариев ТЗ ещё не прогонялись (нужен живой стенд).

## Таблица 100 функций

### Malik Intelligence Engine (1–10)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 1 | Intent Intelligence | PARTIAL | detect-task, brain-v1, response-intelligence; классификация регулярками в 3–4 местах |
| 2 | Complexity Router | TESTED | brain-v1 `analyzeMalikBrainV1` → depth/токены; test:responses |
| 3 | MalikLLM MAX Routing | TESTED | malik-max-engine `buildMaxLanes`/`raceLanes`; test:max |
| 4 | Multi-step Reasoning | PARTIAL | malik-agent-runtime только при Action OS-контракте |
| 5 | Fact Verification | PARTIAL | fact-audit сверяет цифры с прочитанными страницами; без поиска нет проверки |
| 6 | Calculation Verification | PARTIAL | lib/work/math (mathjs) только для распознанных мат. задач |
| 7 | Critical Answer Review | NOT STARTED | только инструкции в промпте, второго прохода нет |
| 8 | Uncertainty Detection | PARTIAL | промпт-модули + «⚠️» truth-engine |
| 9 | Assumption Tracking | PARTIAL | только промпт, нет структуры факт/допущение/оценка |
| 10 | Self-Correction | PARTIAL | арифметика/согласованность итогов, продолжение незакрытых частей |

### Ultra Context (11–20)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 11 | Длинные промпты без потери требований | TESTED | brief-quality, MAX_TEXT_CONTEXT 800k; test:large-prompts |
| 12 | Большие документы по частям | TESTED | **этап A**: lib/ai/document-context.ts (честная доля каждому файлу, начало+конец+релевантное, пометки пропусков); test:titan-stage-a |
| 13 | Поиск релевантных фрагментов | PARTIAL | **этап A**: релевантность по словам вопроса внутри файлов; поиска по истории чатов нет |
| 14 | Бюджет токенов с резервом | PARTIAL | answer-budget, perCall; нет явного резерва под ответ при огромном вводе |
| 15 | Память аккаунта | PARTIAL | память в localStorage, на сервере только история чатов |
| 16 | Сохранение предпочтений по правилам | TESTED | action-os `detectMalikMemoryIntent`; test:memory-isolation |
| 17 | Поиск по истории | TESTED | подстрока по заголовкам/тексту; test:library |
| 18 | Учёт прошлых решений | PARTIAL | последние 32 сообщения, старые обрезаны до 900 символов |
| 19 | Редактирование и перегенерация | PARTIAL | перегенерация только последнего ответа |
| 20 | Ветки диалога | PARTIAL | ветка = копия чата без связи с родителем |

### Streaming & Reliability (21–30)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 21 | Быстрый первый фрагмент | PARTIAL | hedging, мгновенный статус; до первого байта ждём поиск/контекст |
| 22 | Стабильный длинный поток | TESTED | **этап A**: обрыв/лимит/время больше не выдаются за полный ответ; test:max, test:titan-stage-a |
| 23 | Статусы только при реальной работе | TESTED | **этап A**: таймер удалён, шаг показывается только если он был; test:response-stages(-ui) |
| 24 | Сборка визуала без скачков | PARTIAL | rAF-сброс 48 мс; нет теста layout shift |
| 25 | Нет дублей текста | TESTED | **этап A**: lib/ai/continuation-overlap.ts — повтор любой глубины (было ≤240 символов) отбрасывается; test:max, test:titan-stage-a |
| 26 | Восстановление после обрыва сети | PARTIAL | работает, но pending-ходы не чистятся после нормального завершения (риск перезаписи) |
| 27 | Нет ложного «готово» | TESTED | **этап A**: поле `incomplete`, строка «Ответ не завершён: причина», кнопка «Продолжить» |
| 28 | Отмена с сохранением результата | PARTIAL | Stop не останавливает генерацию на сервере (тратятся токены) |
| 29 | Безопасный повтор без дублей | TESTED | canRetryChat, 409 на повторный UUID; test:chat-stream-integrity |
| 30 | Переход на резервного провайдера | PARTIAL | здоровье линий только в памяти процесса |

### Adaptive Answer Engine (31–40)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 31 | Malik Answer Schema | TESTED | три схемы (answer-visuals, answer-cards, lib/visual Zod); test:visual-engine |
| 32 | Авто-выбор текст/визуал/инструмент | TESTED | lib/visual/intent.ts (эвристика) |
| 33 | Профессиональная типографика | TESTED | MalikMarkdown; нет зачёркивания и вложенных цитат |
| 34 | Кратко + раскрыть подробности | PARTIAL | только инструкция в промпте |
| 35 | Оглавление длинных ответов | NOT STARTED | нет якорей и TOC |
| 36 | Сворачиваемые детали | PARTIAL | сворачиваются только панели вокруг ответа |
| 37 | Смысловые иконки | PARTIAL | иконки фиксированы по типу блока |
| 38 | Метки статуса/источника/уверенности | TESTED | Badge, CitationChip, FactAuditPanel |
| 39 | Ссылки на материалы | TESTED | SourceDeck/SourceDrawer |
| 40 | Следующее полезное действие | TESTED | FollowUpChips; **этап A**: «Продолжить» для незавершённых ответов |

### Premium Layouts (41–50)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 41 | Hero Answer | TESTED | MalikAnswerCards hero |
| 42 | Executive Summary | PARTIAL | только промпт-модуль |
| 43 | KPI Dashboard | TESTED | VisualDashboard |
| 44 | Metric Delta | TESTED | MetricNote; дельту даёт модель, не расчёт |
| 45 | Bento grid | NOT STARTED | — |
| 46 | Pros & Cons | NOT STARTED | — |
| 47 | Side-by-Side | TESTED | comparison 2–3 колонки |
| 48 | Decision Matrix с весами | PARTIAL | нет весов и взвешенного итога |
| 49 | Action Checklist | TESTED | MalikAnswerChecklist (состояние в sessionStorage) |
| 50 | FAQ Accordion | NOT STARTED | — |

### Charts & Diagrams (51–60)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 51 | Flowcharts | TESTED | VisualGraph; нет ромбов-решений, mermaid не рендерится |
| 52 | Архитектурные схемы | TESTED | graphBlock NODE_KINDS |
| 53 | Иерархии | TESTED | через общий граф |
| 54 | Concept maps | PARTIAL | только слоистая раскладка |
| 55 | Timelines | TESTED | v1 timeline |
| 56 | Roadmap/Gantt | PARTIAL | нет полос Ганта |
| 57 | Bar charts | TESTED | VisualChart |
| 58 | Line charts | TESTED | VisualChart |
| 59 | Donut/Pie | TESTED | VisualChart |
| 60 | Scatter | IMPLEMENTED | код есть, теста нет |

### Advanced Knowledge Views (61–70)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 61 | Большие таблицы | TESTED | VisualTable; даты не парсятся |
| 62 | Heatmap | NOT STARTED | — |
| 63 | Реальные индикаторы процесса | TESTED | ChatExecution, MalikResponseStages |
| 64 | Подсветка кода | TESTED | один regex-токенайзер на все языки |
| 65 | Diff двух версий | NOT STARTED | diff есть только в библиотеке артефактов |
| 66 | Дерево файлов | PARTIAL | плоский список блоков + ZIP |
| 67 | Пошаговая математика | TESTED | TexMath + math engine |
| 68 | Аннотации изображений | NOT STARTED | — |
| 69 | Карты | NOT STARTED | — |
| 70 | Фотогалереи | TESTED | MalikReferenceImages + лайтбокс |

### Live Interactive Answers (71–80)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 71 | Слайдеры | TESTED | VisualCalculator |
| 72 | Калькуляторы | TESTED | 4 фиксированные модели |
| 73 | Поля ввода | TESTED | VisualCalculator |
| 74 | Сценарии | TESTED | scenarios до 4 |
| 75 | Выпадающие параметры | PARTIAL | только фильтры таблиц |
| 76 | Поиск/фильтр/сортировка | TESTED | только Visual Engine-таблицы |
| 77 | Подсказки графиков | TESTED | тест только для графа |
| 78 | Мастер пошагового решения | PARTIAL | только MalikTapGuide для «куда нажать» |
| 79 | Квизы | NOT STARTED | — |
| 80 | Копирование/сохранение/экспорт | TESTED | CSV/PNG/SVG, ZIP, «Лист / PDF» |

### Multimodal (81–90)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 81 | Понимание изображений | TESTED | multimodal-router; test:image-edit |
| 82 | Тематические изображения из источников | TESTED | reference-images |
| 83 | Генерация изображений из чата | TESTED | test:generation-survives |
| 84 | PDF | PARTIAL | тест проверяет только строку application/pdf |
| 85 | Таблицы xlsx/csv с расчётами | PARTIAL | xlsx как плоский текст; расчёты только в OS data |
| 86 | Транскрипция аудио | TESTED | /api/transcribe |
| 87 | Голосовой режим | TESTED | VoiceMode |
| 88 | Видео | TESTED | кадры + метаданные |
| 89 | Передача задачи в Malik Work | PARTIAL | нет явного согласия в чате |
| 90 | Сохранение визуальных ответов и состояния | PARTIAL | состояние блоков только в localStorage |

### Production Quality (91–100)
| # | Функция | Статус | Доказательство / пробел |
|---|---|---|---|
| 91 | RU/KK/EN | PARTIAL | ответы да, интерфейс не полностью |
| 92 | Доступность | PARTIAL | нет skip-link, нет теста |
| 93 | iPhone/Android/ПК | TESTED | test:mobile-* |
| 94 | Единый бренд | TESTED | test:branding |
| 95 | Оптимизация памяти | PARTIAL | dynamic imports; нет виртуализации длинных чатов |
| 96 | Контроль стоимости | TESTED | Malik Compute ledger |
| 97 | Free/PRO лимиты на сервере | PARTIAL | дневной лимит 10k токенов действует и для PRO |
| 98 | Защита XSS/инъекции/утечки | PARTIAL | нет CSP-заголовков |
| 99 | Аналитика качества | PARTIAL | 👍/👎 только в состоянии React, на сервер не уходят |
| 100 | Автотесты и проверяемый релиз | TESTED | 134 verify-скрипта; build + test:release-core |

## Отчёт по этапу A — Intelligence Foundation

**Сделано**
1. Честное завершение ответа (#22, #27). `runMalikMax` возвращает `incomplete: {reason, missing?, openFence?}` при лимите времени, лимите длины, обрыве, сбое продолжения или «застревании». В конце текста добавляется строка «_Ответ не завершён: причина…_» (открытый блок кода сначала закрывается), а в чате первой идёт кнопка «Продолжить». При отправке истории модели эта строка вырезается.
2. Окончательный текст сервера доходит до чата (найденный аудитом баг). Если сервер дописал «⚠️»-проверку или строку о незавершённости уже после стрима, `done` несёт `finalContent`; его применяют чат, фоновое сохранение и восстановление. Восстановление принимает сохранённый ответ, только если тот содержит уже показанный текст, поэтому чужой ответ по-прежнему отклоняется.
3. Без дублей при продолжении (#25). `createContinuationFilter` отбрасывает повтор любой глубины (раньше ловился только стык ≤240 символов); новый текст идёт дальше без изменений.
4. Большие документы (#12, частично #13). Файлы читаются до 1,2 млн символов (было 180 тыс.) и честно делят контекст: маленькие файлы целиком, большие — начало, конец и самые связанные с вопросом фрагменты. Пропуски помечены, модели запрещено додумывать пропущенное. Итог гарантированно укладывается в бюджет, поэтому второй файл больше не отрезается.
5. Честные статусы (#23). Убран таймер: «Проверяю контекст…» появляется только при реальном поиске или чтении файлов.

**Файлы.** Новые: `lib/ai/answer-completion.ts`, `lib/ai/continuation-overlap.ts`, `lib/ai/document-context.ts`, `scripts/verify-titan-stage-a.mjs`, этот документ. Изменённые: `lib/server/malik-max-engine.ts`, `lib/server/malik-model-router.ts`, `lib/malik-god-router.ts`, `app/api/stream/route-impl.ts`, `app/api/stream/background/route.ts`, `lib/ai/chat-stream-recovery.ts`, `components/sovereign/dashboard.tsx`, `lib/ai/chat-followups.ts`, `lib/server/multimodal-router.ts`, `lib/ai/response-stages.ts`, `components/sovereign/MalikResponseStages.tsx`, `package.json`, тесты `verify-malik-max`, `verify-large-prompts`, `verify-web-research-recovery`, `verify-response-stages`.

**Проверки, которые прошли (запускались).** `tsc --noEmit`; test:titan-stage-a 27/27; test:max 36/36 (+4 новых); test:chat-stream-integrity 11/11; test:chat-liveness 9/9; test:background-survives; test:network 12/12; test:large-prompts; test:multimodal; test:response-stages; test:response-stages-ui 5/5 (браузер); test:web-recovery 21/21; test:truth; test:fact-audit; test:chat-artifacts; test:work-quota; test:work-runtime; test:account; test:public-answer-cache; test:request-motion; test:claude-class.

**Что упало по ходу и исправлено.**
- Первая версия принимала любой изменённый сохранённый ответ, и тест целостности это поймал. Добавлена проверка `answerRevises`.
- Контекст документов мог превысить бюджет на ~3k символов из-за пометок пропусков. Пометки теперь учитываются, есть защитный цикл.
- В двух старых тестах обновлены фикстуры под новые зависимости.

**Что НЕ запускалось.** Полный `test:release-core` (остановлен по просьбе владельца), полный `npm run build`, приёмочные сценарии на живом сайте.

**Риски.**
- Старые сохранённые ответы не меняются; строка «Ответ не завершён» появляется только у новых.
- Отбор фрагментов документа — по словам вопроса, без эмбеддингов.
- `finalContent` заменяет показанный текст целиком, поэтому в конце ответа возможен один перерисовочный кадр.

**Не готово в этапе A:** #7 (критический второй проход), #9 (структура допущений), #13 для истории чатов, #26 (очистка pending), #28 (Stop на сервере).
