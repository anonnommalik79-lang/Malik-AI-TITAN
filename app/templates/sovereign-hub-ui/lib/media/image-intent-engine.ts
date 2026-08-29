import type { ImageMode } from "./types"

export type ImageIntentPlan = {
  rawRequest: string
  normalizedRequest: string
  semanticText: string
  compiledPrompt: string
  language: "ru" | "kk" | "en" | "mixed" | "unknown"
  subjectCategories: string[]
  count: number | null
  colors: string[]
  settings: string[]
  styles: string[]
  camera: string[]
  visibleText: string[]
  mustInclude: string[]
  mustNotInclude: string[]
  priorityOrder: string[]
  ambiguityFlags: string[]
  fingerprint: string
}

type LexiconEntry = {
  canonical: string
  aliases: string[]
  lock: string
}

const SUBJECT_LEXICON: LexiconEntry[] = [
  { canonical: "robot", aliases: ["robot", "robots", "робот", "роботы", "робота", "роботом", "mecha", "android", "андроид"], lock: "robot / mecha subject" },
  { canonical: "transformer", aliases: ["transformer", "transformers", "трансформер", "трансформера", "трансформеры", "трансформеров"], lock: "non-human humanoid transformer / robot" },
  { canonical: "car", aliases: ["car", "cars", "sports car", "sportscar", "supercar", "vehicle", "automobile", "машина", "машину", "машины", "машине", "автомобиль", "автомобиля", "авто", "спорткар", "спорткара"], lock: "sports car / vehicle" },
  { canonical: "motorcycle", aliases: ["motorcycle", "motorbike", "мотоцикл", "мотоцикла", "байк"], lock: "motorcycle" },
  { canonical: "house", aliases: ["house", "home", "дом", "дома", "доме", "здание", "building"], lock: "house / building" },
  { canonical: "football-player", aliases: ["footballer", "football player", "soccer player", "футболист", "футболиста", "футболистка"], lock: "football player" },
  { canonical: "person", aliases: ["person", "people", "human", "человек", "люди", "человека"], lock: "human person" },
  { canonical: "woman", aliases: ["woman", "girl", "female", "женщина", "девушка", "девушку", "девочка"], lock: "woman / girl" },
  { canonical: "man", aliases: ["man", "boy", "male", "мужчина", "парень", "мужчину", "мальчик"], lock: "man / boy" },
  { canonical: "cat", aliases: ["cat", "kitten", "кот", "кошка", "кота", "кошку"], lock: "cat" },
  { canonical: "dog", aliases: ["dog", "puppy", "собака", "пес", "собаку", "щенок"], lock: "dog" },
  { canonical: "horse", aliases: ["horse", "лошадь", "лошадь", "конь", "лошадку"], lock: "horse" },
  { canonical: "bird", aliases: ["bird", "птица", "птицу"], lock: "bird" },
  { canonical: "frog", aliases: ["frog", "frogs", "лягушка", "лягушку", "лягушки", "бақа"], lock: "frog" },
]

const COLORS: Array<[string, string[]]> = [
  ["black", ["black", "черный", "чёрный", "черная", "чёрная", "черное", "чёрное", "қара"]],
  ["white", ["white", "белый", "белая", "белое", "ақ"]],
  ["red", ["red", "красный", "красная", "красное", "қызыл"]],
  ["blue", ["blue", "синий", "синяя", "голубой", "голубая", "көк"]],
  ["green", ["green", "зеленый", "зелёный", "зеленая", "зелёная", "жасыл"]],
  ["yellow", ["yellow", "желтый", "жёлтый", "желтая", "жёлтая", "сары"]],
  ["orange", ["orange", "оранжевый", "оранжевая", "қызғылт сары"]],
  ["purple", ["purple", "violet", "фиолетовый", "фиолетовая", "күлгін"]],
  ["pink", ["pink", "розовый", "розовая", "қызғылт"]],
  ["silver", ["silver", "серебристый", "серебряный", "күміс"]],
  ["gold", ["gold", "golden", "золотой", "золотая", "алтын"]],
]

const SETTINGS: Array<[string, RegExp]> = [
  ["nature / outdoors", /(?:nature|outdoors?|природ|на улице|далада|табиғат)/iu],
  ["forest", /(?:forest|woods|лес|орман)/iu],
  ["mountains", /(?:mountain|mountains|гора|горы|таулар?)/iu],
  ["city", /(?:city|urban|город|қала)/iu],
  ["house exterior / near a house", /(?:near (?:a )?house|by (?:a )?house|возле дома|рядом с домом|у дома|үйдің жанында)/iu],
  ["night", /(?:night|nighttime|ночью|ночн|түнде|түн)/iu],
  ["daylight", /(?:daylight|daytime|днем|днём|күндіз)/iu],
  ["studio", /(?:studio|студия|студийн)/iu],
  ["beach", /(?:beach|shore|пляж|жағажай)/iu],
  ["space", /(?:space|cosmos|outer space|космос|ғарыш)/iu],
]

const STYLE_HINTS: Array<[string, RegExp]> = [
  ["photorealistic", /(?:photoreal|photo realistic|realistic photo|реалистич|фотореал|как фото|настоящ(?:ее|ая|ий) фото)/iu],
  ["cinematic", /(?:cinematic|cinema|movie still|киношн|кинематограф|как в кино)/iu],
  ["anime", /(?:anime|аниме)/iu],
  ["illustration", /(?:illustration|drawing|рисунок|иллюстрац)/iu],
  ["3d render", /(?:3d|render|рендер)/iu],
  ["product photography", /(?:product photo|product shot|предметн|товарн)/iu],
]

const CAMERA_HINTS: Array<[string, RegExp]> = [
  ["close-up", /(?:close[- ]?up|крупный план|крупным планом)/iu],
  ["wide shot", /(?:wide shot|wide angle|широкий план|широкоугольн)/iu],
  ["top-down", /(?:top[- ]?down|bird.?s eye|сверху|вид сверху)/iu],
  ["low angle", /(?:low angle|снизу|низкий ракурс)/iu],
  ["portrait framing", /(?:portrait framing|портретн(?:ый|ая) кадр)/iu],
]

const NUMBER_WORDS: Array<[number, RegExp]> = [
  [1, /\b(?:one|один|одна|одно|бір)\b/iu],
  [2, /\b(?:two|два|две|екі)\b/iu],
  [3, /\b(?:three|три|үш)\b/iu],
  [4, /\b(?:four|четыре|төрт)\b/iu],
  [5, /\b(?:five|пять|бес)\b/iu],
  [6, /\b(?:six|шесть|алты)\b/iu],
  [7, /\b(?:seven|семь|жеті)\b/iu],
  [8, /\b(?:eight|восемь|сегіз)\b/iu],
  [9, /\b(?:nine|девять|тоғыз)\b/iu],
  [10, /\b(?:ten|десять|он)\b/iu],
]

const NOISE_WORDS = new Set([
  "please", "pls", "привет", "салам", "пожалуйста", "hello", "hi", "hey",
  "сделай", "сделать", "создай", "создать", "сгенерируй", "сгенерировать", "нарисуй", "нарисовать",
  "generate", "create", "make", "draw", "маған", "жасап", "жаса", "сурет",
])

const FUZZY_ALIASES = SUBJECT_LEXICON.flatMap((entry) => entry.aliases.map((alias) => ({ alias, canonical: entry.canonical })))
  .filter((entry) => !entry.alias.includes(" ") && entry.alias.length >= 4)

function unique(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).filter((value, index, list) => list.indexOf(value) === index)
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}-]+/gu, "")
}

function editDistance(a: string, b: string) {
  const x = normalizeToken(a)
  const y = normalizeToken(b)
  if (x === y) return 0
  if (!x) return y.length
  if (!y) return x.length

  const prev = Array.from({ length: y.length + 1 }, (_, index) => index)
  const curr = new Array<number>(y.length + 1)
  for (let i = 1; i <= x.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= y.length; j += 1) prev[j] = curr[j]
  }
  return prev[y.length]
}

function fuzzySemanticTokens(value: string) {
  const tokens = value.match(/[\p{L}\p{N}-]+/gu) || []
  const out: string[] = []

  for (const raw of tokens) {
    const token = normalizeToken(raw)
    if (!token || token.length < 4) continue
    let best: { canonical: string; distance: number } | null = null
    for (const candidate of FUZZY_ALIASES) {
      const alias = normalizeToken(candidate.alias)
      if (Math.abs(alias.length - token.length) > 2) continue
      const distance = editDistance(token, alias)
      const limit = Math.max(token.length, alias.length) >= 8 ? 2 : 1
      if (distance <= limit && (!best || distance < best.distance)) {
        best = { canonical: candidate.canonical, distance }
      }
    }
    if (best) out.push(best.canonical)
  }

  return unique(out)
}

function detectLanguage(value: string): ImageIntentPlan["language"] {
  const hasLatin = /[A-Za-z]/.test(value)
  const hasCyrillic = /[А-Яа-яЁё]/u.test(value)
  const hasKazakh = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/u.test(value)
  if ((hasLatin && hasCyrillic) || (hasKazakh && hasLatin)) return "mixed"
  if (hasKazakh) return "kk"
  if (hasCyrillic) return "ru"
  if (hasLatin) return "en"
  return "unknown"
}

function normalizeRequest(raw: string) {
  return String(raw || "")
    .normalize("NFKC")
    .replace(/^\s*\/(?:image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])\s*:?\s*/iu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function semanticText(raw: string) {
  const normalized = normalizeRequest(raw)
  const words = normalized.split(/\s+/)
  const kept = words.filter((word, index) => {
    const token = normalizeToken(word)
    if (index > 6) return true
    return !NOISE_WORDS.has(token)
  })
  const fuzzy = fuzzySemanticTokens(normalized)
  return `${kept.join(" ")} ${fuzzy.join(" ")}`.trim()
}

function extractVisibleText(raw: string) {
  if (!/(?:текст|надпись|напиши|написать|слово|caption|text|write|inscription|логотип|logo)/iu.test(raw)) return []
  const matches = [...raw.matchAll(/[«“"]([^»”"]{1,120})[»”"]/gu)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean)
  const afterLabel = [...raw.matchAll(/(?:текст|надпись|caption|text|write|напиши)\s*[:=]\s*([^,;.!?]{1,120})/giu)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean)
  return unique([...matches, ...afterLabel])
}

function extractMustNot(raw: string) {
  const out: string[] = []
  const patterns = [
    /(?:без|не добавляй|не добавлять|не должно быть|убери|исключи)\s+([^,.!?;]{1,80})/giu,
    /(?:without|do not include|don't include|exclude|no)\s+([^,.!?;]{1,80})/giu,
    /(?:қоспа|қоспау|болмасын)\s+([^,.!?;]{1,80})/giu,
  ]
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) {
      const value = match[1]?.trim()
      if (value) out.push(value)
    }
  }
  return unique(out)
}

function extractCount(raw: string) {
  const digit = raw.match(/(?:^|\s)(\d{1,2})(?=\s|[\p{L}])/u)
  if (digit) {
    const n = Number(digit[1])
    if (n >= 1 && n <= 20) return n
  }
  for (const [value, pattern] of NUMBER_WORDS) {
    if (pattern.test(raw)) return value
  }
  return null
}

function detectSubjects(text: string) {
  const lower = text.toLowerCase()
  const fuzzy = new Set(fuzzySemanticTokens(text))
  const subjects: string[] = []
  for (const entry of SUBJECT_LEXICON) {
    const direct = entry.aliases.some((alias) => lower.includes(alias.toLowerCase()))
    if (direct || fuzzy.has(entry.canonical)) subjects.push(entry.lock)
  }
  return unique(subjects)
}

function detectColors(text: string) {
  const lower = text.toLowerCase()
  return COLORS.filter(([, aliases]) => aliases.some((alias) => lower.includes(alias.toLowerCase()))).map(([canonical]) => canonical)
}

function detectPairs(text: string, pairs: Array<[string, RegExp]>) {
  return pairs.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
}

function hashFingerprint(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `mi-${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function modeStyle(mode?: ImageMode) {
  if (mode === "realistic") return "photorealistic"
  if (mode === "cinematic") return "cinematic"
  if (mode === "product") return "product photography"
  if (mode === "design") return "graphic design"
  return ""
}

export function buildImageIntentPlan(rawPrompt: string, compiledPrompt: string, mode?: ImageMode): ImageIntentPlan {
  const rawRequest = String(rawPrompt || "").trim().slice(0, 4000)
  const normalizedRequest = normalizeRequest(rawRequest)
  const semantic = semanticText(normalizedRequest)
  const subjects = detectSubjects(`${normalizedRequest} ${compiledPrompt}`)
  const colors = detectColors(normalizedRequest)
  const settings = detectPairs(normalizedRequest, SETTINGS)
  const styles = unique([...detectPairs(normalizedRequest, STYLE_HINTS), modeStyle(mode)])
  const camera = detectPairs(normalizedRequest, CAMERA_HINTS)
  const visibleText = extractVisibleText(rawRequest)
  const explicitMustNot = extractMustNot(normalizedRequest)
  const count = extractCount(normalizedRequest)

  const mustInclude = unique([
    ...subjects,
    ...colors.map((color) => `requested color: ${color}`),
    ...settings.map((setting) => `requested setting: ${setting}`),
    ...(count ? [`exact main-subject count: ${count}`] : []),
    ...visibleText.map((text) => `visible text exactly: ${text}`),
  ])

  const mustNotInclude = unique(explicitMustNot)
  const priorityOrder = unique([
    "main subject identity/category",
    ...(count ? ["exact count"] : []),
    "requested action and pose",
    ...settings.map(() => "setting / location"),
    ...colors.map(() => "requested colors"),
    ...visibleText.map(() => "visible text spelling"),
    ...mustNotInclude.map(() => "explicit exclusions"),
    ...camera.map(() => "camera / framing"),
    ...styles.map(() => "style / rendering"),
  ])

  const ambiguityFlags: string[] = []
  if (!subjects.length) ambiguityFlags.push("main subject category not confidently classified; preserve original wording literally")
  if (!count) ambiguityFlags.push("count unspecified; do not invent duplicated main subjects")

  const fingerprint = hashFingerprint(JSON.stringify({
    normalizedRequest,
    subjects,
    count,
    colors,
    settings,
    visibleText,
    mustNotInclude,
  }))

  return {
    rawRequest,
    normalizedRequest,
    semanticText: semantic,
    compiledPrompt: String(compiledPrompt || normalizedRequest).trim(),
    language: detectLanguage(rawRequest),
    subjectCategories: subjects,
    count,
    colors,
    settings,
    styles,
    camera,
    visibleText,
    mustInclude,
    mustNotInclude,
    priorityOrder,
    ambiguityFlags,
    fingerprint,
  }
}

export function buildIntentRepairPrompt(plan: ImageIntentPlan, mismatch: string) {
  return [
    "MALIK IMAGE REPAIR MODE — CORRECT THE PREVIOUS RESULT, DO NOT REINTERPRET THE REQUEST.",
    `INTENT FINGERPRINT: ${plan.fingerprint}`,
    `DETECTED MISMATCH: ${String(mismatch || "semantic mismatch").trim()}`,
    plan.mustInclude.length ? `MUST INCLUDE: ${plan.mustInclude.join(" | ")}` : "",
    plan.mustNotInclude.length ? `MUST NOT INCLUDE: ${plan.mustNotInclude.join(" | ")}` : "",
    plan.visibleText.length ? `VISIBLE TEXT VERBATIM: ${plan.visibleText.join(" | ")}` : "",
    `AUTHORITATIVE ORIGINAL REQUEST: ${plan.rawRequest}`,
    `LOCKED COMPILED PROMPT: ${plan.compiledPrompt}`,
    "Regenerate the image while correcting only the mismatch. Never replace, reinterpret or simplify the user's requested subject.",
  ].filter(Boolean).join("\n\n")
}
