export const PROFESSIONAL_DISCLAIMER =
  "MALIK AI can help draft, summarize and analyze information, but it does not replace licensed professional advice."

export const HONEST_POSITIONING =
  "MALIK AI is a Kazakhstan-built multi-model AI command center combining fast chat, deep reasoning, coding, image generation, video generation, memory and 200 practical AI capabilities."

export const FOUNDER_LINE =
  "Built by Abdumalik Amangeldy, a 16-year-old founder/developer from Kazakhstan."

export const STAGE_LINE =
  "MALIK AI is an early-stage AI platform and release candidate with global ambition."

export function sanitizePublicError(message?: string): string {
  const raw = String(message || "Request failed").slice(0, 280)
  return raw
    .replace(/gsk_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9]+/g, "[redacted]")
    .replace(/ABSK[A-Za-z0-9+/=]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
}

export function validatePrompt(prompt: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(prompt || "").trim()
  if (!value) return { ok: false, error: "prompt_required" }
  if (value.length > 24_000) return { ok: false, error: "prompt_too_long" }
  return { ok: true, value }
}
