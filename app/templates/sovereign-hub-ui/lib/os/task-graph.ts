import { TERMINAL_TASK_STATUSES, type FlowStatus, type OsError, type OsTask, type TaskStatus } from "./types"

/**
 * The task graph: which tasks may start, which must wait, and what a failure
 * means for the tasks that depend on it. Pure functions — the executor calls
 * them, the tests call them, the browser can call them to render a snapshot.
 *
 * Dependencies are explicit. A task starts only when every required
 * dependency has completed. A soft dependency (the logo for the site, or any
 * task marked optional) only has to be finished one way or another: if it
 * failed, the dependent task still runs without it. A failed required dependency cancels
 * its dependents with a reason, instead of leaving them waiting forever.
 */

const ALLOWED: Record<TaskStatus, readonly TaskStatus[]> = {
  planned: ["queued", "waiting", "cancelled"],
  queued: ["running", "waiting", "cancelled"],
  waiting: ["queued", "running", "cancelled"],
  running: ["completed", "failed", "retrying", "cancelled", "waiting"],
  retrying: ["running", "failed", "cancelled"],
  completed: [],
  // A person may ask to run a failed or cancelled task again.
  failed: ["queued"],
  cancelled: ["queued"],
}

export class TaskTransitionError extends Error {
  readonly from: TaskStatus
  readonly to: TaskStatus

  constructor(from: TaskStatus, to: TaskStatus) {
    super(`Task cannot move from ${from} to ${to}`)
    this.name = "TaskTransitionError"
    this.from = from
    this.to = to
  }
}

export function canTransition(from: TaskStatus, to: TaskStatus) {
  return from === to || ALLOWED[from].includes(to)
}

export function transition(task: OsTask, to: TaskStatus, patch: Partial<OsTask> = {}, now = Date.now()): OsTask {
  if (!canTransition(task.status, to)) throw new TaskTransitionError(task.status, to)
  const next: OsTask = { ...task, ...patch, status: to }
  if (to === "running" && !task.startedAt) next.startedAt = now
  if (to === "completed") {
    next.progress = 1
    next.finishedAt = now
    next.error = undefined
    next.activity = undefined
  }
  if (to === "failed" || to === "cancelled") {
    next.finishedAt = now
    next.activity = undefined
  }
  if (to === "queued" && (task.status === "failed" || task.status === "cancelled")) {
    next.finishedAt = undefined
    next.error = undefined
    next.progress = 0
  }
  return next
}

export function isTerminal(status: TaskStatus) {
  return TERMINAL_TASK_STATUSES.includes(status)
}

export type GraphCheck = { ok: boolean; errors: string[] }

export function validateGraph(tasks: readonly OsTask[]): GraphCheck {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const task of tasks) {
    if (ids.has(task.id)) errors.push(`duplicate task id ${task.id}`)
    ids.add(task.id)
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (dependency === task.id) errors.push(`${task.id} depends on itself`)
      else if (!ids.has(dependency)) errors.push(`${task.id} depends on missing ${dependency}`)
    }
  }
  // Cycle detection: white/grey/black depth-first search.
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const state = new Map<string, 0 | 1 | 2>()
  const visit = (id: string, path: string[]): boolean => {
    const mark = state.get(id) || 0
    if (mark === 1) {
      errors.push(`cycle: ${[...path, id].join(" → ")}`)
      return true
    }
    if (mark === 2) return false
    state.set(id, 1)
    for (const dependency of byId.get(id)?.dependencies || []) {
      if (byId.has(dependency) && visit(dependency, [...path, id])) return true
    }
    state.set(id, 2)
    return false
  }
  for (const task of tasks) if (!state.get(task.id)) visit(task.id, [])
  return { ok: errors.length === 0, errors }
}

/** Dependencies first. Throws on an invalid graph. */
export function topologicalOrder(tasks: readonly OsTask[]): OsTask[] {
  const check = validateGraph(tasks)
  if (!check.ok) throw new Error(check.errors.join("; "))
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const done = new Set<string>()
  const order: OsTask[] = []
  const add = (task: OsTask) => {
    if (done.has(task.id)) return
    for (const dependency of task.dependencies) add(byId.get(dependency) as OsTask)
    done.add(task.id)
    order.push(task)
  }
  tasks.forEach(add)
  return order
}

function isSoft(task: OsTask, dependency: OsTask) {
  return Boolean(dependency.optional) || Boolean(task.softDependencies?.includes(dependency.id))
}

function dependencySatisfied(task: OsTask, dependency: OsTask | undefined) {
  if (!dependency) return false
  if (dependency.status === "completed") return true
  // An input the task can live without only has to be finished, one way or another.
  return isSoft(task, dependency) && isTerminal(dependency.status)
}

/** Tasks that can start now. */
export function readyTasks(tasks: readonly OsTask[], now = Date.now()): OsTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  return tasks.filter((task) => {
    if (!["planned", "queued", "waiting", "retrying"].includes(task.status)) return false
    if (task.status === "retrying" && task.retry.nextRetryAt && task.retry.nextRetryAt > now) return false
    return task.dependencies.every((id) => dependencySatisfied(task, byId.get(id)))
  })
}

/**
 * Tasks that can never run because a required dependency failed or was
 * cancelled, with the reason to show.
 */
export function blockedTasks(tasks: readonly OsTask[]): Array<{ task: OsTask; error: OsError }> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const blocked: Array<{ task: OsTask; error: OsError }> = []
  for (const task of tasks) {
    if (isTerminal(task.status) || task.status === "running") continue
    const broken = task.dependencies
      .map((id) => byId.get(id))
      .find((dependency) => dependency && !isSoft(task, dependency) && (dependency.status === "failed" || dependency.status === "cancelled"))
    if (broken) {
      blocked.push({
        task,
        error: {
          code: "DEPENDENCY_FAILED",
          message: `Не выполнено, потому что не получилось: «${broken.label}».`,
          retryable: true,
          action: "retry",
        },
      })
    }
  }
  return blocked
}

export function flowStatusOf(tasks: readonly OsTask[]): FlowStatus {
  if (!tasks.length) return "planned"
  if (tasks.every((task) => task.status === "planned")) return "planned"
  if (tasks.some((task) => !isTerminal(task.status))) return "running"
  const required = tasks.filter((task) => !task.optional)
  const requiredDone = required.filter((task) => task.status === "completed").length
  if (tasks.every((task) => task.status === "cancelled")) return "cancelled"
  if (requiredDone === required.length) {
    return tasks.every((task) => task.status === "completed") ? "completed" : "partial"
  }
  return requiredDone > 0 || tasks.some((task) => task.status === "completed") ? "partial" : "failed"
}

/** Overall progress, 0…1, where each task weighs the same. */
export function flowProgress(tasks: readonly OsTask[]) {
  if (!tasks.length) return 0
  const sum = tasks.reduce((total, task) => total + (isTerminal(task.status) ? 1 : Math.max(0, Math.min(1, task.progress || 0))), 0)
  return Math.round((sum / tasks.length) * 1000) / 1000
}

/** Every task that depends on the given one, directly or not. */
export function dependentsOf(tasks: readonly OsTask[], id: string): string[] {
  const result = new Set<string>()
  const walk = (current: string) => {
    for (const task of tasks) {
      if (task.dependencies.includes(current) && !result.has(task.id)) {
        result.add(task.id)
        walk(task.id)
      }
    }
  }
  walk(id)
  return [...result]
}
