/**
 * MALIK Truth Engine V2: cheap deterministic integrity and provenance checks.
 * None of these checks establish that a law or cited webpage is applicable.
 */
import { checkAccuracy, needsAccuracyGate } from "./accuracy/engine"
export type TruthSource = { url?: string; title?: string; snippet?: string }
export type TruthCheck = { code: "math" | "contradiction" | "source"; message: string }

const normalize = (s: string) => Number(s.replace(/[ \u00a0\u202f]/gu, "").replace(",", "."))

export function auditExtendedArithmetic(answer: string): TruthCheck[] {
  return checkAccuracy(answer, "").report.issues.filter(item => item.code === "arithmetic" || item.code === "units")
    .map(item => ({ code: "math" as const, message: "Арифметическое расхождение: " + item.detail }))
}

const SECTION = /(?:^|\n)\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?(?:\*\*)?\s*(на\s+руки|к\s+выдаче|чистая\s+зарплата|net\s+salary|общие\s+расходы\s+работодателя|полные\s+расходы|total\s+employer\s+cost)\s*(?:\*\*)?\s*[:—–-]\s*(\d[\d \u00a0\u202f]{3,})\s*(?:₸|тенге|тг\b)?/giu
const SCENARIO = /если|при\s+условии|сценари|вариант|без\s+вычета|с\s+вычетом|отдельн|пример|условн/iu

export function auditHeadlineConsistency(answer: string): TruthCheck[] {
  const clean = String(answer || "").replace(/\x60{3}[\s\S]*?\x60{3}/gu, " ")
  const seen = new Map<string, number>()
  const warnings: TruthCheck[] = []
  SECTION.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SECTION.exec(clean)) && warnings.length < 3) {
    const line = clean.slice(clean.lastIndexOf("\n", match.index) + 1, clean.indexOf("\n", match.index) < 0 ? undefined : clean.indexOf("\n", match.index))
    if (SCENARIO.test(line)) continue
    const key = /руки|выдаче|зарплата|salary/iu.test(match[1]) ? "net" : "employer"
    const amount = normalize(match[2])
    if (!Number.isFinite(amount) || amount < 1000) continue
    const other = seen.get(key)
    if (other !== undefined && other !== amount) warnings.push({
      code: "contradiction", message: "Несовпадающие итоговые суммы " + (key === "net" ? "зарплаты" : "расходов работодателя") + " без разделения условий."
    })
    else seen.set(key, amount)
  }
  return warnings
}

function primaryKzTaxSource(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    return host === "adilet.zan.kz" || host === "egov.kz" || host === "enpf.kz" ||
      host === "kgd.gov.kz" || host === "gov.kz" || host.endsWith(".gov.kz")
  } catch { return false }
}

/** Source presence is NOT source authority, date validity or legal applicability. */
export function checkPrimaryEvidence(question: string, sources: readonly TruthSource[]): TruthCheck[] {
  const input = String(question || "")
  if (!/(?:казахст|қазақст|kazakhstan|тенге|теңге|₸|мрп|мзп|тоо|кпн|ипн|опв|восмс|оосмс)/iu.test(input)) return []
  if (!/(?:налог|салық|кпн|ипн|опв|восмс|оосмс|упрощ[её]н|декларац|бухгалтер|payroll|tax)/iu.test(input)) return []
  if (sources.some((source) => primaryKzTaxSource(String(source.url || "")))) return []
  return [{ code: "source", message: "Нет подтверждённого официального источника законодательства Казахстана для этого налогового расчёта." }]
}

/** Buffer only numerical questions so verified text cannot be bypassed by SSE chunks. */
export function shouldBufferNumericalAnswer(question: string) {
  return needsAccuracyGate(question)
}
