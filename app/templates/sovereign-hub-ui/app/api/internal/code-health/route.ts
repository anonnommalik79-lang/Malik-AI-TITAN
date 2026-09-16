import { MALIK_MODELS, isMalikModelId } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import { runMalikCoderOrchestrator } from "@/lib/server/malik-coder-orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function denied() {
  return Response.json({ ok: false }, { status: 401, headers: { "cache-control": "no-store" } })
}

const prompt = [
  "Write a complete single-file HTML app.",
  "Requirements: accessible counter UI, increment/decrement/reset buttons, keyboard shortcuts, localStorage persistence, responsive CSS, no external libraries.",
  "Return the complete runnable HTML code. Do not use TODOs or placeholders.",
].join(" ")

export async function GET(request: Request) {
  const url = new URL(request.url)
  const expected = process.env.MALIK_MODEL_HEALTH_SECRET || ""
  const provided = url.searchParams.get("secret") || ""
  if (!expected || provided !== expected) return denied()

  const modelId = url.searchParams.get("model")
  if (!modelId || !isMalikModelId(modelId)) {
    return Response.json({ ok: true, models: MALIK_MODELS.map((m) => m.id) }, { headers: { "cache-control": "no-store" } })
  }

  const started = Date.now()
  try {
    const result = modelId === "malik-coder-32b"
      ? await runMalikCoderOrchestrator({
          prompt,
          systemPrompt: "Production code stress probe. Finish the requested runnable code.",
          maxTokens: 1800,
          temperature: 0.05,
        })
      : await runStrictMalikModel({
          modelId,
          prompt,
          systemPrompt: "Production code stress probe. Finish the requested runnable code.",
          maxTokens: 1800,
          temperature: 0.05,
        })

    const text = String(result.content || "")
    const htmlClosed = /<\/html>/i.test(text)
    const hasScript = /<script[\s>]/i.test(text) && /<\/script>/i.test(text)
    const hasLocalStorage = /localStorage/i.test(text)
    const noTodo = !/\bTODO\b|placeholder|rest omitted/i.test(text)
    const complete = htmlClosed && hasScript && hasLocalStorage && noTodo

    return Response.json({
      ok: Boolean(text.trim()),
      complete,
      modelId,
      provider: result.provider,
      providerModel: result.model,
      length: text.length,
      htmlClosed,
      hasScript,
      hasLocalStorage,
      noTodo,
      tookMs: Date.now() - started,
    }, { headers: { "cache-control": "no-store" } })
  } catch (error: any) {
    return Response.json({
      ok: false,
      complete: false,
      modelId,
      error: error?.code || error?.name || "ERROR",
      message: error?.message || String(error),
      tookMs: Date.now() - started,
    }, { headers: { "cache-control": "no-store" } })
  }
}
