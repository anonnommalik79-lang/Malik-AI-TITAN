import { taskId } from "@/lib/os/planner"
import type { OsTask } from "@/lib/os/types"

/** Reuse the OS graph/executor, recovery, ownership, SSE and artifact downloads. */
export function repositoryWorkPlan(flowId: string, goal: string): OsTask[] {
  const repository = taskId(flowId, "repository")
  return [{ id: repository, type: "github.work", label: "Работаю с репозиторием GitHub", status: "planned", progress: 0,
    dependencies: [], input: { goal }, artifactIds: [], retry: { attempts: 0, maxAttempts: 2 }, idempotencyKey: `${flowId}:repository` },
  { id: taskId(flowId, "result"), type: "result.assemble", label: "Проверяю и собираю итог", status: "planned", progress: 0,
    dependencies: [repository], input: { goal }, artifactIds: [], retry: { attempts: 0, maxAttempts: 1 }, idempotencyKey: `${flowId}:result` }]
}
