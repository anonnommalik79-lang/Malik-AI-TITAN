/**
 * MALIK Truth Engine V2: cheap deterministic integrity and provenance checks.
 * None of these checks establish that a law or cited webpage is applicable.
 */
export type TruthSource = { url?: string; title?: string; snippet?: string }
export type TruthCheck = { code: "math" | "contradiction" | "source"; message: string }

const N = String.raw`(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+(?:[.,]\d+)?)`
const expression = new RegExp("(" + N + "(?:\\s*[+\\-−×*÷/]\\s*" + N + "%?){1,6})\\s*=\\s*(" + N + ")(?!\\d)", "gu")
const token = new RegExp("(" + N + ")(%)?|([+\\-−×*÷/])", "gu")
const normalize = (s: string) => Number(s.replace(/[ \u00a0\u202f]/gu, "").replace(",", "."))

function calculate(expr: string): number | null {
  const pieces = [...expr.matchAll(token)]
  if (!pieces.length || expr.replace(token, "").replace(/\s/gu, "")) return null
  const values: number[] = [], operators: string[] = []
  const priority = (op: string) => /[×*÷/]/u.test(op) ? 2 : 1
  const apply = () => {
    const b = values.pop(), a = values.pop(), op = operators.pop()
    if (a === undefined || b === undefined || !op) return false
    const result = op === "+" ? a + b : /[-−]/u.test(op) ? a - b :
      /[×*]/u.test(op) ? a * b : b ? a / b : NaN
    if (!Number.isFinite(result)) return false
    values.push(result)
    return true
  }
  let wantNumber = true
  for (const piece of pieces) {
    if (piece[1]) {
      if (!wantNumber) return null
      const n = normalize(piece[1]) / (piece[2] ? 100 : 1)
      if (!Number.isFinite(n)) return null
      values.push(n)
      wantNumber = false
    } else {
      if (wantNumber) return null
      while (operators.length && priority(operators[operators.length - 1]) >= priority(piece[3])) {
        if (!apply()) return null
      }
      operators.push(piece[3])
      wantNumber = true
    }
  }
  if (wantNumber) return null
  while (operators.length) if (!apply()) return null
  return values.length === 1 ? values[0] : null
}

export function auditExtendedArithmetic(answer: string): TruthCheck[] {
  const clean = String(answer || "").replace(/\x60{3}[\s\S]*?\x60{3}/gu, " ").slice(0, 45000)
  const problems: TruthCheck[] = []
  for (const line of clean.split("\n")) {
    if (line.length > 600) continue
    expression.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = expression.exec(line)) && problems.length < 4) {
      const computed = calculate(match[1]), given = normalize(match[2])
      if (computed !== null && Number.isFinite(given) && Math.abs(computed - given) > Math.max(1, Math.abs(computed) * 0.001)) {
        problems.push({ code: "math", message: "Арифметическое расхождение: " + match[0].slice(0, 130) })
      }
    }
    if (problems.length >= 4) break
  }
  return problems
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
  const input = String(question || "")
  if (!/\d/u.test(input)) return false
  return /(?:рассчитай|посчитай|вычисли|реши|сколько\s+будет|уравнени|процент|математ|calculate|compute|equation|solve|percentage|multiply|divide|subtract|addition)/iu.test(input)
}
