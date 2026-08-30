import { voiceLlmAnswer } from "@/lib/voice/voice-llm-router"
import { voiceSearchContext } from "@/lib/voice/web-search"
import { repairTranscript } from "@/lib/voice/speech-vocabulary"
import { languageDirective, looksLikeLanguage, resolveVoiceLanguage } from "@/lib/voice/voice-language"
import {
  antiRepeatNote,
  conversationRules,
  repeatsEarlierAnswer,
  sanitizeHistory,
  tierFor,
} from "@/lib/voice/conversation"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

/**
 * Spoken input is short, accented and full of half-words. The assistant is told
 * to work out the intent rather than answer the literal string, which is what
 * people mean when they say it should understand them.
 */
const COMPREHENSION = [
  "The user is speaking, so the text you receive is a transcript.",
  "It may contain accented pronunciation, missing endings, mixed Russian, Kazakh and English words, or a brand name spelled by sound.",
  "Work out what the person meant and answer that. Do not comment on the wording and never say you did not understand it.",
  "Ask a short clarifying question only when the intent is genuinely ambiguous and guessing would be wrong.",
].join(" ")

function fallbackReply(code: string) {
  if (code === "kk") return "Қазір жауап алу сәтсіз болды. Бір секундтан кейін қайта айтып көр."
  if (code.startsWith("en")) return "I couldn't get a response just now. Try saying it again in a second."
  return "Сейчас не получилось получить ответ. Попробуй сказать ещё раз через секунду."
}

export const POST = withCompute(handlePOST, "voice")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const raw = String(body?.text || body?.message || "").trim().slice(0, 6000)
  const personality = String(body?.personality || "Assistant")
  if (!raw) return Response.json({ ok: false, error: "Пустой Voice запрос" }, { status: 400 })

  // Browser speech recognition sends its text straight here without passing
  // through /api/transcribe, so the repair has to run on this path too.
  const text = repairTranscript(raw) || raw

  // What was already said. Without it every turn was answered as if it were the
  // first thing the user had ever said.
  const history = sanitizeHistory(body?.history)

  const language = resolveVoiceLanguage({ text, selected: body?.language })
  const instruction = [
    "You are Sola, the Malik AI voice assistant.",
    PERSONALITY[personality] || PERSONALITY.Assistant,
    COMPREHENSION,
    conversationRules(history.length > 0),
    languageDirective(language),
    "Never mention internal providers, routing, environment variables or API keys.",
  ].join(" ")

  try {
    const search = await voiceSearchContext(text)
    const grounded = search.context ? `${instruction}\n${search.context}` : instruction
    const tier = tierFor(text, search.sources.length > 0)

    let answer = await voiceLlmAnswer({ text, instruction: grounded, history, tier, signal: request.signal })
    let content = String(answer.content || "").trim()

    if (!content || !looksLikeLanguage(content, language.code)) {
      answer = await voiceLlmAnswer({
        text: `Answer this user request again, in ${language.english} only. USER REQUEST:\n${text}`,
        instruction: `${grounded} The previous answer was not in ${language.english}. A second miss is not allowed.`,
        history,
        tier,
        signal: request.signal,
      })
      content = String(answer.content || "").trim()
    }

    // A small model in a spoken loop will happily give the same answer twice.
    // One retry, told exactly what it already said, with more freedom to vary.
    let repeated = false
    if (content && repeatsEarlierAnswer(content, history)) {
      repeated = true
      const retry = await voiceLlmAnswer({
        text,
        instruction: `${grounded}\n${antiRepeatNote(history)}`,
        history,
        tier,
        temperature: 0.8,
        signal: request.signal,
      })
      const fresh = String(retry.content || "").trim()
      if (fresh && !repeatsEarlierAnswer(fresh, history) && looksLikeLanguage(fresh, language.code)) {
        answer = retry
        content = fresh
        repeated = false
      }
    }

    if (!content) content = fallbackReply(language.code)

    return Response.json({
      ok: true,
      content,
      personality,
      language: language.code,
      languageName: language.english,
      languageLocale: language.locale,
      languageSource: language.source,
      transcript: text,
      turns: history.length,
      tier,
      repeated,
      provider: answer.provider,
      model: answer.model,
      usedWeb: search.sources.length > 0,
      searchRequested: search.requested,
      searchReason: search.reason,
      sources: search.sources,
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("[VOICE_TURN_ERROR]", error instanceof Error ? error.message : error)
    return Response.json({
      ok: true,
      content: fallbackReply(language.code),
      personality,
      language: language.code,
      languageLocale: language.locale,
      provider: "voice-local-fallback",
      model: "none",
    }, { headers: { "cache-control": "no-store" } })
  }
}
