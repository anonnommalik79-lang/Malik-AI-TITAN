import { auditExtendedArithmetic, auditHeadlineConsistency, checkPrimaryEvidence, type TruthSource } from "./truth-engine-v2"
import { finalizeAccuracy, isUserCalculation } from "./accuracy/engine"

export function truthNeedsLiveEvidence(input: string) {
  if (isUserCalculation(input)) return false
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
  return [...auditExtendedArithmetic(text), ...auditHeadlineConsistency(text)].map(item => item.message)
}

export function finalizeTruthAnswer(answer: string, question: string, sourceInput: number | readonly TruthSource[], alreadyChecked = false) {
  const highRisk = truthNeedsLiveEvidence(question)
  if (!answer.trim()) return answer
  // Ordinary conversations are free; numerical responses still get a low-cost
  // independent arithmetic scan without web requests or another model call.
  const sources = Array.isArray(sourceInput) ? sourceInput as TruthSource[] : []
  if (!alreadyChecked) answer = finalizeAccuracy(answer, question, sources).content
  const consistency = highRisk ? auditHeadlineConsistency(answer).map((check) => check.message) : []
  const problems = [...new Set(consistency)].slice(0, 5)
  if (problems.length) {
    // Contradictory totals without a reliable base cannot be chosen arbitrarily.
    // Withhold them instead of publishing an erroneous draft after a warning.
    const safe = answer.split("\n").filter(line => !/(?:на\s+руки|net\s+salary|к\s+выдаче|расходы\s+работодателя|полные\s+расходы).*\d/iu.test(line)).join("\n")
    return "⚠️ **Проверка внутренней согласованности не пройдена.** Следующие результаты нельзя считать подтверждёнными:\n" +
      problems.map((problem) => "- " + problem).join("\n") + "\n\nПротиворечивые итоговые суммы скрыты; уточните исходные данные и условия.\n\n" + safe
  }
  if (!highRisk) return answer
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
