type VoiceLlmResult = {
  content: string
  provider: "groq" | "cloudflare"
  model: string
}

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function contentFrom(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : part?.text || "")
      .join("")
      .trim()
  }
  return ""
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

async function callGroq(system: string, text: string): Promise<VoiceLlmResult | null> {
  const key = env("GROQ_VOICE_API_KEY") || env("GROQ_API_KEY")
  if (!key) return null

  const model = env("GROQ_VOICE_LLM_MODEL") || env("VOICE_LLM_GROQ_MODEL") || "openai/gpt-oss-20b"
  const baseUrl = (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "")

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: text },
          ],
          max_tokens: Number(process.env.VOICE_LLM_MAX_OUTPUT_TOKENS || 700),
          temperature: Number(process.env.VOICE_LLM_TEMPERATURE || 0.45),
          stream: false,
        }),
      },
      Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000),
    )

    if (!response.ok) {
      console.error("[VOICE_LLM_GROQ]", response.status, (await response.text().catch(() => "")).slice(0, 240))
      return null
    }

    const payload = await response.json().catch(() => null)
    const content = contentFrom(payload)
    return content ? { content, provider: "groq", model } : null
  } catch (error) {
    console.error("[VOICE_LLM_GROQ]", error instanceof Error ? error.message : error)
    return null
  }
}

async function callCloudflare(system: string, text: string): Promise<VoiceLlmResult | null> {
  const token = env("CLOUDFLARE_VOICE_API_TOKEN") || env("CLOUDFLARE_API_TOKEN") || env("CF_API_TOKEN")
  const accountId = env("CLOUDFLARE_VOICE_ACCOUNT_ID") || env("CLOUDFLARE_ACCOUNT_ID") || env("CF_ACCOUNT_ID")
  if (!token || !accountId) return null

  const model = env("CLOUDFLARE_VOICE_LLM_MODEL") || env("VOICE_LLM_CLOUDFLARE_MODEL") || "@cf/meta/llama-3.1-8b-instruct-fast"

  try {
    const response = await fetchWithTimeout(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: text },
          ],
          max_tokens: Number(process.env.VOICE_LLM_MAX_OUTPUT_TOKENS || 700),
          temperature: Number(process.env.VOICE_LLM_TEMPERATURE || 0.45),
          stream: false,
        }),
      },
      Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000),
    )

    if (!response.ok) {
      console.error("[VOICE_LLM_CLOUDFLARE]", response.status, (await response.text().catch(() => "")).slice(0, 240))
      return null
    }

    const payload = await response.json().catch(() => null)
    const content = contentFrom(payload)
    return content ? { content, provider: "cloudflare", model } : null
  } catch (error) {
    console.error("[VOICE_LLM_CLOUDFLARE]", error instanceof Error ? error.message : error)
    return null
  }
}

export async function voiceLlmAnswer(input: {
  text: string
  instruction: string
}): Promise<VoiceLlmResult> {
  const groq = await callGroq(input.instruction, input.text)
  if (groq) return groq

  const cloudflare = await callCloudflare(input.instruction, input.text)
  if (cloudflare) return cloudflare

  throw new Error(
    "VOICE_LLM_NOT_CONFIGURED_OR_UNAVAILABLE: expected GROQ_VOICE_API_KEY/GROQ_API_KEY or Cloudflare Voice/API env",
  )
}
