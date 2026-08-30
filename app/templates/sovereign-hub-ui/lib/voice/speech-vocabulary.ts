/**
 * What the recognizer is told to expect, and what to do when it still gets it
 * wrong.
 *
 * Whisper transcribes Russian and Kazakh speech phonetically. A Latin brand
 * name spoken inside a Russian sentence therefore comes back as whatever the
 * sounds looked like: "ChatGPT" turns into "чат гпт", "чад жпт", "чат джи пи
 * ти", and the assistant is then asked about a word that does not exist. The
 * same happens to ordinary words whose consonants are easy to mishear -
 * "площадка" arrives as "плошадка" or "площатка".
 *
 * Two defences, in this order:
 *
 * 1. `speechHintPrompt()` is handed to the recognizer before it decodes
 *    anything. Whisper conditions on it, so it spells the brands correctly at
 *    the source. This is by far the cheaper fix, and it is why the list of
 *    terms below is worth keeping current.
 * 2. `repairTranscript()` cleans up what still slipped through, and runs on
 *    every path - the server recognizer, and the browser's own recognizer,
 *    which takes no hint at all.
 *
 * The repair is deliberately conservative. Brands are matched by explicit
 * spelling variants, ordinary words only by a single-character difference, so
 * a real word is never rewritten into a different real word ("посадка" is two
 * edits from "площадка" and is left alone).
 */

/** Written into the recognizer's prompt so brands are spelled, not sounded out. */
export const VOICE_BRAND_TERMS = [
  "ChatGPT", "OpenAI", "GPT-4", "GPT-5", "DeepSeek", "Claude", "Anthropic",
  "Gemini", "Google", "YouTube", "Midjourney", "Copilot", "Perplexity",
  "Stable Diffusion", "Telegram", "WhatsApp", "Instagram", "TikTok", "GitHub",
  "Figma", "Notion", "Spotify", "Netflix", "Uber", "Kaspi", "Yandex",
  "JavaScript", "TypeScript", "Python", "React", "Next.js", "Node.js",
  "Malik AI", "Sola",
]

/**
 * The exchange written into the prompt. Whisper follows the style of the text
 * it is conditioned on, so the sample is a normal Russian sentence that happens
 * to contain Latin brand names - which is exactly the output we want back.
 */
export function speechHintPrompt(language?: string) {
  const code = String(language || "").toLowerCase()
  const sample = code.startsWith("kk")
    ? "Сәлем! ChatGPT, DeepSeek және Gemini туралы айтып бер. Осы алаңда Malik AI қалай жұмыс істейді?"
    : code.startsWith("en")
      ? "Hi! Tell me about ChatGPT, DeepSeek and Gemini, and how this platform works."
      : "Привет! Расскажи про ChatGPT, DeepSeek и Gemini. Как работает эта площадка и Malik AI?"
  return `${sample} ${VOICE_BRAND_TERMS.join(", ")}.`
}

/** Cyrillic-safe word edges: \b is ASCII-only and never matches next to а-я. */
const OPEN = "(^|[^\\p{L}\\p{N}])"
const CLOSE = "(?![\\p{L}\\p{N}])"

type BrandRule = { canonical: string; variants: string[] }

/**
 * Spelling variants actually produced by Whisper and by the browser recognizer
 * for Russian and Kazakh speech. Only spellings that are not real words in
 * either language are listed, so nothing meaningful is ever overwritten.
 */
const BRANDS: BrandRule[] = [
  {
    canonical: "ChatGPT",
    variants: [
      "чат\\s*-?\\s*(?:гпт|джипити|жипити|джи\\s*пи\\s*ти|жи\\s*пи\\s*ти|гэпэтэ|гэ\\s*пэ\\s*тэ|гпи\\s*ти)",
      "чад\\s*-?\\s*(?:гпт|жпт|джипити|жипити|джи\\s*пи\\s*ти)",
      "чатгпт", "чатжпт", "чат\\s*жпт", "щат\\s*-?\\s*гпт",
      "chat\\s*-?\\s*gpt", "chat\\s*g\\s*p\\s*t",
    ],
  },
  { canonical: "GPT", variants: ["джипити", "жипити", "гэпэтэ", "джи\\s*пи\\s*ти"] },
  { canonical: "DeepSeek", variants: ["дип\\s*-?\\s*с[иеэ]к", "дипсик", "дипсек", "дип\\s*сиик", "deep\\s*seek"] },
  { canonical: "Claude", variants: ["клод", "кл[оа]уд\\s*(?:аи|ai)", "клоуд"] },
  { canonical: "Gemini", variants: ["джемини", "джемени", "жемини", "гемини", "джимини"] },
  { canonical: "Midjourney", variants: ["мидж[оеё]рни", "мид\\s*дж[оеё]рни", "миджорней"] },
  { canonical: "Copilot", variants: ["копайлот", "копилот", "ко\\s*пилот"] },
  { canonical: "Perplexity", variants: ["перплексити", "перплексии", "перплекс[иы]"] },
  { canonical: "Stable Diffusion", variants: ["стейбл\\s*дифф?[ьюу]жн", "стабл\\s*диффузия"] },
  { canonical: "Telegram", variants: ["телеграмм?", "тэлеграм"] },
  { canonical: "WhatsApp", variants: ["в[оа]тс?[аэ]пп?", "воцап", "уотсап"] },
  { canonical: "Instagram", variants: ["инстаграмм?", "инстагр[ае]м"] },
  { canonical: "TikTok", variants: ["тик\\s*-?\\s*ток", "тикток"] },
  { canonical: "YouTube", variants: ["ют[уь]?юб", "ютуб", "ю\\s*туб"] },
  { canonical: "GitHub", variants: ["гит\\s*-?\\s*хаб", "гитхаб", "гитхап"] },
  { canonical: "Figma", variants: ["фигма", "фигме", "фигму"] },
  { canonical: "Notion", variants: ["ноушн", "ноушен", "нотион"] },
  { canonical: "Spotify", variants: ["спотиф[ая]й"] },
  { canonical: "Netflix", variants: ["нетфликс", "н[еэ]тфликс"] },
  { canonical: "Kaspi", variants: ["каспи\\s*банк", "каспий\\s*банк"] },
  { canonical: "JavaScript", variants: ["джава\\s*скрипт", "жава\\s*скрипт", "яваскрипт"] },
  { canonical: "TypeScript", variants: ["тайп\\s*скрипт", "типскрипт"] },
  { canonical: "Python", variants: ["п[ая]йтон", "питон\\s*(?:код|язык)"] },
  { canonical: "Malik AI", variants: ["малик\\s*(?:аи|эйай|ai)", "мал[иы]к\\s*эй\\s*ай"] },
]

const BRAND_RULES = BRANDS.map((brand) => ({
  canonical: brand.canonical,
  pattern: new RegExp(`${OPEN}(?:${brand.variants.join("|")})${CLOSE}`, "giu"),
}))

/**
 * Ordinary words the recognizer softens or hardens by one consonant. Repaired
 * only at edit distance 1, which is enough for every mishearing of this kind
 * and too tight to reach a different real word.
 */
const COMMON_WORDS = [
  "площадка", "площадки", "площадке", "площадку", "площадкой",
  "приложение", "приложения", "приложении", "нейросеть", "нейросети",
  "интернет", "интернете", "сгенерируй", "сгенерировать", "генерация",
  "пожалуйста", "расскажи", "объясни", "переведи", "переводчик",
  "изображение", "изображения", "картинка", "картинку", "фотография",
  "сообщение", "сообщения", "аккаунт", "подписка", "оплата", "стоимость",
  "программа", "программирование", "разработка", "сервер", "сервис",
  "документ", "таблица", "презентация", "календарь", "напоминание",
  "погода", "новости", "расписание", "маршрут", "адрес", "телефон",
  "алаң", "қосымша", "сурет", "хабарлама", "бағдарлама", "аудармашы",
]

const COMMON_SET = new Set(COMMON_WORDS)

/**
 * Whether `heard` is `word` with one consonant misheard.
 *
 * Deliberately narrower than an edit distance of one. Russian inflects by
 * changing the end of a word, so a plain distance-1 rule rewrote perfectly good
 * text: "документы" became "документ", "адреса" became "адрес", "картинки"
 * became "картинка". Two constraints remove that whole class of damage:
 *
 * - same length, so no ending is ever added or dropped;
 * - the differing character is not the last one, because that is where the
 *   grammatical ending lives while a mishearing lands in the stem.
 *
 * "плошадка" and "площатка" still reach "площадка"; "картинки" is left alone.
 */
function misheardOf(heard: string, word: string) {
  if (heard.length !== word.length) return false

  let difference = -1
  for (let index = 0; index < word.length; index += 1) {
    if (heard[index] === word[index]) continue
    if (difference >= 0) return false
    difference = index
  }

  return difference >= 0 && difference < word.length - 1
}

/** Keeps the shape of the original token: ПЛОШАДКА -> ПЛОЩАДКА, Плошадка -> Площадка. */
function matchCase(source: string, replacement: string) {
  if (source === source.toUpperCase() && source !== source.toLowerCase()) return replacement.toUpperCase()
  if (source[0] === source[0]?.toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}

function repairCommonWords(text: string) {
  return text.replace(/[\p{L}\p{N}]+/gu, (token) => {
    const lower = token.toLowerCase()
    // Already correct, or too short for a one-character difference to be
    // anything but a different word.
    if (lower.length < 5 || COMMON_SET.has(lower)) return token
    for (const word of COMMON_WORDS) {
      if (word.length !== lower.length) continue
      if (misheardOf(lower, word)) return matchCase(token, word)
    }
    return token
  })
}

/**
 * Normalises one recognized utterance. Safe to run more than once: every rule
 * maps a wrong spelling to a right one, and a right one to itself.
 */
export function repairTranscript(input: string) {
  let text = String(input || "")
  if (!text.trim()) return ""

  for (const rule of BRAND_RULES) {
    text = text.replace(rule.pattern, (_match, lead: string) => `${lead}${rule.canonical}`)
  }

  text = repairCommonWords(text)

  return text.replace(/[ \t]{2,}/g, " ").trim()
}
