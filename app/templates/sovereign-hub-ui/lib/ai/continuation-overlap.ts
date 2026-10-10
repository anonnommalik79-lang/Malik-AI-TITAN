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
