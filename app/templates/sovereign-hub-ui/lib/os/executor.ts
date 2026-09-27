import { createHash } from "node:crypto"

import { detectCapabilities, qualityTier } from "./capabilities"
import { publish } from "./events"
import { OsToolError, classifyFailure, retryDelayMs, shouldRetry } from "./failures"
import { recordPerf } from "./perf"
import { planFlow, stepIdOf } from "./planner"
import {
  createProject,
  findFlowByRequest,
  getArtifact,
  getArtifacts,
  getFlow,
  getProject,
  newId,
  ownerKey,
  putArtifact,
  readOwnerJson,
  saveFlow,
  toSummary,
  updateProject,
  writeOwnerJson,
} from "./store"
import { blockedTasks, flowStatusOf, isTerminal, readyTasks, transition } from "./task-graph"
import type { DependencyOutput, OwnerContext, ToolContext, ToolDeps } from "./tools/contract"
import { toolFor } from "./tools/registry"
import type { Artifact, Capability, OsError, OsFlow, OsTask, ValidationReport } from "./types"
import { validateArtifact } from "./validate"

/**
 * The executor: runs a flow's task graph.
 *
 * Up to three tasks run at once (one picture at a time), each with its own
 * time limit and cancellation. A failed task is retried with backoff when
 * the failure is temporary; a result that fails its self-check is retried
 * with the list of problems. Every state change is saved and published, so
 * the chat, mission control and a reloaded page all see the same flow.
 *
 * One flow id runs in one place: a second call while it runs is ignored,
 * the same browser request id never creates a second flow, and credits a
 * task already spent are remembered across its retries.
 */

export const PARALLEL_TASKS = 3
export const MAX_ACTIVE_FLOWS_PER_OWNER = 2

type RunningFlow = { controller: AbortController; owner: string; wake: () => void }

type ExecutorGlobal = typeof globalThis & {
  __malikOsRunning?: Map<string, RunningFlow>
  __malikOsCreating?: Map<string, Promise<{ flow: OsFlow; created: boolean }>>
  __malikOsFeedback?: Map<string, ValidationReport>
}

const scope = globalThis as ExecutorGlobal

function running() {
  if (!scope.__malikOsRunning) scope.__malikOsRunning = new Map()
  return scope.__malikOsRunning
}

function creating() {
  if (!scope.__malikOsCreating) scope.__malikOsCreating = new Map()
  return scope.__malikOsCreating
}

function feedback() {
  if (!scope.__malikOsFeedback) scope.__malikOsFeedback = new Map()
  return scope.__malikOsFeedback
}

export function isFlowRunning(flowId: string) {
  return running().has(flowId)
}

export function activeFlowCount(ownerId: string) {
  const owner = ownerKey(ownerId)
  return [...running().values()].filter((entry) => entry.owner === owner).length
}

export type StartFlowInput = {
  owner: OwnerContext
  goal: string
  clientRequestId: string
  chatId?: string
  projectId?: string
  capabilities?: Capability[]
  /** A custom task graph (continuation, editing, data analysis). */
  tasks?: (flowId: string) => OsTask[]
  demo?: boolean
  deps: ToolDeps
}

/** Creates (or finds) the flow for a request and starts it in the background. */
export function startFlow(input: StartFlowInput): Promise<{ flow: OsFlow; created: boolean }> {
  const lock = `${ownerKey(input.owner.userId)}:${input.clientRequestId}`
  const pending = creating().get(lock)
  if (pending) return pending
  const promise = createFlow(input).finally(() => creating().delete(lock))
  creating().set(lock, promise)
  return promise
}

async function createFlow(input: StartFlowInput): Promise<{ flow: OsFlow; created: boolean }> {
  const ownerId = input.owner.userId
  const existing = await findFlowByRequest(ownerId, input.clientRequestId)
  if (existing) return { flow: await recoverInterrupted(ownerId, existing), created: false }

  if (activeFlowCount(ownerId) >= MAX_ACTIVE_FLOWS_PER_OWNER) {
    throw new OsToolError("TOO_MANY_FLOWS", "Уже выполняются две задачи. Дождитесь, пока одна закончится, или остановите её.", { retryable: false, action: "wait" })
  }

  const goal = String(input.goal || "").trim().slice(0, 4_000)
  const capabilities = input.capabilities || detectCapabilities(goal)
  const quality = qualityTier(goal, capabilities.length)
  const now = input.deps.now()

  const project = (input.projectId && await getProject(ownerId, input.projectId))
    || await createProject(ownerId, { title: titleFrom(goal), goal, chatId: input.chatId }, now)

  const id = newId("flow")
  const tasks = input.tasks ? input.tasks(id) : planFlow({ flowId: id, goal, capabilities, quality })
  const flow: OsFlow = {
    id,
    projectId: project.id,
    ownerId: ownerKey(ownerId),
    goal,
    status: "planned",
    tasks,
    createdAt: now,
    updatedAt: now,
    clientRequestId: input.clientRequestId,
    chatId: input.chatId,
    quality,
    capabilities,
    demo: Boolean(input.demo),
  }
  await saveFlow(ownerId, flow)
  await updateProject(ownerId, project.id, (target) => {
    target.flowIds.push(flow.id)
  }, now)
  void runFlow(ownerId, flow.id, input.owner, input.deps)
  return { flow, created: true }
}

function titleFrom(goal: string) {
  const clean = goal.replace(/\s+/g, " ").replace(/^(?:пожалуйста[, ]+)?(?:создай|сделай|подготовь|придумай|разработай|напиши)\s+/iu, "").trim()
  const title = clean.charAt(0).toUpperCase() + clean.slice(1)
  return title.length > 70 ? `${title.slice(0, 69).trimEnd()}…` : title || "Проект"
}

/* ------------------------------------------------------------ recovery */

/**
 * A flow saved as running, with no runner in this process, was interrupted
 * by a restart. Its unfinished tasks become retryable failures instead of
 * spinning forever.
 */
export async function recoverInterrupted(ownerId: string, flow: OsFlow): Promise<OsFlow> {
  if (isFlowRunning(flow.id)) return flow
  if (flow.tasks.every((task) => isTerminal(task.status))) return flow
  const now = Date.now()
  flow.tasks = flow.tasks.map((task) => {
    if (isTerminal(task.status)) return task
    const error: OsError = { code: "INTERRUPTED", message: "Сервер перезапустился во время работы. Нажмите «Продолжить».", retryable: true, action: "retry" }
    if (task.status === "running" || task.status === "retrying") return { ...task, status: "failed", error, finishedAt: now, activity: undefined }
    return { ...task, status: "cancelled", error, finishedAt: now }
  })
  flow.interrupted = true
  flow.status = flowStatusOf(flow.tasks)
  flow.updatedAt = now
  flow.finishedAt = now
  await saveFlow(ownerId, flow)
  return flow
}

/* --------------------------------------------------------------- control */

export async function cancelFlow(ownerId: string, flowId: string) {
  const entry = running().get(flowId)
  if (entry && entry.owner === ownerKey(ownerId)) {
    entry.controller.abort()
    entry.wake()
    return true
  }
  const flow = await getFlow(ownerId, flowId)
  if (!flow) return false
  const now = Date.now()
  let changed = false
  flow.tasks = flow.tasks.map((task) => {
    if (isTerminal(task.status)) return task
    changed = true
    return { ...task, status: "cancelled", finishedAt: now, activity: undefined }
  })
  if (changed) {
    flow.status = flowStatusOf(flow.tasks)
    flow.updatedAt = now
    flow.finishedAt = now
    await saveFlow(ownerId, flow)
    publish(flow.id, { type: "done", flowId: flow.id, status: flow.status })
  }
  return true
}

/**
 * Runs again: the given task (or every failed and cancelled one) and the
 * tasks that were cancelled because of it.
 */
export async function retryFlow(ownerId: string, flowId: string, owner: OwnerContext, deps: ToolDeps, taskId?: string) {
  const flow = await getFlow(ownerId, flowId)
  if (!flow) return null
  if (isFlowRunning(flow.id) && !taskId) return flow
  const targets = new Set(
    flow.tasks
      .filter((task) => (taskId ? task.id === taskId : task.status === "failed" || task.status === "cancelled"))
      .filter((task) => task.status === "failed" || task.status === "cancelled")
      .map((task) => task.id),
  )
  if (!targets.size) return flow
  // Dependents that were cancelled because of these run again too.
  let grew = true
  while (grew) {
    grew = false
    for (const task of flow.tasks) {
      if (targets.has(task.id) || task.status !== "cancelled") continue
      if (task.dependencies.some((id) => targets.has(id))) {
        targets.add(task.id)
        grew = true
      }
    }
  }
  // The summary is rebuilt from whatever is there after the retry.
  for (const task of flow.tasks) if (task.type === "result.assemble" && task.status === "completed") targets.add(task.id)
  const now = Date.now()
  flow.tasks = flow.tasks.map((task) => {
    if (!targets.has(task.id)) return task
    if (task.status === "completed") return { ...task, status: "queued", progress: 0, finishedAt: undefined, artifactIds: [], retry: { ...task.retry, attempts: 0 } }
    return transition(task, "queued", { retry: { ...task.retry, attempts: 0, nextRetryAt: undefined } }, now)
  })
  flow.interrupted = false
  flow.finishedAt = undefined
  flow.status = flowStatusOf(flow.tasks)
  flow.updatedAt = now
  await saveFlow(ownerId, flow)
  publish(flow.id, { type: "flow", flow })
  if (isFlowRunning(flow.id)) running().get(flow.id)?.wake()
  else void runFlow(ownerId, flow.id, owner, deps)
  return flow
}

/* ------------------------------------------------------------------- run */

export async function runFlow(ownerId: string, flowId: string, owner: OwnerContext, deps: ToolDeps) {
  if (running().has(flowId)) return
  const controller = new AbortController()
  let wakeUp: (() => void) | null = null
  const entry: RunningFlow = { controller, owner: ownerKey(ownerId), wake: () => wakeUp?.() }
  running().set(flowId, entry)
  const started = deps.now()
  let firstTaskAt = 0
  try {
    const flow = await getFlow(ownerId, flowId)
    if (!flow) return
    const active = new Map<string, Promise<void>>()

    const save = async () => {
      flow.updatedAt = deps.now()
      flow.status = flowStatusOf(flow.tasks)
      await saveFlow(ownerId, flow)
    }

    const setTask = async (next: OsTask) => {
      flow.tasks = flow.tasks.map((task) => (task.id === next.id ? next : task))
      await save()
      publish(flow.id, { type: "task", flowId: flow.id, task: next })
    }

    for (;;) {
      if (controller.signal.aborted) break

      for (const { task, error } of blockedTasks(flow.tasks)) {
        await setTask(transition(task, "cancelled", { error }, deps.now()))
      }

      const now = deps.now()
      const imageBusy = [...active.keys()].some((id) => flow.tasks.find((task) => task.id === id)?.type === "image.generate")
      const ready = readyTasks(flow.tasks, now).filter((task) => !active.has(task.id))
      let imageStarted = imageBusy
      for (const task of ready) {
        if (active.size >= PARALLEL_TASKS) break
        if (task.type === "image.generate") {
          if (imageStarted) continue
          imageStarted = true
        }
        if (!firstTaskAt) {
          firstTaskAt = deps.now()
          recordPerf("flow.first-task", firstTaskAt - flow.createdAt)
        }
        const promise = runTask(ownerId, flow, task, owner, deps, controller.signal, setTask)
          .catch((error) => console.warn("[MALIK_OS] task crashed", task.id, error instanceof Error ? error.message : String(error)))
          .finally(() => {
            active.delete(task.id)
            wakeUp?.()
          })
        active.set(task.id, promise)
      }

      if (!active.size) {
        const waiting = flow.tasks.filter((task) => task.status === "retrying" && task.retry.nextRetryAt)
        const pending = flow.tasks.some((task) => ["planned", "queued", "waiting"].includes(task.status))
        if (!waiting.length && !(pending && readyTasks(flow.tasks, deps.now()).length)) break
        if (waiting.length) {
          const next = Math.min(...waiting.map((task) => task.retry.nextRetryAt as number))
          await Promise.race([
            deps.sleep(Math.max(50, next - deps.now()), controller.signal).catch(() => undefined),
            new Promise<void>((resolve) => { wakeUp = resolve }),
          ])
          continue
        }
      }

      await new Promise<void>((resolve) => {
        wakeUp = resolve
        if (!active.size) resolve()
      })
      wakeUp = null
    }

    if (controller.signal.aborted) {
      await Promise.allSettled([...active.values()])
      const now = deps.now()
      flow.tasks = flow.tasks.map((task) => (isTerminal(task.status) ? task : { ...task, status: "cancelled", finishedAt: now, activity: undefined }))
    } else {
      // Anything never able to start (a broken graph) is closed, not left spinning.
      const now = deps.now()
      flow.tasks = flow.tasks.map((task) => (isTerminal(task.status) ? task : { ...task, status: "cancelled", finishedAt: now, error: task.error || { code: "NOT_STARTED", message: "Шаг не смог начаться.", retryable: true, action: "retry" } }))
    }
    flow.finishedAt = deps.now()
    await save()
    recordPerf("flow.total", flow.finishedAt - started, flow.status === "completed" || flow.status === "partial")
    publish(flow.id, { type: "done", flowId: flow.id, status: flow.status })
    if (flow.status === "completed" || flow.status === "partial") await rememberForDemo(ownerId, flow).catch(() => undefined)
  } finally {
    running().delete(flowId)
  }
}

async function runTask(
  ownerId: string,
  flow: OsFlow,
  initial: OsTask,
  owner: OwnerContext,
  deps: ToolDeps,
  flowSignal: AbortSignal,
  setTask: (task: OsTask) => Promise<void>,
) {
  const tool = toolFor(initial.type)
  const current = () => flow.tasks.find((task) => task.id === initial.id) || initial
  if (!tool) {
    await setTask(transition(transition(initial, "queued"), "running", {}, deps.now()))
    await setTask(transition(current(), "failed", { error: { code: "UNKNOWN_TOOL", message: "Этот шаг пока не поддерживается.", retryable: false, action: "none" } }, deps.now()))
    return
  }
  const invalid = tool.validate?.(initial.input)
  const attempt = initial.retry.attempts + 1
  let task = initial.status === "planned" || initial.status === "waiting" ? transition(initial, "queued", {}, deps.now()) : initial
  task = transition(task, "running", { retry: { ...task.retry, attempts: attempt }, progress: 0.02, error: undefined, activity: undefined }, deps.now())
  await setTask(task)
  if (invalid) {
    await setTask(transition(current(), "failed", { error: { code: "INVALID_INPUT", message: invalid, retryable: false, action: "none" } }, deps.now()))
    return
  }

  const controller = new AbortController()
  const onFlowAbort = () => controller.abort()
  flowSignal.addEventListener("abort", onFlowAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, tool.timeoutMs)
  const started = deps.now()

  try {
    const project = await getProject(ownerId, flow.projectId)
    if (!project) throw new OsToolError("PROJECT_MISSING", "Проект не найден.", { retryable: false })

    // Everything this task may read, loaded before it starts.
    const outputs = new Map<string, DependencyOutput>()
    for (const id of task.dependencies) {
      const dependency = flow.tasks.find((item) => item.id === id)
      if (dependency?.status !== "completed") continue
      outputs.set(stepIdOf(dependency), { task: dependency, artifacts: await getArtifacts(ownerId, dependency.artifactIds) })
    }
    const inputIds = Array.isArray(task.input.sourceArtifactIds) ? (task.input.sourceArtifactIds as unknown[]).map(String).slice(0, 12) : []
    const inputs = await getArtifacts(ownerId, inputIds)

    let lastActivity = 0
    const context: ToolContext = {
      owner,
      flow,
      task,
      project,
      deps,
      signal: controller.signal,
      attempt,
      feedback: feedback().get(task.id),
      inputs,
      dependency: (stepId) => outputs.get(stepId) || null,
      activity: (text, progress) => {
        const now = deps.now()
        // At most a few updates a second reach storage and the browser.
        if (now - lastActivity < 400 && progress === undefined) return
        lastActivity = now
        const latest = current()
        if (latest.status !== "running") return
        void setTask({ ...latest, activity: String(text).slice(0, 140), progress: progress === undefined ? latest.progress : Math.max(latest.progress, Math.min(0.98, progress)) })
      },
      markCharged: async () => {
        await setTask({ ...current(), charged: true })
      },
    }

    const result = await tool.run(context)
    if (controller.signal.aborted) throw abortReason(timedOut, flowSignal)

    // Self-check before anything is saved.
    const brandName = result.facts?.brandName || project.facts.brandName
    const language = (project.facts.language as "ru" | "kk" | "en" | undefined) || undefined
    const reports = result.artifacts.map((draft) => validateArtifact(draft, {
      brandName,
      sourceCount: Array.isArray(draft.metadata?.sources) ? (draft.metadata!.sources as unknown[]).length : undefined,
      language,
    }, deps.now()))
    const failedReport = reports.find((report) => !report.ok)
    if (failedReport && attempt < task.retry.maxAttempts) {
      feedback().set(task.id, failedReport)
      throw new OsToolError("SELF_CHECK_FAILED", `Результат не прошёл проверку: ${failedReport.checks.filter((check) => !check.ok).map((check) => check.note).slice(0, 2).join("; ")}. Исправляю.`, { retryable: true })
    }
    feedback().delete(task.id)

    const stored: Artifact[] = []
    for (let index = 0; index < result.artifacts.length; index += 1) {
      const draft = result.artifacts[index]
      const artifact = await putArtifact(ownerId, { ...draft, validation: reports[index], version: draft.version || 1 }, deps.now())
      stored.push(artifact)
      publish(flow.id, { type: "artifact", flowId: flow.id, artifact: toSummary(artifact) })
    }

    await updateProject(ownerId, project.id, (target) => {
      target.artifactIds.push(...stored.map((artifact) => artifact.id))
      Object.assign(target.facts, result.facts || {})
      for (const text of result.decisions || []) {
        target.decisions.push({ id: newId("art").replace("art_", "dec_"), text: String(text).slice(0, 300), at: deps.now(), source: "task", taskId: task.id })
      }
      target.sources.push(...(result.sources || []))
    }, deps.now())

    await setTask(transition(current(), "completed", { artifactIds: stored.map((artifact) => artifact.id), provider: result.provider }, deps.now()))
    recordPerf(`tool.${task.type}`, deps.now() - started, true)
  } catch (caught) {
    const error = controller.signal.aborted ? abortReason(timedOut, flowSignal) : caught
    recordPerf(`tool.${task.type}`, deps.now() - started, false)
    if (flowSignal.aborted) {
      await setTask(transition(current(), "cancelled", { error: { code: "CANCELLED", message: "Остановлено.", retryable: true, action: "retry" } }, deps.now()))
      return
    }
    const classified = classifyFailure(error)
    const latest = current()
    if (shouldRetry(classified, attempt, latest.retry.maxAttempts)) {
      const delay = retryDelayMs(attempt, classified, (error as { retryAfterMs?: number })?.retryAfterMs, deps.random)
      await setTask(transition(latest, "retrying", {
        error: classified,
        activity: undefined,
        retry: { ...latest.retry, attempts: attempt, nextRetryAt: deps.now() + delay, lastErrorCode: classified.code },
      }, deps.now()))
      return
    }
    if (flow.demo) {
      const rescued = await demoFallback(ownerId, flow, latest, deps)
      if (rescued) {
        publish(flow.id, { type: "artifact", flowId: flow.id, artifact: toSummary(rescued) })
        await setTask(transition(latest, "completed", { artifactIds: [rescued.id], provider: "demo-cache", error: undefined }, deps.now()))
        return
      }
    }
    await setTask(transition(latest, "failed", { error: classified, retry: { ...latest.retry, attempts: attempt, lastErrorCode: classified.code, nextRetryAt: undefined } }, deps.now()))
  } finally {
    clearTimeout(timer)
    flowSignal.removeEventListener("abort", onFlowAbort)
  }
}

function abortReason(timedOut: boolean, flowSignal: AbortSignal) {
  if (flowSignal.aborted) return new OsToolError("CANCELLED", "Остановлено.", { retryable: false })
  if (timedOut) return new OsToolError("TIMEOUT", "Шаг выполнялся слишком долго. Повторю ещё раз.", { retryable: true })
  return new OsToolError("CANCELLED", "Остановлено.", { retryable: false })
}

/* --------------------------------------------------------- demo fallback */

/**
 * The last good result of each step, per normalized goal, remembered for
 * demo mode. In a demo, a step that fails after every retry shows that saved
 * copy — labeled as a saved copy with its original date, never as new.
 */
type DemoCache = { goal: string; savedAt: number; steps: Record<string, string[]> }

export function demoGoalKey(goal: string) {
  const normalized = goal.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32)
}

async function rememberForDemo(ownerId: string, flow: OsFlow) {
  const steps: Record<string, string[]> = {}
  for (const task of flow.tasks) {
    if (task.status === "completed" && task.provider !== "demo-cache" && task.artifactIds.length) steps[stepIdOf(task)] = task.artifactIds
  }
  if (!Object.keys(steps).length) return
  const previous = await readOwnerJson<DemoCache>(ownerId, `demo-${demoGoalKey(flow.goal)}`)
  await writeOwnerJson(ownerId, `demo-${demoGoalKey(flow.goal)}`, { goal: flow.goal.slice(0, 400), savedAt: Date.now(), steps: { ...(previous?.steps || {}), ...steps } })
}

async function demoFallback(ownerId: string, flow: OsFlow, task: OsTask, deps: ToolDeps): Promise<Artifact | null> {
  const cache = await readOwnerJson<DemoCache>(ownerId, `demo-${demoGoalKey(flow.goal)}`)
  const ids = cache?.steps?.[stepIdOf(task)]
  if (!ids?.length) return null
  const original = await getArtifact(ownerId, ids[0])
  if (!original) return null
  const { id: _id, ownerId: _owner, createdAt, ...rest } = original
  void _id
  void _owner
  return putArtifact(ownerId, {
    ...rest,
    projectId: flow.projectId,
    sourceTask: task.id,
    title: original.title,
    fallback: { kind: "demo-cache", cachedAt: cache!.savedAt, originalCreatedAt: createdAt },
    links: [{ relation: "revision-of", artifactId: original.id }],
  }, deps.now())
}
