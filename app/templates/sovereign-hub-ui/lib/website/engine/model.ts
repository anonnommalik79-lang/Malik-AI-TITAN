import "server-only"
import { DEFAULT_MALIK_MODEL_ID, isMalikModelId, canUseMalikModel, hasMalikProAccess } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import { checkUsageLimit, recordChatUsage } from "@/lib/limits/rate-limit"
import { getDailyTextTokenQuota, recordGeneratedTextTokens } from "@/lib/server/daily-text-token-quota"
import { computeService, retryCompute } from "@/lib/malik-compute/runtime"
import { estimateCompute } from "@/lib/malik-compute/service"
import { randomUUID } from "node:crypto"
import type { WebsiteJob } from "./types"

/** The same selected model/catalog, entitlement and usage controls as chat.
 * Structured-source requests do not enter freshness/news routing. */
export async function websiteModel(job: WebsiteJob, system: string, prompt: string, signal: AbortSignal) {
  const access = await checkUsageLimit({ userId: job.actor, plan: job.plan, task: "code" })
  if (!access.ok) throw new Error("WEBSITE_MODEL_USAGE_LIMIT")
  const quota = getDailyTextTokenQuota(job.actor, job.plan)
  if (!quota.unlimited && (quota.remaining || 0) < 128) throw new Error("WEBSITE_TEXT_TOKEN_LIMIT")
  const budget = Math.min(6200, quota.remaining ?? 6200)
  const modelId = isMalikModelId(job.modelId) && !["malik-coder-32b", "malik-oil-1tb"].includes(job.modelId) ? job.modelId : DEFAULT_MALIK_MODEL_ID
  if (!canUseMalikModel(modelId, job.plan)) throw new Error("WEBSITE_MODEL_NOT_ALLOWED")
  const reservation = job.plan === "owner" ? null : await retryCompute(() => computeService.reserveCompute(job.actor, estimateCompute("agent"), "agent", randomUUID()))
  let generated = false
  try {
    const answer = await runStrictMalikModel({ modelId, prompt, systemPrompt: system, maxTokens: budget, temperature: 0.35, reasoningEffort: "low", allowCatalog: hasMalikProAccess(job.plan), signal })
    if (!answer?.content?.trim() || answer.incomplete) throw new Error("INCOMPLETE_MODEL_SOURCE")
    recordGeneratedTextTokens(job.actor, job.plan, answer.content)
    await recordChatUsage(job.actor, job.plan, "code", Math.ceil(answer.content.length / 3))
    generated = true
    return answer.content
  } finally {
    if (reservation) await retryCompute(() => generated ? computeService.settleCompute(reservation, estimateCompute("agent"), "agent") : computeService.failCompute(reservation, "PROVIDER_UNAVAILABLE"))
  }
}
