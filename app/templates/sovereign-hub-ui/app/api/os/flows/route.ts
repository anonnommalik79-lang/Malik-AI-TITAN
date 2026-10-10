import { z } from "zod"
import { routeWorkRequest } from "@/lib/work/orchestrator"
import { repositoryWorkPlan } from "@/lib/work/repository-plan"
import { startFlow } from "@/lib/os/executor"
import { OsToolError } from "@/lib/os/failures"
import { cleanRequestId, flowView, isOwnerPlan, osError, osJson, osOwner, requireSignedIn, returnDailyFlow, takeDailyFlow } from "@/lib/os/http"
import { serverToolDeps } from "@/lib/os/runtime"
import { findFlowByRequest, listFlows, storeIsDurable } from "@/lib/os/store"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const flowRequest = z.object({ goal: z.string().min(12).max(120000), clientRequestId: z.string().min(1).max(120), chatId: z.string().regex(/^[\w:.-]{1,120}$/).optional(), projectId: z.string().regex(/^[\w-]{1,120}$/).optional(), workspaceMode: z.enum(["chat", "work"]).default("chat"), force: z.boolean().optional(), demo: z.boolean().optional() }).strict()
  .refine(body => body.workspaceMode === "work" || body.goal.length <= 4000)

/** Mission control: this account's flows, newest first. */
export async function GET(request: Request) {
  try {
    const owner = await osOwner(request)
    if (!owner.authenticated) return osJson({ ok: true, flows: [], durable: await storeIsDurable() })
    const url = new URL(request.url)
    const projectId = url.searchParams.get("projectId") || undefined
    const flows = await listFlows(owner.userId, { projectId, limit: 40 })
    return osJson({ ok: true, flows, durable: await storeIsDurable() })
  } catch (error) {
    return osError(error)
  }
}

/**
 * Starts a Superflow for a goal. The same clientRequestId always answers
 * with the same flow, so a double click, a retry after a dropped connection
 * or a second tab never starts a second run or spends twice.
 */
export async function POST(request: Request) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const parsed = flowRequest.safeParse(await readJsonBodyLimited<unknown>(request, 512 * 1024))
    if (!parsed.success) throw new OsToolError("INVALID_REQUEST", "Проверьте цель и параметры задачи.", { retryable: false })
    const body = parsed.data
    const goal = body.workspaceMode === "work" ? body.goal.trim() : body.goal.replace(/\s+/g, " ").trim()
    const clientRequestId = cleanRequestId(body.clientRequestId)
    if (goal.length < 12) throw new OsToolError("INVALID_REQUEST", "Опишите цель подробнее.", { retryable: false })
    if (!clientRequestId) throw new OsToolError("INVALID_REQUEST", "Нет идентификатора запроса.", { retryable: false })

    const existing = await findFlowByRequest(owner.userId, clientRequestId)
    if (existing) return osJson({ ok: true, created: false, flow: flowView(existing) })

    // The browser asked because auto mode said so; the server checks again.
    const decision = routeWorkRequest(goal, { mode: body.workspaceMode, signedIn: owner.authenticated })
    const repositoryWork = decision.reason === "work-repository"
    if (!repositoryWork && goal.length > 4000) throw new OsToolError("INVALID_REQUEST", "Длинный brief доступен для задач Work с конкретным GitHub-репозиторием.")
    const forced = body.force === true
    if (decision.route !== "flow" && !forced) {
      throw new OsToolError("INVALID_REQUEST", "Эта задача не требует нескольких инструментов — отвечу в обычном чате.", { retryable: false })
    }
    const chatId = typeof body.chatId === "string" && /^[\w:.-]{1,120}$/.test(body.chatId) ? body.chatId : undefined
    const projectId = typeof body.projectId === "string" ? body.projectId : undefined
    // Demo mode (labeled saved copies on failure) is for the account owner
    // or a deployment that enables it explicitly.
    const demo = body.demo === true && (isOwnerPlan(owner) || process.env.MALIK_DEMO_MODE === "1")

    await takeDailyFlow(owner)
    const result = await startFlow({
      owner,
      goal,
      clientRequestId,
      chatId,
      projectId,
      capabilities: decision.capabilities.length ? decision.capabilities : undefined,
      workRepository: repositoryWork,
      tasks: repositoryWork ? id => repositoryWorkPlan(id, goal) : undefined,
      demo,
      deps: serverToolDeps(),
    }).catch(async (error) => {
      await returnDailyFlow(owner).catch(() => undefined)
      throw error
    })
    if (!result.created) await returnDailyFlow(owner).catch(() => undefined)
    return osJson({ ok: true, created: result.created, flow: flowView(result.flow), durable: await storeIsDurable() }, result.created ? 201 : 200)
  } catch (error) {
    return osError(error)
  }
}
