/**
 * A continuation call is asked to pick up where an answer stopped. Models do
 * not always obey: some restart at the last sentence, some a paragraph or a
 * whole section earlier. Whatever a continuation re-sends that is already in
 * the answer is dropped here, while the rest streams through unchanged.
 *
 * How: the start of the continuation is looked up in the end of the answer.
 * While the incoming text keeps matching the answer from one of those places,
 * it is held back. When it has re-sent everything up to the answer's end, only
 * what follows is passed on. If it stops matching first, it was new text after
 * all and is passed on whole. Pure and synchronous: easy to test and cheap.
 */

/** The longest end of `previous` that `next` starts with (at least 12 chars, at most 240). */
export function trimSuffixPrefix(previous: string, next: string) {
  const limit = Math.min(240, previous.length, next.length)
  for (let size = limit; size >= 12; size -= 1) {
    if (previous.endsWith(next.slice(0, size))) return next.slice(size)
  }
  return next
}

export type ContinuationFilter = {
  push: (chunk: string) => void
  /** The stream ended: release or drop whatever is still held. */
  end: () => void
  /** Characters dropped as repeats, for logs and tests. */
  readonly dropped: number
}

export function createContinuationFilter(
  previous: string,
  emit: (chunk: string) => void,
  options: { window?: number; probe?: number } = {},
): ContinuationFilter {
  const windowSize = Math.max(256, options.window ?? 12_000)
  const probe = Math.max(8, options.probe ?? 24)
  const tail = String(previous || "").slice(-windowSize)
  let pending = ""
  let decided = false
  let dropped = 0
  let candidates: number[] | null = null

  const release = (output: string, repeated: number) => {
    decided = true
    dropped += repeated
    pending = ""
    candidates = null
    if (output) emit(output)
  }

  const evaluate = (final: boolean) => {
    if (decided) return
    if (!tail) { release(pending, 0); return }
    if (candidates === null) {
      if (pending.length < probe && !final) return
      const head = pending.slice(0, Math.min(probe, pending.length))
      if (head.trim().length < 8) {
        const trimmed = trimSuffixPrefix(tail, pending)
        release(trimmed, pending.length - trimmed.length)
        return
      }
      candidates = []
      for (let at = tail.indexOf(head); at >= 0; at = tail.indexOf(head, at + 1)) candidates.push(at)
    }
    // Keep the places where the answer and the incoming text still agree.
    candidates = candidates.filter((start) => {
      const rest = tail.slice(start)
      const length = Math.min(rest.length, pending.length)
      return rest.slice(0, length) === pending.slice(0, length)
    })
    // One of them has been re-sent up to the answer's end: what follows is new.
    const covered = candidates.filter((start) => pending.length >= tail.length - start)
    if (covered.length) {
      const start = Math.min(...covered)
      const repeated = tail.length - start
      release(pending.slice(repeated), repeated)
      return
    }
    if (!candidates.length) {
      // It diverged: new text, except for a short exact overlap at the seam.
      const trimmed = trimSuffixPrefix(tail, pending)
      release(trimmed, pending.length - trimmed.length)
      return
    }
    // The stream ended while still repeating the answer: nothing new came.
    if (final) release("", pending.length)
  }

  return {
    push(chunk: string) {
      if (!chunk) return
      if (decided) { emit(chunk); return }
      pending += chunk
      evaluate(false)
    },
    end() {
      if (decided) return
      evaluate(true)
      if (!decided) release(pending, 0)
    },
    get dropped() { return dropped },
  }
}

/** A fence line that opens a block: ``` or ~~~ with a language. A bare ``` may be a closing fence and is kept. */
const OPENING_FENCE = /^[ \t]*(?:```|~~~)[ \t]*[\w.+#-]+[^\n`]*\n/u
/** A short lead-in a model writes before re-opening its code («Продолжение кода:», "Here is the rest:"). */
const LEAD_IN = /^[ \t]*(?:[*_#>]+[ \t]*)?[^\n`]{0,120}?(?:продолж|дальше|остав|остальн|оконч|continu|rest\b|remaining|here\b|жалғас)[^\n`]{0,80}\n+/iu

/**
 * A code answer that stopped inside a code block is continued *inside* that
 * block. Models often start the continuation with a new «```html» anyway,
 * sometimes after a line like «Продолжение:». In Markdown that line is not a
 * fence (a closing fence has no language) — it lands in the code as text and
 * the block can never be closed: every later fence flips the count, and the
 * engine keeps asking for more until it runs out of attempts. That happened to
 * a game in the chat. The re-opening line (and its lead-in) is dropped here,
 * before the overlap filter sees the text.
 */
export function createReopenedFenceFilter(insideOpenBlock: boolean, emit: (chunk: string) => void) {
  let pending = ""
  let decided = !insideOpenBlock
  let dropped = 0
  const decide = (final: boolean) => {
    if (decided) return
    const start = pending.replace(/^\s+/u, "")
    const lead = LEAD_IN.exec(start)
    const afterLead = lead ? start.slice(lead[0].length) : start
    const fence = OPENING_FENCE.exec(afterLead)
    if (fence) {
      decided = true
      const rest = afterLead.slice(fence[0].length)
      dropped += pending.length - rest.length
      pending = ""
      if (rest) emit(rest)
      return
    }
    // Enough has arrived to know there is no re-opened fence in the first lines.
    const settled = /\n[^\n]*\n/u.test(afterLead) || afterLead.length > 260 || (!lead && /\S/u.test(afterLead) && !/^[ \t]*(?:`{1,3}|~{1,3})?[ \t]*[\w.+#-]*$/u.test(afterLead.split("\n")[0]))
    if (settled || final) {
      decided = true
      const out = pending
      pending = ""
      if (out) emit(out)
    }
  }
  return {
    push(chunk: string) {
      if (!chunk) return
      if (decided) { emit(chunk); return }
      pending += chunk
      decide(false)
    },
    end() {
      if (!decided) decide(true)
    },
    get dropped() { return dropped },
  }
}
