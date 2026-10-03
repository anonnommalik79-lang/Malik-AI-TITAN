/** Remove conversational instructions without changing the named subject. */
export function normalizeWebSearchQuery(prompt: string): string {
  return prompt.replace(/\[(?:system|assistant|developer|internal)[^\]]*\][\s\S]*$/iu, "")
    .replace(/^(?:ты\s+)?(?:знаеш[ь]?|знаете|расскажи(?:те)?)(?:\s+(?:ли|что[- ]нибудь))?\s+(?:про|о|об)\s+/iu, "")
    .replace(/(?:дай|покажи|перечисли|назови)(?:\s+(?:мне|пожалуйста))?\s+(?:всех\s+)?спикер[\p{L}]*/giu, "спикеры")
    .replace(/^(?:поищи|найди|покажи)(?:\s+мне)?\s+(?:информацию\s+)?(?:про\s+|о\s+)?/iu, "")
    .replace(/\s+/gu, " ").trim().slice(0, 260)
}

/** Keep named events as a whole, rather than matching any generic 'AI' page. */
export function eventSearchTitle(prompt: string): string {
  if (!/(?:спикер|участник|хедлайнер|программ|speakers?|participants?|line[ -]?up|programme?)/iu.test(prompt)) return ""
  const query = normalizeWebSearchQuery(prompt)
  const quoted = query.match(/[«"]([^»"]{3,90})[»"]/u)?.[1]
  if (quoted) return quoted
  const latin = query.match(/[a-z][a-z\d'’-]*(?:\s+[a-z\d][a-z\d'’-]*){1,6}/iu)?.[0] || ""
  return latin.replace(/(?:^|\s)(?:all|the|speakers?|participants?|official|programme?|program|lineup|give|show|list|of|at|for|\d{4})(?=\s|$)/giu, " ").replace(/\s+/gu, " ").trim()
}
