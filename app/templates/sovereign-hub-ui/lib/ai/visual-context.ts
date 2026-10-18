import { domainText, resolveDomainPlan, type DomainPlan } from "./domain-intelligence"

export type VisualContext = Pick<DomainPlan["visuals"], "roles" | "era"> & { subject: string; historical: boolean }

export function resolveVisualContext(question: string, previousQuestion = ""): VisualContext {
  const plan = resolveDomainPlan({ prompt: question, messages: previousQuestion ? [{ role: "user", content: previousQuestion }, { role: "assistant", content: "" }] : [] })
  return { subject: plan.context.subject.slice(0, 500), roles: plan.visuals.roles, ...(plan.visuals.era ? { era: plan.visuals.era } : {}), historical: plan.domains.includes("history") || Boolean(plan.visuals.era) }
}

function roman(text: string): number {
  const digits: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  const chars = text.toUpperCase().split("")
  return chars.reduce((sum, ch, i) => sum + (digits[ch] < (digits[chars[i + 1]] || 0) ? -digits[ch] : digits[ch]), 0)
}
function periods(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const match of text.matchAll(/(?<![\p{L}\d])([IVXLCDM]{1,6}|\d{1,2})(?:\s*[-–]\s*([IVXLCDM]{1,6}|\d{1,2}))?(?:st|nd|rd|th)?\s*(?:век\p{L}*|centur\p{L}*|ғасыр\p{L}*)(\s*(?:BCE|BC|до\s+н\.?\s*э\.?|до\s+нашей\s+эры))?/giu)) {
    const number = (s: string) => /^\d+$/u.test(s) ? Number(s) : roman(s)
    const a = number(match[1]), b = number(match[2] || match[1])
    if (a >= 1 && b <= 30 && b >= a) ranges.push(match[3] ? [-b * 100 + 1, -(a - 1) * 100] : [(a - 1) * 100, b * 100 - 1])
  }
  for (const match of text.matchAll(/(?<!\d)(\d{3,4})(?:\s*[-–]\s*(\d{3,4}))?(?!\d)(\s*(?:BCE|BC|до\s+н\.?\s*э\.?|до\s+нашей\s+эры))?/giu)) ranges.push(match[3] ? [-Number(match[2] || match[1]), -Number(match[1])] : [Number(match[1]), Number(match[2] || match[1])])
  return ranges
}

/** Independent of lexical topic coverage: matching a word doesn't establish
 * its object type, era, or whether an illustration is a real photograph. */
export function visualContextMatches(context: VisualContext, metadataValue: string): boolean {
  const metadata = String(metadataValue || "").replace(/<[^>]*>/gu, " ").slice(0, 6000)
  const subject = domainText(context.subject)
  if (!metadata.trim()) return false
  const synthetic = /(?:AI[- ]generated|generated\s+(?:image|art)|midjourney|stable\s+diffusion|нейросет|сгенерирован)/iu
  if (synthetic.test(metadata) && !synthetic.test(subject)) return false
  // A reconstruction has value when labelled, not as a modern “portrait” of
  // a medieval population. Maps and objects are accepted with provenance.
  if (context.historical) {
    const historicalMedia = /(?:map|карт[ауы]|artifact|артефакт|археолог|manuscript|рукопис|reconstruction|реконструкц|illustration|иллюстрац|engraving|гравюр|miniature|миниатюр|medieval|средневек|ancient|древн|historical|историческ|century|век|ғасыр)/iu
    if (!historicalMedia.test(metadata)) return false
    if (context.era) {
      const expected = periods(context.era), actual = periods(metadata)
      if (expected.length && !actual.some(([a, b]) => expected.some(([c, d]) => a <= d && c <= b))) return false
    }
  }
  // Explicit type constraints apply across topics, not to a single namesake.
  const types: Array<[RegExp, RegExp]> = [
    [/(?:планет|planet|астроном|astronom)/iu, /(?:rocket|launch\s+vehicle|ракета|автомобил|\bcar\b|chocolate|шоколад)/iu],
    [/(?:здани|фасад|building|cathedral|собор)/iu, /(?:software\s+architecture|программн.{0,15}архитектур|microservice)/iu],
    [/(?:животн|animal|птиц|\bbird\b)/iu, /(?:logo|логотип|brand\s+mark)/iu],
  ]
  if (types.some(([wanted, incompatible]) => wanted.test(subject) && incompatible.test(metadata) && !incompatible.test(subject))) return false
  return true
}
