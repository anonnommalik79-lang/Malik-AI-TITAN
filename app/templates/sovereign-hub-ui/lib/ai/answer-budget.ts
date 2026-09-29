export function answerBudget(body: any, prompt: string, taskTarget: number) {
  const requested = Number(body?.maxTokens) || 0
  const tokenMatch = prompt.match(/(?:на|about|around|approximately|примерно)\s+(\d{3,6})\s*(?:токен|tokens?)/i)
  const wordMatch = prompt.match(/(?:на|about|around|approximately|примерно)\s+(\d{3,6})\s*(?:слов|words?)/i)
  const asked = tokenMatch
    ? Math.ceil(Number(tokenMatch[1]) * 1.15)
    : wordMatch
      ? Math.ceil(Number(wordMatch[1]) * 1.8)
      : 0

  const lines = String(prompt || "").split(/\r?\n/)
  const requirementCount = lines.filter((line) => /^\s*(?:\d{1,2}[.)]|[-*•])\s+\S/u.test(line)).length
  const strictContract = /(не пропускай|кажд(?:ый|ую|ое)|строго|в самом конце|в конце выведи|таблиц|exact|every requirement|do not skip|finish with|end with|output format)/iu.test(prompt)
  const structuredFloor = prompt.length >= 18_000 || requirementCount >= 12
    ? 14_000
    : prompt.length >= 6_000 || requirementCount >= 8
      ? 10_000
      : prompt.length >= 2_000 || requirementCount >= 5 || strictContract
        ? 7_000
        : 0

  const wanted = Math.max(requested, taskTarget, structuredFloor, Math.min(asked, 32_000))
  const cap = Number(body?.maxTokensCap)
  return Number.isFinite(cap) && cap > 0 ? Math.min(wanted, Math.floor(cap)) : wanted
}
