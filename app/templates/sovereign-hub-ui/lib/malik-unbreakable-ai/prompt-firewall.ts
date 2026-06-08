import { UNBREAKABLE_LIMITS } from "./constants"

export function sanitizePrompt(prompt: string) {
  return String(prompt || "")
    .split("\u0000")
    .join("")
    .trim()
    .slice(0, UNBREAKABLE_LIMITS.maxPromptChars)
}

export function promptFirewall(prompt: string) {
  const clean = sanitizePrompt(prompt)
  const warnings: string[] = []
  if (!clean) warnings.push("Prompt is empty.")
  if (clean.length > 6000) warnings.push("Prompt is large; token economy will compress context.")
  if (/api[_-]?key|secret|password|token/i.test(clean)) warnings.push("Prompt may contain secret-like text.")
  return {
    ok: clean.length > 0,
    clean,
    warnings,
  }
}

