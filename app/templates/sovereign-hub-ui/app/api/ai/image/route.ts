import { generateBedrockImage } from "@/lib/ai/providers/bedrock-image-provider"
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
    const result = await generateBedrockImage({
      prompt: promptCheck.value,
      task: "image",
      signal: request.signal,
    })
    if (result.success) {
      return Response.json({ ok: true, provider: result.provider, model: result.model, content: result.output })
    }
  }

  const replay = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
    signal: request.signal,
  })
  return handleGenerateRequest(replay, "image")
}
