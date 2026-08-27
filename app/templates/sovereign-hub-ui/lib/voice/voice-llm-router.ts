type VoiceLlmResult = {
  content: string
  provider: "groq" | "cloudflare"
  model: string
}

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function contentFrom(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => typeof part === "string" ? part : part?.text || "")
      .join("")
      .trim()
    if (joined) return joined
  }

  const native = payload?.result?.response ?? payload?.response ?? payload?.result?.text ?? payload?.text
  return typeof native === "string" ? native.trim() : ""
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

function requestBody(system: string, text: string, model?: string) {
  return {
    ...(model ? { model } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    max_tokens: Number(process.env.VOICE_LLM_MAX_OUTPUT_TOKENS || 700),
    temperature: Number(process.env.VOICE_LLM_TEMPERATURE || 0.45),
    stream: false,
  }
}

async function callGroq(system: string, text: string): Promise<VoiceLlmResult | null> {
  // Important: try BOTH keys. A stale dedicated Voice key must never block a
  // working generic Groq key that already exists in Render.
  const keys = unique([env("GROQ_VOICE_API_KEY"), env("GROQ_API_KEY")])
  if (!keys.length) return null

  const model = env("GROQ_VOICE_LLM_MODEL") || env("VOICE_LLM_GROQ_MODEL") || "openai/gpt-oss-20b"
  const baseUrl = (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "")
  const timeoutMs = Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000)

  for (const key of keys) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify(requestBody(system, text, model)),
        },
        timeoutMs,
      )

      if (!response.ok) {
        console.error("[VOICE_LLM_GROQ]", response.status, (await response.text().catch(() => "")).slice(0, 240))
        continue
      }

      const payload = await response.json().catch(() => null)
      const content = contentFrom(payload)
      if (content) return { content, provider: "groq", model }
    } catch (error) {
      console.error("[VOICE_LLM_GROQ]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

type CfCredential = { token: string; accountId: string }

function cloudflareCredentials(): CfCredential[] {
  const voiceToken = env("CLOUDFLARE_VOICE_API_TOKEN")
  const genericToken = env("CLOUDFLARE_API_TOKEN") || env("CF_API_TOKEN")
  const voiceAccount = env("CLOUDFLARE_VOICE_ACCOUNT_ID")
  const genericAccount = env("CLOUDFLARE_ACCOUNT_ID") || env("CF_ACCOUNT_ID")

  const candidates: CfCredential[] = [
    { token: voiceToken, accountId: voiceAccount || genericAccount },
    { token: genericToken, accountId: genericAccount || voiceAccount },
    { token: voiceToken, accountId: genericAccount },
    { token: genericToken, accountId: voiceAccount },
  ].filter((item) => item.token && item.accountId)

  const seen = new Set<string>()
  return candidates.filter((item) => {
    const id = `${item.accountId}:${item.token}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

async function callCloudflare(system: string, text: string): Promise<VoiceLlmResult | null> {
  const credentials = cloudflareCredentials()
  if (!credentials.length) return null

  const model = env("CLOUDFLARE_VOICE_LLM_MODEL") || env("VOICE_LLM_CLOUDFLARE_MODEL") || "@cf/meta/llama-3.1-8b-instruct-fast"
  const timeoutMs = Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000)

  for (const { token, accountId } of credentials) {
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    }

    // First try Cloudflare's OpenAI-compatible endpoint.
    try {
      const response = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody(system, text, model)),
        },
        timeoutMs,
      )

      if (response.ok) {
        const payload = await response.json().catch(() => null)
        const content = contentFrom(payload)
        if (content) return { content, provider: "cloudflare", model }
      } else {
        console.error("[VOICE_LLM_CLOUDFLARE_COMPAT]", response.status, (await response.text().catch(() => "")).slice(0, 240))
      }
    } catch (error) {
      console.error("[VOICE_LLM_CLOUDFLARE_COMPAT]", error instanceof Error ? error.message : error)
    }

    // Native Workers AI endpoint is a second Cloudflare path. This makes Voice
    // resilient if the OpenAI-compatible path/model combination is unavailable.
    try {
      const response = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody(system, text)),
        },
        timeoutMs,
      )

      if (!response.ok) {
        console.error("[VOICE_LLM_CLOUDFLARE_NATIVE]", response.status, (await response.text().catch(() => "")).slice(0, 240))
        continue
      }

      const payload = await response.json().catch(() => null)
      const content = contentFrom(payload)
      if (content) return { content, provider: "cloudflare", model }
    } catch (error) {
      console.error("[VOICE_LLM_CLOUDFLARE_NATIVE]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

export async function voiceLlmAnswer(input: {
  text: string
  instruction: string
}): Promise<VoiceLlmResult> {
  const groq = await callGroq(input.instruction, input.text)
  if (groq) return groq

  const cloudflare = await callCloudflare(input.instruction, input.text)
  if (cloudflare) return cloudflare

  throw new Error("VOICE_LLM_UNAVAILABLE")
}
