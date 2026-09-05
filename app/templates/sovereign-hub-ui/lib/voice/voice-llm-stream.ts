/**
 * The answer, word by word, and the model chosen by the language it is in.
 *
 * Two problems, one file.
 *
 * THE WAIT. Nothing was spoken until the whole answer existed. The reply is
 * synthesized in pieces and the pieces are already pipelined, so the only thing
 * left between the end of a question and the first sound is the model finishing
 * a paragraph nobody has heard yet. Streaming removes it: the first sentence
 * goes to the speech engine while the rest is still being written, which is
 * what every assistant that feels instant is actually doing.
 *
 * KAZAKH. Voice sent every turn to the head of the shared provider chain -
 * whatever is fastest and configured. For Russian and English that is fine.
 * For Kazakh it is the whole complaint: an open-weights model of twenty-odd
 * billion parameters has seen very little Kazakh, and what comes back is
 * grammatical mush that reads as stupidity. Nothing in the recognizer or the
 * speech engine can fix an answer that was written badly. Kazakh goes to Gemini
 * first, which speaks it properly, and everything else keeps the fast chain.
 *
 * Both providers are spoken to through the same OpenAI-shaped endpoint, so
 * there is one streaming client rather than two.
 */

import type { VoiceMessage } from "./conversation"

export type StreamedAnswer = {
  content: string
  provider: string
  model: string
}

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

type Endpoint = { provider: string; baseUrl: string; keys: string[]; models: string[] }

function groq(): Endpoint {
  return {
    provider: "groq",
    baseUrl: (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    keys: unique([env("GROQ_VOICE_API_KEY"), env("GROQ_API_KEY")]),
    models: unique([env("GROQ_VOICE_LLM_MODEL"), env("VOICE_LLM_GROQ_MODEL"), "openai/gpt-oss-20b"]),
  }
}

function gemini(): Endpoint {
  return {
    provider: "gemini",
    // Gemini's OpenAI-compatible surface, so one client covers both providers.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keys: unique([env("GEMINI_VOICE_API_KEY"), env("GEMINI_API_KEY"), env("GOOGLE_GENERATIVE_AI_API_KEY"), env("GOOGLE_AI_API_KEY")]),
    models: unique([env("VOICE_LLM_KAZAKH_MODEL"), "gemini-2.5-flash", "gemini-flash-latest"]),
  }
}

/**
 * Who answers, given the language being spoken.
 *
 * Kazakh first goes to the model that speaks Kazakh, then falls back to the
 * fast chain rather than failing - a mediocre answer beats no answer. Every
 * other language keeps the order it always had, because for those the fast
 * model is not the problem.
 */
export function providersFor(languageCode: string): Endpoint[] {
  const code = String(languageCode || "").toLowerCase()
  const kazakhFirst = env("VOICE_LLM_KAZAKH_PROVIDER") !== "off"
  return code.startsWith("kk") && kazakhFirst ? [gemini(), groq()] : [groq(), gemini()]
}

function messages(instruction: string, text: string, history: VoiceMessage[]) {
  return [
    { role: "system", content: instruction },
    ...history.map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: text },
  ]
}

/**
 * Reads one OpenAI-style stream, handing over each piece of text as it lands.
 *
 * The body arrives as `data: {...}` lines, and a chunk boundary can fall in the
 * middle of one - so the tail is carried to the next read rather than parsed
 * and thrown away, which is the bug every hand-written SSE reader has once.
 */
async function readStream(response: Response, onDelta: (text: string) => void): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  let buffer = ""
  let full = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let cut = buffer.indexOf("\n")
    while (cut !== -1) {
      const line = buffer.slice(0, cut).trim()
      buffer = buffer.slice(cut + 1)
      cut = buffer.indexOf("\n")

      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === "[DONE]") continue
      try {
        const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content
        if (typeof piece === "string" && piece) {
          full += piece
          onDelta(piece)
        }
      } catch {
        // A malformed line is not worth abandoning a working stream over.
      }
    }
  }
  return full
}

/**
 * Streams an answer, trying each provider and each key until one speaks.
 *
 * Returns null rather than throwing when nothing works, because the caller's
 * answer to that is always the same: fall back to the request that waits for
 * the whole answer. A slower reply is not a failure; no reply is.
 */
export async function streamVoiceAnswer(input: {
  instruction: string
  text: string
  history?: VoiceMessage[]
  languageCode: string
  temperature?: number
  signal?: AbortSignal
  onDelta: (text: string) => void
}): Promise<StreamedAnswer | null> {
  const history = input.history || []
  const timeoutMs = Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000)

  for (const endpoint of providersFor(input.languageCode)) {
    if (!endpoint.keys.length) continue

    for (const model of endpoint.models) {
      for (const key of endpoint.keys) {
        const controller = new AbortController()
        const abort = () => controller.abort()
        input.signal?.addEventListener("abort", abort, { once: true })
        // The clock is on the first token, not on the whole answer: a long
        // reply that is arriving is working, and killing it mid-sentence would
        // be worse than waiting.
        const timer = setTimeout(abort, timeoutMs)
        let started = false

        try {
          const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            cache: "no-store",
            signal: controller.signal,
            body: JSON.stringify({
              model,
              messages: messages(input.instruction, input.text, history),
              max_tokens: Number(process.env.VOICE_LLM_MAX_OUTPUT_TOKENS || 320),
              temperature: input.temperature ?? Number(process.env.VOICE_LLM_TEMPERATURE || 0.45),
              stream: true,
            }),
          })

          if (!response.ok) {
            console.warn(`[VOICE_LLM_STREAM] ${endpoint.provider} ${model} status=${response.status}`)
            continue
          }

          const content = (await readStream(response, (piece) => {
            if (!started) {
              started = true
              clearTimeout(timer)
            }
            input.onDelta(piece)
          })).trim()

          if (content) return { content, provider: endpoint.provider, model }
        } catch (error) {
          if (input.signal?.aborted) return null
          console.warn(`[VOICE_LLM_STREAM] ${endpoint.provider} ${model}`, error instanceof Error ? error.message : error)
        } finally {
          clearTimeout(timer)
          input.signal?.removeEventListener("abort", abort)
        }
      }
    }
  }

  return null
}

/**
 * The first complete sentence in a growing string, and what is left over.
 *
 * Speech can start on a sentence; it cannot start on half of one. This is what
 * decides when there is enough to hand to the speech engine, and it is
 * deliberately conservative: a fragment spoken early sounds broken, and the
 * whole point of streaming is that it does not.
 */
export function takeSentence(buffer: string, force = false): { sentence: string; rest: string } {
  // Every place a sentence could end, tried in order. Stopping at the first one
  // is wrong: "Сәлем! Қалай көмектесе аламын?" ends twice, and the first ending
  // is a one-word greeting that is not worth a whole speech request on its own.
  const terminator = /[.!?…]+["»)]?(\s|$)/g
  let match: RegExpExecArray | null
  while ((match = terminator.exec(buffer)) !== null) {
    const end = match.index + match[0].length
    const sentence = buffer.slice(0, end).trim()
    // Two words is not a thought, it is an abbreviation or a number. Waiting
    // for more costs nothing; saying "3." out loud is a mistake you hear.
    if (sentence.split(/\s+/).filter(Boolean).length >= 3) {
      return { sentence, rest: buffer.slice(end) }
    }
  }

  // Nothing has ended, and enough has arrived that waiting for a full stop
  // would cost more than breaking at a clause.
  //
  // 120 characters is about eight seconds of speech. This only ever fires on a
  // model writing a long run-on without terminal punctuation, and the whole
  // point of streaming is that the first sound is not held hostage to one.
  if (buffer.length >= 120) {
    const comma = buffer.lastIndexOf(",", 120)
    if (comma > 45) return { sentence: buffer.slice(0, comma + 1).trim(), rest: buffer.slice(comma + 1) }
  }

  if (force && buffer.trim()) return { sentence: buffer.trim(), rest: "" }
  return { sentence: "", rest: buffer }
}
