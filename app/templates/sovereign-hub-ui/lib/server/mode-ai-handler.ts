import type { MalikAIMode } from "@/lib/ai/config"
import { routeModeAI } from "@/lib/ai/provider-registry"
import { sanitizePublicError, validatePrompt } from "@/lib/ai/safety"
import { publicEngineForProvider, publicErrorMessage, sanitizePublicText } from "@/lib/brand-provider-map"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export async function handleModeAI(request: Request, mode: MalikAIMode) {
  const body = await request.json().catch(() => ({}))
  const promptCheck = validatePrompt(body?.prompt || body?.message || body?.question)
  if (!promptCheck.ok) {
    return Response.json({ ok: false, error: promptCheck.error }, { status: 400 })
  }

  const entitlement = await resolveRequestEntitlement(request)
  const result = await routeModeAI(mode, {
    prompt: promptCheck.value,
    messages: Array.isArray(body?.messages) ? body.messages : undefined,
    userId: entitlement.userId,
    userEmail: entitlement.userId,
    plan: entitlement.plan,
    maxTokens: typeof body?.maxTokens === "number" ? body.maxTokens : undefined,
    temperature: typeof body?.temperature === "number" ? body.temperature : undefined,
    signal: request.signal,
  })

  const task = mode === "code" ? "code" : mode === "photo" ? "image" : mode === "video" ? "video" : "chat"
  const engine = publicEngineForProvider(result.provider, task)

  return Response.json(
    {
      ok: result.success,
      mode,
      engine: engine.title,
      engineId: engine.id,
      provider: result.provider,
      model: result.model,
      fallbackUsed: Boolean(result.fallbackUsed),
      content: sanitizePublicText(result.output),
      publicError: result.success ? undefined : publicErrorMessage(sanitizePublicError(result.error)),
    },
    { status: result.success ? 200 : 503 },
  )
}
