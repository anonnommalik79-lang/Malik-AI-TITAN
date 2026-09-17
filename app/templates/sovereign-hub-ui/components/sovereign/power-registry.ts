"use client"

export type AiModeId =
  | "auto"
  | "chat"
  | "code"
  | "website"
  | "image"
  | "video"
  | "research"
  | "agent"
  | "architect"
  | "debug"
  | "canvas"
  | "presentation"
  | "pdf"
  | "word"
  | "data"
  | "security"
  | "qazaq-rescue"
  | "fast"
  | "deep"
  | "creator"

export type PowerAction = {
  id: string
  title: string
  category: string
  description: string
  actionType: string
  safeStatus: string
  /**
   * The text an action of type prompt-chat / prompt-canvas puts in the composer.
   *
   * Without it those actions had nothing to send: runCommandPaletteAction had no
   * branch for them and clicking any of the fifty did nothing at all. The text
   * is a starting instruction the person finishes - most of these need their own
   * subject - so it is prefilled rather than sent.
   */
  prompt?: string
}

export const AI_MODES: Array<{ id: AiModeId; label: string; description: string }> = [
  { id: "auto", label: "Авто", description: "Сам выбирает чат, канвас, код или медиа." },
  { id: "chat", label: "Чат", description: "Держит ответ в разговоре." },
  { id: "code", label: "Код", description: "Отвечает файлами и блоками кода." },
  { id: "website", label: "Сайт", description: "Открывает канвас для сайтов и макетов." },
  { id: "image", label: "Изображение", description: "Готовит генерацию и разбор изображений." },
  { id: "video", label: "Видео", description: "Готовит генерацию и разбор видео." },
  { id: "research", label: "Исследование", description: "Отвечает как исследовательская записка." },
  { id: "agent", label: "Агент", description: "Планирует задачи как исполнитель." },
  { id: "architect", label: "Архитектор", description: "Строит план файлов и структуру продукта." },
  { id: "debug", label: "Отладка", description: "Отвечает как баг-репорт и шаги починки." },
  { id: "canvas", label: "Канвас", description: "Отправляет готовые артефакты в превью." },
  { id: "presentation", label: "Презентация", description: "Собирает структуру слайдов и питча." },
  { id: "pdf", label: "PDF", description: "Готовит структуру документа под экспорт." },
  { id: "word", label: "Word", description: "Готовит структуру редактируемого документа." },
  { id: "data", label: "Данные", description: "Разбирает таблицы, метрики и датасеты." },
  { id: "security", label: "Безопасность", description: "Только защитные проверки и отчёты." },
  { id: "qazaq-rescue", label: "Qazaq Rescue", description: "Планы и документы на случай ЧС." },
  { id: "fast", label: "Быстро", description: "Короткие практичные ответы." },
  { id: "deep", label: "Глубоко", description: "Больше рассуждения и планирования." },
  { id: "creator", label: "Креатор", description: "Бренд, дизайн и контент для запуска." },
]

export const CORE_POWER_ACTIONS: PowerAction[] = [
  { id: "open-home", title: "Открыть главную", category: "Навигация", description: "Вернуться на главный экран Malik AI.", actionType: "open-home", safeStatus: "Готово" },
  { id: "open-photo-studio", title: "Студия изображений", category: "Медиа", description: "Открыть генерацию изображений.", actionType: "open-photo", safeStatus: "Готово" },
  { id: "open-video-studio", title: "Студия видео", category: "Медиа", description: "Открыть генерацию видео.", actionType: "open-video", safeStatus: "Готово" },
  { id: "open-malik-codex", title: "Malik Codex", category: "Агент", description: "Открыть окно Malik Codex.", actionType: "open-codex", safeStatus: "Готово" },
  { id: "open-canvas-command", title: "Открыть канвас", category: "Канвас", description: "Открыть правую панель предпросмотра.", actionType: "open-canvas", safeStatus: "Готово" },
  { id: "open-support-command", title: "Поддержка", category: "Поддержка", description: "Открыть панель поддержки 24/7.", actionType: "open-support", safeStatus: "Готово" },
  { id: "open-api-status-command", title: "Статус сервисов", category: "Система", description: "Открыть страницу статуса без секретов.", actionType: "open-api-status", safeStatus: "Открывает /status" },
  { id: "open-deploy-guide-command", title: "Гайд по деплою", category: "Деплой", description: "Чек-лист сборки и публикации на Render.", actionType: "open-deploy", safeStatus: "Готово" },
  { id: "open-pro-upgrade", title: "Перейти на Plus", category: "Оплата", description: "Открыть тарифы и апгрейд.", actionType: "open-pro", safeStatus: "Готово" },
  { id: "reset-usage", title: "Сбросить локальные счётчики", category: "Система", description: "Очищает счётчики использования в этом браузере. На сервере ничего не меняется.", actionType: "reset-usage", safeStatus: "Только этот браузер" },
  { id: "copy-build-command", title: "Скопировать команду сборки", category: "Деплой", description: "Кладёт npm run build в буфер обмена.", actionType: "copy-build-command", safeStatus: "Буфер обмена" },
  {
    id: "create-website-prompt",
    title: "Сайт с нуля",
    category: "Креатор",
    description: "Собрать одностраничный сайт и открыть его в канвасе.",
    actionType: "prompt-canvas",
    safeStatus: "Открывает канвас",
    prompt: "Собери одностраничный сайт целиком в одном HTML-файле: герой, три блока преимуществ, отзывы, цены и форма заявки. Тема: ",
  },
  { id: "create-photo-prompt", title: "Новое изображение", category: "Медиа", description: "Открыть студию изображений под новый запрос.", actionType: "open-photo", safeStatus: "Готово" },
  { id: "create-video-prompt", title: "Новое видео", category: "Медиа", description: "Открыть студию видео под новый запрос.", actionType: "open-video", safeStatus: "Готово" },
  { id: "create-code-prompt", title: "Режим кода", category: "Код", description: "Переключиться в режим генерации кода.", actionType: "set-mode:code", safeStatus: "Готово" },
  { id: "auto-route-mode", title: "Авто-режим", category: "Режимы", description: "Сам выбирает чат, код, канвас, Codex или медиа.", actionType: "set-mode:auto", safeStatus: "Готово" },
  { id: "website-mode", title: "Режим сайта", category: "Режимы", description: "Запросы про сайты открывают канвас справа.", actionType: "set-mode:website", safeStatus: "Готово" },
  { id: "code-mode", title: "Режим кода", category: "Режимы", description: "Ответы приходят блоками кода и файлами.", actionType: "set-mode:code", safeStatus: "Готово" },
  { id: "architect-mode", title: "Режим архитектора", category: "Режимы", description: "План файлов, границы модулей и заметки по архитектуре.", actionType: "set-mode:architect", safeStatus: "Готово" },
  { id: "debug-mode", title: "Режим отладки", category: "Режимы", description: "Ответ как баг-репорт: причина и шаги починки.", actionType: "set-mode:debug", safeStatus: "Готово" },
  { id: "image-analyze-mode", title: "Разбор изображения", category: "Режимы", description: "Готовит разбор для приложенных картинок.", actionType: "set-mode:image", safeStatus: "Готово" },
  { id: "video-analyze-mode", title: "Разбор видео", category: "Режимы", description: "Готовит разбор таймлайна для приложенных видео.", actionType: "set-mode:video", safeStatus: "Готово" },
  { id: "file-reader-mode", title: "Чтение файлов", category: "Режимы", description: "Готовит разбор приложенных документов.", actionType: "set-mode:data", safeStatus: "Готово" },
  { id: "voice-mode", title: "Голосовой ввод", category: "Режимы", description: "Возвращает обычный чат для голосового ввода.", actionType: "set-mode:chat", safeStatus: "Готово" },
  { id: "canvas-auto-open", title: "Канвас при коде", category: "Канвас", description: "Открывает превью, когда сгенерирован код, HTML или TSX.", actionType: "open-canvas", safeStatus: "Готово" },
  { id: "project-save", title: "Проекты", category: "Проекты", description: "Открыть локальную историю проектов.", actionType: "open-projects", safeStatus: "Готово" },
  { id: "template-quick-use", title: "Галерея шаблонов", category: "Шаблоны", description: "Открыть библиотеку шаблонов.", actionType: "open-templates", safeStatus: "Готово" },
  { id: "api-health-drawer", title: "Здоровье сервисов", category: "Система", description: "Статусы движков без раскрытия ключей.", actionType: "open-api-status", safeStatus: "Открывает /status" },
  { id: "deploy-guide-drawer", title: "Чек-лист сборки", category: "Деплой", description: "Команда сборки и порядок публикации.", actionType: "open-deploy", safeStatus: "Готово" },
  { id: "notifications", title: "Уведомления", category: "Поддержка", description: "Центр событий: деплой, вход, канвас, Codex.", actionType: "open-notifications", safeStatus: "Готово" },
  { id: "usage-meter", title: "Счётчик расхода", category: "Оплата", description: "Кредиты, тариф, оценка стоимости и время сброса.", actionType: "open-billing", safeStatus: "Готово" },
  { id: "owner-tools", title: "Инструменты владельца", category: "Система", description: "Консоль основателя. Доступна только владельцу аккаунта.", actionType: "owner-tools", safeStatus: "Только владелец" },
  { id: "render-guard", title: "Проверка перед деплоем", category: "Деплой", description: "Напоминает прогнать сборку перед пушем.", actionType: "open-deploy", safeStatus: "Готово" },
]

export const POWER_REGISTRY: PowerAction[] = [
  {
    id: "create-saas-landing", title: "Лендинг для SaaS", category: "Креатор",
    description: "Страница запуска: герой, функции, цены и призыв к действию.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери лендинг SaaS-продукта одним HTML-файлом: герой с оффером, блок из шести функций, три тарифа, отзывы, FAQ и форма заявки. Продукт: ",
  },
  {
    id: "create-admin-dashboard", title: "Админ-панель", category: "Сайт",
    description: "Дашборд с метриками, таблицами и управлением.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери админ-панель одним HTML-файлом: боковое меню, четыре карточки метрик, график, таблица с фильтром и поиском. Продукт: ",
  },
  {
    id: "create-ai-chat-ui", title: "Интерфейс AI-чата", category: "Дизайн",
    description: "Премиальный интерфейс ассистента.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери интерфейс AI-чата одним HTML-файлом: список диалогов слева, лента сообщений, композер с кнопками вложения и отправки, тёмная тема. ",
  },
  {
    id: "create-pricing-page", title: "Страница тарифов", category: "Бизнес",
    description: "Тарифы, лимиты и апгрейд.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери страницу тарифов одним HTML-файлом: три плана с ценой и лимитами, переключатель месяц/год, сравнительная таблица и FAQ. Продукт: ",
  },
  {
    id: "create-portfolio", title: "Портфолио", category: "Креатор",
    description: "Кейсы, биография и контакт.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери сайт-портфолио одним HTML-файлом: герой с именем и специальностью, шесть кейсов с описанием, блок о себе и контакты. Обо мне: ",
  },
  {
    id: "create-ecommerce", title: "Витрина магазина", category: "Сайт",
    description: "Каталог, карточки товара и корзина.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери витрину интернет-магазина одним HTML-файлом: шапка с поиском, сетка из восьми товаров, фильтры по категории и цене, боковая корзина с итогом. Магазин: ",
  },
  {
    id: "create-mobile-app-ui", title: "Экран мобильного приложения", category: "Дизайн",
    description: "Мобильный макет с вкладками и карточками.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери макет мобильного приложения одним HTML-файлом шириной 390px: верхняя панель, лента карточек, нижние вкладки на четыре раздела. Приложение: ",
  },
  {
    id: "create-api-route", title: "Контракт API-маршрута", category: "Код",
    description: "Схема запроса, ответа и ошибок.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Спроектируй API-маршрут: метод, путь, схема запроса и ответа, коды ошибок, валидация, лимиты и пример обработчика. Задача: ",
  },
  {
    id: "create-database-schema", title: "Схема базы данных", category: "Данные",
    description: "Таблицы, поля и связи.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Спроектируй схему базы данных: таблицы, поля с типами, ключи, связи, индексы и миграция первой версии. Проект: ",
  },
  {
    id: "create-readme", title: "README проекта", category: "Файлы",
    description: "Установка, запуск и деплой.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Напиши README: что делает проект, установка, переменные окружения, запуск, сборка, деплой и структура папок. Проект: ",
  },
  {
    id: "create-pitch-deck-outline", title: "Структура питч-дека", category: "Бизнес",
    description: "Каркас презентации для инвесторов.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь структуру питч-дека для инвесторов: слайд за слайдом, что на каждом и какие цифры нужны. Проект: ",
  },
  {
    id: "create-pdf-report", title: "Отчёт под PDF", category: "Файлы",
    description: "Структура документа под экспорт в PDF.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь структуру отчёта под экспорт в PDF: титул, оглавление, разделы с подзаголовками, таблицы и выводы. Тема: ",
  },
  {
    id: "create-word-report", title: "Отчёт под Word", category: "Файлы",
    description: "Структура редактируемого документа.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь структуру документа под Word: заголовки по уровням, разделы, таблицы и места под правки. Тема: ",
  },
  {
    id: "create-presentation-plan", title: "План презентации", category: "Обучение",
    description: "Названия слайдов и текст выступления.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь план презентации: названия слайдов, тезисы на каждом и что говорить вслух. Тема: ",
  },
  { id: "analyze-image", title: "Разобрать изображение", category: "Медиа", description: "Режим разбора приложенных картинок.", actionType: "set-mode:image", safeStatus: "Готово" },
  { id: "analyze-video", title: "Разобрать видео", category: "Медиа", description: "Режим разбора таймлайна видео.", actionType: "set-mode:video", safeStatus: "Готово" },
  { id: "read-uploaded-file", title: "Прочитать файл", category: "Файлы", description: "Режим разбора приложенных документов.", actionType: "set-mode:data", safeStatus: "Готово" },
  {
    id: "summarize-document", title: "Сжать документ", category: "Файлы",
    description: "Ключевые тезисы из текста или файла.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Сожми документ в ключевые тезисы: о чём он, какие цифры важны, какие решения предлагаются и что требует ответа. Текст или файл ниже:\n\n",
  },
  {
    id: "extract-tasks", title: "Вытащить задачи", category: "Автоматизация",
    description: "Список дел из текста или файла.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Вытащи из текста конкретные задачи: что сделать, кто отвечает, срок. Ничего не придумывай сверх текста. Текст ниже:\n\n",
  },
  {
    id: "generate-tests", title: "Тесты для кода", category: "Код",
    description: "План тестов и примеры кейсов.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь план тестов и напиши тесты: обычные случаи, границы, ошибки. Код ниже:\n\n",
  },
  { id: "debug-error-log", title: "Разобрать ошибку", category: "Код", description: "Режим отладки: причина и починка.", actionType: "set-mode:debug", safeStatus: "Готово" },
  {
    id: "explain-code", title: "Объяснить код", category: "Код",
    description: "Разбор кода простыми шагами.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Объясни этот код по шагам: что он делает, зачем каждая часть и где слабые места. Код ниже:\n\n",
  },
  {
    id: "refactor-code", title: "План рефакторинга", category: "Код",
    description: "Безопасные улучшения без переписывания проекта.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Предложи безопасный рефакторинг: что менять, в каком порядке, что может сломаться и как проверить. Код ниже:\n\n",
  },
  { id: "generate-architecture", title: "Архитектура системы", category: "Проекты", description: "План модулей и границ.", actionType: "set-mode:architect", safeStatus: "Готово" },
  {
    id: "create-file-tree", title: "Дерево файлов", category: "Проекты",
    description: "План структуры проекта.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь дерево файлов проекта с коротким объяснением, что лежит в каждой папке. Проект: ",
  },
  { id: "export-project-json", title: "Экспорт проектов", category: "Проекты", description: "Открыть проекты и выгрузить их в JSON.", actionType: "open-projects", safeStatus: "Готово" },
  { id: "export-zip-guide", title: "Выгрузка в ZIP", category: "Деплой", description: "Открыть раздел сборки.", actionType: "open-deploy", safeStatus: "Готово" },
  { id: "render-build-checklist", title: "Чек-лист Render", category: "Деплой", description: "Сборка, пуш в GitHub и передеплой.", actionType: "open-deploy", safeStatus: "Готово" },
  { id: "vercel-deploy-guide", title: "Гайд по Vercel", category: "Деплой", description: "Порядок публикации на Vercel.", actionType: "open-deploy", safeStatus: "Готово" },
  { id: "workos-status", title: "Статус входа", category: "Система", description: "Состояние WorkOS на странице статуса.", actionType: "open-api-status", safeStatus: "Открывает /status" },
  { id: "api-status", title: "Статус движков", category: "Система", description: "Состояние моделей и запасных путей.", actionType: "open-api-status", safeStatus: "Открывает /status" },
  { id: "billing-setup-guide", title: "Оплата и лимиты", category: "Бизнес", description: "Открыть оплату и планирование расхода.", actionType: "open-billing", safeStatus: "Готово" },
  { id: "usage-limits-setup", title: "Лимиты расхода", category: "Система", description: "Открыть оплату и настроить лимиты.", actionType: "open-billing", safeStatus: "Готово" },
  {
    id: "storage-setup-guide", title: "Хранилище файлов", category: "Файлы",
    description: "План бакетов и хранения артефактов.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь план хранения файлов: какие бакеты нужны, структура путей, права, срок жизни, резервные копии. Проект: ",
  },
  {
    id: "worker-queue-setup", title: "Очередь задач", category: "Автоматизация",
    description: "План фоновых обработчиков.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Спроектируй очередь фоновых задач: брокер, воркеры, повторные попытки, таймауты, наблюдаемость. Задачи: ",
  },
  {
    id: "realtime-status-setup", title: "Прогресс в реальном времени", category: "Автоматизация",
    description: "План событий и потока прогресса.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Спроектируй передачу прогресса в реальном времени: транспорт, формат событий, что делать при обрыве связи. Сценарий: ",
  },
  {
    id: "observability-setup", title: "Логи и оповещения", category: "Система",
    description: "План логов, метрик и алертов.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь план наблюдаемости: какие логи писать, какие метрики снимать, на что слать оповещения и какие пороги. Сервис: ",
  },
  {
    id: "anti-spam-setup", title: "Защита от злоупотреблений", category: "Безопасность",
    description: "Лимиты и защита от спама.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь план защиты от злоупотреблений: лимиты запросов, проверка ввода, блокировки, что показывать пользователю. Сервис: ",
  },
  { id: "safe-security-audit", title: "Защитный аудит", category: "Безопасность", description: "Чек-лист защитной проверки.", actionType: "set-mode:security", safeStatus: "Только защита" },
  {
    id: "exif-checker-ui", title: "Проверка метаданных фото", category: "Безопасность",
    description: "Интерфейс для просмотра EXIF.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери одним HTML-файлом инструмент: пользователь выбирает фото, страница показывает его EXIF-метаданные и предупреждает о геолокации. Всё считается в браузере, ничего не отправляется. ",
  },
  {
    id: "defensive-scan-report", title: "Отчёт по защите", category: "Безопасность",
    description: "Шаблон защитного отчёта.",
    actionType: "prompt-chat", safeStatus: "Только защита",
    prompt: "Составь шаблон защитного отчёта: что проверено, что найдено, уровень риска, что чинить в первую очередь. Система: ",
  },
  { id: "ctf-training-mode", title: "Учебный режим CTF", category: "Обучение", description: "Безопасные учебные задачи.", actionType: "set-mode:security", safeStatus: "Только обучение" },
  { id: "qazaq-rescue-protocol", title: "Qazaq Rescue", category: "ЧС", description: "Протокол действий при ЧС.", actionType: "set-mode:qazaq-rescue", safeStatus: "Готово" },
  {
    id: "earthquake-plan", title: "План на землетрясение", category: "ЧС",
    description: "Подготовка и порядок действий.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь план на случай землетрясения: что подготовить заранее, что делать во время толчков, что после, тревожный рюкзак. Город и жильё: ",
  },
  {
    id: "offline-qr-help", title: "Офлайн-инструкция по QR", category: "ЧС",
    description: "Памятка, доступная без интернета.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь короткую памятку на случай ЧС, которую можно распечатать и повесить с QR-кодом: телефоны, порядок действий, точка сбора. Место: ",
  },
  {
    id: "school-drill-plan", title: "Учебная тревога в школе", category: "ЧС",
    description: "План эвакуационной тренировки.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь план учебной эвакуации в школе: роли, сигнал, маршруты, сбор и перекличка, разбор после. Школа: ",
  },
  {
    id: "emergency-pdf", title: "Памятка ЧС под печать", category: "ЧС",
    description: "Содержание печатной памятки.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь содержание печатной памятки по ЧС на одну страницу: телефоны, действия по шагам, что взять с собой. Регион: ",
  },
  {
    id: "family-safety-plan", title: "Семейный план безопасности", category: "ЧС",
    description: "Чек-лист для семьи.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь семейный план безопасности: точка сбора, связь, кто за кого отвечает, запас воды и лекарств, документы. Состав семьи: ",
  },
  { id: "project-history", title: "История проектов", category: "Проекты", description: "Открыть локальную историю проектов.", actionType: "open-projects", safeStatus: "Готово" },
  { id: "recent-chats", title: "Последние чаты", category: "Проекты", description: "Открыть список чатов.", actionType: "open-chats", safeStatus: "Готово" },
  { id: "pinned-projects", title: "Закреплённые проекты", category: "Проекты", description: "Открыть проекты и закреплённые сверху.", actionType: "open-projects", safeStatus: "Готово" },
  { id: "template-gallery", title: "Галерея шаблонов", category: "Дизайн", description: "Открыть библиотеку шаблонов.", actionType: "open-templates", safeStatus: "Готово" },
  { id: "design-tokens", title: "Дизайн-токены", category: "Дизайн", description: "Открыть генерацию компонентов.", actionType: "open-design", safeStatus: "Готово" },
  {
    id: "copy-tailwind-theme", title: "Скопировать запрос темы Tailwind", category: "Дизайн",
    description: "Кладёт готовый запрос в буфер обмена.",
    actionType: "copy-guide", safeStatus: "Буфер обмена",
    prompt: "Собери тему Tailwind: палитра с тёмным режимом, шкала типографики, радиусы, тени и отступы. Отдай готовый tailwind.config и CSS-переменные. Бренд: ",
  },
  {
    id: "typography-scale", title: "Шкала типографики", category: "Дизайн",
    description: "Размеры, интерлиньяж и применение.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Собери шкалу типографики: размеры от подписи до заголовка, интерлиньяж, насыщенность и где что применять. Продукт: ",
  },
  {
    id: "button-system", title: "Система кнопок", category: "Дизайн",
    description: "Варианты и состояния кнопок.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери одним HTML-файлом систему кнопок: основная, вторичная, опасная, призрачная; размеры S/M/L; состояния наведения, нажатия, фокуса, загрузки и выключено. ",
  },
  {
    id: "card-system", title: "Система карточек", category: "Дизайн",
    description: "Варианты карточек и адаптив.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери одним HTML-файлом систему карточек: с картинкой, со статистикой, со списком и пустое состояние; сетка, адаптив и состояние наведения. ",
  },
  {
    id: "animation-presets", title: "Пресеты анимации", category: "Дизайн",
    description: "Готовые переходы и их применение.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Предложи набор анимаций интерфейса: появление, переход между экранами, загрузка, ошибка. Для каждой — длительность, кривая и когда уместна. Продукт: ",
  },
  {
    id: "glassmorphism-preset", title: "Стеклянный стиль", category: "Дизайн",
    description: "Пресет полупрозрачного интерфейса.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери одним HTML-файлом демонстрацию стеклянного стиля: карточки с размытием фона, панель навигации, модальное окно. Покажи палитру и правила читаемости текста. ",
  },
  {
    id: "cyberpunk-preset", title: "Киберпанк-стиль", category: "Дизайн",
    description: "Пресет неонового интерфейса.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери одним HTML-файлом демонстрацию киберпанк-стиля: неоновые акценты на тёмном фоне, карточки, кнопки и заголовки. Покажи палитру и где акценты уместны. ",
  },
  {
    id: "apple-clean-preset", title: "Чистый продуктовый стиль", category: "Дизайн",
    description: "Пресет спокойного интерфейса.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери одним HTML-файлом демонстрацию спокойного продуктового стиля: много воздуха, сдержанная палитра, крупная типографика, карточки и кнопки. ",
  },
  {
    id: "startup-preset", title: "Стиль стартап-лендинга", category: "Дизайн",
    description: "Пресет страницы запуска.",
    actionType: "prompt-canvas", safeStatus: "Открывает канвас",
    prompt: "Собери одним HTML-файлом визуальный пресет стартап-лендинга: герой, логотипы клиентов, три преимущества, призыв к действию. Покажи палитру и шрифты. ",
  },
  {
    id: "investor-mode", title: "Рассказ для инвестора", category: "Бизнес",
    description: "Формулировки под инвесторский разговор.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Переведи описание продукта на язык инвестора: проблема, решение, рынок, как зарабатываем, почему мы. Без выдуманных цифр — где нужны данные, так и напиши. Продукт: ",
  },
  {
    id: "founder-bio-generator", title: "Биография основателя", category: "Бизнес",
    description: "Короткая и длинная версия.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Напиши биографию основателя в трёх длинах: одна строка, абзац и полная версия. Только факты, которые я дам ниже:\n\n",
  },
  {
    id: "press-release", title: "Пресс-релиз", category: "Бизнес",
    description: "Текст анонса для прессы.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Напиши пресс-релиз о запуске: заголовок, лид, суть, цитата основателя, факты о компании и контакты. Только то, что я перечислю ниже:\n\n",
  },
  {
    id: "business-plan", title: "Бизнес-план", category: "Бизнес",
    description: "Структура плана по разделам.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь бизнес-план по разделам: продукт, клиенты, конкуренты, каналы, деньги, риски и план на год. Где нужны мои цифры — отметь. Бизнес: ",
  },
  {
    id: "roadmap-generator", title: "Дорожная карта", category: "Бизнес",
    description: "План выпусков по этапам.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь дорожную карту продукта на три квартала: что выпускаем, зачем, что считаем успехом. Продукт: ",
  },
  {
    id: "competitor-matrix", title: "Сравнение с конкурентами", category: "Бизнес",
    description: "Таблица отличий.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Собери таблицу сравнения с конкурентами: строки — возможности, столбцы — продукты, честно отметь где мы слабее. Наш продукт и конкуренты: ",
  },
  {
    id: "user-persona", title: "Портрет пользователя", category: "Бизнес",
    description: "Кто покупает и почему.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Опиши два-три портрета пользователей: кто это, какая у них задача, что мешает сегодня, почему выберут нас. Продукт: ",
  },
  {
    id: "landing-copy", title: "Тексты для лендинга", category: "Креатор",
    description: "Заголовки и блоки страницы.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Напиши тексты лендинга: заголовок, подзаголовок, три блока пользы, отзыв, ответы на возражения и призыв к действию. Продукт: ",
  },
  {
    id: "terms-draft", title: "Черновик условий", category: "Система",
    description: "Каркас пользовательского соглашения. Не юридический документ.",
    actionType: "prompt-chat", safeStatus: "Черновик",
    prompt: "Составь черновик пользовательского соглашения по разделам: что за сервис, права и обязанности, оплата, ответственность, расторжение. Это черновик, не юридический документ — отметь места, где нужен юрист. Сервис: ",
  },
  {
    id: "privacy-draft", title: "Черновик политики данных", category: "Система",
    description: "Каркас политики конфиденциальности. Не юридический документ.",
    actionType: "prompt-chat", safeStatus: "Черновик",
    prompt: "Составь черновик политики конфиденциальности: какие данные собираем, зачем, сколько храним, кому передаём, как удалить. Это черновик, не юридический документ — отметь места, где нужен юрист. Сервис: ",
  },
  {
    id: "faq-generator", title: "Частые вопросы", category: "Креатор",
    description: "Ответы на вопросы покупателей.",
    actionType: "prompt-chat", safeStatus: "Готово",
    prompt: "Составь блок частых вопросов: десять вопросов, которые задают перед покупкой, и короткие честные ответы. Продукт: ",
  },
  { id: "support-center", title: "Центр поддержки", category: "Поддержка", description: "Открыть поддержку.", actionType: "open-support", safeStatus: "Готово" },
  { id: "recovery-center", title: "Что делать при сбое", category: "Безопасность", description: "Открыть поддержку и запасные пути.", actionType: "open-support", safeStatus: "Готово" },
]

export const COMMAND_ACTIONS: PowerAction[] = [...CORE_POWER_ACTIONS, ...POWER_REGISTRY]
