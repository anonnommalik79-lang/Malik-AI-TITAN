import { routeCapability } from "./capabilities"
import { validateGraph } from "./task-graph"
import type { Capability, OsTask, QualityTier, ToolName } from "./types"

/**
 * The planner: one goal and its capabilities become a task graph.
 *
 * The graph is built from explicit rules, never from a model's free-form
 * plan, so every row the person sees in the Superflow block is a task the
 * executor knows how to run. Independent tasks (research and the brief's
 * follow-ups, the logo and the business plan) run side by side; a task that
 * needs another's result lists it as a dependency.
 */

type Step = {
  id: string
  type: ToolName
  label: string
  capability?: Capability
  /** Required dependencies (by step id) when present in the plan. */
  needs: string[]
  /** Dependencies used if present, never required to exist. */
  uses: string[]
  optional?: boolean
}

const STEPS: Step[] = [
  { id: "understand", type: "goal.understand", label: "Понимаю цель", needs: [], uses: [] },
  { id: "research", type: "research.web", label: "Исследую рынок", capability: "research", needs: ["understand"], uses: [] },
  { id: "brand", type: "brand.create", label: "Создаю бренд", capability: "brand", needs: ["understand"], uses: ["research"] },
  { id: "logo", type: "image.generate", label: "Рисую логотип", capability: "image", needs: ["understand"], uses: ["brand"], optional: true },
  { id: "plan", type: "business.plan", label: "Пишу бизнес-план", capability: "business-plan", needs: ["understand"], uses: ["research", "brand"] },
  { id: "document", type: "document.write", label: "Пишу документ", capability: "document", needs: ["understand"], uses: ["research", "brand", "plan"] },
  { id: "site", type: "site.generate", label: "Собираю сайт", capability: "website", needs: ["understand"], uses: ["brand", "logo", "research"] },
  { id: "deck", type: "presentation.generate", label: "Готовлю Investor Deck", capability: "presentation", needs: ["understand"], uses: ["plan", "brand", "research"] },
  { id: "video", type: "video.script", label: "Пишу сценарий видео", capability: "video-script", needs: ["understand"], uses: ["brand", "research"] },
  { id: "code", type: "code.project", label: "Пишу код проекта", capability: "code", needs: ["understand"], uses: ["brand", "research"] },
  { id: "data", type: "data.analyze", label: "Анализирую данные", capability: "data", needs: ["understand"], uses: [] },
]

const PRESENTATION_LABEL_PLAIN = "Готовлю презентацию"
const IMAGE_LABEL_PLAIN = "Создаю изображение"

export type PlanOptions = {
  flowId: string
  goal: string
  capabilities: Capability[]
  quality: QualityTier
  /** Ids of attachments the data analyst may read. */
  attachmentIds?: string[]
}

/** A stable id for a task inside a flow. */
export function taskId(flowId: string, stepId: string) {
  return `${flowId}.${stepId}`
}

export function planFlow(options: PlanOptions): OsTask[] {
  const { flowId, goal, capabilities, quality } = options
  const wanted = new Set<Capability>(capabilities)
  const investor = /инвестор|investor|питч|pitch/iu.test(goal)
  const logo = /логотип|logo|бренд|brand|стартап|startup/iu.test(goal)

  const included = STEPS.filter((step) => !step.capability || wanted.has(step.capability))
  const present = new Set(included.map((step) => step.id))

  const tasks: OsTask[] = included.map((step) => {
    const route = step.capability ? routeCapability(step.capability, quality) : undefined
    const needs = step.needs.filter((id) => present.has(id))
    const uses = step.uses.filter((id) => present.has(id) && !needs.includes(id))
    let label = step.label
    if (step.id === "deck" && !investor) label = PRESENTATION_LABEL_PLAIN
    if (step.id === "logo" && !logo) label = IMAGE_LABEL_PLAIN
    const input: Record<string, unknown> = {
      goal,
      quality,
      route: route ? { model: route.model, reasoningEffort: route.reasoningEffort, maxTokens: route.maxTokens } : { model: "malik-max" },
    }
    if (step.id === "logo") input.purpose = logo ? "logo" : "illustration"
    if (step.id === "deck") input.audience = investor ? "investors" : "general"
    if (step.id === "data") input.attachmentIds = options.attachmentIds || []
    return {
      id: taskId(flowId, step.id),
      type: step.type,
      label,
      status: "planned",
      progress: 0,
      dependencies: [...needs, ...uses].map((id) => taskId(flowId, id)),
      softDependencies: uses.map((id) => taskId(flowId, id)),
      input,
      artifactIds: [],
      retry: { attempts: 0, maxAttempts: step.type === "image.generate" ? 2 : 3 },
      idempotencyKey: `${flowId}:${step.id}`,
      // Only a step whose result is a nice-to-have for the others is optional.
      optional: Boolean(step.optional),
    }
  })

  // The final step reads every result and checks they agree with each other.
  tasks.push({
    id: taskId(flowId, "result"),
    type: "result.assemble",
    label: "Проверяю и собираю итог",
    status: "planned",
    progress: 0,
    dependencies: tasks.map((task) => task.id),
    // The summary reports what worked and what did not; it waits for all.
    softDependencies: tasks.filter((task) => task.type !== "goal.understand").map((task) => task.id),
    input: { goal, quality },
    artifactIds: [],
    retry: { attempts: 0, maxAttempts: 2 },
    idempotencyKey: `${flowId}:result`,
  })

  const check = validateGraph(tasks)
  if (!check.ok) throw new Error(`Superflow plan is invalid: ${check.errors.join("; ")}`)
  return tasks
}

/** "flow_abc.site" → "site". */
export function stepIdOf(task: Pick<OsTask, "id">) {
  const dot = task.id.lastIndexOf(".")
  return dot >= 0 ? task.id.slice(dot + 1) : task.id
}
