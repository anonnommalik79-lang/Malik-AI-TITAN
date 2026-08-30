import type { VideoGenerateInput } from "../types"

export type TitanVideoProviderId = "dashscope" | "pollo" | "runway" | "fal" | "luma" | "veo"

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY
}
function runwayKey() {
  return process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY
}
function veoKey() {
  return process.env.GOOGLE_VEO_API_KEY || process.env.VEO_API_KEY
}
function dashscopeKey() {
  return process.env.DASHSCOPE_API_KEY?.trim() || ""
}

export function dashscopeVideoModel() {
  return process.env.DASHSCOPE_VIDEO_MODEL?.trim() || "wan2.7-t2v-2026-06-12"
}

function dashscopeApiBase() {
  const raw = process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com/api/v1"
  return raw.replace(/\/$/, "")
}

function dashscopeCompatibleBase() {
  const explicit = process.env.DASHSCOPE_COMPATIBLE_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")
  try {
    const url = new URL(dashscopeApiBase())
    return `${url.origin}/compatible-mode/v1`
  } catch {
    return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  }
}

async function compileDashscopeVideoPrompt(prompt: string, generateAudio: boolean) {
  const key = dashscopeKey()
  if (!key || process.env.DASHSCOPE_VIDEO_PROMPT_COMPILER === "false") return null

  try {
    const response = await fetch(`${dashscopeCompatibleBase()}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // This step turns the user's Russian or Kazakh into the English prompt
        // the renderer actually sees, so it decides whether the video matches
        // what was asked for. A smaller model saved about five seconds out of
        // two minutes and put that fidelity at risk, which is not a trade worth
        // making: the speed comes from clip duration instead.
        model: process.env.DASHSCOPE_PROMPT_MODEL || "qwen-plus",
        temperature: 0.15,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content: [
              "You are the MalikVideo prompt compiler.",
              "Rewrite the user's Russian, Kazakh, English, slang, typo-heavy or mixed-language request into one precise English cinematic video-generation prompt.",
              "Preserve every requested subject, action, place, number, camera instruction, style and constraint. Do not invent a different plot.",
              "If the user includes spoken dialogue in Russian or Kazakh, keep the quoted dialogue EXACTLY in the original language and label the spoken language.",
              generateAudio
                ? "Include natural synchronized ambience, sound effects and requested speech/audio details."
                : "Do not add speech or sound instructions.",
              "Return only the final generation prompt, no explanation and no markdown.",
            ].join(" "),
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(Number(process.env.DASHSCOPE_PROMPT_TIMEOUT_MS || 12_000)),
    })
    const payload = await response.json().catch(() => ({}))
    const compiled = payload?.choices?.[0]?.message?.content
    if (response.ok && typeof compiled === "string" && compiled.trim() && keptTheRequest(prompt, compiled)) {
      return compiled.trim()
    }
    // null, not the original: the caller then lets DashScope do the rewrite
    // itself rather than sending a raw Russian sentence to the renderer.
    return null
  } catch {
    return null
  }
}

/**
 * Whether the English rewrite still describes what was actually asked for.
 *
 * The rewrite is the only thing the renderer sees, so anything it drops is
 * simply absent from the video, and there is no way to tell from the result
 * which step lost it. Three things are checked because they are the ones that
 * change the meaning of a shot rather than its wording:
 *
 * - numbers ("три кота", "1980-е") - a dropped or altered count is a different
 *   scene;
 * - quoted dialogue, which the compiler is told to carry over verbatim;
 * - length, because a one-line answer to a paragraph-long request means the
 *   model summarised instead of translating.
 *
 * A failed check discards the rewrite rather than repairing it: the raw request
 * then goes to DashScope with its own extender enabled, which is slower but
 * never silently drops half the scene.
 */
export function keptTheRequest(original: string, compiled: string) {
  const text = compiled.trim()
  if (!text) return false

  const originalWords = original.trim().split(/\s+/).filter(Boolean).length
  const compiledWords = text.split(/\s+/).filter(Boolean).length
  // A cinematic rewrite is normally longer than the request; far shorter means
  // detail was thrown away.
  if (originalWords >= 8 && compiledWords < originalWords * 0.6) return false

  const lower = text.toLowerCase()

  // Counts as digits: "1980-е", "5 человек".
  const digitsIn = (value: string) => (value.match(/\d+/g) || []).filter((n) => n.length <= 4)
  const wantedDigits = digitsIn(original)
  if (wantedDigits.length) {
    const got = new Set(digitsIn(text))
    // A digit rendered as an English word is a correct translation, not a loss.
    const spelled = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|hundred|thousand)\b/i.test(text)
    if (wantedDigits.some((n) => !got.has(n)) && !spelled) return false
  }

  // Counts written as words. "три кота" carries no digit at all, so a rewrite
  // that says "a cat" passed the digit check while describing a different
  // scene. One and its forms are left out: they are far more often an article
  // than a count, and a false rejection costs a slower render for nothing.
  //
  // Kazakh numerals are kept in a separate list, checked only when the request
  // is actually Kazakh. Several of them are ordinary Russian words - "он" is
  // ten in Kazakh and "he" in Russian, "бес" is five in Kazakh and a demon in
  // Russian - so checking them unconditionally rejected a correct rewrite of
  // "он бежит по улице" for not containing the number ten.
  const RU: Array<[string, string, RegExp]> = [
    ["2", "two", /(?:^|[^\p{L}])(?:два|две|двое)(?![\p{L}])/iu],
    ["3", "three", /(?:^|[^\p{L}])(?:три|трое)(?![\p{L}])/iu],
    ["4", "four", /(?:^|[^\p{L}])(?:четыре|четверо)(?![\p{L}])/iu],
    ["5", "five", /(?:^|[^\p{L}])(?:пять|пятеро)(?![\p{L}])/iu],
    ["6", "six", /(?:^|[^\p{L}])шесть(?![\p{L}])/iu],
    ["7", "seven", /(?:^|[^\p{L}])семь(?![\p{L}])/iu],
    ["8", "eight", /(?:^|[^\p{L}])восемь(?![\p{L}])/iu],
    ["9", "nine", /(?:^|[^\p{L}])девять(?![\p{L}])/iu],
    ["10", "ten", /(?:^|[^\p{L}])десять(?![\p{L}])/iu],
  ]

  const KK: Array<[string, string, RegExp]> = [
    ["2", "two", /(?:^|[^\p{L}])екі(?![\p{L}])/iu],
    ["3", "three", /(?:^|[^\p{L}])үш(?![\p{L}])/iu],
    ["4", "four", /(?:^|[^\p{L}])төрт(?![\p{L}])/iu],
    ["5", "five", /(?:^|[^\p{L}])бес(?![\p{L}])/iu],
    ["6", "six", /(?:^|[^\p{L}])алты(?![\p{L}])/iu],
    ["7", "seven", /(?:^|[^\p{L}])жеті(?![\p{L}])/iu],
    ["8", "eight", /(?:^|[^\p{L}])сегіз(?![\p{L}])/iu],
    ["9", "nine", /(?:^|[^\p{L}])тоғыз(?![\p{L}])/iu],
  ]

  const looksKazakh = /[әіңғүұқөһ]/u.test(original)
  for (const [digit, english, pattern] of looksKazakh ? [...RU, ...KK] : RU) {
    if (!pattern.test(original)) continue
    if (lower.includes(digit) || new RegExp(`\\b${english}\\b`, "i").test(lower)) continue
    return false
  }

  const quoted = original.match(/[«"']([^«»"']{3,})[»"']/g)
  if (quoted?.length) {
    const inner = quoted.map((q) => q.replace(/^[«"']|[»"']$/g, "").trim().toLowerCase())
    if (!inner.every((line) => lower.includes(line))) return false
  }

  return true
}

export function videoProviderConfigured(id: TitanVideoProviderId): boolean {
  if (id === "dashscope") return Boolean(dashscopeKey())
  if (id === "pollo") return Boolean(process.env.POLLO_API_KEY?.trim()) && process.env.POLLO_VIDEO_ENABLED === "true"
  if (id === "runway") return Boolean(runwayKey())
  if (id === "fal") return Boolean(falKey())
  if (id === "luma") return Boolean(process.env.LUMA_API_KEY?.trim())
  if (id === "veo") return Boolean(veoKey())
  return false
}

export async function createTitanVideoJob(provider: TitanVideoProviderId, input: VideoGenerateInput) {
  const length = input.length || 5

  if (provider === "dashscope") {
    const key = dashscopeKey()
    if (!key) throw new Error("DASHSCOPE_API_KEY missing")
    const model = dashscopeVideoModel()
    const compiledPrompt = await compileDashscopeVideoPrompt(input.prompt, input.generateAudio !== false)
    // 1080p as before. The studio used to hardcode it with no way to change it;
    // it is a control now, but the default it starts on is unchanged.
    const requested = input.resolution || (process.env.VIDEO_DEFAULT_RESOLUTION?.trim() as VideoGenerateInput["resolution"]) || "1080p"
    const resolution = requested === "480p" ? "480P" : requested === "1080p" ? "1080P" : "720P"
    const ratio = input.ratio || "16:9"

    const response = await fetch(`${dashscopeApiBase()}/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model,
        input: {
          prompt: compiledPrompt || input.prompt,
          negative_prompt: "low quality, blurry, distorted anatomy, duplicate subjects, unstable camera, flicker, watermark, subtitles",
        },
        parameters: {
          resolution,
          ratio,
          duration: length,
          // DashScope's own rewrite stays on, exactly as before. It is a second
          // LLM pass over a prompt we have already compiled and it does add
          // latency, but it is also part of how the finished shot has always
          // looked, and the render itself is where the minutes actually go.
          // DASHSCOPE_PROMPT_EXTEND=false turns it off for a faster render.
          prompt_extend: process.env.DASHSCOPE_PROMPT_EXTEND?.trim().toLowerCase() !== "false",
          watermark: false,
        },
      }),
    })
    const payload = await response.json().catch(() => ({}))
    const taskId = payload?.output?.task_id
    if (!response.ok || !taskId) {
      throw new Error(payload?.message || payload?.code || payload?.error?.message || "DashScope Wan video failed")
    }
    return {
      taskId: String(taskId),
      model,
      statusUrl: `${dashscopeApiBase()}/tasks/${encodeURIComponent(String(taskId))}`,
      responseUrl: undefined,
    }
  }

  if (provider === "runway") {
    const key = runwayKey()
    if (!key) throw new Error("RUNWAY_API_KEY missing")
    const model = process.env.RUNWAY_VIDEO_MODEL || "gen4.5"
    const response = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "X-Runway-Version": "2024-11-06" },
      body: JSON.stringify({ model, promptText: input.prompt, ratio: "1280:720", duration: length }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.id) throw new Error(payload?.error || payload?.message || "Runway failed")
    return { taskId: payload.id, model, statusUrl: `https://api.dev.runwayml.com/v1/tasks/${payload.id}`, responseUrl: undefined }
  }

  if (provider === "fal") {
    const key = falKey()
    if (!key) throw new Error("FAL_KEY missing")
    const model = process.env.FAL_VIDEO_MODEL || "fal-ai/minimax-video"
    const response = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: { authorization: `Key ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: input.prompt }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.request_id) throw new Error(payload?.detail || payload?.message || "FAL video failed")
    return { taskId: payload.request_id, model, statusUrl: payload.status_url, responseUrl: payload.response_url }
  }

  if (provider === "luma") {
    const key = process.env.LUMA_API_KEY
    if (!key) throw new Error("LUMA_API_KEY missing")
    const model = process.env.LUMA_VIDEO_MODEL || "ray-2"
    const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ prompt: input.prompt, model, resolution: input.resolution || "720p", duration: `${length}s`, aspect_ratio: input.ratio || "16:9" }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.id) throw new Error(payload?.detail || payload?.message || "Luma failed")
    return { taskId: payload.id, model, statusUrl: `https://api.lumalabs.ai/dream-machine/v1/generations/${payload.id}` }
  }

  if (provider === "veo") {
    const key = veoKey()
    if (!key) throw new Error("GOOGLE_VEO_API_KEY missing")
    const model = process.env.GOOGLE_VEO_MODEL || "veo-3.1-generate-preview"
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt: input.prompt }], parameters: { aspectRatio: input.ratio || "16:9" } }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.name) throw new Error(payload?.error?.message || "Veo failed")
    return { taskId: payload.name, model, statusUrl: `https://generativelanguage.googleapis.com/v1beta/${payload.name}?key=${key}` }
  }

  throw new Error(`Provider ${provider} not handled here — use Pollo module`)
}

export async function fetchTitanVideoStatus(provider: TitanVideoProviderId, taskId: string, extras?: { statusUrl?: string; responseUrl?: string }) {
  if (provider === "dashscope") {
    const key = dashscopeKey()
    if (!key) throw new Error("DASHSCOPE_API_KEY missing")
    const response = await fetch(extras?.statusUrl || `${dashscopeApiBase()}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${key}` },
      cache: "no-store",
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.message || payload?.code || `DashScope status ${response.status}`)
    const raw = String(payload?.output?.task_status || "").toUpperCase()
    const status = raw === "SUCCEEDED" ? "succeed" : raw === "FAILED" || raw === "CANCELED" ? "failed" : "processing"
    const videoUrl = payload?.output?.video_url
    return { status, videoUrl, error: payload?.output?.message || payload?.message }
  }

  if (provider === "runway") {
    const key = runwayKey()
    const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" },
    })
    const payload = await response.json().catch(() => ({}))
    const status = payload?.status === "SUCCEEDED" ? "succeed" : payload?.status === "FAILED" ? "failed" : "processing"
    const videoUrl = payload?.output?.[0]?.url || payload?.output?.url
    return { status, videoUrl, error: payload?.failure || payload?.error }
  }

  if (provider === "fal" && extras?.responseUrl) {
    const key = falKey()
    const statusRes = await fetch(extras.statusUrl || "", { headers: { authorization: `Key ${key}` } })
    const statusPayload = await statusRes.json().catch(() => ({}))
    if (statusPayload?.status !== "COMPLETED") {
      return { status: statusPayload?.status === "FAILED" ? "failed" : "processing", videoUrl: undefined }
    }
    const resultRes = await fetch(extras.responseUrl, { headers: { authorization: `Key ${key}` } })
    const resultPayload = await resultRes.json().catch(() => ({}))
    const videoUrl = resultPayload?.video?.url || resultPayload?.output?.url
    return { status: videoUrl ? "succeed" : "processing", videoUrl }
  }

  if (provider === "luma") {
    const key = process.env.LUMA_API_KEY
    const response = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    })
    const payload = await response.json().catch(() => ({}))
    const status = payload?.state === "completed" ? "succeed" : payload?.state === "failed" ? "failed" : "processing"
    const videoUrl = payload?.assets?.video || payload?.video?.url
    return { status, videoUrl, error: payload?.failure_reason }
  }

  if (provider === "veo") {
    const key = veoKey()
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${taskId}?key=${key}`)
    const payload = await response.json().catch(() => ({}))
    const done = Boolean(payload?.done)
    const status = payload?.error ? "failed" : done ? "succeed" : "processing"
    const videoUrl = payload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
    return { status, videoUrl, error: payload?.error?.message }
  }

  return { status: "processing" as const, videoUrl: undefined }
}
