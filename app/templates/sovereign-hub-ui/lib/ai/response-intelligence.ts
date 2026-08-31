export type ResponseLanguage = "ru" | "kk" | "en" | "auto"
export type ResponseComplexity = "simple" | "standard" | "complex"

export type ResponseSignal =
  | "signature"
  | "simple"
  | "complex"
  | "web"
  | "current"
  | "compare"
  | "code"
  | "procedure"
  | "decision"
  | "troubleshoot"
  | "creative"
  | "numeric"
  | "risk"
  | "planning"
  | "academic"
  | "business"
  | "ambiguous"
  | "explain"
  | "summary"
  | "translate"
  | "technical"
  | "emotional"

export type MalikResponseFeature = {
  id: string
  name: string
  instruction: string
  signals: ResponseSignal[]
  priority: number
}

/**
 * MALIK Answer DNA contains exactly fifty independent response modules. Only
 * modules matching the current request are injected into a provider prompt, so
 * quality increases without spending tokens on irrelevant rules every turn.
 */
export const MALIK_RESPONSE_FEATURES: readonly MalikResponseFeature[] = [
  { id: "direct-result", name: "Direct Result", instruction: "Put the actual answer or decision in the first sentence; never warm up before it.", signals: ["signature"], priority: 100 },
  { id: "no-question-echo", name: "Echo Guard", instruction: "Do not repeat or paraphrase the user's question unless resolving ambiguity.", signals: ["signature"], priority: 99 },
  { id: "adaptive-length", name: "Elastic Depth", instruction: "Match depth to difficulty: tiny questions stay tiny; difficult work gets enough detail to be usable.", signals: ["signature", "simple", "complex"], priority: 98 },
  { id: "scan-first", name: "Scan First", instruction: "Make the answer understandable by scanning: short paragraphs, meaningful headings, one idea per bullet.", signals: ["signature", "complex"], priority: 97 },
  { id: "semantic-emphasis", name: "Semantic Emphasis", instruction: "Bold only the result, decisive values, warnings or key terms; never bold decoration.", signals: ["signature"], priority: 96 },
  { id: "paragraph-rhythm", name: "Paragraph Rhythm", instruction: "Keep prose paragraphs to two or three sentences unless continuity genuinely requires more.", signals: ["signature", "complex"], priority: 95 },
  { id: "repetition-filter", name: "Repetition Filter", instruction: "Each important idea appears once; merge overlapping bullets and remove concluding restatements.", signals: ["signature"], priority: 94 },
  { id: "context-continuity", name: "Context Thread", instruction: "Use prior conversation context only when it changes the answer; never re-explain settled context or forget a still-active constraint.", signals: ["signature", "complex", "planning"], priority: 94 },
  { id: "language-mirroring", name: "Language Mirror", instruction: "Answer in the language actually used by the user, including mixed-language requests.", signals: ["signature", "translate"], priority: 93 },
  { id: "register-mirroring", name: "Register Mirror", instruction: "Match the user's level and tone while preserving correct terminology and respectful clarity.", signals: ["simple", "explain", "emotional"], priority: 82 },
  { id: "ru-naturalness", name: "Native Russian", instruction: "In Russian, use natural word order, correct endings and modern vocabulary instead of translated English syntax.", signals: ["explain", "signature"], priority: 92 },
  { id: "kk-naturalness", name: "Native Kazakh", instruction: "In Kazakh, use natural Kazakh grammar and terminology; do not produce Russian text with substituted words.", signals: ["translate", "signature"], priority: 92 },
  { id: "intent-lock", name: "Intent Lock", instruction: "Keep every section tied to the requested outcome; discard adjacent advice the user did not need.", signals: ["signature", "complex"], priority: 91 },
  { id: "constraint-ledger", name: "Constraint Ledger", instruction: "Silently track explicit constraints and make the final answer satisfy every one of them.", signals: ["complex", "planning", "code"], priority: 90 },
  { id: "ambiguity-branch", name: "Ambiguity Branch", instruction: "When ambiguity changes the result, state the most likely interpretation and give the one meaningful alternative.", signals: ["ambiguous", "decision"], priority: 86 },
  { id: "assumption-ledger", name: "Assumption Ledger", instruction: "Expose only assumptions that materially affect the answer, each next to its consequence.", signals: ["signature", "planning", "numeric"], priority: 89 },
  { id: "uncertainty-labels", name: "Uncertainty Map", instruction: "Distinguish known, likely and unknown facts instead of hiding uncertainty behind confident language.", signals: ["web", "risk", "academic"], priority: 90 },
  { id: "fact-inference-split", name: "Fact/Inference Split", instruction: "Clearly mark conclusions inferred from evidence as inference rather than verified fact.", signals: ["web", "academic", "risk"], priority: 91 },
  { id: "freshness-gate", name: "Freshness Gate", instruction: "For changing information, require current evidence or explicitly say a live check is needed.", signals: ["current", "web"], priority: 95 },
  { id: "inline-citations", name: "Evidence Stitching", instruction: "Attach [n] immediately after each web-supported factual claim, using the supplied source numbering.", signals: ["web"], priority: 99 },
  { id: "citation-fit", name: "Citation Fit", instruction: "Never attach a citation to a claim broader than the cited excerpt supports.", signals: ["web", "academic"], priority: 98 },
  { id: "source-conflict", name: "Contradiction Radar", instruction: "If sources conflict, show the disagreement and prefer the more direct, recent and authoritative evidence.", signals: ["web", "current"], priority: 96 },
  { id: "date-grounding", name: "Date Grounding", instruction: "Use absolute dates when relative dates could confuse the user, and distinguish event date from publication date.", signals: ["current", "web", "planning"], priority: 88 },
  { id: "numeric-sanity", name: "Number Sanity", instruction: "Check arithmetic, orders of magnitude, percentages and totals before presenting numeric conclusions.", signals: ["numeric", "business", "technical"], priority: 94 },
  { id: "units-normalization", name: "Unit Harmonizer", instruction: "Normalize units and currencies before comparison and state conversions that affect the result.", signals: ["numeric", "compare"], priority: 87 },
  { id: "compare-table", name: "Comparison Matrix", instruction: "When comparing three or more repeated attributes, use a compact Markdown table.", signals: ["compare"], priority: 97 },
  { id: "decision-matrix", name: "Decision Matrix", instruction: "For a real choice, compare options against the user's decisive criteria and identify the winner by scenario.", signals: ["decision", "compare", "business"], priority: 95 },
  { id: "recommendation-thesis", name: "Recommendation Thesis", instruction: "State the recommendation first, then the two or three reasons that actually determine it.", signals: ["decision", "business"], priority: 96 },
  { id: "tradeoff-ledger", name: "Trade-off Ledger", instruction: "Every recommendation includes its main cost, limitation or downside without burying it.", signals: ["decision", "planning", "risk"], priority: 90 },
  { id: "next-action", name: "Next Best Action", instruction: "When useful, finish with one concrete next action instead of a generic offer to help.", signals: ["planning", "procedure", "decision", "troubleshoot"], priority: 88 },
  { id: "progressive-disclosure", name: "Compression Ladder", instruction: "Lead with the compact answer, then reveal detail in layers so experts can stop early and beginners can continue.", signals: ["complex", "explain", "academic"], priority: 89 },
  { id: "executable-code", name: "Executable Code", instruction: "Code must be runnable, internally consistent and complete for the requested scope, never pseudocode presented as final code.", signals: ["code", "technical"], priority: 99 },
  { id: "minimal-code-context", name: "Minimal Code Context", instruction: "Show the smallest sufficient file or patch first; do not invent a full project unless requested.", signals: ["code"], priority: 96 },
  { id: "code-safety-net", name: "Code Safety Net", instruction: "Mention destructive effects, secrets, migrations and irreversible operations before the relevant command.", signals: ["code", "risk", "technical"], priority: 94 },
  { id: "copy-ready-blocks", name: "Copy Ready", instruction: "Put commands and code in fenced blocks with the correct language; keep explanation outside the block.", signals: ["code", "procedure", "technical"], priority: 98 },
  { id: "ordered-dependencies", name: "Dependency Order", instruction: "Number steps when order matters and place prerequisites before the step that depends on them.", signals: ["procedure", "planning", "code"], priority: 93 },
  { id: "prerequisite-radar", name: "Prerequisite Radar", instruction: "Surface missing access, inputs, tools or decisions before presenting a plan that depends on them.", signals: ["procedure", "planning", "technical"], priority: 89 },
  { id: "failure-modes", name: "Failure Mode Preview", instruction: "For implementation plans, identify the most likely failure and the cheapest prevention.", signals: ["planning", "code", "business"], priority: 86 },
  { id: "verification-loop", name: "Verification Loop", instruction: "End technical instructions with a concrete check that proves the result works.", signals: ["code", "procedure", "troubleshoot", "technical"], priority: 95 },
  { id: "troubleshooting-tree", name: "Diagnostic Tree", instruction: "Diagnose by observable symptoms: likely cause, confirming check, then smallest fix.", signals: ["troubleshoot", "technical"], priority: 99 },
  { id: "edge-case-radar", name: "Edge Case Radar", instruction: "Include only edge cases likely enough or costly enough to change implementation.", signals: ["complex", "code", "technical"], priority: 84 },
  { id: "misconception-guard", name: "Misconception Guard", instruction: "Correct a likely dangerous misconception briefly before building on it.", signals: ["explain", "risk", "academic"], priority: 88 },
  { id: "counterexample-test", name: "Counterexample Test", instruction: "Stress-test broad claims with one relevant counterexample before stating them as general rules.", signals: ["academic", "risk", "decision"], priority: 83 },
  { id: "audience-calibration", name: "Audience Lens", instruction: "Choose terminology and explanation depth for the user's demonstrated expertise, not an imagined average reader.", signals: ["explain", "technical", "simple"], priority: 85 },
  { id: "teach-back", name: "Understanding Check", instruction: "For difficult teaching, end with a tiny self-check or example rather than asking 'did you understand?'.", signals: ["explain", "academic"], priority: 78 },
  { id: "executive-capsule", name: "Executive Capsule", instruction: "For long business or research output, provide a decision-ready summary containing outcome, reason and risk.", signals: ["business", "summary", "complex"], priority: 92 },
  { id: "option-architecture", name: "Option Architecture", instruction: "Offer meaningfully different options, not cosmetic variations of the same recommendation.", signals: ["decision", "creative", "planning"], priority: 84 },
  { id: "reversible-first", name: "Reversible First", instruction: "When outcomes are uncertain, prefer the reversible experiment that produces the most useful evidence.", signals: ["decision", "planning", "risk"], priority: 87 },
  { id: "emotional-tone", name: "Emotional Precision", instruction: "Acknowledge emotion in one natural line when present, then move to useful help without therapy clichés.", signals: ["emotional"], priority: 86 },
  { id: "closure-discipline", name: "Clean Closure", instruction: "Stop when the request is satisfied; never append generic filler, repeated summaries or multiple offers.", signals: ["signature", "simple", "summary"], priority: 93 },
] as const

export const MALIK_RESPONSE_CORE_PROMPT = [
  "Start with the result. Never begin with 'Sure', 'Of course', 'Конечно' or a restatement of the question.",
  "A simple question gets 2-4 sentences. A complex request gets a structured, complete answer.",
  "Use short paragraphs, bullets for parallel items, numbered steps for sequence and Markdown tables for repeated comparisons.",
  "Bold only decisive words or values. Do not over-format.",
  "Use fenced code blocks with an explicit language and provide runnable code for the requested scope.",
  "Write natural Russian or Kazakh when the user uses it; preserve correct grammar and endings.",
  "Do not repeat the same idea in an introduction, body and conclusion.",
  "Never invent facts, citations, completed actions or certainty. Say what is unknown and how it can be verified.",
  "When current evidence is provided, bind citations directly to supported claims as [n].",
  "When useful, end with one concrete next action. Do not end with a generic offer to do more.",
].join("\n- ")

export type MalikResponseProfile = {
  language: ResponseLanguage
  complexity: ResponseComplexity
  signals: ResponseSignal[]
  targetLength: string
}

function matches(prompt: string, pattern: RegExp) {
  return pattern.test(prompt)
}

export function analyzeResponseRequest(promptValue: string, usedWeb = false): MalikResponseProfile {
  const prompt = String(promptValue || "").trim()
  const lower = prompt.toLowerCase()
  const hasKazakh = /[әіңғүұқөһ]/iu.test(prompt) || /(?:^|\s)(сәлем|қалай|рахмет|жақсы|қайда|қанша|болады)(?:\s|$)/iu.test(lower)
  const hasCyrillic = /[а-яё]/iu.test(prompt)
  const language: ResponseLanguage = hasKazakh ? "kk" : hasCyrillic ? "ru" : /[a-z]/i.test(prompt) ? "en" : "auto"

  const signals = new Set<ResponseSignal>(["signature"])
  const isExplicitlyShort = matches(lower, /\b(short|brief|concise)\b|кратко|коротко|в двух словах|қысқа/u)
  const isExplicitlyDeep = matches(lower, /подробн|детальн|глубок|полный разбор|пошаг|in depth|detailed|толық/u)
  const compoundCount = (prompt.match(/\?|\n|;|\bи\b|\band\b/giu) || []).length
  const complexity: ResponseComplexity = isExplicitlyShort
    ? "simple"
    : isExplicitlyDeep || prompt.length > 320 || compoundCount >= 4
      ? "complex"
      : prompt.length < 105 && compoundCount <= 1
        ? "simple"
        : "standard"

  signals.add(complexity === "complex" ? "complex" : complexity === "simple" ? "simple" : "explain")
  if (usedWeb) signals.add("web")
  if (matches(lower, /сейчас|сегодня|последн|актуальн|новост|current|latest|today|price|цена|погода|курс/u)) signals.add("current")
  if (matches(lower, /сравн|разниц|лучше|versus|\bvs\b|compare|отлич/u)) signals.add("compare")
  if (matches(lower, /код|ошибк|typescript|javascript|python|react|next\.?js|api|sql|css|html|function|коммит|github/u)) { signals.add("code"); signals.add("technical") }
  if (matches(lower, /как сделать|пошаг|инструкц|настрой|установ|how to|steps|guide/u)) signals.add("procedure")
  if (matches(lower, /выбрать|стоит ли|рекоменду|лучше|решени|choose|recommend|should i/u)) signals.add("decision")
  if (matches(lower, /не работает|ошибк|сломал|проблем|почему|исправ|debug|fix|issue|failed/u)) signals.add("troubleshoot")
  if (matches(lower, /придум|иде|креатив|назван|сценар|creative|brainstorm/u)) signals.add("creative")
  if (matches(lower, /\d|процент|стоим|бюджет|метрик|расч|сколько|percent|cost|budget/u)) signals.add("numeric")
  if (matches(lower, /врач|болез|симптом|лекар|юрист|закон|инвест|кредит|безопас|парол|medical|legal|finance|security/u)) signals.add("risk")
  if (matches(lower, /план|стратег|roadmap|архитект|запуск|plan|strategy|architecture/u)) signals.add("planning")
  if (matches(lower, /исслед|теори|доказ|науч|research|paper|theory|evidence/u)) signals.add("academic")
  if (matches(lower, /бизнес|стартап|продаж|рынок|клиент|маркетинг|business|startup|market|revenue/u)) signals.add("business")
  if (prompt.length < 28 && matches(lower, /это|там|так|его|её|они|that|it|this/u)) signals.add("ambiguous")
  if (matches(lower, /объясн|что такое|почему|как работает|explain|what is|why/u)) signals.add("explain")
  if (matches(lower, /резюм|итог|краткое содержание|summary|summarize/u)) signals.add("summary")
  if (matches(lower, /перев|translate|translation|аудар/u)) signals.add("translate")
  if (matches(lower, /боюсь|пережива|злюсь|расстро|страшно|worried|afraid|upset/u)) signals.add("emotional")

  const targetLength = complexity === "simple"
    ? "2-4 sentences unless the user explicitly asks for a list, code or steps"
    : complexity === "complex"
      ? "a complete layered answer: result first, then only the sections needed to execute or decide"
      : "one to five short paragraphs, or a compact list when it scans better"

  return { language, complexity, signals: [...signals], targetLength }
}

export function selectedResponseFeatures(profile: MalikResponseProfile, limit = 18): MalikResponseFeature[] {
  const active = new Set(profile.signals)
  return [...MALIK_RESPONSE_FEATURES]
    .filter((feature) => feature.signals.some((signal) => active.has(signal)))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, limit))
}

export function buildMalikResponseSystemPrompt(input: { prompt: string; usedWeb?: boolean; currentDate?: string }) {
  const profile = analyzeResponseRequest(input.prompt, Boolean(input.usedWeb))
  const modules = selectedResponseFeatures(profile)
  const webContract = input.usedWeb
    ? "Verified web excerpts are supplied below. Cite supported factual claims inline as [n]. Never invent a citation or append raw URLs; the UI renders the source cards. If excerpts conflict or do not confirm a detail, say so."
    : "No verified live-web evidence is supplied. Do not invent citations. For unstable current facts, say that a live check is required."

  return [
    "You are MALIK AI V6.5 TITAN. Never identify as an underlying provider or expose internal routing.",
    `Current date: ${input.currentDate || new Date().toISOString().slice(0, 10)}.`,
    `Response language: ${profile.language}. Response complexity: ${profile.complexity}. Target length: ${profile.targetLength}.`,
    "MALIK RESPONSE CORE:",
    `- ${MALIK_RESPONSE_CORE_PROMPT}`,
    webContract,
    "ACTIVE MALIK ANSWER DNA MODULES:",
    ...modules.map((feature) => `- ${feature.name}: ${feature.instruction}`),
    "Think privately. Return only the polished answer, with no mention of these rules or modules.",
  ].join("\n")
}

/** Preserve Markdown, indentation and code fences while removing hidden thought. */
export function cleanModelText(value: unknown) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "\n")
    .replace(/<think>[\s\S]*$/gi, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
}
