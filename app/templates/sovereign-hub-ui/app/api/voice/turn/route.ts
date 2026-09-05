import { voiceLlmAnswer } from "@/lib/voice/voice-llm-router"
import { streamVoiceAnswer, takeSentence } from "@/lib/voice/voice-llm-stream"
import { voiceSearchContext } from "@/lib/voice/web-search"
import { repairTranscript } from "@/lib/voice/speech-vocabulary"
import { languageDirective, looksLikeLanguage, resolveVoiceLanguage } from "@/lib/voice/voice-language"
import { answersKazakhGreeting, kazakhGreeting, kazakhGreetingFallback, spokenIntentInstruction } from "@/lib/voice/spoken-intent"
import type { VoiceMessage } from "@/lib/voice/conversation"
import {
  antiRepeatNote,
  conversationRules,
  repeatsEarlierAnswer,
  sanitizeHistory,
  tierFor,
} from "@/lib/voice/conversation"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { appendFounderMessage } from "@/lib/server/founder-message-log"
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
  "Work out what the person meant and answer that. Do not give an etymology or invent a person's name when the user is simply talking to you.",
  "Ask a short clarifying question only when the intent is genuinely ambiguous and guessing would be wrong.",
  // The repair table upstream can only fix spellings that are not real words.
  // "чат гпт" heard as "чаче" cannot be rewritten there - "чаче" is a real
  // Russian word - so the model is told what these conversations are about and
  // resolves it from context, which is what a person does with a mumbled name.
  "A garbled word in a sentence about AI, models or software is almost always one of these:",
  "ChatGPT, GPT, Claude, Gemini, DeepSeek, Copilot, Perplexity, Midjourney, Stable Diffusion, Malik AI,",
  "GitHub, Figma, Notion, Telegram, WhatsApp, Instagram, TikTok, YouTube, Kaspi, JavaScript, TypeScript, Python, React, Next.js.",
  "Read it as the one that fits and answer about that, without commenting on the mishearing.",
  "\"Чем Claude отличается от чаче\" is a question about ChatGPT.",
].join(" ")

/**
 * This answer is going to be read aloud, and that changes what a good answer
 * is. Everything a written reply uses to organise itself - headings, bullets,
 * bold, links, code - is either read out as noise by a speech engine or
 * silently dropped, and a paragraph that scans in two seconds on screen takes
 * twenty to listen to. The comparison being made is with assistants whose
 * spoken replies are two or three sentences long, and this is most of why
 * theirs feel quick.
 */
const SPOKEN_OUTPUT = [
  "Your answer will be spoken aloud, not shown as text.",
  "Reply in one to three short sentences unless the user explicitly asked for detail or for a list.",
  "Write plain speech only: no markdown, no asterisks, no bullet points, no numbered lists, no headings, no code blocks, no URLs and no emoji.",
  "Write numbers, dates and units the way they are said out loud rather than as digits and symbols.",
  "If the full answer is genuinely long, say the short version and offer to go deeper.",
].join(" ")

function fallbackReply(code: string) {
  if (code === "kk") return "Қазір жауап алу сәтсіз болды. Бір секундтан кейін қайта айтып көр."
  if (code.startsWith("en")) return "I couldn't get a response just now. Try saying it again in a second."
  return "Сейчас не получилось получить ответ. Попробуй сказать ещё раз через секунду."
}

function voiceIdentity(user: Awaited<ReturnType<typeof getOptionalWorkOSAuth>>["user"]) {
  if (!user?.email) return { authenticated: false, userId: "guest" }
  if (!user.emailVerified) return { authenticated: true, userId: `workos:${user.id}` }
  return { authenticated: true, userId: user.email.trim().toLowerCase() }
}

async function recordVoiceTurn(input: {
  authenticated: boolean
  userId: string
  text: string
  content: string
  provider: string
  model: string
}) {
  if (!input.authenticated) return
  await appendFounderMessage({
    userId: input.userId,
    source: "voice",
    userText: input.text,
    assistantText: input.content,
    provider: input.provider,
    model: input.model,
  }).catch((error) => {
    console.warn("[FOUNDER MESSAGE LOG] voice write skipped", error instanceof Error ? error.message : error)
  })
}

/**
 * The streaming answer.
 *
 * The response goes out before the model has finished, and the pieces follow as
 * they are written - that is the point, and the first version of this file got
 * it wrong by awaiting the whole answer and then sending it in one go, which is
 * the old behaviour wearing a stream's clothes.
 *
 * The guard is on the server. The first sentence is held back until it has been
 * checked - right language, not a repeat of something already said - and only
 * then does anything leave for the speech engine. So the client never has to
 * un-say a sentence: either the stream was good, or the guard caught it and the
 * answer is rewritten here, on the same connection, before a word is spoken.
 */
function streamingResponse(input: {
  instruction: string
  text: string
  history: VoiceMessage[]
  language: ReturnType<typeof resolveVoiceLanguage>
  personality: string
  tier: ReturnType<typeof tierFor>
  search: Awaited<ReturnType<typeof voiceSearchContext>>
  signal: AbortSignal
  authenticated: boolean
  userId: string
}): Response {
  const { instruction, text, history, language, personality, tier, search, signal, authenticated, userId } = input
  const encoder = new TextEncoder()
  const frame = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(frame(event, data)) } catch {}
      }

      send("meta", {
        language: language.code,
        languageName: language.english,
        languageLocale: language.locale,
        transcript: text,
        personality,
      })

      let pending = ""
      let cleared = false
      let abandoned = false
      let spoken = ""

      const answer = await streamVoiceAnswer({
        instruction,
        text,
        history,
        languageCode: language.code,
        signal,
        onDelta: (piece) => {
          if (abandoned) return
          if (cleared) {
            spoken += piece
            send("delta", { text: piece })
            return
          }

          pending += piece
          const { sentence, rest } = takeSentence(pending)
          if (!sentence) return

          // The two checks worth stopping for, both local and both cheap: the
          // wrong language, and an answer already given a moment ago.
          if (!looksLikeLanguage(sentence, language.code) || repeatsEarlierAnswer(sentence, history)) {
            abandoned = true
            return
          }

          cleared = true
          pending = rest
          const opening = sentence + (rest ? " " : "")
          spoken += opening
          send("delta", { text: opening })
        },
      }).catch(() => null)

      let content = ""
      let provider = "stream"
      let model = "auto"

      if (!abandoned && answer) {
        // Whatever followed the last full stop never passed through the guard.
        content = (cleared ? spoken + pending : answer.content).trim()
        if (!cleared && content) send("delta", { text: content })
        else if (pending.trim()) send("delta", { text: pending })
        provider = answer.provider
        model = answer.model
      }

      // The stream was refused, or it said the wrong thing in the wrong
      // language. Nothing has been spoken yet, so the answer is simply written
      // again - once, told exactly what it got wrong.
      if (!content || !looksLikeLanguage(content, language.code)) {
        try {
          const retry = await voiceLlmAnswer({
            text,
            instruction: abandoned
              ? `${instruction} The previous attempt answered in the wrong language or repeated an earlier answer. Answer in ${language.english}, and say something new.`
              : instruction,
            history,
            tier,
            temperature: abandoned ? 0.8 : undefined,
            signal,
            userId,
            languageCode: language.code,
          })
          const fresh = String(retry.content || "").trim()
          content = fresh && looksLikeLanguage(fresh, language.code) ? fresh : fallbackReply(language.code)
          provider = retry.provider
          model = retry.model
        } catch {
          content = fallbackReply(language.code)
          provider = "voice-local-fallback"
          model = "none"
        }
        send("delta", { text: content })
      }

      await recordVoiceTurn({ authenticated, userId, text, content, provider, model })

      send("done", {
        ok: true,
        content,
        personality,
        language: language.code,
        languageName: language.english,
        languageLocale: language.locale,
        transcript: text,
        turns: history.length,
        tier,
        provider,
        model,
        usedWeb: search.sources.length > 0,
        sources: search.sources,
      })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  })
}

export const POST = withCompute(handlePOST, "voice")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const raw = String(body?.text || body?.message || "").trim().slice(0, 6000)
  const personality = String(body?.personality || "Assistant")
  if (!raw) return Response.json({ ok: false, error: "Пустой Voice запрос" }, { status: 400 })

  const { user } = await getOptionalWorkOSAuth()
  const identity = voiceIdentity(user)

  // Browser speech recognition sends its text straight here without passing
  // through /api/transcribe, so the repair has to run on this path too.
  const text = repairTranscript(raw) || raw

  // What was already said. Without it every turn was answered as if it were the
  // first thing the user had ever said.
  const history = sanitizeHistory(body?.history)

  const greeting = kazakhGreeting(text)
  const language = resolveVoiceLanguage({ text: greeting ? "Қалайсың?" : text, selected: body?.language })
  const instruction = [
    "You are Sola, the Malik AI voice assistant.",
    PERSONALITY[personality] || PERSONALITY.Assistant,
    COMPREHENSION,
    SPOKEN_OUTPUT,
    conversationRules(history.length > 0),
    languageDirective(language),
    spokenIntentInstruction(text, language.code),
    "Never mention internal providers, routing, environment variables or API keys.",
  ].join(" ")

  try {
    const search = await voiceSearchContext(text)
    const grounded = search.context ? `${instruction}\n${search.context}` : instruction
    const tier = tierFor(text, search.sources.length > 0)

    // Speech can start on the first sentence instead of on the last one, which
    // is the whole of the "долго готовит голос" complaint: the pieces were
    // always pipelined, so the only thing between the question ending and the
    // first sound was the model finishing a paragraph nobody had heard.
    //
    // A Kazakh greeting is the one case that opts out. Its answer is repaired
    // after the fact when the model misses the intent, and a repair cannot be
    // applied to something already spoken aloud.
    if (body?.stream && !greeting) {
      return streamingResponse({
        instruction: grounded,
        text,
        history,
        language,
        personality,
        tier,
        search,
        signal: request.signal,
        authenticated: identity.authenticated,
        userId: identity.userId,
      })
    }

    let answer = await voiceLlmAnswer({
      text,
      instruction: grounded,
      history,
      tier,
      signal: request.signal,
      userId: identity.userId,
      languageCode: language.code,
    })
    let content = String(answer.content || "").trim()
    let correctedGreeting = false

    // A wrong answer can contain Kazakh letters and still miss the meaning.
    // Keep the normal model response when it fits; repair this narrow social
    // intent without another paid request if it invents a name/definition.
    if (greeting && (!looksLikeLanguage(content, language.code) || !answersKazakhGreeting(content))) {
      content = kazakhGreetingFallback(greeting)
      correctedGreeting = true
    }

    if (!content || !looksLikeLanguage(content, language.code)) {
      answer = await voiceLlmAnswer({
        text: `Answer this user request again, in ${language.english} only. USER REQUEST:\n${text}`,
        instruction: `${grounded} The previous answer was not in ${language.english}. A second miss is not allowed.`,
        history,
        tier,
        signal: request.signal,
        userId: identity.userId,
        languageCode: language.code,
      })
      content = String(answer.content || "").trim()
    }

    // A small model in a spoken loop will happily give the same answer twice.
    // One retry, told exactly what it already said, with more freedom to vary.
    let repeated = false
    if (content && !greeting && repeatsEarlierAnswer(content, history)) {
      repeated = true
      const retry = await voiceLlmAnswer({
        text,
        instruction: `${grounded}\n${antiRepeatNote(history)}`,
        history,
        tier,
        temperature: 0.8,
        signal: request.signal,
        userId: identity.userId,
        languageCode: language.code,
      })
      const fresh = String(retry.content || "").trim()
      if (fresh && !repeatsEarlierAnswer(fresh, history) && looksLikeLanguage(fresh, language.code)) {
        answer = retry
        content = fresh
        repeated = false
      }
    }

    if (!content || !looksLikeLanguage(content, language.code)) content = fallbackReply(language.code)

    await recordVoiceTurn({
      authenticated: identity.authenticated,
      userId: identity.userId,
      text,
      content,
      provider: answer.provider,
      model: answer.model,
    })

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
      correctedGreeting,
      provider: answer.provider,
      model: answer.model,
      usedWeb: search.sources.length > 0,
      searchRequested: search.requested,
      searchReason: search.reason,
      sources: search.sources,
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("[VOICE_TURN_ERROR]", error instanceof Error ? error.message : error)
    const content = fallbackReply(language.code)
    await recordVoiceTurn({
      authenticated: identity.authenticated,
      userId: identity.userId,
      text,
      content,
      provider: "voice-local-fallback",
      model: "none",
    })
    return Response.json({
      ok: true,
      content,
      personality,
      language: language.code,
      languageLocale: language.locale,
      provider: "voice-local-fallback",
      model: "none",
    }, { headers: { "cache-control": "no-store" } })
  }
}
