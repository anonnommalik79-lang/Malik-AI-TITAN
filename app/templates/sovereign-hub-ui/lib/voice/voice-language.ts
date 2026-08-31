import { TRANSLATOR_LANGUAGES, languageEnglishName, speechLocale } from "@/lib/translator/languages"

/**
 * Which language the voice assistant answers in.
 *
 * Voice used to accept exactly three - Kazakh, Russian, English - and the turn
 * route carried the line "the selected Voice language overrides the language of
 * the user's words". So speaking Spanish to it got a Kazakh answer, and there
 * was no way to ask for anything else.
 *
 * The rule now is the one people expect from a voice assistant: it answers in
 * the language you spoke to it. The picker in the UI becomes the fallback for
 * when a short utterance is not enough to tell, and an explicit request inside
 * the sentence ("ответь по-испански") beats both.
 */

export type VoiceLanguageDecision = {
  /** BCP-47-ish code from the shared language table. */
  code: string
  /** English name, which is what models reason about most reliably. */
  english: string
  /** Locale for speech synthesis. */
  locale: string
  /** How it was chosen, for the response payload and for tests. */
  source: "requested-in-speech" | "detected" | "selected" | "default"
}

const OPEN = "(^|[^\\p{L}\\p{N}])"
const CLOSE = "(?![\\p{L}\\p{N}])"

/**
 * "Answer in X" in the three languages this product's users actually speak,
 * plus English. The language itself is captured and resolved separately.
 */
const ASK_FOR_LANGUAGE = [
  // Russian: "ответь по-испански", "скажи на испанском", "переведи на испанский"
  new RegExp(`(?:ответ|скаж|говор|отвеч|напиш|переведи|переключ)\\p{L}*\\s+(?:мне\\s+)?(?:пожалуйста\\s+)?(?:по[-\\s]?|на\\s+)([\\p{L}]{3,})`, "iu"),
  // Kazakh: "ағылшынша жауап бер"
  new RegExp(`([\\p{L}]{4,}ша|[\\p{L}]{4,}ше)\\s+(?:жауап|айт|сөйле)`, "iu"),
  // English: "answer in Spanish", "reply in French", "speak Kazakh"
  new RegExp(`(?:answer|reply|respond|speak|say it|talk)\\s+(?:to me\\s+)?(?:in\\s+)?([a-z]{3,})`, "i"),
]

/**
 * Names a spoken request can use. Built from the shared table (English name and
 * endonym) plus the Russian and Kazakh adjective stems, which is how the
 * request almost always arrives: "по-испански", "на немецком", "ағылшынша".
 */
const NAME_STEMS: Record<string, string[]> = {
  ru: ["русск", "russian", "орысша", "орыс"],
  en: ["английск", "англ", "english", "ағылшынша", "ағылшын", "инглиш"],
  kk: ["казахск", "қазақша", "казахша", "қазақ", "kazakh"],
  ky: ["киргизск", "кыргызча", "kyrgyz"],
  uz: ["узбекск", "oʻzbekcha", "uzbek"],
  uk: ["украинск", "українськ", "ukrainian"],
  tr: ["турецк", "türkçe", "turkish"],
  az: ["азербайджанск", "azərbaycan", "azerbaijani"],
  de: ["немецк", "deutsch", "german"],
  fr: ["французск", "français", "french"],
  es: ["испанск", "español", "spanish"],
  it: ["итальянск", "italiano", "italian"],
  pt: ["португальск", "português", "portuguese"],
  nl: ["голландск", "нидерландск", "nederlands", "dutch"],
  pl: ["польск", "polski", "polish"],
  cs: ["чешск", "čeština", "czech"],
  ar: ["арабск", "arabic", "عربية"],
  he: ["иврит", "hebrew"],
  fa: ["персидск", "фарси", "persian", "farsi"],
  hi: ["хинди", "hindi"],
  ur: ["урду", "urdu"],
  bn: ["бенгальск", "bengali"],
  "zh-CN": ["китайск", "chinese", "mandarin", "中文"],
  ja: ["японск", "japanese", "日本語"],
  ko: ["корейск", "korean", "한국어"],
  vi: ["вьетнамск", "vietnamese"],
  th: ["тайск", "thai"],
  id: ["индонезийск", "indonesian"],
  ms: ["малайск", "malay"],
  hy: ["армянск", "armenian"],
  ka: ["грузинск", "georgian"],
  el: ["греческ", "greek"],
  ro: ["румынск", "romanian"],
  hu: ["венгерск", "hungarian"],
  sv: ["шведск", "swedish"],
  fi: ["финск", "finnish"],
  no: ["норвежск", "norwegian"],
  da: ["датск", "danish"],
  sr: ["сербск", "serbian"],
  bg: ["болгарск", "bulgarian"],
  sw: ["суахили", "swahili"],
  tt: ["татарск", "татарча", "tatar"],
  ba: ["башкирск", "башҡортса", "bashkir"],
  tg: ["таджикск", "tajik"],
  tk: ["туркменск", "turkmen"],
}

/** Resolves a spoken language name to a code from the shared table. */
export function resolveLanguageName(raw: string) {
  const value = String(raw || "").toLowerCase().trim()
  if (value.length < 3) return ""

  for (const [code, stems] of Object.entries(NAME_STEMS)) {
    for (const stem of stems) {
      if (value.startsWith(stem) || stem.startsWith(value)) return code
    }
  }

  // Anything else in the 130+ table, by English name or endonym.
  for (const language of TRANSLATOR_LANGUAGES) {
    const english = language.english.toLowerCase()
    const label = language.label.toLowerCase()
    if (value === english || value === label) return language.code
    if (english.startsWith(value) && value.length >= 4) return language.code
  }

  return ""
}

function requestedInSpeech(text: string) {
  for (const pattern of ASK_FOR_LANGUAGE) {
    const match = pattern.exec(text)
    if (!match?.[1]) continue
    const code = resolveLanguageName(match[1])
    if (code) return code
  }
  return ""
}

/** Scripts that identify a language on sight. */
const SCRIPTS: Array<[string, RegExp]> = [
  ["ja", /[぀-ゟ゠-ヿ]/u],
  ["ko", /[가-힯ᄀ-ᇿ]/u],
  ["zh-CN", /[一-鿿]/u],
  ["th", /[฀-๿]/u],
  ["lo", /[຀-໿]/u],
  ["km", /[ក-៿]/u],
  ["my", /[က-႟]/u],
  ["ka", /[Ⴀ-ჿ]/u],
  ["hy", /[԰-֏]/u],
  ["he", /[֐-׿]/u],
  ["el", /[Ͱ-Ͽ]/u],
  ["hi", /[ऀ-ॿ]/u],
  ["bn", /[ঀ-৿]/u],
  ["pa", /[਀-੿]/u],
  ["gu", /[઀-૿]/u],
  ["ta", /[஀-௿]/u],
  ["te", /[ఀ-౿]/u],
  ["kn", /[ಀ-೿]/u],
  ["ml", /[ഀ-ൿ]/u],
  ["si", /[඀-෿]/u],
  ["am", /[ሀ-፿]/u],
]

/** Persian and Urdu letters that Arabic does not use. */
const PERSIAN = /[پچژگ]/u
const URDU = /[ٹڈڑںھہے]/u

/**
 * Cyrillic languages.
 *
 * The letter "і" is not a tell: Kazakh and Ukrainian both use it, so testing
 * for it first read every Ukrainian sentence as Kazakh. Only letters unique to
 * one language count as evidence, and where the scripts genuinely overlap the
 * decision falls to function words.
 */
function cyrillicLanguage(text: string): { code: string; confident: boolean } {
  const lower = text.toLowerCase()

  if (/[ѓѕќџ]/u.test(lower)) return { code: "mk", confident: true }
  if (/[ђћњљ]/u.test(lower)) return { code: "sr", confident: true }
  if (/[їєґ]/u.test(lower)) return { code: "uk", confident: true }
  if (/[әңғүұқөһ]/u.test(lower)) {
    const tatar = /[җҫ]/u.test(lower)
    return { code: tatar ? "tt" : "kk", confident: true }
  }
  if (/[ў]/u.test(lower)) return { code: "uz", confident: true }

  // Stems, not whole words. Kazakh glues its endings on, so "калай" has to
  // match "калайсың", "калайсыз", "калайсын" - the whole-word version of this
  // list matched none of them, and a greeting came back as Russian.
  const stem = (stems: string) => new RegExp(`${OPEN}(?:${stems})\\p{L}*${CLOSE}`, "iu").test(lower)
  const has = (words: string) => new RegExp(`${OPEN}(?:${words})${CLOSE}`, "iu").test(lower)

  // "і" without a decisive letter: Ukrainian and Kazakh both reach here.
  if (/і/u.test(lower)) {
    if (has("як|що|справи|дякую|привіт|будь\\s+ласка|ти|ви|це|тільки")) return { code: "uk", confident: true }
    if (stem("бір|кім|мен|сен|біз|сіз|бұл|үшін|қалай|жақсы|керек")) return { code: "kk", confident: true }
    return { code: "uk", confident: false }
  }

  // Kazakh written in plain Russian letters, which is what the recognizer
  // produces for a short utterance: "калайсын", "салем", "рахмет", "жаксы".
  if (stem(
    "калай|салем|сэлем|рахмет|ракмет|жаксы|жаман|казак|казакша|" +
    "кайда|канша|канда|неге|калайсы|бар\\s+ма|жок|" +
    "мен|сен|сиз|биз|бул|осы|солай|керек|болады|болмайды|" +
    "тусиндир|айтшы|кайталa|кешир|рахат",
  )) return { code: "kk", confident: true }

  if (has("ама|също|защото|какво|благодаря")) return { code: "bg", confident: true }
  if (stem("як|що|дякую|привіт|справи")) return { code: "uk", confident: true }

  // Positive evidence that this really is Russian, rather than Cyrillic text we
  // simply failed to place. Without this every unrecognised Kazakh phrase was
  // silently declared Russian and overrode the user's own choice of language.
  //
  // Content words are matched as stems, but the short function words have to be
  // whole words: a stem match on "по" would also fire on "почему", "потом" and
  // half the dictionary.
  const russian = stem(
    "привет|здравствуй|спасибо|пожалуйста|сколько|почему|зачем|потому|" +
    "который|котор|сегодня|сейчас|давай|можешь|хочу|нужно|скажи|расскажи|" +
    "сделай|покажи|напиши|помоги|бежит|идёт|идет|делает|говорит|смотрит|" +
    // The imperatives a voice assistant actually receives. Two words with no
    // preposition ("включи музыку") is otherwise unplaceable Cyrillic.
    "включ|выключ|открой|закрой|найди|поставь|останов|повтори|продолж|" +
    "перевед|запиши|отправ|позвони|напомни|посчитай|нарисуй|создай|добавь|" +
    "удали|прочитай|объясни|сравни|проверь|запусти",
  ) || has(
    "что|как|где|когда|это|этот|эта|эти|очень|ещё|еще|тоже|также|" +
    "меня|тебя|мне|тебе|нас|вам|они|она|мы|вы|его|её|ее|их|" +
    "на|в|с|к|у|по|из|для|про|над|под|при|без|же|бы|ли|не|или|" +
    "уже|потом|здесь|там|тут|вот|так|то|" +
    "был|была|было|будет|есть|нет|да",
  )

  return { code: "ru", confident: russian }
}

/** Latin-script languages, by their most common function words. */
const LATIN_MARKERS: Array<[string, RegExp]> = [
  ["es", /(?:^|\s)(?:qué|cómo|dónde|gracias|hola|por favor|puedes|quiero|el|la|los|las|una)(?=\s|$|[.,!?])/i],
  ["pt", /(?:^|\s)(?:você|obrigad[oa]|não|português|como está|por favor|quero|uma)(?=\s|$|[.,!?])/i],
  ["fr", /(?:^|\s)(?:bonjour|merci|s'il|comment|pourquoi|je suis|c'est|est-ce|les|une|nous)(?=\s|$|[.,!?])/i],
  ["de", /(?:^|\s)(?:hallo|danke|bitte|warum|wie geht|ich bin|nicht|und|der|die|das|ein)(?=\s|$|[.,!?])/i],
  ["it", /(?:^|\s)(?:ciao|grazie|per favore|come stai|sono|perché|che cosa|una|gli)(?=\s|$|[.,!?])/i],
  ["tr", /(?:^|\s)(?:merhaba|teşekkür|nasılsın|lütfen|nedir|için|bir|değil|evet)(?=\s|$|[.,!?])/i],
  ["pl", /(?:^|\s)(?:cześć|dziękuję|proszę|jak się|dlaczego|jestem|nie ma|czy)(?=\s|$|[.,!?])/i],
  ["nl", /(?:^|\s)(?:hallo|dank je|alsjeblieft|hoe gaat|waarom|ik ben|niet|het|een)(?=\s|$|[.,!?])/i],
  ["id", /(?:^|\s)(?:halo|terima kasih|apa kabar|saya|tidak|bagaimana|yang|untuk)(?=\s|$|[.,!?])/i],
  ["vi", /(?:^|\s)(?:xin chào|cảm ơn|bạn|không|làm sao|tôi|được)(?=\s|$|[.,!?])/i],
  ["az", /(?:^|\s)(?:salam|təşəkkür|necəsən|mən|deyil|üçün)(?=\s|$|[.,!?])/i],
  ["uz", /(?:^|\s)(?:salom|rahmat|qalaysiz|men|yoʻq|uchun)(?=\s|$|[.,!?])/i],
]

/**
 * Best guess at the language of one utterance. Returns "" when the text is too
 * short or too neutral to tell, so the caller can fall back to the picker
 * instead of guessing wrong on "ок" or "ага".
 */
/**
 * Detection with its own certainty attached.
 *
 * The certainty is the important half. A script is proof; a function word is
 * proof; falling off the end of the Cyrillic checks is not. Reporting that last
 * case as plain "ru" let a guess outrank the language the user had chosen by
 * hand, which is how "калайсың" got answered in Russian.
 */
export function detectSpokenLanguageDetailed(text: string): { code: string; confident: boolean } {
  const value = String(text || "").trim()
  const unknown = { code: "", confident: false }
  if (!value) return unknown

  for (const [code, pattern] of SCRIPTS) {
    if (pattern.test(value)) return { code, confident: true }
  }

  if (/[؀-ۿ]/u.test(value)) {
    if (URDU.test(value)) return { code: "ur", confident: true }
    if (PERSIAN.test(value)) return { code: "fa", confident: true }
    return { code: "ar", confident: true }
  }

  if (/[Ѐ-ӿ]/u.test(value)) return cyrillicLanguage(value)

  if (/[a-z]/i.test(value)) {
    for (const [code, pattern] of LATIN_MARKERS) {
      if (pattern.test(value)) return { code, confident: true }
    }
    // Latin letters with no marker: English is the safe reading, but it is a
    // reading, not proof, and only once there are enough words to mean anything.
    if (value.split(/\s+/).filter(Boolean).length >= 2) return { code: "en", confident: false }
    return unknown
  }

  return unknown
}

/** Best guess at the language of one utterance, or "" when it cannot tell. */
export function detectSpokenLanguage(text: string) {
  return detectSpokenLanguageDetailed(text).code
}

/**
 * The language the answer must be in.
 *
 * An explicit request inside the sentence wins. Then confident detection - a
 * script, or a word only one language uses. The picker comes next, because a
 * person who has chosen Kazakh has told us more than a guess can, and only then
 * an unconfident guess.
 */
export function resolveVoiceLanguage(input: { text: string; selected?: unknown }): VoiceLanguageDecision {
  const text = String(input.text || "")
  const raw = typeof input.selected === "string" ? input.selected : ""
  const selected = raw && raw !== "auto" ? raw : ""

  const asked = requestedInSpeech(text)
  if (asked) return decision(asked, "requested-in-speech")

  const detected = detectSpokenLanguageDetailed(text)
  if (detected.code && detected.confident) return decision(detected.code, "detected")

  if (selected) return decision(selected, "selected")
  if (detected.code) return decision(detected.code, "detected")

  return decision("ru", "default")
}

function decision(code: string, source: VoiceLanguageDecision["source"]): VoiceLanguageDecision {
  return { code, english: languageEnglishName(code), locale: speechLocale(code), source }
}

/** The language half of the system prompt, for any language in the table. */
export function languageDirective(decisionOrCode: VoiceLanguageDecision | string) {
  const code = typeof decisionOrCode === "string" ? decisionOrCode : decisionOrCode.code
  const english = languageEnglishName(code)
  return [
    `LANGUAGE: answer only in ${english}.`,
    "Write it the way a native speaker says it out loud, in that language's own script.",
    "Keep exact brand names, code identifiers and proper nouns as they are spelled.",
    "Never mix scripts inside a word and never produce half-transliterated text.",
    "Sentences must be short enough to read aloud naturally.",
  ].join(" ")
}

/**
 * Whether a reply is plausibly in the language it was supposed to be. Script is
 * the reliable signal; for Latin-script languages we only check that the reply
 * did not come back in a different script entirely, because telling Spanish
 * from Portuguese by regex is not worth a retry.
 */
export function looksLikeLanguage(text: string, code: string) {
  const value = String(text || "").trim()
  if (!value) return false

  const expected = detectSpokenLanguage(value)
  if (!expected) return true

  if (code === "kk") return /[әіңғүұқөһ]/u.test(value) || expected === "kk"
  if (code === "ru") return /[Ѐ-ӿ]/u.test(value) && !/[әіңғүұқөһ]/u.test(value)

  const cyrillic = /[Ѐ-ӿ]/u.test(value)
  const latin = /[a-z]/i.test(value)

  for (const [scriptCode, pattern] of SCRIPTS) {
    if (code === scriptCode) return pattern.test(value)
  }

  if (["ar", "fa", "ur", "ps", "sd"].includes(code)) return /[؀-ۿ]/u.test(value)
  if (["uk", "bg", "sr", "mk", "be", "ky", "tt", "ba", "mn", "tg"].includes(code)) return cyrillic

  // Latin-script target: reject only an answer that is clearly not Latin.
  return latin || !cyrillic
}
