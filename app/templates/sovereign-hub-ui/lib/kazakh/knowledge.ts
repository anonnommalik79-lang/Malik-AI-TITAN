/**
 * Kazakhstan Knowledge Engine (offline RAG-lite)
 * ==============================================
 * A curated, deterministic knowledge layer about Kazakhstan that runs offline
 * (no API key, no external call). It retrieves the most relevant stable facts
 * for a query and injects them into the AI prompt so answers are grounded in
 * Kazakhstan reality — the moat that generic global models do not have.
 *
 * IMPORTANT: entries hold only STABLE, well-known facts (capital, currency,
 * institutions, structure). Volatile numbers (exact GDP, daily rates, current
 * officials) are intentionally NOT hardcoded — for those the answer must say
 * "требует свежего источника" so the product never publishes stale data.
 */

export type KnowledgeEntry = {
  id: string
  title: string
  tags: string[]
  body: string
  /** Where a journalist should verify live/volatile details. */
  source?: string
}

export const KAZAKHSTAN_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "geo-basics",
    title: "Казахстан — базовое",
    tags: ["казахстан", "страна", "столица", "астана", "алматы", "география", "qazaqstan", "kazakhstan", "капитал"],
    body:
      "Столица — Астана (Astana). Крупнейший город и финансовый центр — Алматы (Almaty). Валюта — казахстанский тенге (₸, KZT). Государственный язык — казахский, язык межнационального общения — русский. Часовые пояса РК: UTC+5. Девятая по площади страна мира.",
  },
  {
    id: "state-structure",
    title: "Госустройство РК",
    tags: ["власть", "парламент", "мажилис", "сенат", "правительство", "президент", "акимат", "министерство", "закон"],
    body:
      "Парламент двухпалатный: Мажилис (нижняя палата) и Сенат (верхняя палата). Исполнительная власть — Правительство РК. Регионами и городами управляют акиматы во главе с акимами. При ссылке на конкретных должностных лиц и нормы законов — обязательно указывать, что требуется проверка по официальному источнику (Adilet, egov.kz).",
    source: "adilet.zan.kz, egov.kz",
  },
  {
    id: "regions",
    title: "Регионы и города",
    tags: ["регион", "область", "город", "шымкент", "караганда", "актобе", "тараз", "павлодар", "усть-каменогорск", "атырау", "костанай", "кызылорда", "семей", "туркестан"],
    body:
      "Города республиканского значения: Астана, Алматы, Шымкент. Регионы — области (например, Карагандинская, Актюбинская, Туркестанская, Атырауская и др.). Для материалов СМИ важно правильно склонять названия и указывать регион инфоповода.",
  },
  {
    id: "digital-ecosystem",
    title: "Цифровая экосистема РК",
    tags: ["astana hub", "digital bridge", "egov", "технопарк", "стартап", "it", "цифровизация", "tech", "форум", "хаб", "венчур", "инвестор"],
    body:
      "Astana Hub — международный технопарк IT-стартапов, ключевая площадка экосистемы. Digital Bridge — крупный технологический форум Казахстана (стартапы, инвесторы, AI, госцифровизация). eGov — портал государственных услуг. Эти структуры — частые инфоповоды и контекст для tech-материалов.",
  },
  {
    id: "media-landscape",
    title: "Медиаландшафт РК",
    tags: ["сми", "тв", "телеканал", "новости", "хабар", "qazaqstan", "редакция", "журналист", "телеграм", "канал", "медиа", "эфир"],
    body:
      "В Казахстане работают государственные и частные телеканалы, новостные порталы и сильные Telegram-каналы. Контент часто двуязычный (KZ/RU). Для новостей характерны: оперативные ленты, видео-сюжеты, мультиязычные версии материалов. Тренд — вертикальное видео и соцсети как основной канал дистрибуции.",
  },
  {
    id: "language-policy",
    title: "Язык и письменность",
    tags: ["казахский", "латиница", "кириллица", "язык", "перевод", "qazaqsha", "латын", "әліпби", "алфавит"],
    body:
      "Казахский язык использует кириллицу; ведётся переход на латинскую графику (Qazaq Latyn, версия 2021: Ә=Ä, Ғ=Ğ, Ң=Ñ, Ө=Ö, Ұ=Ū, Ү=Ü, Ш=Ş). Для медиа важна корректная транслитерация в обе стороны и чистый литературный казахский без машинной кальки.",
  },
  {
    id: "culture-calendar",
    title: "Культура и календарь",
    tags: ["наурыз", "праздник", "культура", "традиции", "день столицы", "день независимости", "ораза", "айт"],
    body:
      "Ключевые даты и праздники РК (например, Наурыз мейрамы весной, День независимости) — регулярные инфоповоды. Учитывай культурный код, религиозную и национальную чувствительность аудитории. Точные даты и официальные мероприятия — сверять с актуальным календарём.",
  },
  {
    id: "economy-context",
    title: "Экономический контекст",
    tags: ["экономика", "тенге", "нефть", "газ", "экспорт", "курс", "инфляция", "бизнес", "налог", "kaspi"],
    body:
      "Экономика РК во многом связана с нефтью, газом, металлами и сельским хозяйством; активно растёт цифровой и финтех-сектор (популярны локальные платёжные сервисы). Конкретные цифры (курс тенге, инфляция, ВВП) — ВОЛАТИЛЬНЫ: их нельзя писать по памяти, только со свежим источником (Нацбанк РК, Бюро нацстатистики).",
    source: "nationalbank.kz, stat.gov.kz",
  },
]

const STOPWORDS = new Set([
  "и", "в", "на", "о", "об", "по", "для", "что", "как", "это", "the", "a", "of", "to", "in", "is",
  "мне", "ты", "я", "он", "она", "они", "за", "из", "с", "со", "ну", "же", "бы",
])

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-zа-яёәғқңөұүһі0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

/** Score one entry against query tokens (tag hits weigh more than body hits). */
function scoreEntry(entry: KnowledgeEntry, tokens: string[]): number {
  if (!tokens.length) return 0
  const tagText = entry.tags.join(" ").toLowerCase()
  const bodyText = `${entry.title} ${entry.body}`.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (tagText.includes(token)) score += 5
    if (bodyText.includes(token)) score += 1
  }
  return score
}

export type RetrievedKnowledge = {
  entries: KnowledgeEntry[]
  hasMatch: boolean
}

/** Retrieve the top-N most relevant Kazakhstan knowledge entries for a query. */
export function retrieveKazakhKnowledge(query: string, limit = 3): RetrievedKnowledge {
  const tokens = tokenize(query)
  const ranked = KAZAKHSTAN_KNOWLEDGE
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return {
    entries: ranked.map((r) => r.entry),
    hasMatch: ranked.length > 0,
  }
}

/** Heuristic: does the query touch Kazakhstan topics at all? */
export function isKazakhstanRelated(query: string): boolean {
  return retrieveKazakhKnowledge(query, 1).hasMatch
}

/** Build a compact, citable context block to inject into an AI prompt. */
export function buildKazakhContextBlock(query: string, limit = 3): string {
  const { entries, hasMatch } = retrieveKazakhKnowledge(query, limit)
  if (!hasMatch) return ""

  const lines = entries.map((e) => {
    const src = e.source ? ` (сверка: ${e.source})` : ""
    return `- ${e.title}: ${e.body}${src}`
  })

  return [
    "[KAZAKHSTAN_KNOWLEDGE_CONTEXT]",
    "Достоверный контекст о Казахстане (используй как опору, не противоречь ему):",
    ...lines,
    "Волатильные данные (курсы, цифры, имена должностных лиц) не выдумывай — помечай «требует свежего источника».",
  ].join("\n")
}
