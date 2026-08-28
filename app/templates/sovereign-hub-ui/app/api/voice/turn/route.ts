import { voiceLlmAnswer } from "@/lib/voice/voice-llm-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type VoiceLanguage = "kk" | "ru" | "en"

const PERSONALITY: Record<string, string> = {
  Assistant: "Be a natural, concise voice assistant. Use short spoken sentences and no markdown unless necessary.",
  Therapist: "Use a calm reflective conversational style. Listen carefully, ask useful gentle questions, and avoid diagnosing or presenting yourself as a medical professional.",
  Storyteller: "Answer like a vivid storyteller with natural pacing, imagery and a clear narrative arc while staying concise enough for speech.",
  "Kids Story Time": "Use a friendly age-appropriate storytelling voice. Keep content safe, simple, warm and easy to follow aloud.",
  "Kids Trivia Game": "Run a friendly spoken trivia game. Ask one clear question at a time, wait for the user's answer, then react and continue.",
  Meditation: "Use very calm, brief sentences suitable for spoken meditation. Avoid urgency and keep a slow, grounded rhythm.",
  Motivation: "Use an energetic, practical coaching style. Be specific, concise and encouraging without hype or pressure.",
  Romantic: "Use a warm, gentle, emotionally expressive conversational style while respecting boundaries and keeping the response tasteful.",
  Argumentative: "Challenge claims constructively. Point out weak assumptions, offer counterarguments and stay respectful and evidence-oriented.",
}

function detectVoiceLanguage(text: string): VoiceLanguage {
  const normalized = text.toLowerCase()
  if (/[әіңғүұқөһ]/i.test(text) || /\b(сәлем|салем|қалай|калай|жақсы|жаксы|қазақ|казак|қазақстан|казахстан|рахмет|рақмет|керек|болады|болмайды|иә|ия|жоқ|жок|менің|сенің|біздің|сіздің|қайда|кайда|қанша|канша|неге|осы|бұл|бул)\b/i.test(normalized)) return "kk"
  if (/[а-яё]/i.test(text)) return "ru"
  return "en"
}

function requestedLanguage(value: unknown): VoiceLanguage | null {
  return value === "kk" || value === "ru" || value === "en" ? value : null
}

function languageInstruction(language: VoiceLanguage) {
  if (language === "kk") return "LANGUAGE LOCK: KAZAKH ONLY. Respond ONLY in natural modern Kazakh using Cyrillic Kazakh spelling. Never answer in English or Russian. Do not mix Russian or English words except exact brands, code identifiers, URLs or proper names. Use normal Kazakh words whenever they exist. Keep pronunciation-friendly sentences suitable for TTS."
  if (language === "ru") return "LANGUAGE LOCK: RUSSIAN ONLY. Respond ONLY in natural Russian. Never answer in English or Kazakh. Do not mix other languages except exact brands, code identifiers, URLs or proper names. Keep pronunciation-friendly sentences suitable for TTS."
  return "LANGUAGE LOCK: ENGLISH ONLY. Respond ONLY in natural English. Never answer in Russian or Kazakh except an exact proper name. Keep pronunciation-friendly sentences suitable for TTS."
}

function matchesLanguage(text: string, language: VoiceLanguage) {
  if (language === "kk") return /[әіңғүұқөһ]/i.test(text) || /\b(мен|сен|сіз|бұл|осы|және|үшін|қалай|жақсы|керек|бар|жоқ|иә|рақмет|сәлем|қазақ|қазір|болады)\b/i.test(text)
  if (language === "ru") return /[а-яё]/i.test(text) && !/[әіңғүұқөһ]/i.test(text)
  return /[a-z]/i.test(text) && !/[а-яёәіңғүұқөһ]/i.test(text)
}

function localFallback(language: VoiceLanguage) {
  if (language === "kk") return "Қазір жауап алу сәтсіз болды. Бір секундтан кейін қайта айтып көр."
  if (language === "ru") return "Сейчас не получилось получить ответ. Попробуй сказать ещё раз через секунду."
  return "I couldn't get a response just now. Try saying it again in a second."
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body?.text || body?.message || "").trim().slice(0, 6000)
  const personality = String(body?.personality || "Assistant")
  if (!text) return Response.json({ ok: false, error: "Пустой Voice запрос" }, { status: 400 })

  const language = requestedLanguage(body?.language) || detectVoiceLanguage(text)
  const personalityInstruction = PERSONALITY[personality] || PERSONALITY.Assistant
  const instruction = [
    "You are Sola, the Malik AI voice assistant.",
    personalityInstruction,
    languageInstruction(language),
    "The selected Voice language overrides the language of the user's words. This is mandatory.",
    "Never output mixed-script gibberish or half-transliterated words.",
    "Never mention internal providers, routing, environment variables, or API keys.",
  ].join(" ")

  try {
    let answer = await voiceLlmAnswer({ text, instruction })
    let content = String(answer.content || "").trim()

    if (!content || !matchesLanguage(content, language)) {
      answer = await voiceLlmAnswer({
        text: `Answer this user request again. Obey the selected language lock exactly. USER REQUEST:\n${text}`,
        instruction: `${instruction} Previous output violated the language lock. A second violation is not allowed.`,
      })
      content = String(answer.content || "").trim()
    }

    if (!content || !matchesLanguage(content, language)) content = localFallback(language)

    return Response.json({ ok: true, content, personality, language, provider: answer.provider, model: answer.model }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("[VOICE_TURN_ERROR]", error instanceof Error ? error.message : error)
    return Response.json({ ok: true, content: localFallback(language), personality, language, provider: "voice-local-fallback", model: "none" }, { headers: { "cache-control": "no-store" } })
  }
}
