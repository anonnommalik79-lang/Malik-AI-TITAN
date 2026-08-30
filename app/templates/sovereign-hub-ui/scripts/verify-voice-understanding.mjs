import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

/**
 * Voice had three holes, and this guards all three.
 *
 * 1. Nothing told the recognizer what words to expect, so a Latin brand name
 *    spoken inside a Russian sentence came back spelled by sound - "ChatGPT"
 *    as "чат гпт" - and the assistant was asked about a word that does not
 *    exist. The reported symptom was exactly that: it understands "знаешь" but
 *    not "чатгпт".
 * 2. The answer language was locked to Kazakh, Russian or English, and the
 *    system prompt said the picker "overrides the language of the user's
 *    words". Speaking anything else got an answer in the wrong language.
 * 3. The web was searched only when the user said the word "поищи", so "какая
 *    сейчас погода" was answered from training data.
 *
 * Note on the regexes under test: JavaScript's \b is ASCII-only and never
 * matches next to Cyrillic, so every word boundary in this code has to be
 * written as an explicit character class. Several tests below exist only to
 * catch a relapse into \b.
 */

/** Assertions are about code, not about comments describing what was removed. */
function codeOf(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
}

async function loadModule(file, stubs = {}) {
  const source = fs.readFileSync(file, "utf8")
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  for (const [specifier, replacement] of Object.entries(stubs)) {
    code = code.replace(
      new RegExp(`import\\s*(?:\\{[^}]*\\}|[\\w*]+)\\s*from\\s*["']${specifier.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}["'];?`, "g"),
      replacement,
    )
  }
  return import(`data:text/javascript,${encodeURIComponent(code)}`)
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`)
  }
}

// ---------------------------------------------------------------- vocabulary
const vocabulary = await loadModule("lib/voice/speech-vocabulary.ts")
const { repairTranscript, speechHintPrompt, VOICE_BRAND_TERMS } = vocabulary

console.log("\nrecognizing the words people actually say")

check("the recognizer is told the brands before it decodes", () => {
  const hint = speechHintPrompt("ru")
  assert.match(hint, /ChatGPT/, "ChatGPT must be in the prompt")
  assert.match(hint, /DeepSeek/)
  assert.ok(VOICE_BRAND_TERMS.length >= 20, "vocabulary is too small to be useful")
})

check("the hint is written in the language being spoken", () => {
  assert.match(speechHintPrompt("kk"), /[әіңғүұқөһ]/u, "Kazakh hint must be Kazakh")
  assert.match(speechHintPrompt("ru"), /[а-яё]/i)
  assert.match(speechHintPrompt("en"), /^Hi!/)
})

// The reported bug, in every spelling the recognizers produce.
for (const heard of [
  "расскажи про чат гпт",
  "расскажи про чатгпт",
  "расскажи про чад жпт",
  "расскажи про чат джи пи ти",
  "расскажи про чат джипити",
  "расскажи про чат гэпэтэ",
  "tell me about chat gpt",
]) {
  check(`"${heard}" reaches the model as ChatGPT`, () => {
    assert.match(repairTranscript(heard), /ChatGPT/)
  })
}

check("other AI brands survive the trip too", () => {
  assert.match(repairTranscript("сравни дипсик и джемини"), /DeepSeek/)
  assert.match(repairTranscript("сравни дипсик и джемини"), /Gemini/)
  assert.match(repairTranscript("открой ютуб"), /YouTube/)
  assert.match(repairTranscript("напиши в телеграмм"), /Telegram/)
})

check("площадка is repaired however it was misheard", () => {
  for (const heard of ["плошадка", "площатка", "площядка"]) {
    assert.equal(repairTranscript(`эта ${heard} работает`), "эта площадка работает", `failed on ${heard}`)
  }
})

check("a real word two edits away is left alone", () => {
  // "посадка" is a different word; snapping it to "площадка" would be a bug.
  assert.match(repairTranscript("мягкая посадка"), /посадка/)
  assert.match(repairTranscript("правильный ответ"), /ответ/)
})

check("Russian inflections are not flattened into the dictionary form", () => {
  // A plain edit-distance-1 rule rewrote every plural and oblique case:
  // "документы" -> "документ", "адреса" -> "адрес", "картинки" -> "картинка".
  const inflected = [
    "документы", "таблицы", "сервера", "адреса", "телефоны", "маршруты",
    "аккаунты", "подписки", "оплаты", "стоимости", "картинки", "интернета",
    "напоминания", "фотографии", "сообщения", "приложения", "нейросети",
  ]
  for (const value of inflected) {
    assert.equal(repairTranscript(value), value, `"${value}" must survive untouched`)
  }
})

check("a whole sentence of ordinary speech is left as it is", () => {
  const said = "открой документы и покажи адреса всех сервисов в интернете"
  assert.equal(repairTranscript(said), said)
})

check("correct text passes through unchanged, and repair is idempotent", () => {
  const clean = "Расскажи про ChatGPT и эту площадку"
  assert.equal(repairTranscript(clean), clean)
  assert.equal(repairTranscript(repairTranscript("чат гпт")), repairTranscript("чат гпт"))
})

check("capitalisation of the original word is kept", () => {
  assert.match(repairTranscript("Плошадка открыта"), /^Площадка/)
})

check("word edges are Cyrillic-safe, not \\b", () => {
  const source = codeOf("lib/voice/speech-vocabulary.ts")
  assert.ok(!/\\\\b/.test(source) && !source.includes("\\b"), "\\b never matches beside Cyrillic")
  // A brand inside a longer word must not be rewritten.
  assert.match(repairTranscript("чатгптшный"), /чатгптшный/)
})

// ------------------------------------------------------------------ language
const language = await loadModule("lib/voice/voice-language.ts", {
  "@/lib/translator/languages": `
    const TRANSLATOR_LANGUAGES = [
      { code: "ru", label: "Русский", english: "Russian" },
      { code: "en", label: "English", english: "English" },
      { code: "kk", label: "Қазақша", english: "Kazakh" },
      { code: "es", label: "Español", english: "Spanish" },
      { code: "fr", label: "Français", english: "French" },
      { code: "de", label: "Deutsch", english: "German" },
      { code: "tr", label: "Türkçe", english: "Turkish" },
      { code: "ar", label: "العربية", english: "Arabic" },
      { code: "ja", label: "日本語", english: "Japanese" },
      { code: "zh-CN", label: "中文", english: "Simplified Chinese" },
      { code: "uk", label: "Українська", english: "Ukrainian" },
    ];
    const languageEnglishName = (code) => TRANSLATOR_LANGUAGES.find((l) => l.code === code)?.english || code;
    const speechLocale = (code) => ({ ru: "ru-RU", en: "en-US", kk: "kk-KZ", es: "es-ES", ja: "ja-JP" })[code] || code;
  `,
})
const { detectSpokenLanguage, resolveVoiceLanguage, languageDirective, looksLikeLanguage } = language

console.log("\nanswering in the language that was spoken")

check("the old three-language lock is gone", () => {
  const source = codeOf("app/api/voice/turn/route.ts")
  assert.ok(!/overrides the language of the user's words/i.test(source), "the override line must be gone")
  assert.ok(!/LANGUAGE LOCK: KAZAKH ONLY/.test(source), "hardcoded per-language locks must be gone")
})

check("scripts are recognized on sight", () => {
  assert.equal(detectSpokenLanguage("こんにちは、元気ですか"), "ja")
  assert.equal(detectSpokenLanguage("안녕하세요"), "ko")
  assert.equal(detectSpokenLanguage("你好，今天怎么样"), "zh-CN")
  assert.equal(detectSpokenLanguage("مرحبا كيف حالك"), "ar")
  assert.equal(detectSpokenLanguage("Γεια σου"), "el")
})

check("Kazakh is not mistaken for Russian", () => {
  assert.equal(detectSpokenLanguage("Сәлем, қалайсың"), "kk")
  assert.equal(detectSpokenLanguage("Привет, как дела"), "ru")
  assert.equal(detectSpokenLanguage("Привіт, як справи"), "uk")
})

check("Latin languages are told apart by their own words", () => {
  assert.equal(detectSpokenLanguage("Hola, ¿cómo estás?"), "es")
  assert.equal(detectSpokenLanguage("Bonjour, comment ça va"), "fr")
  assert.equal(detectSpokenLanguage("Hallo, wie geht es dir"), "de")
  assert.equal(detectSpokenLanguage("Merhaba, nasılsın"), "tr")
  assert.equal(detectSpokenLanguage("Tell me a joke please"), "en")
})

check("a word too short to judge falls back to the picker", () => {
  assert.equal(detectSpokenLanguage("ок"), "ru")
  assert.equal(detectSpokenLanguage(""), "")
  assert.equal(resolveVoiceLanguage({ text: "", selected: "kk" }).code, "kk")
})

check("the spoken language beats the picker", () => {
  const decided = resolveVoiceLanguage({ text: "Hola, ¿qué hora es?", selected: "kk" })
  assert.equal(decided.code, "es")
  assert.equal(decided.source, "detected")
})

check("asking for a language inside the sentence beats everything", () => {
  assert.equal(resolveVoiceLanguage({ text: "ответь по-английски пожалуйста", selected: "kk" }).code, "en")
  assert.equal(resolveVoiceLanguage({ text: "скажи на испанском", selected: "ru" }).code, "es")
  assert.equal(resolveVoiceLanguage({ text: "answer in Kazakh", selected: "ru" }).code, "kk")
})

check("the directive names the language and is not empty", () => {
  const directive = languageDirective("es")
  assert.match(directive, /Spanish/)
  assert.match(languageDirective("kk"), /Kazakh/)
})

check("a reply in the wrong script is caught", () => {
  assert.equal(looksLikeLanguage("Привет, чем помочь?", "ru"), true)
  assert.equal(looksLikeLanguage("Сәлем, көмектесе аламын", "kk"), true)
  assert.equal(looksLikeLanguage("Привет", "kk"), false)
  assert.equal(looksLikeLanguage("こんにちは", "ja"), true)
  assert.equal(looksLikeLanguage("Привет", "ja"), false)
  assert.equal(looksLikeLanguage("Hola, buenos días", "es"), true)
})

// -------------------------------------------------------------------- search
const search = await loadModule("lib/voice/web-search.ts", {
  "../malik-research/search": "const searchVoiceWeb = async () => [];",
})
const { voiceSearchReason } = search

console.log("\nsearching the web when the question needs it")

check("an explicit instruction still searches", () => {
  assert.equal(voiceSearchReason("поищи в интернете про новый айфон"), "asked")
  assert.equal(voiceSearchReason("загугли это"), "asked")
  assert.equal(voiceSearchReason("интернеттен тап"), "asked")
})

check("questions about things that change search by themselves", () => {
  assert.equal(voiceSearchReason("какая сейчас погода в Алматы"), "fresh")
  assert.equal(voiceSearchReason("какой курс доллара"), "fresh")
  assert.equal(voiceSearchReason("что нового в мире"), "fresh")
  assert.equal(voiceSearchReason("сколько стоит биткоин"), "fresh")
  assert.equal(voiceSearchReason("кто сейчас президент Казахстана"), "fresh")
  assert.equal(voiceSearchReason("what is the weather today"), "fresh")
})

check("ordinary conversation does not hit the web", () => {
  assert.equal(voiceSearchReason("расскажи анекдот"), "off")
  assert.equal(voiceSearchReason("как дела"), "off")
  assert.equal(voiceSearchReason("объясни как работает двигатель"), "off")
})

check("a time word without a question is not a search", () => {
  assert.equal(voiceSearchReason("сегодня я很 устал"), "off")
  assert.equal(voiceSearchReason("сегодня я устал"), "off")
})

check("work the model does alone stays offline", () => {
  assert.equal(voiceSearchReason("переведи это на английский"), "off")
  assert.equal(voiceSearchReason("напиши стих про осень"), "off")
  assert.equal(voiceSearchReason("посчитай сколько будет 15 процентов от 2400"), "off")
  assert.equal(voiceSearchReason("найди ошибку в этом коде"), "off")
})

check("the user can switch searching off", () => {
  assert.equal(voiceSearchReason("не гугли, просто скажи своими словами"), "off")
  assert.equal(voiceSearchReason("без интернета скажи какая погода"), "off")
})

check("a failed search still produces an answer", async () => {
  const source = codeOf("lib/voice/web-search.ts")
  assert.match(source, /WEB SEARCH RETURNED NOTHING/, "an empty result must still let the model answer")
  const turn = codeOf("app/api/voice/turn/route.ts")
  assert.ok(!/searchUnavailableReply/.test(turn), "the turn must no longer bail out on an empty search")
})

check("word edges in the search rules are Cyrillic-safe", () => {
  const source = codeOf("lib/voice/web-search.ts")
  assert.ok(!source.includes("\\b"), "\\b never matches beside Cyrillic")
})

// --------------------------------------------------------------------- wiring
console.log("\nwiring")

check("the recognizer is given the hint on every path", () => {
  const router = codeOf("lib/transcribe/voice-router.ts")
  assert.match(router, /speechHintPrompt/, "the hint must reach the transcriber")
  assert.match(router, /repairTranscript/, "the transcript must be repaired after recognition")
})

check("the browser recognizer's own text is repaired as well", () => {
  const client = codeOf("components/voice/VoiceMode.tsx")
  assert.match(client, /repairTranscript/, "browser speech recognition takes no hint, so it must be repaired")
})

check("the turn understands intent instead of the literal string", () => {
  const turn = codeOf("app/api/voice/turn/route.ts")
  assert.match(turn, /Work out what the person meant/, "the assistant must be told to read intent")
  assert.match(turn, /repairTranscript/)
  assert.match(turn, /resolveVoiceLanguage/)
})

check("the client speaks the answer in the answered language", () => {
  const client = codeOf("components/voice/VoiceMode.tsx")
  assert.match(client, /languageLocale/, "the reply locale must reach speech synthesis")
})

console.log(failures ? `\n${failures} failing\n` : "\nall voice checks passed\n")
process.exit(failures ? 1 : 0)
