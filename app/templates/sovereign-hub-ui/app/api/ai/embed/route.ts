import { embedWithBedrock } from "@/lib/ai/providers/bedrock-embedding-provider"
import { validatePrompt } from "@/lib/ai/safety"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const promptCheck = validatePrompt(body?.text || body?.prompt || body?.input)
  if (!promptCheck.ok) {
    return Response.json({ ok: false, error: promptCheck.error }, { status: 400 })
  }

  const result = await embedWithBedrock(promptCheck.value, request.signal)
  return Response.json(
    {
      ok: result.success,
      provider: result.provider,
      model: result.model,
      data: result.output,
      error: result.success ? undefined : result.error,
    },
    { status: result.success ? 200 : 503 },
  )
}
