import type { BusinessMode, BusinessModeId, BusinessOutputFormat, BusinessRunContext, BusinessSectionId } from "./types"
import { outputFormatInstructions } from "./output-templates"
import { KAZAKH_MEDIA_BRAIN, SELF_VERIFY_PROTOCOL } from "@/lib/media-brain/kazakh-media-brain"
import { buildKazakhContextBlock } from "@/lib/kazakh/knowledge"

const MEDIA_SECTIONS: BusinessSectionId[] = [
  "newsroom-desk",
  "social-media-desk",
  "broadcast-desk",
  "media-language",
]

function isMediaSection(sectionId: BusinessSectionId): boolean {
  return MEDIA_SECTIONS.includes(sectionId)
}

type ModeSeed = {
  id: BusinessModeId
  sectionId: BusinessSectionId
  titleRu: string
  title: string
  descriptionRu: string
  outputFormat?: BusinessOutputFormat
  expertRole: string
  taskHint: string
}

const SEEDS: ModeSeed[] = [
  { id: "ceo-decision", sectionId: "business-doctor", titleRu: "CEO Decision Mode", title: "CEO Decision", descriptionRu: "Решения как CEO: что делать сейчас, что отложить, риски и деньги", expertRole: "опытный CEO и стратег", taskHint: "Помоги принять решение как CEO", outputFormat: "standard" },
  { id: "business-xray", sectionId: "business-doctor", titleRu: "Business X-Ray", title: "Business X-Ray", descriptionRu: "Рентген бизнеса: сайт, соцсети, цены, оффер, аудитория", expertRole: "бизнес-аналитик и product strategist", taskHint: "Сделай полный рентген бизнеса", outputFormat: "standard" },
  { id: "money-leak", sectionId: "business-doctor", titleRu: "Money Leak Detector", title: "Money Leak", descriptionRu: "Где бизнес теряет деньги: реклама, конверсия, расходы, цены", expertRole: "финансовый директор стартапа", taskHint: "Найди утечки денег в бизнесе", outputFormat: "standard" },
  { id: "customer-pain", sectionId: "business-doctor", titleRu: "Customer Pain Scanner", title: "Pain Scanner", descriptionRu: "Боли клиентов: страхи, возражения, барьеры покупки", expertRole: "CX-исследователь и продакт-маркетолог", taskHint: "Выяви реальные боли клиентов", outputFormat: "standard" },
  { id: "market-entry", sectionId: "business-doctor", titleRu: "Market Entry Strategy", title: "Market Entry", descriptionRu: "Как выйти на рынок: MVP, первые клиенты, каналы", expertRole: "go-to-market стратег", taskHint: "Построй стратегию выхода на рынок", outputFormat: "standard" },
  { id: "pmf-scanner", sectionId: "business-doctor", titleRu: "Product-Market Fit Scanner", title: "PMF Scanner", descriptionRu: "Нужен ли продукт рынку, кто купит и что изменить", expertRole: "product-market fit аналитик", taskHint: "Оцени product-market fit", outputFormat: "score" },
  { id: "mvp-cut", sectionId: "business-doctor", titleRu: "MVP Cut Mode", title: "MVP Cut", descriptionRu: "Убери лишнее — только 5 функций для первой версии", expertRole: "lean startup MVP архитектор", taskHint: "Сократи scope до минимального MVP", outputFormat: "checklist" },
  { id: "feature-priority", sectionId: "business-doctor", titleRu: "Feature Priority Matrix", title: "Feature Matrix", descriptionRu: "Impact/effort матрица приоритетов фич", expertRole: "product owner", taskHint: "Расставь приоритеты фич impact/effort", outputFormat: "checklist" },
  { id: "automation-finder", sectionId: "business-doctor", titleRu: "Automation Finder", title: "Automation Finder", descriptionRu: "Что автоматизировать: CRM, боты, таблицы, AI-ответы", expertRole: "операционный автоматизатор", taskHint: "Найди процессы для автоматизации", outputFormat: "checklist" },
  { id: "revenue-engine", sectionId: "sales-booster", titleRu: "Revenue Engine Builder", title: "Revenue Engine", descriptionRu: "Система дохода: тарифы, воронка, upsell, подписка", expertRole: "revenue architect", taskHint: "Построй систему монетизации", outputFormat: "standard" },
  { id: "ai-sales-manager", sectionId: "sales-booster", titleRu: "AI Sales Manager", title: "AI Sales Manager", descriptionRu: "Ответы клиентам, follow-up, WhatsApp/Telegram скрипты", expertRole: "senior sales manager", taskHint: "Создай sales-скрипты и follow-up", outputFormat: "scripts" },
  { id: "objection-killer", sectionId: "sales-booster", titleRu: "Objection Killer", title: "Objection Killer", descriptionRu: "10 сильных ответов на возражения без давления", expertRole: "тренер по продажам", taskHint: "Закрой возражения клиента", outputFormat: "scripts" },
  { id: "conversation-analyzer", sectionId: "sales-booster", titleRu: "Conversation Analyzer", title: "Conversation Analyzer", descriptionRu: "Анализ переписки: где потеряна продажа", expertRole: "sales coach", taskHint: "Проанализируй переписку с клиентом", outputFormat: "scripts" },
  { id: "offer-ab", sectionId: "sales-booster", titleRu: "Offer A/B Generator", title: "Offer A/B", descriptionRu: "10 вариантов оффера с оценкой силы", expertRole: "копирайтер и conversion strategist", taskHint: "Сгенерируй и оцени варианты оффера", outputFormat: "standard" },
  { id: "trust-builder", sectionId: "sales-booster", titleRu: "Trust Builder", title: "Trust Builder", descriptionRu: "Чего не хватает для доверия: отзывы, кейсы, гарантии", expertRole: "brand trust consultant", taskHint: "Усиль доверие к бренду", outputFormat: "checklist" },
  { id: "business-war-map", sectionId: "marketing-war-room", titleRu: "Business War Map", title: "War Map", descriptionRu: "Карта войны: конкуренты, каналы, возможности", expertRole: "competitive strategist", taskHint: "Построй карту конкурентной борьбы", outputFormat: "standard" },
  { id: "ad-killer-pack", sectionId: "marketing-war-room", titleRu: "Ad Killer Pack", title: "Ad Killer Pack", descriptionRu: "20 заголовков, 10 текстов, креативы, аудитории", expertRole: "performance marketer", taskHint: "Создай полный рекламный пакет", outputFormat: "standard" },
  { id: "tiktok-reels-engine", sectionId: "marketing-war-room", titleRu: "TikTok/Reels Engine", title: "Reels Engine", descriptionRu: "Контент-план: хуки, сценарии, вирусные идеи", expertRole: "short-form content director", taskHint: "Сделай контент-план на месяц", outputFormat: "checklist" },
  { id: "brand-voice", sectionId: "marketing-war-room", titleRu: "Brand Voice Generator", title: "Brand Voice", descriptionRu: "Голос бренда и единый tone of voice", expertRole: "brand voice strategist", taskHint: "Определи голос бренда", outputFormat: "standard" },
  { id: "competitor-legal", sectionId: "marketing-war-room", titleRu: "Competitor Destroyer (Legal)", title: "Competitor Legal", descriptionRu: "Легальный анализ конкурентов и дифференциация", expertRole: "ethical competitive analyst", taskHint: "Проанализируй конкурента легально", outputFormat: "standard" },
  { id: "one-person-company", sectionId: "founder-commander", titleRu: "One-Person Company", title: "Solo Founder", descriptionRu: "Режим соло-founder: мини-команда из AI-ролей", expertRole: "solo founder operator", taskHint: "Организуй бизнес для одного founder", outputFormat: "checklist" },
  { id: "founder-daily", sectionId: "founder-commander", titleRu: "Founder Daily Commander", title: "Daily Commander", descriptionRu: "3 главные задачи дня, фокус и эффект", expertRole: "founder coach", taskHint: "Составь план founder на сегодня", outputFormat: "checklist" },
  { id: "team-task-commander", sectionId: "founder-commander", titleRu: "Team Task Commander", title: "Team Tasks", descriptionRu: "Разбивка цели на задачи для команды", expertRole: "project lead", taskHint: "Разбей цель на задачи команды", outputFormat: "checklist" },
  { id: "landing-doctor", sectionId: "founder-commander", titleRu: "Landing Page Doctor", title: "Landing Doctor", descriptionRu: "Почему закрывают сайт за 5 секунд", expertRole: "CRO specialist", taskHint: "Диагностируй лендинг", outputFormat: "standard" },
  { id: "conversion-booster", sectionId: "founder-commander", titleRu: "Conversion Booster", title: "Conversion Booster", descriptionRu: "План роста конверсии: CTA, тексты, mobile", expertRole: "conversion rate optimizer", taskHint: "Повысь конверсию сайта", outputFormat: "checklist" },
  { id: "investor-qa", sectionId: "investor-mode", titleRu: "Investor Killer Q&A", title: "Investor Q&A", descriptionRu: "Ответы на жёсткие вопросы инвестора", expertRole: "venture advisor", taskHint: "Подготовь ответы инвестору", outputFormat: "score" },
  { id: "pitch-battle", sectionId: "investor-mode", titleRu: "Pitch Battle Simulator", title: "Pitch Battle", descriptionRu: "ИИ-жюри атакует проект вопросами", expertRole: "жюри Astana Hub / инвестор", taskHint: "Симулируй жёсткий pitch battle", outputFormat: "battle" },
  { id: "crisis-commander", sectionId: "crisis-mode", titleRu: "Crisis Commander", title: "Crisis Commander", descriptionRu: "Антикризисный план: 24 часа / 3 дня / 7 дней", expertRole: "crisis management advisor", taskHint: "Составь антикризисный план", outputFormat: "standard" },
  { id: "reputation-defender", sectionId: "crisis-mode", titleRu: "Reputation Defender", title: "Reputation Defender", descriptionRu: "Ответы на негатив, жалобы, хейт", expertRole: "reputation manager", taskHint: "Защити репутацию профессионально", outputFormat: "scripts" },
  { id: "launch-domination", sectionId: "launch-engine", titleRu: "Launch Domination Mode", title: "Launch Domination", descriptionRu: "Полный launch pack: сайт, посты, pitch, 7 дней", expertRole: "launch director", taskHint: "Подготовь полный запуск продукта", outputFormat: "launch" },

  // ── Newsroom Desk (Редакция) ──────────────────────────────────────────────
  { id: "news-article", sectionId: "newsroom-desk", titleRu: "Новость / Статья", title: "News Article", descriptionRu: "Готовая новость под публикацию: заголовок, лид, текст, теги, SEO", expertRole: "выпускающий редактор новостного СМИ Казахстана", taskHint: "Напиши готовую к публикации новость по теме", outputFormat: "article" },
  { id: "breaking-news", sectionId: "newsroom-desk", titleRu: "Срочная новость (Breaking)", title: "Breaking News", descriptionRu: "Быстрая срочная заметка + что подтвердить перед эфиром", expertRole: "редактор ленты срочных новостей", taskHint: "Сделай срочную новость и список фактов для подтверждения", outputFormat: "article" },
  { id: "longread-report", sectionId: "newsroom-desk", titleRu: "Лонгрид / Репортаж", title: "Longread", descriptionRu: "Глубокий материал: структура, герои, факты, контекст", expertRole: "автор лонгридов и репортажей", taskHint: "Построй структуру и текст лонгрида/репортажа", outputFormat: "article" },
  { id: "headline-lab", sectionId: "newsroom-desk", titleRu: "Лаборатория заголовков", title: "Headline Lab", descriptionRu: "10 заголовков + лиды + SEO на двух языках без кликбейта", expertRole: "редактор заголовков и SEO-специалист медиа", taskHint: "Сгенерируй сильные заголовки и лиды KZ/RU", outputFormat: "standard" },
  { id: "fact-check", sectionId: "newsroom-desk", titleRu: "Фактчек", title: "Fact-Check", descriptionRu: "Проверка утверждения: вердикт, источники, риск фейка", expertRole: "фактчекер и верификатор информации", taskHint: "Проверь утверждение и дай вердикт фактчека", outputFormat: "factcheck" },
  { id: "interview-kit", sectionId: "newsroom-desk", titleRu: "Подготовка интервью", title: "Interview Kit", descriptionRu: "Вопросы, бэкграунд спикера, острые и follow-up вопросы", expertRole: "интервьюер и журналист-расследователь", taskHint: "Подготовь набор вопросов для интервью", outputFormat: "interview" },
  { id: "press-release", sectionId: "newsroom-desk", titleRu: "Пресс-релиз", title: "Press Release", descriptionRu: "Официальный пресс-релиз по стандарту с цитатой и контактами", expertRole: "PR-редактор и пресс-секретарь", taskHint: "Напиши официальный пресс-релиз", outputFormat: "article" },

  // ── Social Media Desk (Соцсети) ───────────────────────────────────────────
  { id: "social-cuts", sectionId: "social-media-desk", titleRu: "Нарезка для соцсетей", title: "Social Cuts", descriptionRu: "Из новости — посты для Instagram/Telegram/TikTok + хэштеги", expertRole: "SMM-редактор медиа в РК", taskHint: "Сделай посты для соцсетей из материала", outputFormat: "social" },
  { id: "social-multipack", sectionId: "social-media-desk", titleRu: "1 статья → 5 соцсетей", title: "Social Multipack", descriptionRu: "Одна статья → готовый пакет для Instagram, Telegram, TikTok, Facebook, X (RU+KZ)", expertRole: "SMM-продюсер медиа в РК", taskHint: "Преврати статью в пакет постов для 5 соцсетей с казахскими версиями", outputFormat: "social-pack" },
  { id: "reels-script", sectionId: "social-media-desk", titleRu: "Сценарий Reels / TikTok", title: "Reels Script", descriptionRu: "Вертикальный сценарий с хуком, сценами и CTA", expertRole: "short-form видеорежиссёр новостей", taskHint: "Напиши сценарий вертикального видео по теме", outputFormat: "social" },
  { id: "telegram-post", sectionId: "social-media-desk", titleRu: "Пост Telegram-канала", title: "Telegram Post", descriptionRu: "Короткий ёмкий пост канала СМИ с акцентами", expertRole: "редактор Telegram-канала издания", taskHint: "Напиши пост для Telegram-канала СМИ", outputFormat: "social" },

  // ── Broadcast Desk (Эфир / ТВ) ────────────────────────────────────────────
  { id: "tv-script", sectionId: "broadcast-desk", titleRu: "ТВ-сценарий сюжета", title: "TV Script", descriptionRu: "Подводка, закадровый текст, синхроны, титры, тайм-коды", expertRole: "телевизионный редактор и продюсер выпуска", taskHint: "Напиши сценарий ТВ-сюжета", outputFormat: "tv-script" },
  { id: "teleprompter", sectionId: "broadcast-desk", titleRu: "Текст для телесуфлёра", title: "Teleprompter", descriptionRu: "Чистый текст ведущего под суфлёр с таймингом", expertRole: "редактор эфира и автор текстов ведущего", taskHint: "Подготовь текст ведущего для телесуфлёра", outputFormat: "tv-script" },
  { id: "video-storyboard", sectionId: "broadcast-desk", titleRu: "Раскадровка сюжета", title: "Storyboard", descriptionRu: "Покадровый план видеоряда: сцены, планы, графика", expertRole: "режиссёр монтажа новостного видео", taskHint: "Сделай раскадровку видеосюжета", outputFormat: "tv-script" },

  // ── Language Desk (Язык / Перевод) ────────────────────────────────────────
  { id: "translate-kz-ru-en", sectionId: "media-language", titleRu: "Перевод KZ ↔ RU ↔ EN", title: "Translate KZ/RU/EN", descriptionRu: "Медиа-перевод без кальки с сохранением смысла и тона", expertRole: "медиа-переводчик KZ/RU/EN", taskHint: "Переведи материал между казахским, русским и английским", outputFormat: "standard" },
  { id: "kazakh-editor", sectionId: "media-language", titleRu: "Редактура казахского", title: "Kazakh Editor", descriptionRu: "Чистый литературный казахский, кириллица ↔ латиница", expertRole: "редактор-корректор казахского языка", taskHint: "Отредактируй и улучши казахский текст", outputFormat: "standard" },
  { id: "rewrite-style", sectionId: "media-language", titleRu: "Рерайт под стиль издания", title: "Rewrite", descriptionRu: "Переписать материал под нужный тон и формат издания", expertRole: "литературный редактор СМИ", taskHint: "Перепиши материал под стиль издания", outputFormat: "article" },

  // ── Digital Bridge 2026 (Winning Kit) ─────────────────────────────────────
  { id: "db-pitch-deck", sectionId: "demo-day", titleRu: "Pitch Deck (10 слайдов)", title: "Pitch Deck", descriptionRu: "Победный питч-дек под Digital Bridge / Astana Hub", expertRole: "питч-коуч уровня Demo Day Astana Hub", taskHint: "Собери победный pitch deck для Digital Bridge 2026", outputFormat: "pitch-deck" },
  { id: "db-demo-script", sectionId: "demo-day", titleRu: "Demo Script (3 мин)", title: "Demo Script", descriptionRu: "Сценарий живого демо с таймингом и запасным планом", expertRole: "режиссёр продуктовых демо на форумах", taskHint: "Напиши 3-минутный demo-сценарий для сцены", outputFormat: "demo-script" },
  { id: "db-jury-simulator", sectionId: "demo-day", titleRu: "Симулятор жюри", title: "Jury Simulator", descriptionRu: "Жёсткие вопросы жюри Digital Bridge + сильные ответы", expertRole: "член жюри Digital Bridge и венчурный инвестор", taskHint: "Симулируй жюри Digital Bridge и подготовь ответы", outputFormat: "battle" },
  { id: "db-one-pager", sectionId: "demo-day", titleRu: "Investor One-Pager", title: "One-Pager", descriptionRu: "Одностраничник для инвесторов: проблема, ров, ask", expertRole: "венчурный аналитик", taskHint: "Сделай investor one-pager", outputFormat: "standard" },
  { id: "db-traction-story", sectionId: "demo-day", titleRu: "Traction Story", title: "Traction", descriptionRu: "Как упаковать метрики и тракшн без выдуманных цифр", expertRole: "growth-стратег", taskHint: "Упакуй тракшн и метрики проекта", outputFormat: "standard" },
  { id: "db-winning-narrative", sectionId: "demo-day", titleRu: "Нарратив «почему мы №1»", title: "Winning Narrative", descriptionRu: "История лидерства: ров, рынок РК, неизбежность победы", expertRole: "стратег позиционирования и сторителлинга", taskHint: "Построй нарратив лидерства для Digital Bridge", outputFormat: "standard" },
]

export const BUSINESS_MODES: BusinessMode[] = SEEDS.map((seed) => ({
  id: seed.id,
  sectionId: seed.sectionId,
  title: seed.title,
  titleRu: seed.titleRu,
  description: seed.descriptionRu,
  descriptionRu: seed.descriptionRu,
  outputFormat: seed.outputFormat || "standard",
  taskHint: seed.taskHint,
  expertRole: seed.expertRole,
}))

export function getBusinessMode(id: string): BusinessMode | undefined {
  return BUSINESS_MODES.find((mode) => mode.id === id)
}

export function modesForSection(sectionId: BusinessSectionId): BusinessMode[] {
  return BUSINESS_MODES.filter((mode) => mode.sectionId === sectionId)
}

const LANG_LABEL: Record<string, string> = {
  ru: "русский",
  kz: "казахский",
  en: "английский",
}

export function buildBusinessPrompt(mode: BusinessMode, input: string, context: BusinessRunContext = {}): string {
  const lang = LANG_LABEL[context.language || "ru"] || "русский"
  const media = isMediaSection(mode.sectionId)

  const ctxLines = media
    ? [
        context.outlet ? `Издание / канал: ${context.outlet}` : "",
        context.audience ? `Аудитория: ${context.audience}` : "",
        context.region ? `Регион / гео: ${context.region}` : "",
        context.beat ? `Рубрика / тема: ${context.beat}` : "",
        context.website ? `Сайт: ${context.website}` : "",
        context.instagram ? `Соцсети: ${context.instagram}` : "",
        context.extra ? `Доп. контекст: ${context.extra}` : "",
      ].filter(Boolean)
    : [
        context.website ? `Сайт: ${context.website}` : "",
        context.instagram ? `Instagram/соцсети: ${context.instagram}` : "",
        context.prices ? `Цены: ${context.prices}` : "",
        context.industry ? `Ниша: ${context.industry}` : "",
        context.revenue ? `Доход/оборот: ${context.revenue}` : "",
        context.teamSize ? `Команда: ${context.teamSize}` : "",
        context.extra ? `Доп. контекст: ${context.extra}` : "",
      ].filter(Boolean)

  const engineLabel = media ? "MALIK AI Newsroom Engine" : "MALIK AI Business Engine"
  const contextLabel = media ? "КОНТЕКСТ РЕДАКЦИИ" : "КОНТЕКСТ БИЗНЕСА"

  // Offline Kazakhstan knowledge grounding (RAG-lite) for media + Digital Bridge.
  const wantsKazakhContext = media || mode.sectionId === "demo-day"
  const kazakhContext = wantsKazakhContext
    ? buildKazakhContextBlock(`${mode.titleRu} ${context.beat || ""} ${context.region || ""} ${context.industry || ""} ${input}`)
    : ""

  return [
    media ? KAZAKH_MEDIA_BRAIN : "",
    SELF_VERIFY_PROTOCOL,
    kazakhContext,
    `Ты — ${mode.expertRole} в ${engineLabel}.`,
    `Режим: ${mode.titleRu}. ${mode.taskHint}.`,
    `Отвечай на ${lang} языке. Будь конкретным, практичным, без воды.`,
    `Не выдумывай факты, цитаты и цифры. Если данных мало — укажи допущения и что проверить.`,
    media
      ? `Соблюдай журналистские стандарты и медиа-этику РК. Запрещены фейки и поддельные цитаты реальных людей.`
      : `Не давай незаконных советов. Legal Document — только с пометкой «не юридическая консультация».`,
    "",
    "ФОРМАТ ОТВЕТА (строго markdown):",
    outputFormatInstructions(mode.outputFormat),
    "",
    ctxLines.length ? `${contextLabel}:\n${ctxLines.join("\n")}` : "",
    "",
    `ЗАПРОС ПОЛЬЗОВАТЕЛЯ:\n${input.trim()}`,
  ]
    .filter(Boolean)
    .join("\n")
}
