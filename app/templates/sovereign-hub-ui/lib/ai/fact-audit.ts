/**
 * Fact grounding audit — the answer is checked against its own sources before
 * the user reads it.
 *
 * The pain this solves: a chat with web search attached still writes figures
 * that are in none of the pages it read. The system prompt asks the model not
 * to ("Never invent a citation"), and the source deck shows which pages were
 * open, but nothing has ever compared the two. So the confident wrong number
 * and the confident right number look identical on screen, and the reader has
 * to open five tabs to tell them apart. That is the reason people re-check
 * every AI answer by hand, and the reason they do not use one for work.
 *
 * What this module does is narrow on purpose. It does not judge meaning, it
 * does not call a model, and it costs nothing: it takes every *substantive
 * figure* in the answer — percentages, money, scaled amounts, decimals, large
 * integers, years — and asks one mechanical question. Does this number occur
 * anywhere in the pages the answer was written from? It also checks that every
 * [n] marker points at a source that exists.
 *
 * Both questions have provable answers, which is the whole point: a verdict
 * here is arithmetic, not a second opinion from another model that can be
 * wrong in the same direction as the first.
 *
 * Deliberately NOT checked, because each would cry wolf:
 *  - quotations. Snippets are capped at ~2200 characters, so a real quotation
 *    from further down the page would be reported missing.
 *  - claims with no number in them. Deciding whether prose is entailed by a
 *    snippet needs a model, and a model's guess is not evidence.
 *  - anything at all when no page was read. With nothing to compare against,
 *    every figure would be flagged, which teaches the reader to ignore the
 *    flag. Silence is the honest output.
 *
 * Matching is tolerant by design. A missed hallucination costs the reader
 * nothing they did not already have; a false alarm on a correctly rounded
 * figure costs them their trust in the whole feature. So rounding is accepted
 * (2% on scaled amounts, half a point on percentages), thousands separators
 * and decimal commas are normalised, "1.2 million" matches "1 200 000", and
 * numbers the user supplied in the question count as grounded.
 */

export type MalikFactVerdict = "supported" | "missing" | "bad-citation" | "unchecked"

export type MalikFactClaim = {
  id: string
  kind: "figure" | "citation"
  /** The figure exactly as the answer wrote it, or the broken [n] marker. */
  value: string
  /** The sentence it stands in, trimmed for display. */
  sentence: string
  verdict: MalikFactVerdict
  /** 1-based indexes of the sources the figure was found in. */
  sourceIndexes: number[]
  note?: string
}

export type MalikFactAudit = {
  /** Substantive figures the answer stated. Citations are counted separately. */
  checked: number
  /** Figures found in at least one page, or supplied by the question. */
  supported: number
  /** Figures found nowhere. */
  missing: number
  /** [n] markers pointing at a source that does not exist. */
  brokenCitations: number
  claims: MalikFactClaim[]
  summary: string
  /**
   * "unchecked" means no page was read at all: `checked` is then how many
   * figures *could* be checked, and supported/missing are both zero. The
   * reader is one tap away from turning it into one of the other two.
   */
  status: "clean" | "flagged" | "unchecked"
}

export type MalikFactAuditSource = {
  title?: string
  url?: string
  domain?: string
  snippet?: string
}

const MAX_REPORTED_CLAIMS = 24
const SENTENCE_DISPLAY_LIMIT = 170

/** Thin spaces and non-breaking spaces group thousands too. */
const ODD_SPACES = /[    ⁠]/g

/**
 * One scanner for the answer and for the pages, so the two sides are read by
 * the same rules. Groups: 1 = the guard character, 2 = a leading currency
 * sign, 3 = the number, 4 = the trailing unit or word.
 */
const FIGURE_SCAN = /(^|[^\d.,\w])([$€£₸¥]\s?)?(\d{1,3}(?: \d{3})+|\d{1,3}(?:,\d{3})+|\d+(?:[.,]\d+)?)\s*(%|[$€£₸¥]|[A-Za-zА-Яа-яЁё]{1,12}(?![A-Za-zА-Яа-яЁё]))?/g

const CITATION_SCAN = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g

const SCALES: Array<[RegExp, number]> = [
  [/^(?:тыс|тысяч[аиеу]?|тысячи|thousand|thousands|k)$/i, 1e3],
  [/^(?:млн|миллион[аовы]*|million|millions|mn)$/i, 1e6],
  [/^(?:млрд|миллиард[аовы]*|billion|billions|bn)$/i, 1e9],
  [/^(?:трлн|триллион[аовы]*|trillion|trillions)$/i, 1e12],
]

const PERCENT_WORD = /^(?:процент[аовы]*|percent|pct)$/i

const CURRENCY_WORD = /^(?:доллар[аовы]*|долл|евро|тенге|рубл[ейяь]*|руб|фунт[аовы]*|usd|eur|kzt|rub|gbp|dollars?|euros?)$/i

function normalizeSpaces(value: unknown) {
  return String(value ?? "").replace(ODD_SPACES, " ")
}

/**
 * Regions the audit must not read. A number inside a code block is a literal
 * the user asked for, not a claim about the world; a number inside a URL or an
 * e-mail address is an address.
 */
function stripUncheckable(answer: string) {
  return normalizeSpaces(answer)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/```[\s\S]*$/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!?\]\([^)\s]*\)/g, "] ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
}

function scaleOf(unit: string) {
  if (!unit) return 0
  for (const [pattern, multiplier] of SCALES) if (pattern.test(unit)) return multiplier
  return 0
}

/**
 * "1 234" and "1,234" are one thousand two hundred and thirty-four; "1,5" is
 * one and a half. The difference is whether the separator is followed by
 * exactly three digits, repeatedly.
 */
function numericValue(raw: string): number | null {
  const text = raw.trim()
  if (/^\d{1,3}(?: \d{3})+$/.test(text) || /^\d{1,3}(?:,\d{3})+$/.test(text)) {
    const grouped = Number(text.replace(/[ ,]/g, ""))
    return Number.isFinite(grouped) ? grouped : null
  }
  const plain = Number(text.replace(",", "."))
  return Number.isFinite(plain) ? plain : null
}

type FigureKind = "year" | "percent" | "scaled" | "money" | "decimal" | "large"

type ScannedFigure = {
  /** As written, with its sign or unit, for display. */
  text: string
  /** The number as written. */
  value: number
  /** The number with any scale word applied: "3.5 млн" → 3_500_000. */
  expanded: number
  /** The size of the last significant place, scaled: "3.5 млн" → 100_000. */
  step: number
  scale: number
  kind: FigureKind
}

/**
 * How precisely the figure was written. "1.2" claims tenths, "12 400" claims
 * hundreds, "1247" claims units. This is what makes rounding legible: a page
 * saying 1 247 000 agrees with an answer saying 1.2 млн, because 1.2 млн only
 * ever claimed to be right to the nearest hundred thousand.
 */
function precisionOf(raw: string): number {
  const text = raw.trim()
  if (/^\d{1,3}(?: \d{3})+$/.test(text) || /^\d{1,3}(?:,\d{3})+$/.test(text)) {
    return trailingZeroStep(text.replace(/[ ,]/g, ""))
  }
  const parts = text.split(/[.,]/)
  if (parts.length > 1) return Math.pow(10, -parts[1].length)
  return trailingZeroStep(parts[0])
}

function trailingZeroStep(digits: string) {
  const zeros = /0+$/.exec(digits)
  return zeros ? Math.pow(10, Math.min(zeros[0].length, 6)) : 1
}

function classify(raw: string, value: number, currency: string, unit: string): FigureKind | null {
  if (unit === "%" || PERCENT_WORD.test(unit)) return "percent"
  if (scaleOf(unit)) return "scaled"
  if (currency || /^[$€£₸¥]$/.test(unit) || CURRENCY_WORD.test(unit)) return "money"
  if (Number.isInteger(value) && value >= 1900 && value <= 2100) return "year"
  // A bare decimal under a hundred is nearly always a version, not a
  // statistic — "Next.js 16.1", "GPT-4.5". Those belong to the answer, not to
  // the sources, and flagging them would be the feature's first false alarm.
  if (/[.,]\d/.test(raw) && value >= 100) return "decimal"
  if (value >= 1000) return "large"
  // Everything else is structure, not statistics: "5 причин", "24 часа",
  // "топ-10". Flagging those would bury the figures that matter.
  return null
}

function scanFigures(text: string): ScannedFigure[] {
  const found: ScannedFigure[] = []
  FIGURE_SCAN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FIGURE_SCAN.exec(text))) {
    const currency = match[2] || ""
    const raw = match[3] || ""
    const unit = match[4] || ""
    const value = numericValue(raw)
    if (value == null) continue
    const kind = classify(raw, value, currency.trim(), unit.trim())
    if (!kind) continue
    const suffix = unit.trim()
    const scale = scaleOf(suffix) || 1
    found.push({
      text: `${currency.trim()}${raw}${suffix && suffix !== "%" ? ` ${suffix}` : suffix}`.trim(),
      value,
      expanded: value * scale,
      step: precisionOf(raw) * scale,
      scale,
      kind,
    })
  }
  return found
}

/** Every number a page states, both as written and with its scale applied. */
function scanValues(text: string): number[] {
  const values: number[] = []
  for (const figure of scanFiguresLoosely(text)) {
    values.push(figure.value)
    if (figure.expanded !== figure.value) values.push(figure.expanded)
  }
  return values
}

/**
 * The page side keeps every number, not only the substantive ones: a source
 * writing "42" is evidence for an answer writing "42%".
 */
function scanFiguresLoosely(text: string): Array<{ value: number; expanded: number }> {
  const found: Array<{ value: number; expanded: number }> = []
  FIGURE_SCAN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FIGURE_SCAN.exec(text))) {
    const raw = match[3] || ""
    const unit = (match[4] || "").trim()
    const value = numericValue(raw)
    if (value == null) continue
    const scale = scaleOf(unit)
    found.push({ value, expanded: scale ? value * scale : value })
  }
  return found
}

/**
 * How far a page may sit from the answer and still count as agreeing with it.
 *
 * A year is a year, so nothing is allowed. A percentage may be rounded to the
 * place it was written to, but no further — 83% and 85% are a real
 * disagreement and the reader should see it. Everything else gets the
 * generous rule: half the place it was written to, or two per cent, whichever
 * admits more, because the figures that matter are large and get rounded on
 * the way into a sentence.
 */
function toleranceFor(figure: ScannedFigure) {
  if (figure.kind === "year") return 0
  if (figure.kind === "percent") return Math.max(figure.step / 2, 0.5)
  return Math.max(figure.step / 2, Math.abs(figure.expanded) * 0.02)
}

function near(target: number, slack: number, values: number[]) {
  return values.some((candidate) => Math.abs(candidate - target) <= slack)
}

/**
 * A page agrees with the figure if it states the same amount either as the
 * answer wrote it or with the scale word spelled out — "3.5 млн" is met by
 * both "3,5" in a table and "3 500 000" in prose.
 */
function figureFoundIn(figure: ScannedFigure, values: number[]) {
  const slack = toleranceFor(figure)
  if (near(figure.expanded, slack, values)) return true
  return figure.scale > 1 && near(figure.value, slack / figure.scale, values)
}

function sentencesOf(text: string) {
  return normalizeSpaces(text)
    .split(/\n+/)
    .flatMap((line) => line.replace(/([.!?…])\s+/g, "$1\u0000").split("\u0000"))
    .map((line) => line
      .replace(/^\s*[#>*+-]+\s*/, "")
      .replace(/^\s*\d+[.)]\s+/, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean)
}

/**
 * What makes two mentions of a figure the same figure. Rounded, because
 * 8.3 × 10⁹ is 8300000000.000001 in binary floating point and an id is no
 * place to carry that.
 */
function claimKey(figure: ScannedFigure) {
  return `${figure.kind}:${Math.round(figure.expanded * 1000) / 1000}`
}

function shorten(sentence: string) {
  if (sentence.length <= SENTENCE_DISPLAY_LIMIT) return sentence
  return `${sentence.slice(0, SENTENCE_DISPLAY_LIMIT - 1).trimEnd()}…`
}

function plural(count: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(count) % 100
  const mod10 = mod100 % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/** «Все 2 факта», «Все 5 фактов» — agreement with the number itself. */
function factWord(count: number) {
  return plural(count, "факт", "факта", "фактов")
}

/** «из 1 факта», «из 2 фактов» — the genitive «из» governs, not the number. */
function factWordAfterOutOf(count: number) {
  const mod100 = Math.abs(count) % 100
  return mod100 !== 11 && mod100 % 10 === 1 ? "факта" : "фактов"
}

export function auditAnswerFacts(input: {
  answer: string
  sources: MalikFactAuditSource[]
  prompt?: string
}): MalikFactAudit | null {
  const sources = (input.sources || []).filter((source) => source && (source.snippet || source.title))
  // Nothing was read, so nothing can be compared. Saying so loudly would train
  // the reader to dismiss the badge on the answers where it does mean something.
  if (!sources.length) return null

  const original = normalizeSpaces(input.answer)
  if (!original.trim()) return null

  const claims: MalikFactClaim[] = []
  let checked = 0
  let supported = 0

  // --- citation integrity -------------------------------------------------
  // Purely arithmetic: [7] against five sources is wrong, with no judgement
  // involved. This is the one contract the system prompt states outright, and
  // until now nothing enforced it.
  const citationBody = stripUncheckable(original)
  const broken = new Set<number>()
  CITATION_SCAN.lastIndex = 0
  let citation: RegExpExecArray | null
  while ((citation = CITATION_SCAN.exec(citationBody))) {
    for (const piece of citation[1].split(/[,;]/)) {
      const index = Number(piece.trim())
      if (!Number.isInteger(index)) continue
      if (index < 1 || index > sources.length) broken.add(index)
    }
  }
  for (const index of broken) {
    claims.push({
      id: `citation-${index}`,
      kind: "citation",
      value: `[${index}]`,
      sentence: "",
      verdict: "bad-citation",
      sourceIndexes: [],
      note: `Ссылки [${index}] не существует — источников всего ${sources.length}.`,
    })
  }

  // --- figures ------------------------------------------------------------
  const perSourceValues = sources.map((source) => scanValues(`${source.title || ""} ${source.snippet || ""}`))
  const promptValues = scanValues(normalizeSpaces(input.prompt || ""))

  // Citation markers carry source numbers, not facts, so they leave before the
  // figures are read.
  const answerBody = stripUncheckable(original).replace(CITATION_SCAN, " ")
  const seen = new Set<string>()

  for (const sentence of sentencesOf(answerBody)) {
    for (const figure of scanFigures(sentence)) {
      const key = claimKey(figure)
      if (seen.has(key)) continue
      seen.add(key)
      checked += 1

      const hits: number[] = []
      perSourceValues.forEach((values, index) => {
        if (figureFoundIn(figure, values)) hits.push(index + 1)
      })

      // A number the user put in the question is grounded by the question.
      const fromPrompt = !hits.length && figureFoundIn(figure, promptValues)

      if (hits.length || fromPrompt) {
        supported += 1
        const claim: MalikFactClaim = {
          id: `figure-${key}`,
          kind: "figure",
          value: figure.text,
          sentence: shorten(sentence),
          verdict: "supported",
          sourceIndexes: hits,
        }
        // Set only when there is one, so an audit read back off the wire is
        // identical to the audit that was written.
        if (fromPrompt) claim.note = "Число взято из вашего вопроса."
        claims.push(claim)
        continue
      }

      claims.push({
        id: `figure-${key}`,
        kind: "figure",
        value: figure.text,
        sentence: shorten(sentence),
        verdict: "missing",
        sourceIndexes: [],
        note: "Этого числа нет ни в одном прочитанном источнике — проверьте его отдельно.",
      })
    }
  }

  const brokenCitations = broken.size
  if (!checked && !brokenCitations) return null

  const missing = checked - supported
  // Problems first: the reader opens this panel to find them.
  const order: Record<MalikFactVerdict, number> = { missing: 0, "bad-citation": 1, unchecked: 2, supported: 3 }
  claims.sort((a, b) => order[a.verdict] - order[b.verdict])

  return {
    checked,
    supported,
    missing,
    brokenCitations,
    claims: claims.slice(0, MAX_REPORTED_CLAIMS),
    status: missing || brokenCitations ? "flagged" : "clean",
    summary: buildSummary(checked, supported, missing, brokenCitations),
  }
}

/**
 * The same scan, run on an answer that was written without opening a page.
 *
 * Nothing is judged here — there is nothing to judge against. It reports what
 * *would* be checkable, so the answer can say "written without sources" in one
 * quiet line instead of saying nothing and letting the reader assume the
 * figures were verified. Every one of these claims can be turned into a real
 * verdict by re-running the audit against pages fetched on demand.
 */
export function describeUncheckedAnswer(input: { answer: string; prompt?: string }): MalikFactAudit | null {
  const answer = normalizeSpaces(input.answer)
  if (!answer.trim()) return null

  // An answer that carries code is answering a code question, and the numbers
  // left in its prose are ports, timeouts and sizes — settings, not claims
  // about the world. Offering to check those against the open web is the kind
  // of noise that makes people stop reading the panel everywhere else.
  if (/```/.test(answer)) return null

  const body = stripUncheckable(answer).replace(CITATION_SCAN, " ")
  const claims: MalikFactClaim[] = []
  const seen = new Set<string>()

  for (const sentence of sentencesOf(body)) {
    for (const figure of scanFigures(sentence)) {
      const key = claimKey(figure)
      if (seen.has(key)) continue
      seen.add(key)
      claims.push({
        id: `figure-${key}`,
        kind: "figure",
        value: figure.text,
        sentence: shorten(sentence),
        verdict: "unchecked",
        sourceIndexes: [],
      })
    }
  }

  if (!claims.length) return null

  return {
    checked: claims.length,
    supported: 0,
    missing: 0,
    brokenCitations: 0,
    claims: claims.slice(0, MAX_REPORTED_CLAIMS),
    status: "unchecked",
    summary: claims.length === 1
      ? "Ответ написан без источников — факт не проверен"
      : `Ответ написан без источников — ${claims.length} ${factWord(claims.length)} не проверены`,
  }
}

/**
 * One figure, re-checked against pages fetched for it specifically.
 *
 * This is what a reader gets when they tap a flagged number: rather than being
 * told to go and look, the same audit runs again over sources found for that
 * number alone. A "missing" verdict here is much stronger than the first one —
 * the first only said the figure was absent from pages fetched for the whole
 * question; this says it was absent from pages fetched to find it.
 */
export function recheckFigure(input: {
  claim: string
  sources: MalikFactAuditSource[]
  prompt?: string
}): { verdict: "supported" | "missing"; value: string; sourceIndexes: number[]; summary: string } | null {
  const figure = scanFigures(normalizeSpaces(input.claim))[0]
  if (!figure) return null

  const perSource = (input.sources || []).map((source) => scanValues(`${source.title || ""} ${source.snippet || ""}`))
  const hits: number[] = []
  perSource.forEach((values, index) => {
    if (figureFoundIn(figure, values)) hits.push(index + 1)
  })

  if (hits.length) {
    return {
      verdict: "supported",
      value: figure.text,
      sourceIndexes: hits,
      summary: hits.length === 1
        ? "Подтверждено — число нашлось в источнике"
        : `Подтверждено — число нашлось в ${hits.length} источниках`,
    }
  }

  return {
    verdict: "missing",
    value: figure.text,
    sourceIndexes: [],
    summary: input.sources.length
      ? `Не подтверждено — ${input.sources.length} ${plural(input.sources.length, "страница", "страницы", "страниц")} прочитано, числа нет ни на одной`
      : "Не подтверждено — открытые источники ничего не вернули",
  }
}

const VERDICTS: MalikFactVerdict[] = ["supported", "missing", "bad-citation", "unchecked"]

/**
 * The same audit read back off the wire, or out of a turn that was persisted
 * weeks ago by an older build. Anything that does not have the right shape is
 * dropped rather than rendered half-drawn: a verification badge is only worth
 * showing when its contents are known good.
 */
export function normalizeFactAudit(value: unknown): MalikFactAudit | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const checked = Number(raw.checked)
  const supported = Number(raw.supported)
  if (!Number.isFinite(checked) || !Number.isFinite(supported)) return null

  const claims = (Array.isArray(raw.claims) ? raw.claims : [])
    .map((entry): MalikFactClaim | null => {
      if (!entry || typeof entry !== "object") return null
      const claim = entry as Record<string, unknown>
      const verdict = String(claim.verdict) as MalikFactVerdict
      if (!VERDICTS.includes(verdict)) return null
      const id = String(claim.id || "")
      const text = String(claim.value || "")
      if (!id || !text) return null
      const restored: MalikFactClaim = {
        id,
        kind: claim.kind === "citation" ? "citation" : "figure",
        value: text,
        sentence: String(claim.sentence || ""),
        verdict,
        sourceIndexes: (Array.isArray(claim.sourceIndexes) ? claim.sourceIndexes : [])
          .map((index) => Number(index))
          .filter((index) => Number.isInteger(index) && index > 0),
      }
      // Added only when there is one: an explicit `note: undefined` is a key
      // that survives JSON.stringify as nothing and makes two identical audits
      // compare unequal.
      if (claim.note) restored.note = String(claim.note)
      return restored
    })
    .filter((claim): claim is MalikFactClaim => Boolean(claim))
    .slice(0, MAX_REPORTED_CLAIMS)

  const missing = Number.isFinite(Number(raw.missing)) ? Number(raw.missing) : Math.max(0, checked - supported)
  const brokenCitations = Number.isFinite(Number(raw.brokenCitations)) ? Number(raw.brokenCitations) : 0
  if (!checked && !brokenCitations) return null

  // The status is recomputed rather than trusted: it is what decides how loud
  // the panel is, and a stored turn from an older build may not carry one.
  const unchecked = raw.status === "unchecked" && !supported && !missing && !brokenCitations

  return {
    checked,
    supported,
    missing,
    brokenCitations,
    claims,
    status: unchecked ? "unchecked" : missing || brokenCitations ? "flagged" : "clean",
    summary: String(raw.summary || buildSummary(checked, supported, missing, brokenCitations)),
  }
}

function buildSummary(checked: number, supported: number, missing: number, brokenCitations: number) {
  const citationNote = brokenCitations
    ? `${brokenCitations} ${plural(brokenCitations, "ссылка ведёт", "ссылки ведут", "ссылок ведут")} на несуществующий источник`
    : ""

  if (!checked) return citationNote.charAt(0).toUpperCase() + citationNote.slice(1)

  const figures = missing
    ? `${supported} из ${checked} ${factWordAfterOutOf(checked)} подтверждено источниками · ${missing} не найдено`
    : checked === 1
      ? "Факт в ответе подтверждён источниками"
      : `Все ${checked} ${factWord(checked)} подтверждены источниками`

  return citationNote ? `${figures} · ${citationNote}` : figures
}
