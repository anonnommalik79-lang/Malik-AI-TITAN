import { MALIK_MODELS, isMalikModelId } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function unauthorized() {
  return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const provided = url.searchParams.get("secret") || ""
  const expected = process.env.MALIK_MODEL_HEALTH_SECRET || ""
  if (!expected || provided !== expected) return unauthorized()

  const modelId = url.searchParams.get("model")
  if (!modelId || !isMalikModelId(modelId)) {
    return Response.json({
      ok: true,
      models: MALIK_MODELS.map((model) => ({ id: model.id, label: model.label, provider: model.provider, providerModel: model.providerModel })),
    }, { headers: { "cache-control": "no-store" } })
  }

  const model = MALIK_MODELS.find((item) => item.id === modelId)!
  const started = Date.now()
  try {
    const result = await runStrictMalikModel({
      modelId,
      prompt: "Reply with exactly: OK",
      systemPrompt: "Health probe. Return exactly OK and nothing else.",
      maxTokens: 512,
      temperature: 0,
    }, { allowFallback: false })

    return Response.json({
      ok: true,
      modelId,
      label: model.label,
      configuredProvider: model.provider,
      configuredProviderModel: model.providerModel,
      actualProvider: result.provider,
      actualProviderModel: result.model,
      content: result.content.slice(0, 120),
      latencyMs: Date.now() - started,
    }, { headers: { "cache-control": "no-store" } })
  } catch (error: any) {
    return Response.json({
      ok: false,
      modelId,
      label: model.label,
      configuredProvider: model.provider,
      configuredProviderModel: model.providerModel,
      error: error?.code || error?.name || "ERROR",
      message: error?.message || String(error),
      status: error?.status || 503,
      latencyMs: Date.now() - started,
    }, { status: 200, headers: { "cache-control": "no-store" } })
  }
}
