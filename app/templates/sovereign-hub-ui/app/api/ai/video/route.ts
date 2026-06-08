import { createBedrockVideoJob } from "@/lib/ai/providers/bedrock-video-provider"
import { validatePrompt } from "@/lib/ai/safety"
import { handleGenerateRequest } from "@/lib/generation-route"
import { bedrockConfigured } from "@/lib/ai/providers/bedrock-provider"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const promptCheck = validatePrompt(body?.prompt || body?.message)
  if (!promptCheck.ok) {
    return Response.json({ ok: false, error: promptCheck.error }, { status: 400 })
  }

  if (bedrockConfigured()) {
    const result = createBedrockVideoJob(promptCheck.value)
    const jobStatus = (result.output as { status?: string } | undefined)?.status
    if (result.success && jobStatus && jobStatus !== "pending_implementation") {
      return Response.json(
        { ok: result.success, provider: result.provider, model: result.model, job: result.output },
        { status: result.success ? 202 : 503 },
      )
    }
  }

  const replay = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
    signal: request.signal,
  })
  return handleGenerateRequest(replay, "video")
}
