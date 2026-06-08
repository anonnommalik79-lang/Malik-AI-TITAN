import type { IntelligenceTask } from "./types"
import { SAFE_HISTORY_KEYS } from "./constants"
import { createIntelligenceId } from "./id"
import { getJson, setJson } from "./safe-storage"

const MAX_TASKS = 80

export function listTasks(): IntelligenceTask[] {
  return getJson<IntelligenceTask[]>(SAFE_HISTORY_KEYS.tasks, [])
}

export function saveTask(task: Partial<IntelligenceTask> & { prompt: string }): IntelligenceTask {
  const now = new Date().toISOString()
  const full: IntelligenceTask = {
    id: task.id || createIntelligenceId("task"),
    kind: task.kind || "chat",
    prompt: task.prompt,
    status: task.status || "ready",
    provider: task.provider,
    createdAt: task.createdAt || now,
    updatedAt: now,
    progress: task.progress ?? 100,
    result: task.result,
    error: task.error,
  }

  const next = [full, ...listTasks().filter((item) => item.id !== full.id)].slice(0, MAX_TASKS)
  setJson(SAFE_HISTORY_KEYS.tasks, next)
  return full
}

export function clearTasks() {
  setJson(SAFE_HISTORY_KEYS.tasks, [])
}

