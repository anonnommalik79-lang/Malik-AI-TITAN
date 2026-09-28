/** A conservative guard against invented numeric claims in investor decks. */
function figures(text: string) {
  return [...text.matchAll(/\d+(?:[.,]\d+)*(?:[\s\u00a0]\d{3})*/g)]
    .map((match) => match[0].replace(/[\s\u00a0]/g, "").replace(/,/g, "."))
}

function visibleText(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") return [String(value)]
  if (Array.isArray(value)) return value.flatMap(visibleText)
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) =>
    ["id", "imageUrl", "imageQuery", "imagePrompt", "imageLink", "imageCredit"].includes(key) ? [] : visibleText(child),
  )
}

export function unsupportedInvestorFigures(slide: unknown, knownFacts: string) {
  const allowed = new Set(figures(knownFacts))
  return [...new Set(visibleText(slide).flatMap(figures).filter((number) => !allowed.has(number)))]
}
