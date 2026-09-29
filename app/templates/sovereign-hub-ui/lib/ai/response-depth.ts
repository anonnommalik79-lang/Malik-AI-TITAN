export type ResponseDepth = "fast" | "deep" | "ultra"

export function normalizeResponseDepth(value: unknown): ResponseDepth {
  const normalized = String(value || "").toLowerCase()
  if (normalized === "deep") return "deep"
  if (normalized === "ultra" || normalized === "maximum" || normalized === "extra-high") return "ultra"
  return "fast"
}

export function responseDepthInstruction(depth: ResponseDepth) {
  if (depth === "ultra") {
    return [
      "Use maximum useful reasoning depth for this answer.",
      "Privately verify calculations, assumptions, code paths, edge cases and contradictions before finalizing.",
      "For a multi-part prompt, keep a private acceptance checklist and do not finish until every requested section and exact output-format requirement is satisfied.",
      "Prefer a complete correct answer over a short answer; avoid filler and never expose chain-of-thought.",
    ].join(" ")
  }
  if (depth === "deep") {
    return [
      "Reason carefully before answering and privately verify the result.",
      "For numbered, bulleted or rubric-style requests, satisfy every explicit requirement and preserve the requested final format.",
      "Be complete where the task is complex, but do not expose hidden chain-of-thought.",
    ].join(" ")
  }
  return "Answer quickly and directly, but never omit an explicit requested section, constraint, exact phrase, or final format merely to be brief."
}

export function responseDepthLimits(depth: ResponseDepth) {
  if (depth === "ultra") return { maxTokens: 16_000, temperature: 0.4, minAnswerChars: 600 }
  if (depth === "deep") return { maxTokens: 8_000, temperature: 0.35, minAnswerChars: 250 }
  return { maxTokens: 2_200, temperature: 0.3, minAnswerChars: 40 }
}
