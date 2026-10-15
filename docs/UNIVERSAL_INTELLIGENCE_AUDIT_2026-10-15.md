# Malik Universal Intelligence: исходный аудит

База: `56ed3167`, отдельная ветка `codex/universal-intent-context-20261015`. Интерфейс не переписывается; новые платные сервисы, Render и внешние записи не запускаются. Нельзя обещать стопроцентную точность модели или всех интеграций.

## Карта существующих границ

| Область | Реальный код / наблюдение |
|---|---|
| Chat API | `app/api/stream/route-impl.ts`, SSE, heartbeat, AbortSignal, admission/quota перед ответом |
| Инструкции | `lib/ai/response-intelligence.ts`, `chat-artifact-skills.ts`, `client-context.ts` |
| Выбранная модель | `lib/server/malik-model-router.ts`; MAX — `malik-max-engine.ts`; Oil — отдельный консилиум |
| Ошибки/резервы | Strict router / MAX: отмена, таймауты, отдых недоступных lanes, признак incomplete |
| История | `lib/server/account-chat-state.ts`, `lib/ai/account-chat-state-merge.ts`, клиентские messages |
| Контекст/память | `conversation-focus.ts`, `document-context.ts`, `client-context.ts`, OS project/store; предпочтения не являются системными полномочиями |
| Фоновые ответы | `lib/server/background-chat-turns.ts`, `/api/stream/background` |
| Вложения | `lib/server/multimodal-router.ts`, отдельные MIME/size проверки, локальный document parser |
| Документы | `lib/work/documents`: настоящий PDF/DOCX/XLSX/CSV/ZIP; `/api/work/export` вызывается меню скачивания |
| Презентации | `lib/presentations/pptx.ts`: редактируемый PPTX, отдельный экспорт OS presentation |
| Изображения | `lib/ai/image-intent.ts`, существующий media/generation путь и квоты; не заменять анализ генерацией |
| Видео/музыка | Существующие `/api/media` и `/api/generate`, provider readiness не равно успешному live-вызову |
| Сайты | `lib/sites/forge/chat-turn.ts`, план → HTML → quality gates → preview/publish |
| Work | `lib/os/planner.ts`, `executor.ts`, `tools/registry.ts`: уже есть типизированный registry и исполнитель; дублировать их не нужно |
| Редактирование/версии | `lib/os/tools/edit-tool.ts`, `store.ts`, `revision-of` / `derived-from`, owner-scoped чтение |
| Web | `lib/malik-research/search.ts`, live-intelligence, freshness policy; реальные источники отдельно от пользовательских данных |
| Форматы | `lib/work/documents/formats.ts`, Markdown/download controls; разрыв между модельной инструкцией и реальным экспортом |
| Доступ | `request-entitlement.ts`, WorkOS; owner берётся из сессии, не из body/history |
| Лимиты | `lib/limits/rate-limit.ts`, daily-text/multimodal, Work quota; не отключать ради новых функций |
| UI и проверяемость | MalikMarkdown, WorkDownloadMenu, execution trace; компонентные браузерные проверки не являются live E2E |

## Воспроизведённые причины

На исходной базе через существующий `workTestLoader`, без сети:

1. `isContextDependent('Нет, в Word')` возвращает **false**. Context-focus ограничен короткими предметными follow-up и не хранит согласованный набор формата/тона/языка.
2. `detectChatArtifactSkills('Создай в Word')` возвращает **[]**. Явный естественный alias Word не выбирает document contract.
3. `buildChatArtifactSkillPrompt('Создай Excel с формулами')` просит модель выдать **CSV**, а не XLSX. Document contract рекомендует HTML/Markdown, presentation contract — HTML. Это архитектурное несоответствие уже имеющимся настоящим экспортёрам.
4. `parseCell('=SUM(A2:A3)')` возвращает **text**. Это безопасно для недоверенных загрузок, но не реализует явно заказанную формульную книгу. Нужен отдельный opt-in с закрытым списком безопасных формул; нельзя автоматически исполнять любые строки из CSV.
5. `WorkDownloadMenu` создаёт файл только при выборе формата. Обычный текст модели ещё не доказывает, что запрошенный файл создан/проверен/сохранён.
6. Registry на 200 capability-названий — каталог подсказок, не 200 подтверждённых исполнимых инструментов. Исполнимый OS registry существует отдельно. Нельзя выдавать список возможностей за выполненные действия.
7. `artifact.edit` для кода сохраняет новый snapshot, но `qaPassed: true` в его метаданных не означает выполненный build/тесты. Без sandbox нельзя добавлять заявления о terminal execution.

Из этих наблюдений не следует, что все остальные функции сломаны. Ранее проверенные Oil, web, streaming и экспорт должны сохраниться. Старый набор из пятидесяти сценариев универсального диалога отсутствует: нельзя приписать ему исходный процент успеха.

## Реализация и доказательства

Приоритет: общий типизированный intent/context contract без дополнительного вызова модели; точный исходный запрос; замена конфликтующих предпочтений; реальные преобразования через существующие экспорт/OS store; проверка результата перед выдачей ссылки; отдельный безопасный режим формул. Продолжение по artifact ID всегда перепроверяется относительно серверного owner.

Проверки из задания разделяются на: исполненный детерминированный результат, интеграционный контракт с имитацией провайдера, и живой результат. Изображения/поиск/модельная стилистика не объявляются проверенными в production по результатам mocks. Нет готового sandbox и постоянного S3/R2; не обещаем выполнение произвольного кода или сохранение после перезапуска без инфраструктуры. Неполная локальная WorkOS-конфигурация не доказывает неисправность production-регистрации.
