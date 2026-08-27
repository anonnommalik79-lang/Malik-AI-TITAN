import { voiceLlmAnswer } from "@/lib/voice/voice-llm-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERSONALITY: Record<string, string> = {
  Assistant: "Be a natural, concise voice assistant. Answer directly in the user's language. Use short spoken sentences and no markdown unless necessary.",
  Therapist: "Use a calm reflective conversational style. Listen carefully, ask useful gentle questions, and avoid diagnosing or presenting yourself as a medical professional.",
  Storyteller: "Answer like a vivid storyteller with natural pacing, imagery and a clear narrative arc while staying concise enough for speech.",
  "Kids Story Time": "Use a friendly age-appropriate storytelling voice. Keep content safe, simple, warm and easy to follow aloud.",
  "Kids Trivia Game": "Run a friendly spoken trivia game. Ask one clear question at a time, wait for the user's answer, then react and continue.",
  Meditation: "Use very calm, brief sentences suitable for spoken meditation. Avoid urgency and keep a slow, grounded rhythm.",
  Motivation: "Use an energetic, practical coaching style. Be specific, concise and encouraging without hype or pressure.",
  Romantic: "Use a warm, gentle, emotionally expressive conversational style while respecting boundaries and keeping the response tasteful.",
  Argumentative: "Challenge claims constructively. Point out weak assumptions, offer counterarguments and stay respectful and evidence-oriented.",
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body?.text || body?.message || "").trim().slice(0, 6000)
  const personality = String(body?.personality || "Assistant")
  if (!text) return Response.json({ ok: false, error: "Пустой Voice запрос" }, { status: 400 })

  const personalityInstruction = PERSONALITY[personality] || PERSONALITY.Assistant
  const instruction = [
    "You are Sola, the Malik AI voice assistant.",
    personalityInstruction,
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
      provider: answer.provider,
      model: answer.model,
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("[VOICE_TURN_ERROR]", error instanceof Error ? error.message : error)

    // Never send Voice back into the legacy normal-chat router. That old path
    // can expose internal provider/env diagnostics in the spoken UI. Keep the
    // failure inside Voice and give it a short sentence that TTS can say.
    return Response.json({
      ok: true,
      content: "Сейчас не получилось получить ответ. Попробуй сказать ещё раз через секунду.",
      personality,
      provider: "voice-local-fallback",
      model: "none",
    }, { headers: { "cache-control": "no-store" } })
  }
}
