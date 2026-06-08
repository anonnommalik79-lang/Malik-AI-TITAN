import { routeIntelligenceIntent } from "./intent-router"
import { planFinalResponse } from "./final-orchestrator"
import { saveTask } from "./task-store"

export function runDashboardBridge(prompt: string) {
  const intent = routeIntelligenceIntent(prompt)
  const result = planFinalResponse(prompt)
  const task = saveTask({
    kind: intent.kind,
    prompt,
    status: "ready",
    progress: 100,
    result,
  })

  return {
    intent,
    result,
    task,
  }
}

