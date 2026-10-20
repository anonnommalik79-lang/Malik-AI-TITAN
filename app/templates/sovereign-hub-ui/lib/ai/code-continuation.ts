import { openCodeFence } from "./answer-completion"
import { createContinuationFilter, type ContinuationFilter } from "./continuation-overlap"

/** Promote only real output syntax, not the topic word "game" in prose. */
export function answerContainsCode(text: string): boolean {
  return /(?:^|\n) {0,3}(?:`{3,}|~{3,})(?:html|css|javascript|js|typescript|ts|tsx|jsx|python|py|java|cpp|csharp|rust|go|sql|bash|sh)(?=\s|$)/iu.test(text)
    || /(?:^|\n)\s*(?:<!doctype\s+html|<html(?:\s|>)|function\s+[\w$]+\s*\(|def\s+\w+\s*\()/iu.test(text)
}

/** Remove a model's redundant opening wrapper BEFORE overlap detection. Do not
 * strip the final closing fence or trim whitespace from a partial code token. */
export function createCodeContinuationFilter(previous: string, emit: (chunk: string) => void): ContinuationFilter {
  const fence = openCodeFence(previous)
  const overlap = createContinuationFilter(previous, emit)
  let prefix = "", decided = !fence, wrapperDropped = 0
  const drain = (final: boolean) => {
    if (decided) return
    const candidate = /^(\s{0,80})(`{3,}|~{3,})([A-Za-z0-9_+-]{1,30})(?:[ \t]+[^`\r\n]{0,80})?[ \t]*\r?\n/.exec(prefix)
    if (candidate && fence && candidate[2][0] === fence.marker[0] && (!fence.language || candidate[3].toLowerCase() === fence.language)) {
      wrapperDropped = candidate[0].length
      decided = true
      overlap.push(prefix.slice(candidate[0].length))
      prefix = ""
      return
    }
    // A wrapper is at most ~120 bytes. Other content, including a bare final
    // closing fence, is passed unchanged when its prefix is decided.
    if (final || prefix.length > 128 || /\n/.test(prefix.trimStart()) || !/^[\s`~A-Za-z0-9_+-]*$/.test(prefix)) {
      decided = true
      overlap.push(prefix)
      prefix = ""
    }
  }
  return {
    push(chunk) {
      if (decided) { overlap.push(chunk); return }
      prefix += chunk
      drain(false)
    },
    end() { drain(true); overlap.end() },
    get dropped() { return wrapperDropped + overlap.dropped },
  }
}
