import { analyzeResponseRequest } from "@/lib/ai/response-intelligence"

/**
 * Short technical words are matched as whole words: «работа» is not «бот»,
 * «capital» is not «api», «багаж» is not «баг», «программа тренировок» is not
 * programming. A false match sent everyday questions to coding models with
 * coding instructions.
 */
const CODE_WORDS = /(?<![\p{L}\p{N}_])(?:код(?:а|у|ом|е|ы|ов|ами|ах|ик|инг)?|code|coding|html|css|javascript|typescript|python|react(?:js)?|next\.?js|node\.?js|sql|api|index\.html|components?|компонент\p{L}*|функци[яиюей]\p{L}*\s+(?:на|в|для)\s+\p{L}+|скрипт\p{L}*|сайт\p{L}*|веб[- ]?приложени\p{L}*|приложени[ея]\s+(?:на|для)\s+(?:ios|android|react|flutter|swift|kotlin)|программир\p{L}*|программист\p{L}*|алгоритм\p{L}*|бот(?:а|у|ом|е|ы|ов|ами|ах)?|презентаци\p{L}*|слайд\p{L}*|presentations?|slides?|csv|openapi|mermaid|debug\p{L}*|баг(?:а|и|у|ом|ов)?|fix|build|repository|репозитор\p{L}*)(?![\p{L}\p{N}_])/iu
const CODE_SYNTAX = /```|(?:^|\n)\s*(?:import\s+[\w{*]|from\s+\w+\s+import\s)|\b(?:class\s+[A-Z]\w*|function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|def\s+\w+\s*\()/u

export function isCodeRequest(prompt: string) {
  const value = String(prompt || "")
  return CODE_WORDS.test(value) || CODE_SYNTAX.test(value)
    // A bug report is code when it is about software, not about a mistake in life.
    || (/ошибк/iu.test(value) && /(?:консол|терминал|компил|сборк|деплой|сервер|npm|pip|exception|traceback|stack\s*trace|undefined|null|error:|typeerror|syntaxerror)/iu.test(value))
}


/**
 * Short everyday requests run on the responsive lanes. That includes short
 * comparisons and how-tos - the MAX engine keeps them fast on purpose - so the
 * answer's depth is not decided here: the fast-mode instruction defers to the
 * answer contract (overview, head-to-head) instead of asking for brevity.
 */
export function isFastChatRequest(prompt: string, attachments?: readonly unknown[]) {
  const value = String(prompt || "").trim()
  if (!value || attachments?.length || isCodeRequest(value)) return false
  if (value.length > 320 || value.split(/\r?\n/).length > 4) return false

  // Short everyday questions should not pay the latency/cost of deep reasoning.
  // Explicit analysis/research/planning/math-heavy instructions keep the full path.
  if (/(подробн|глубок|проанализ|анализир|исслед|стратег|архитект|докаж|формул|research|deep dive|analy[sz]e|architecture|debug|benchmark)/i.test(value)) return false
  return true
}

/** A short question that still deserves a full, structured answer. */
export function wantsFullShape(prompt: string): boolean {
  const profile = analyzeResponseRequest(prompt)
  return profile.complexity === "complex" || profile.signals.some((signal) => signal === "overview" || signal === "headtohead" || signal === "planning")
}
