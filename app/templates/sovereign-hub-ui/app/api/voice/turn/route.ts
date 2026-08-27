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

  // Kazakh always wins first. Special Kazakh Cyrillic letters are the strongest
  // signal; common words cover short phrases that may not contain them.
  if (
    /[әіңғүұқөһ]/i.test(text) ||
    /\b(сәлем|салем|қалай|калай|жақсы|жаксы|қазақ|казак|қазақстан|казахстан|рахмет|рақмет|керек|болады|болмайды|иә|ия|жоқ|жок|менің|сенің|біздің|сіздің|қайда|кайда|қанша|канша|неге|осы|бұл|бул)\b/i.test(normalized)
  ) return "kk"

  if (/[а-яё]/i.test(text)) return "ru"
  return "en"
}

function languageInstruction(language: VoiceLanguage) {
  if (language === "kk") {
    return [
      "Respond ONLY in natural modern Kazakh using Cyrillic Kazakh spelling.",
      "Do not mix Russian or English words into sentences unless an exact brand, product, code identifier, URL, or proper name requires it.",
      "Never transliterate Kazakh with Latin or Russian spelling when a normal Kazakh word exists.",
      "Keep pronunciation-friendly sentences suitable for clear text-to-speech.",
    ].join(" ")
  }

  if (language === "ru") {
    return [
      "Respond ONLY in natural Russian.",
      "Do not mix Kazakh or English into sentences unless an exact brand, product, code identifier, URL, or proper name requires it.",
      "Do not transliterate Russian words into Latin letters.",
      "Keep pronunciation-friendly sentences suitable for clear text-to-speech.",
    ].join(" ")
  }

  return [
    "Respond ONLY in natural English.",
    "Do not mix Russian or Kazakh into sentences unless an exact proper name requires it.",
    "Keep pronunciation-friendly sentences suitable for clear text-to-speech.",
  ].join(" ")
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

  const language = detectVoiceLanguage(text)
  const personalityInstruction = PERSONALITY[personality] || PERSONALITY.Assistant
  const instruction = [
    "You are Sola, the Malik AI voice assistant.",
    personalityInstruction,
    languageInstruction(language),
    "Preserve the user's intended language even when the transcription contains one or two foreign-looking tokens.",
    "Never output mixed-script gibberish or half-transliterated words.",
    "Never mention GitHub Models, OpenRouter, DeepSeek, Render environment variables, internal provider routing, or missing API keys to the user.",
    "If a provider is unavailable, the server will handle fallback. Just answer the user's request naturally.",
  ].join(" ")

  try {
    const answer = await voiceLlmAnswer({ text, instruction })
    const content = String(answer.content || "").trim()
    if (!content) throw new Error("empty voice answer")

    return Response.json({
      ok: true,
      content,
      personality,
      language,
      provider: answer.provider,
      model: answer.model,
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("[VOICE_TURN_ERROR]", error instanceof Error ? error.message : error)
    return Response.json({
      ok: true,
      content: localFallback(language),
      personality,
      language,
      provider: "voice-local-fallback",
      model: "none",
    }, { headers: { "cache-control": "no-store" } })
  }
}
