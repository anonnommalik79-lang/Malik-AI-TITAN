import "server-only"

import { classifyFailure, OsToolError } from "./failures"
import { readOwnerJson, writeOwnerJson } from "./store"
import type { OwnerContext } from "./tools/contract"
import type { OsFlow } from "./types"

/**
 * What every Malik AI OS route shares: who is asking (from the session,
 * never from the body), the daily Superflow allowance, JSON responses that
 * are never cached, and errors in words a person can act on.
 */

export async function osOwner(request: Request): Promise<OwnerContext> {
  const { resolveRequestEntitlement } = await import("@/lib/server/request-entitlement")
  const entitlement = await resolveRequestEntitlement(request)
  return { userId: entitlement.userId, plan: entitlement.plan, authenticated: entitlement.authenticated }
}

export function isOwnerPlan(owner: OwnerContext) {
  return owner.plan === "owner"
}

export function osJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "private, no-store", "x-malik-os": "v1" } })
}

export function osError(error: unknown, fallbackStatus = 500) {
  const classified = classifyFailure(error)
  const status = error instanceof OsToolError
    ? (error.code === "NOT_FOUND" ? 404 : error.code === "SIGN_IN_REQUIRED" ? 401 : error.code === "TOO_MANY_FLOWS" || error.code === "DAILY_LIMIT" ? 429 : error.code === "INVALID_REQUEST" || error.code === "INVALID_INPUT" ? 400 : error.code === "PLAN_REQUIRED" ? 402 : fallbackStatus)
    : classified.code === "INVALID_REQUEST" ? 400 : fallbackStatus
  if (!(error instanceof OsToolError)) console.warn("[MALIK_OS] route error", error instanceof Error ? error.message : String(error))
  return osJson({ ok: false, code: classified.code, error: classified.message, retryable: classified.retryable, action: classified.action }, status)
}

export function requireSignedIn(owner: OwnerContext) {
  if (!owner.authenticated) throw new OsToolError("SIGN_IN_REQUIRED", "Войдите в аккаунт, чтобы запускать Superflow и хранить проекты.", { retryable: false, action: "sign-in" })
}

function readLimit(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

export function dailyFlowLimit(owner: OwnerContext) {
  if (owner.plan === "owner") return Number.POSITIVE_INFINITY
  if (owner.plan === "ultra") return readLimit("MALIK_OS_ULTRA_DAILY_FLOWS", 100)
  if (owner.plan === "pro") return readLimit("MALIK_OS_PRO_DAILY_FLOWS", 30)
  return readLimit("MALIK_OS_FREE_DAILY_FLOWS", 3)
}

type Usage = { day: string; flows: number }

/** Counts a started flow against today's allowance; refuses over the limit. */
export async function takeDailyFlow(owner: OwnerContext) {
  const limit = dailyFlowLimit(owner)
  if (!Number.isFinite(limit)) return { used: 0, limit: null as number | null }
  const day = new Date().toISOString().slice(0, 10)
  const stored = await readOwnerJson<Usage>(owner.userId, "usage-flows")
  const used = stored?.day === day ? stored.flows : 0
  if (used >= limit) {
    throw new OsToolError("DAILY_LIMIT", limit === 0
      ? "Superflow доступен в MalikAI Plus."
      : `На сегодня лимит Superflow исчерпан (${limit}). Он обновится завтра.`, { retryable: false, action: "upgrade" })
  }
  await writeOwnerJson(owner.userId, "usage-flows", { day, flows: used + 1 })
  return { used: used + 1, limit }
}

/** Gives back a flow that was counted but never started (a duplicate request). */
export async function returnDailyFlow(owner: OwnerContext) {
  const day = new Date().toISOString().slice(0, 10)
  const stored = await readOwnerJson<Usage>(owner.userId, "usage-flows")
  if (stored?.day === day && stored.flows > 0) await writeOwnerJson(owner.userId, "usage-flows", { day, flows: stored.flows - 1 })
}

/** A flow as the browser sees it: statuses, labels, ids — no tool inputs. */
export function flowView(flow: OsFlow) {
  return {
    id: flow.id,
    projectId: flow.projectId,
    goal: flow.goal,
    status: flow.status,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    finishedAt: flow.finishedAt,
    clientRequestId: flow.clientRequestId,
    chatId: flow.chatId,
    quality: flow.quality,
    capabilities: flow.capabilities,
    demo: flow.demo || undefined,
    interrupted: flow.interrupted || undefined,
    tasks: flow.tasks.map((task) => ({
      id: task.id,
      type: task.type,
      label: task.label,
      activity: task.activity,
      status: task.status,
      progress: task.progress,
      dependencies: task.dependencies,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      artifactIds: task.artifactIds,
      error: task.error,
      retry: { attempts: task.retry.attempts, maxAttempts: task.retry.maxAttempts, nextRetryAt: task.retry.nextRetryAt },
      provider: task.provider === "demo-cache" ? "demo-cache" : undefined,
      optional: task.optional || undefined,
    })),
  }
}

export type FlowView = ReturnType<typeof flowView>

export function cleanRequestId(value: unknown) {
  const text = String(value || "").trim()
  return /^[A-Za-z0-9_-]{8,80}$/.test(text) ? text : ""
}
