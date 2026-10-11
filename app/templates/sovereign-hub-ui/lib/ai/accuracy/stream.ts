import { needsAccuracyGate } from "./engine"

/**
 * No second output buffer. Numeric/scientific turns publish only the checked
 * final content, while SSE activity/heartbeat continues. Ordinary prose keeps
 * deltas until its first numeric/math claim, then the final snapshot takes over.
 */
export function accuracyTokenGate(question: string, emit?: (chunk: string) => void): ((chunk: string) => void) | undefined {
  if (!emit) return undefined
  // Code literals are not answer assertions; keep existing code streaming.
  const code = /^(?:напиши|создай|сделай|исправь|write|create|build|fix)\s+.{0,40}(?:код|скрипт|компонент|сайт|code|script|component|website|react|html)/iu.test(question)
  if (!code && needsAccuracyGate(question)) return undefined
  let held = false
  return chunk => {
    if (held) return
    const index = code ? -1 : chunk.search(/[\d$\\]/u)
    if (index < 0) emit(chunk)
    else { if (index) emit(chunk.slice(0, index)); held = true }
  }
}
