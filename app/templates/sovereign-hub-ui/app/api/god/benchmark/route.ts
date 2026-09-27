import { createHash } from "node:crypto"

import { PUBLIC_MALIK_MODELS, isMalikModelId } from "@/lib/ai/malik-models"
import { recordPerformance } from "@/lib/god-mode/performance"
import { recordProviderAttempt } from "@/lib/god-mode/provider-health"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const DEFAULT_PROMPT = "Ответь ровно одним коротким предложением: почему проверка качества перед релизом важна?"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return withGodTraceHeaders(Response.json({ ok: false, code: "OWNER_ONLY", error: "Owner access required." }, { status: 403 }), trace, { operation: "benchmark", budgetMs: 1500 })
  }
  return withGodTraceHeaders(Response.json({
    ok: true,
    executesProviderCalls: true,
    requiresExplicitRun: true,
    maxModelsPerRun: 5,
    models: PUBLIC_MALIK_MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      capabilities: model.capabilities,
    })),
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "benchmark", budgetMs: 1500 })
}

export async function POST(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return withGodTraceHeaders(Response.json({ ok: false, code: "OWNER_ONLY", error: "Owner access required." }, { status: 403 }), trace, { operation: "benchmark", budgetMs: 300_000 })
  }

  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 32 * 1024)
  if (body.run !== true) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "EXPLICIT_CONFIRMATION_REQUIRED", error: "Benchmark makes real provider calls. Send run=true." }, { status: 400 }), trace, { operation: "benchmark", budgetMs: 300_000 })
  }

  const requested = Array.isArray(body.modelIds) ? body.modelIds.map(String) : []
  const modelIds = [...new Set(requested)].filter((id) => isMalikModelId(id) && PUBLIC_MALIK_MODELS.some((model) => model.id === id)).slice(0, 5)
  if (!modelIds.length) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "MODELS_REQUIRED", error: "Выберите от 1 до 5 публичных моделей." }, { status: 400 }), trace, { operation: "benchmark", budgetMs: 300_000 })
  }

  const prompt = String(body.prompt || DEFAULT_PROMPT).trim().slice(0, 2_000) || DEFAULT_PROMPT
  const systemPrompt = "You are running an owner-requested Malik AI quality benchmark. Follow the prompt exactly. Do not mention benchmarking infrastructure."
  const results = []

  for (const modelId of modelIds) {
    const startedAt = Date.now()
    try {
      const output = await runStrictMalikModel({
        modelId,
        prompt,
        systemPrompt,
        maxTokens: Math.max(64, Math.min(1_000, Number(body.maxTokens || 300))),
        temperature: 0,
        reasoningEffort: "low",
      }, { allowFallback: false })
      const latencyMs = Date.now() - startedAt
      recordPerformance({ operation: `benchmark:${modelId}`, durationMs: latencyMs, ok: true, at: Date.now(), traceId: trace.traceId })
      recordProviderAttempt(output.provider, { ok: true, latencyMs })
      const content = String(output.content || "")
      results.push({
        modelId,
        ok: true,
        provider: output.provider,
        providerModel: output.model,
        latencyMs,
        chars: content.length,
        outputHash: createHash("sha256").update(content).digest("hex").slice(0, 16),
        preview: content.slice(0, 320),
      })
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      recordPerformance({ operation: `benchmark:${modelId}`, durationMs: latencyMs, ok: false, at: Date.now(), traceId: trace.traceId })
      results.push({
        modelId,
        ok: false,
        latencyMs,
        error: error instanceof Error ? error.message.slice(0, 500) : "Model benchmark failed",
      })
    }
  }

  return withGodTraceHeaders(Response.json({
    ok: true,
    live: true,
    prompt,
    results,
    disclaimer: "This is a dated live measurement, not a permanent model ranking.",
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "benchmark", budgetMs: 300_000 })
}
