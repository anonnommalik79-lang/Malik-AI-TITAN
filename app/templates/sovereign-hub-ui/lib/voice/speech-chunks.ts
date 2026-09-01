/**
 * Splits a reply into pieces that can be spoken as they are synthesized.
 *
 * Speech used to be generated in one request: the whole answer went to the
 * provider, and nothing was heard until the last word had been rendered. The
 * screen said "Готовлю голос" for as long as that took, which on a four-sentence
 * answer is most of the wait. Assistants that feel instant do not synthesize
 * faster - they start speaking the first sentence while the rest is still being
 * made.
 *
 * The first chunk is deliberately short. It is the only one the user actually
 * waits for, so it is sized to come back quickly; everything after it is
 * synthesized while earlier audio is still playing, and larger chunks there
 * sound better because the provider can carry intonation across a whole thought.
 */

/** Small enough to synthesize fast; long enough not to sound clipped. */
const FIRST_CHUNK = 140
const LATER_CHUNK = 420

/**
 * Sentence ends, including the ones Russian and Kazakh actually use. The
 * lookbehind-free form is deliberate: Safari shipped lookbehind late and this
 * runs in the browser.
 */
function sentences(text: string): string[] {
  const value = String(text || "").replace(/\s+/g, " ").trim()
  if (!value) return []

  const out: string[] = []
  let current = ""

  for (const piece of value.split(/([.!?…]+["»)]?\s+|\n+)/)) {
    if (!piece) continue
    current += piece
    if (/[.!?…]+["»)]?\s+$|\n+$/.test(piece)) {
      out.push(current.trim())
      current = ""
    }
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/**
 * A sentence longer than a chunk still has to be broken somewhere. Commas and
 * clause boundaries are the least damaging place: a break mid-phrase is audible,
 * a break at a comma is a pause the listener expects anyway.
 */
function splitLongSentence(sentence: string, limit: number): string[] {
  if (sentence.length <= limit) return [sentence]

  const parts: string[] = []
  let current = ""
  for (const piece of sentence.split(/([,;:—–]\s+)/)) {
    if (current.length + piece.length > limit && current.trim()) {
      parts.push(current.trim())
      current = ""
    }
    current += piece
  }
  if (current.trim()) parts.push(current.trim())

  // Still too long: a single unbroken clause. Cut on whitespace rather than
  // mid-word, which the synthesizer would pronounce as nonsense.
  return parts.flatMap((part) => {
    if (part.length <= limit) return [part]
    const words = part.split(" ")
    const chunks: string[] = []
    let line = ""
    for (const word of words) {
      if (line.length + word.length + 1 > limit && line) {
        chunks.push(line)
        line = ""
      }
      line = line ? `${line} ${word}` : word
    }
    if (line) chunks.push(line)
    return chunks
  })
}

export function speechChunks(text: string, first = FIRST_CHUNK, later = LATER_CHUNK): string[] {
  const list = sentences(text)
  if (!list.length) return []

  const chunks: string[] = []
  let current = ""

  for (const sentence of list) {
    const limit = chunks.length === 0 ? first : later

    for (const piece of splitLongSentence(sentence, limit)) {
      if (current && current.length + piece.length + 1 > limit) {
        chunks.push(current)
        current = piece
        continue
      }
      current = current ? `${current} ${piece}` : piece
    }

    // The opening chunk closes at the first sentence boundary that reaches a
    // speakable length, so playback can start while the rest is still queued.
    if (chunks.length === 0 && current.length >= Math.min(first, 60)) {
      chunks.push(current)
      current = ""
    }
  }

  if (current) chunks.push(current)
  return chunks
}
