import { applyFreeModeRequest } from "@/lib/ai/free-mode"
import { getCapabilityById, renderCapabilityPrompt } from "@/lib/ai/capabilities"
import { routeAI } from "@/lib/ai/router"
import type { AITaskType } from "@/lib/ai/types"
import { publicEngineForProvider, publicErrorMessage, sanitizePublicText } from "@/lib/brand-provider-map"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type CapabilityBody = {
  capabilityId?: string
  id?: string
  input?: string
  userInput?: string
  message?: string
  execute?: boolean
  run?: boolean
  maxTokens?: number
  temperature?: number
}

function taskForCapability(mode: string, category: string): AITaskType {
  if (mode === "code") return "code"
  if (category === "Research") return "research"
  if (mode === "pro") return "enterprise"
  return "chat"
}

function preparedResponse(capabilityId: string, input = "") {
  const capability = getCapabilityById(capabilityId)
  if (!capability) {
    return Response.json({ ok: false, error: "capability_not_found", capabilityId }, { status: 404 })
  }

  const prompt = renderCapabilityPrompt(capability, input)
  return Response.json({
    ok: true,
    status: "prepared",
    capability,
    mode: capability.suggestedMode,
    prompt,
    disclaimer: capability.disclaimer,
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const capabilityId = url.searchParams.get("id") || url.searchParams.get("capabilityId") || ""
  const input = url.searchParams.get("input") || ""
  if (!capabilityId) return Response.json({ ok: false, error: "capability_id_required" }, { status: 400 })
  return preparedResponse(capabilityId, input)
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CapabilityBody
  const capabilityId = String(body.capabilityId || body.id || "").trim()
  const input = String(body.userInput || body.input || body.message || "").trim()
  const execute = Boolean(body.execute || body.run)

  if (!capabilityId) return Response.json({ ok: false, error: "capability_id_required" }, { status: 400 })
  const capability = getCapabilityById(capabilityId)
  if (!capability) return Response.json({ ok: false, error: "capability_not_found", capabilityId }, { status: 404 })

  const prompt = renderCapabilityPrompt(capability, input)
  if (!execute) {
    return Response.json({
      ok: true,
      status: "prepared",
      capability,
      mode: capability.suggestedMode,
      prompt,
      disclaimer: capability.disclaimer,
    })
  }

  const entitlement = await resolveRequestEntitlement(request)
  const task = taskForCapability(capability.suggestedMode, capability.category)
  const result = await routeAI(
    applyFreeModeRequest({
      prompt,
      task,
      userId: entitlement.userId,
      userEmail: entitlement.userId,
      plan: entitlement.plan,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      signal: request.signal,
      metadata: {
        capabilityId: capability.id,
        capabilityTitle: capability.title,
        capabilityCategory: capability.category,
        suggestedMode: capability.suggestedMode,
        riskLevel: capability.riskLevel,
      },
    }),
  )

  const engine = publicEngineForProvider(result.provider, task)
  return Response.json(
    {
      ok: result.success,
      status: result.success ? "ready" : "fallback",
      capability,
      mode: capability.suggestedMode,
      task,
      prompt,
      engine: engine.title,
      engineId: engine.id,
      provider: result.provider,
      model: result.model,
      fallbackUsed: Boolean(result.fallbackUsed) || !result.success,
      content: sanitizePublicText(result.output),
      disclaimer: capability.disclaimer,
      publicError: result.success ? undefined : publicErrorMessage(result.error),
    },
    { status: result.error === "DAILY_LIMIT_REACHED" ? 429 : 200 },
  )
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
