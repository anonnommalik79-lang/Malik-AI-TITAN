/**
 * The honest status of a Malik Work code result.
 *
 *   COMPLETED_VERIFIED       — no errors, no warnings, and the preview really
 *                              rendered without a runtime error.
 *   COMPLETED_WITH_LIMITATIONS — no errors, but something was not verified
 *                              (warnings, no preview for this stack, packages
 *                              the preview cannot load).
 *   FAILED                   — diagnostics or the running preview found errors.
 *   BLOCKED                  — nothing could be checked (no files, unreadable input).
 *   CANCELLED                — stopped by the person.
 *   CHECKING                 — the preview has not reported yet; never shown as done.
 *
 * Pure: the server gives a provisional status, the browser the final one
 * once the preview frame has answered.
 */

export type WorkCodeStatus = "COMPLETED_VERIFIED" | "COMPLETED_WITH_LIMITATIONS" | "FAILED" | "BLOCKED" | "CANCELLED" | "CHECKING"

type Analysis = { counts: { errors: number; warnings: number }; stats?: { files: number } }
type Preview = { ok: boolean; reason: string | null; limitations: string[] }
type Runtime = { ready: boolean; errors: string[] }

export function projectStatus(input: { analysis?: Analysis | null; preview?: Preview | null; runtime?: Runtime | null; cancelled?: boolean }): { status: WorkCodeStatus; reasons: string[] } {
  const reasons: string[] = []
  if (input.cancelled) return { status: "CANCELLED", reasons: ["Остановлено пользователем."] }
  const analysis = input.analysis
  if (!analysis || (analysis.stats && analysis.stats.files === 0)) return { status: "BLOCKED", reasons: ["Нет файлов для проверки."] }
  if (analysis.counts.errors > 0) reasons.push(`Ошибок в коде: ${analysis.counts.errors}.`)
  if (input.runtime?.errors.length) reasons.push(`Ошибок при запуске превью: ${input.runtime.errors.length}.`)
  if (reasons.length) return { status: "FAILED", reasons }
  if (analysis.counts.warnings > 0) reasons.push(`Предупреждений: ${analysis.counts.warnings}.`)
  const preview = input.preview
  if (preview && !preview.ok) reasons.push(`Превью для этого проекта недоступно (${preview.reason}).`)
  if (preview?.ok && preview.limitations.some((item) => /недоступен в превью|не компилируется/.test(item))) reasons.push("Часть проекта не может работать в превью.")
  if (preview?.ok && !input.runtime) return { status: "CHECKING", reasons: [...reasons, "Ждём ответа от превью."] }
  if (preview?.ok && input.runtime && !input.runtime.ready) return { status: "CHECKING", reasons: [...reasons, "Превью ещё не отрисовалось."] }
  if (!preview) reasons.push("Превью не запускалось.")
  return reasons.length ? { status: "COMPLETED_WITH_LIMITATIONS", reasons } : { status: "COMPLETED_VERIFIED", reasons: ["Ошибок нет, превью отрисовалось без ошибок выполнения."] }
}
