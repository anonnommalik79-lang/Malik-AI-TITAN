import { auditExtendedArithmetic, auditHeadlineConsistency, checkPrimaryEvidence, type TruthSource } from "./truth-engine-v2"

export function truthNeedsLiveEvidence(input: string) {
  return /налог|налогооблож|бухгалтер|кпн|ипн|опв|восмс|оосмс|упрощенк|декларац|салық|законодател|юридич|лечени|диагноз|лекарств|дозировк|ипотек|кредит|инвестиц|payroll|taxation|legislation|medication|diagnosis/i.test(input)
}
export function officialTruthQuery(input: string) {
  if (/казахст|қазақст|kazakhstan|тенге|теңге|₸|мрп|тоо|кпн|ипн/i.test(input) && truthNeedsLiveEvidence(input)) {
    const year = input.match(/20\d{2}/)?.[0] || String(new Date().getFullYear())
    return "Казахстан " + year + " налоговый кодекс официальная редакция site:kgd.gov.kz OR site:adilet.zan.kz OR site:gov.kz"
  }
  return ""
}

export function truthSystemInstruction(input: string, hasEvidence: boolean) {
  const highRisk = truthNeedsLiveEvidence(input)
  const rules = [
    "MALIK TRUTH GATE: Check every numeric result, reconcile summaries and calculations, never invent sources, citations or execution results.",
    "Distinguish a user-provided value from an authoritative current fact. State important unknown assumptions.",
  ]
  if (!highRisk) return rules.join("\n")
  return rules.concat([
    "HIGH-RISK FACTS: Identify the jurisdiction, period, exact governing rules and exceptions before calculating.",
    "Use primary dated evidence; a number appearing on a website is not proof it applies to this year, region, person or regime.",
    hasEvidence ? "Cite only the actually supplied sources; do not confuse search snippets with an authoritative legal conclusion." : "No verified current official sources: do not call a legal or financial calculation verified.",
    "Never invent MRP, MZP, tax rates, legal articles, exemptions or insurance caps.",
    "For payroll, keep employee withholding, employer contributions and enterprise taxes separate. Confirm deductions and contribution bases.",
    "Reconcile the opening answer, table, worked example, code constants and closing result; repair contradictions before finalizing.",
    "Do not claim Python code was executed, or laws checked, unless the corresponding tool was actually used.",
    "If an exact high-stakes result cannot be validated, explain the missing fact instead of inventing a precise total.",
  ]).join("\n")
}

/** Mechanical check of simple, explicit percentages. This is not a proof of legal applicability. */
export function auditTruthArithmetic(text: string) {
  const body = String(text || "").replace(/\x60{3}[\s\S]*?\x60{3}/gu, " ").slice(0, 35000)
  const normalize = (s: string) => Number(s.replace(/[ \u00a0\u202f]/gu, "").replace(",", "."))
  const mismatches: string[] = []
  const formula = /(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)\s*[×*]\s*(\d+(?:[.,]\d+)?)\s*%\s*=\s*(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)/gu
  for (const line of body.split("\n")) {
    if (line.length > 400) continue
    formula.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = formula.exec(line)) && mismatches.length < 3) {
      const computed = normalize(match[1]) * normalize(match[2]) / 100
      const result = normalize(match[3])
      if (Number.isFinite(computed) && Number.isFinite(result) && Math.abs(computed - result) > Math.max(1, Math.abs(computed) * 0.001)) {
        mismatches.push("Несовпадение формулы: " + match[0])
      }
    }
  }
  // Check conflicting unconditional headline results; comparisons with explicit
  // scenarios are excluded to avoid treating legitimate alternatives as errors.
  const netPattern = /(?:на\s+руки|net\s+salary|к\s+выдаче)[^\n.!?]{0,55}?(\d[\d \u00a0\u202f]{3,})\s*(?:₸|тенге|тг\b)/giu
  const reported = new Set<number>()
  let net: RegExpExecArray | null
  while ((net = netPattern.exec(body)) && reported.size < 3) {
    const around = body.slice(Math.max(0, net.index - 15), netPattern.lastIndex + 20)
    if (/(?:без\s+вычета|с\s+вычетом|вариант|сценари|услови|если|пример)/iu.test(around)) continue
    const value = normalize(net[1])
    if (Number.isFinite(value) && value > 1000) reported.add(value)
  }
  if (reported.size > 1) mismatches.push("Несовпадающие итоговые суммы зарплаты на руки без разделения условий.")
  return mismatches
}

export function finalizeTruthAnswer(answer: string, question: string, sourceInput: number | readonly TruthSource[]) {
  const highRisk = truthNeedsLiveEvidence(question)
  if (!answer.trim()) return answer
  // Ordinary conversations are free; numerical responses still get a low-cost
  // independent arithmetic scan without web requests or another model call.
  const oldProblems = highRisk ? auditTruthArithmetic(answer) : []
  const expandedProblems = auditExtendedArithmetic(answer).map((check) => check.message)
  const consistency = highRisk ? auditHeadlineConsistency(answer).map((check) => check.message) : []
  const problems = [...new Set([...oldProblems, ...expandedProblems, ...consistency])].slice(0, 5)
  if (problems.length) {
    return "⚠️ **Проверка внутренней согласованности не пройдена.** Следующие результаты нельзя считать подтверждёнными:\n" +
      problems.map((problem) => "- " + problem).join("\n") + "\n\n**Непроверенный черновик:**\n\n" + answer
  }
  if (!highRisk) return answer
  const sources = Array.isArray(sourceInput) ? sourceInput as TruthSource[] : []
  const count = typeof sourceInput === "number" ? sourceInput : sources.length
  if (!count) {
    return "⚠️ **Актуальные первоисточники не получены.** Нормы и ставки ниже не подтверждены официальными документами. Не используйте текст как готовую декларацию или профессиональное заключение.\n\n" + answer
  }
  if (sources.length) {
    const warnings = checkPrimaryEvidence(question, sources)
    if (warnings.length) return "⚠️ **Источники не прошли проверку авторитетности.** " +
      warnings.map((item) => item.message).join(" ") + " Наличие ссылок не подтверждает актуальность и применимость норм.\n\n" + answer
  }
  return answer
}
