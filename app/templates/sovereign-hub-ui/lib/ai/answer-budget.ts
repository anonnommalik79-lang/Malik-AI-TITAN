/**
 * How long an answer may be. The chat's depth setting asks for a size, the
 * brain knows what the task needs, and the user may say it outright ("на
 * 4000 токенов", "2000 слов"). The largest of those wins, but never more
 * than the account's remaining daily allowance (maxTokensCap).
 */
export function answerBudget(body: any, prompt: string, taskTarget: number) {
  const requested = Number(body?.maxTokens) || 0
  const asked = (() => {
    const tokens = String(prompt || "").match(/(\d[\d\s.,]{1,7})\s*(?:токен|tokens?\b)/iu)
    if (tokens) return Math.round(Number(tokens[1].replace(/[\s.,]/g, "")) * 1.15)
    const words = String(prompt || "").match(/(\d[\d\s.,]{1,7})\s*(?:слов|words?\b)/iu)
    if (words) return Math.round(Number(words[1].replace(/[\s.,]/g, "")) * 1.8)
    return 0
  })()
  const wanted = Math.max(requested, taskTarget, Math.min(asked, 32_000))
  const cap = Number(body?.maxTokensCap)
  return Number.isFinite(cap) && cap > 0 ? Math.min(wanted, Math.floor(cap)) : wanted
}
