import { providerFetch } from "@/lib/ai/providers/base"

const MODEL = "sensenova/sensenova-u1.5-lite"

function key() {
  return (process.env.XKIRO_API_KEY || process.env.XKIRO_API_KEY_1 || "").trim()
}

function baseUrl() {
  return (process.env.XKIRO_BASE_URL || "https://api.xkiro.com/v1").replace(/\/+$/, "")
}

export function xkiroImageConfigured() {
  return Boolean(key())
}

function headers() {
  const value = key()
  return {
    authorization: `Bearer ${value}`,
    "x-api-key": value,
    "content-type": "application/json; charset=utf-8",
    accept: "application/json",
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function generateWithXkiroImage(input: {
  prompt: string
  signal?: AbortSignal
}) {
  const apiKey = key()
  if (!apiKey) throw new Error("XKIRO_API_KEY_1 is not configured")

  const create = await providerFetch(`${baseUrl()}/images/generations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: MODEL,
      prompt: input.prompt,
      n: 1,
      size: "1024x1024",
    }),
    signal: input.signal,
  }, 45_000)

  const created = await create.json().catch(() => ({})) as any
  if (!create.ok) throw new Error(`xKiro image create failed (${create.status}): ${String(created?.error?.message || created?.message || "unknown error").slice(0, 300)}`)

  const directUrl = String(created?.data?.[0]?.url || created?.url || "").trim()
  if (directUrl) return { imageUrl: directUrl, providerModel: MODEL }

  const jobId = String(created?.id || created?.job_id || created?.task_id || "").trim()
  if (!jobId) throw new Error("xKiro image response did not contain a job id")

  for (let attempt = 0; attempt < 36; attempt += 1) {
    if (input.signal?.aborted) throw input.signal.reason || new Error("Aborted")
    await sleep(attempt < 4 ? 2_500 : 5_000)

    const poll = await providerFetch(`${baseUrl()}/images/generations/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        accept: "application/json",
      },
      signal: input.signal,
    }, 30_000)
    const payload = await poll.json().catch(() => ({})) as any
    if (!poll.ok) throw new Error(`xKiro image poll failed (${poll.status}): ${String(payload?.error?.message || payload?.message || "unknown error").slice(0, 300)}`)

    const status = String(payload?.status || "").toLowerCase()
    const url = String(payload?.data?.[0]?.url || payload?.url || payload?.output?.[0]?.url || "").trim()
    if (status === "succeeded" || status === "completed" || url) {
      if (!url) throw new Error("xKiro image job completed without an image URL")
      return { imageUrl: url, providerModel: MODEL }
    }
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(`xKiro image generation failed: ${String(payload?.error?.message || payload?.message || status).slice(0, 300)}`)
    }
  }

  throw new Error("xKiro image generation timed out")
}
