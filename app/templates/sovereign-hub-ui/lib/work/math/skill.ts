import { mathVerified, runMath, type MathOutcome, type MathTask } from "./engine"
import { detectMathTask, type MathIntent } from "./intent"

/**
 * The math skill in the chat: detect → compute → verify → hand the result
 * to the model as program output. The answer explains; the engine decides
 * the numbers. When the engine cannot compute something, that is said too,
 * and the model is told not to dress its own arithmetic as the engine's.
 */

export type MathReceipt = { intent: MathIntent; outcome: MathOutcome }

/** Engine refusals that only mean «this was not a formula» — nothing to report. */
const NOT_MATH = new Set(["PARSE", "NOT_ALLOWED", "UNKNOWN_SYMBOL", "FREE_SYMBOL", "EMPTY", "TOO_LONG", "TOO_BIG", "VARIABLE"])

export function computeMathForMessage(text: string): MathReceipt | null {
  const intent = detectMathTask(text)
  if (!intent) return null
  const outcome = runMath(intent.task)
  if (!outcome.ok && (!intent.explicit || NOT_MATH.has(outcome.code))) return null
  return { intent, outcome }
}

export function describeTask(task: MathTask): string {
  if (task.op === "evaluate") return `вычислить ${task.expression}${task.expectUnit ? ` в ${task.expectUnit}` : ""}`
  if (task.op === "convert") return `перевести ${task.value} в ${task.to}`
  if (task.op === "solve") return `решить ${task.equation}${task.variable ? ` относительно ${task.variable}` : ""}${task.interval ? ` на [${task.interval.join("; ")}]` : ""}`
  if (task.op === "system") return `решить систему ${task.equations.join("; ")}`
  if (task.op === "derivative") return `производная${task.order && task.order > 1 ? ` порядка ${task.order}` : ""} от ${task.expression}${task.variable ? ` по ${task.variable}` : ""}${task.at !== undefined ? ` в точке ${task.at}` : ""}`
  if (task.op === "integrate") return task.from !== undefined ? `интеграл ${task.expression} от ${task.from} до ${task.to}` : `неопределённый интеграл ${task.expression}`
  return `упростить ${task.expression}`
}

/** A short receipt for the execution panel (what ran, what came out, what was checked). */
export function mathReceiptText(receipt: MathReceipt): string {
  const { outcome } = receipt
  if (!outcome.ok) return `Движок ${outcome.engine} не посчитал: ${outcome.error}`
  return [
    outcome.title,
    `Результат: ${outcome.answer}`,
    ...outcome.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}`),
    ...outcome.notes,
    `${outcome.engine} · ${outcome.ms} мс`,
  ].join("\n")
}

/** The system-prompt block that hands the engine's result to the model. */
export function mathEngineInstruction(receipt: MathReceipt | null): string {
  if (!receipt) return ""
  const { outcome, intent } = receipt
  if (!outcome.ok) {
    return [
      "[MALIK_MATH_ENGINE]",
      `The Malik math engine (${outcome.engine}, deterministic) was asked to ${describeTask(intent.task)} and did not produce a result: ${outcome.error}`,
      "That finding is reliable (e.g. a divergent integral, an equation with parameters). Do not present any number as computed by the engine or verified by a tool. If the problem can still be solved by hand, solve it step by step as your own derivation and say so; otherwise explain why it has no finite answer.",
      "[/MALIK_MATH_ENGINE]",
    ].join("\n")
  }
  const values = outcome.values.map((value) => `- ${value.label} = ${value.value}${value.exact && value.exact !== value.value ? ` (точно: ${value.exact})` : ""}${value.tex ? ` [TeX: ${value.tex}]` : ""}`)
  return [
    "[MALIK_MATH_ENGINE]",
    `The Malik math engine (${outcome.engine}, deterministic program, not a model) computed this before you answer: ${outcome.title}.`,
    `RESULT: ${outcome.answer}`,
    values.length ? `VALUES:\n${values.join("\n")}` : "",
    outcome.steps.length ? `ENGINE STEPS:\n${outcome.steps.map((step) => `- ${step}`).join("\n")}` : "",
    outcome.checks.length ? `CHECKS THAT ACTUALLY RAN:\n${outcome.checks.map((check) => `- ${check.ok ? "passed" : "FAILED"}: ${check.name} — ${check.detail}`).join("\n")}` : "",
    outcome.notes.length ? `NOTES:\n${outcome.notes.map((note) => `- ${note}`).join("\n")}` : "",
    "Rules: the final answer must be exactly this result; every number you show must agree with the engine. Explain the solution in the user's language the way a good teacher would — givens, formula or method, substitution, units — compactly. Write formulas in LaTeX ($…$). You may say the result was checked by the Malik engine only for the checks listed above; never invent other tool runs. If the engine computed something other than what the user really asked, say what was computed and answer the actual question. A «распознана численно» exact form is a numeric match, not a proof — present it that way.",
    mathVerified(outcome) ? "" : "Some checks did not pass or none ran: present the result with that caveat.",
    "[/MALIK_MATH_ENGINE]",
  ].filter(Boolean).join("\n")
}
