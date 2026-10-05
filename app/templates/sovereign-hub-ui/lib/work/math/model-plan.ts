import { z } from "zod"
import { detectQuantitativeReasoning } from "@/lib/ai/quantitative-reasoning"
import type { WorkspaceMode } from "@/lib/ai/work-mode"
import { mathTaskSchema } from "./schema"
import { mathVerified, runMath, type MathOutcome, type MathTask } from "./engine"
import { describeTask } from "./skill"
const planSchema = z.object({ givens: z.array(z.string().min(1).max(300)).max(20), unknown: z.string().min(1).max(300), tasks: z.array(mathTaskSchema).min(1).max(6) }).strict()
export const mathPlanningInstruction = [
  "Return only strict JSON {givens:string[],unknown:string,tasks:MathTask[]} with 1-6 tasks, no Markdown or explanations.",
  "Use only the user's data; if missing/contradictory or not computable return no plan, never invent numbers. State assumptions in givens. The model composes formulas; the deterministic engine only checks those formulas, not the truth of the physical model.",
  "Task operations: evaluate{expression,expectUnit?}, convert{value,to}, solve{equation,variable?,interval?}, system{equations}, derivative{expression,variable?,order?,at?}, integrate{expression,variable?,from?,to?}, simplify{expression}. Include op in every task. Each expression must be self-contained, no references to prior tasks, assignments, property access or new functions.",
  "For physics keep units in the expression and set expectUnit for evaluate or use convert. Variables/constants not supplied by the user must not be invented.",
].join("\n")
export type PlannedMath = { givens: string[]; unknown: string; receipts: Array<{ task: MathTask; outcome: MathOutcome }> }
/** Extra planning is work-only; any invalid/unverified task discards the whole plan. */
export async function planWorkMath(input: { prompt: string; mode: WorkspaceMode; explicitMath: boolean; attachments: number; signal?: AbortSignal }, model: (signal: AbortSignal) => Promise<string>, timeoutMs = 6000): Promise<PlannedMath | null> {
  if (input.mode !== "work" || input.explicitMath || input.attachments || !detectQuantitativeReasoning(input.prompt)?.complex) return null
  const controller = new AbortController(), abort = () => controller.abort()
  if (input.signal?.aborted) return null
  input.signal?.addEventListener("abort", abort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const raw = await Promise.race([model(controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("TIMEOUT")) }, Math.min(6000, Math.max(1, timeoutMs))) })])
    if (controller.signal.aborted || raw.length > 16000) return null
    const plan = planSchema.safeParse(JSON.parse(raw)); if (!plan.success) return null
    const receipts = []
    for (const task of plan.data.tasks) {
      if (controller.signal.aborted) return null
      const outcome = runMath(task)
      if (!mathVerified(outcome)) return null
      receipts.push({ task, outcome })
    }
    return { givens: plan.data.givens, unknown: plan.data.unknown, receipts }
  } catch { return null }
  finally { clearTimeout(timer); controller.abort(); input.signal?.removeEventListener("abort", abort) }
}
export function plannedMathReceiptText(task: MathTask, outcome: MathOutcome) {
  if (!outcome.ok) return ""
  return [describeTask(task), `Результат: ${outcome.answer}`, ...outcome.checks.map(check => `${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}`), ...outcome.notes, `${outcome.engine} · ${outcome.ms} мс`].join("\n")
}
export function plannedMathInstruction(plan: PlannedMath | null) {
  if (!plan) return ""
  return ["[MALIK_WORK_FORMULAS]", "Формулы составлены моделью, посчитаны движком. Движок проверил только перечисленные выражения, НЕ правильность исходных данных или физической модели. Сопоставь формулы с вопросом; назови допущения и недостающие условия, не выдавай их за факты.", `Дано (по плану модели): ${plan.givens.join("; ")}`, `Искомое: ${plan.unknown}`, ...plan.receipts.map(({ task, outcome }) => plannedMathReceiptText(task, outcome)), "Use these actual outputs and checks, including dimensions where present. Never claim additional checks or tool operations. If a formula does not answer the question, say what was actually computed.", "[/MALIK_WORK_FORMULAS]"].join("\n")
}
