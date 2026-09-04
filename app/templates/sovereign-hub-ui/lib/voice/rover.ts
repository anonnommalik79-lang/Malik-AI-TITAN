/**
 * Voting between recognizers, word by word.
 *
 * There are three transcripts of every utterance now - the streaming
 * recognizer, Whisper, and the browser's own - and until this file the code
 * picked one of them whole. That is the wrong unit. The three rarely fail in
 * the same place: the stream drops the ending of a rare word, Whisper invents a
 * fluent clause where the audio was quiet, the browser mangles a brand name but
 * gets the grammar. Choosing one transcript means accepting all of its mistakes
 * to get all of its correct words.
 *
 * ROVER (Fiscus, 1997) is the standard answer and it is free: align the
 * hypotheses into a single network of slots, then vote inside each slot. Where
 * two of three agree, the third is outvoted and its mistake disappears - and
 * because the three make *different* mistakes, that happens far more often than
 * all three being wrong together. The result is usually better than any of the
 * inputs, which no amount of picking can achieve.
 *
 * Two departures from the paper, both because of what these particular
 * recognizers do:
 *
 * The alignment is phonetic, not exact. "площадка" and "плошадка" are the same
 * word heard twice and must land in the same slot to vote together; under
 * string equality they land in different slots and split their own vote.
 *
 * The null vote is weighted below the others. A word that only one recognizer
 * heard is usually a word only one recognizer invented, and dropping it is the
 * safer error - but the streaming recognizer is the one that actually hears the
 * quiet endings of words, so a confident single vote still wins.
 */

import { phoneticSimilarity } from "./phonetics"

export type Hypothesis = {
  text: string
  /** 0 to 1. How much this recognizer's opinion is worth in the vote. */
  weight: number
  /** For diagnostics only. */
  source: string
}

type Slot = {
  /** Every word proposed for this position, with who proposed it. */
  votes: Array<{ word: string; weight: number; source: string }>
}

const WORD = /[\p{L}\p{N}]+(?:[''‑-][\p{L}\p{N}]+)*/gu

export function words(text: string): string[] {
  return String(text || "").toLowerCase().match(WORD) || []
}

/**
 * How much of the vote is agreement and how much is confidence.
 *
 * At 1 the most popular word always wins regardless of how unsure everyone is;
 * at 0 a single very confident recognizer overrules the other two. 0.72 leans
 * on agreement, because agreement between systems that fail differently is the
 * stronger evidence - but leaves enough room for a confident stream to carry a
 * word the other two never heard.
 */
const AGREEMENT_WEIGHT = 0.72

/** A slot the majority left empty needs real support to survive. */
const NULL_BIAS = 0.62

/** Same word, heard twice, for the purpose of sharing a vote. */
const SAME_WORD = 0.84

function similarity(a: string, b: string) {
  if (a === b) return 1
  return phoneticSimilarity(a, b)
}

/**
 * Aligns one hypothesis onto the network, extending it where the hypothesis has
 * words the network has never seen.
 *
 * Ordinary edit-distance dynamic programming, with the substitution cost taken
 * from how alike the two words sound rather than from whether they are equal.
 */
function fold(network: Slot[], hypothesis: Hypothesis): Slot[] {
  const tokens = words(hypothesis.text)
  if (!network.length) {
    return tokens.map((word) => ({
      votes: [{ word, weight: hypothesis.weight, source: hypothesis.source }],
    }))
  }
  if (!tokens.length) return network

  const rows = network.length + 1
  const cols = tokens.length + 1
  const cost = new Float64Array(rows * cols)
  const from = new Uint8Array(rows * cols) // 1 = match, 2 = slot skipped, 3 = word inserted

  for (let i = 1; i < rows; i++) { cost[i * cols] = i; from[i * cols] = 2 }
  for (let j = 1; j < cols; j++) { cost[j] = j; from[j] = 3 }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      // The slot's cost against this word is its best existing candidate: a
      // slot holding "площадка" should accept "плошадка" cheaply.
      let best = 0
      for (const vote of network[i - 1].votes) {
        const score = similarity(vote.word, tokens[j - 1])
        if (score > best) best = score
      }
      const match = cost[(i - 1) * cols + (j - 1)] + (1 - best)
      const skipSlot = cost[(i - 1) * cols + j] + 1
      const insert = cost[i * cols + (j - 1)] + 1

      let value = match
      let move = 1
      if (skipSlot < value) { value = skipSlot; move = 2 }
      if (insert < value) { value = insert; move = 3 }
      cost[i * cols + j] = value
      from[i * cols + j] = move
    }
  }

  // Walk the alignment back, building the new network in reverse.
  const out: Slot[] = []
  let i = network.length
  let j = tokens.length
  while (i > 0 || j > 0) {
    const move = i === 0 ? 3 : j === 0 ? 2 : from[i * cols + j]
    if (move === 1) {
      const slot = network[i - 1]
      slot.votes.push({ word: tokens[j - 1], weight: hypothesis.weight, source: hypothesis.source })
      out.push(slot)
      i--; j--
    } else if (move === 2) {
      // This hypothesis had nothing for this slot. Nothing is recorded: a
      // silent vote is counted at the end from who is missing, which is the
      // only way to also count the hypotheses that never saw an inserted slot
      // at all.
      out.push(network[i - 1])
      i--
    } else {
      // A word no previous hypothesis had. Everyone before this one is recorded
      // as having said nothing here.
      out.push({ votes: [{ word: tokens[j - 1], weight: hypothesis.weight, source: hypothesis.source }] })
      j--
    }
  }
  return out.reverse()
}

export type FusionResult = {
  text: string
  /** Mean agreement across the slots that survived: 1 means every recognizer agreed everywhere. */
  agreement: number
  /** Slots where the winner was decided by a thin margin, in output order. */
  contested: string[]
}

/**
 * Combines the hypotheses into one transcript.
 *
 * The strongest hypothesis seeds the network so that word order follows the
 * recognizer that was most sure of it; the rest vote on its contents.
 */
export function fuseTranscripts(input: Hypothesis[]): FusionResult {
  const hypotheses = input
    .map((item) => ({ ...item, weight: Math.max(0, Math.min(1, item.weight)) }))
    .filter((item) => words(item.text).length > 0)

  if (!hypotheses.length) return { text: "", agreement: 0, contested: [] }
  if (hypotheses.length === 1) {
    return { text: hypotheses[0].text.trim(), agreement: 1, contested: [] }
  }

  const ordered = [...hypotheses].sort((a, b) => b.weight - a.weight)
  const total = ordered.reduce((sum, item) => sum + item.weight, 0) || 1

  let network: Slot[] = []
  for (const hypothesis of ordered) network = fold(network, hypothesis)

  const chosen: string[] = []
  const contested: string[] = []
  let agreementSum = 0
  let counted = 0

  for (const slot of network) {
    // Words that sound the same share one candidate, so a vote is never split
    // between two spellings of the same sound.
    const candidates: Array<{ word: string; weight: number; count: number }> = []
    for (const vote of slot.votes) {
      const existing = candidates.find((candidate) => similarity(candidate.word, vote.word) >= SAME_WORD)
      if (existing) {
        existing.weight += vote.weight
        existing.count += 1
        // Keep the spelling proposed by the most confident recognizer.
        if (vote.weight > 0 && vote.word.length > existing.word.length) existing.word = vote.word
      } else {
        candidates.push({ word: vote.word, weight: vote.weight, count: 1 })
      }
    }

    const score = (weight: number, count: number) =>
      AGREEMENT_WEIGHT * (count / ordered.length) + (1 - AGREEMENT_WEIGHT) * (weight / total)

    let winner = candidates[0]
    let winningScore = winner ? score(winner.weight, winner.count) : 0
    let runnerUp = 0
    for (const candidate of candidates.slice(1)) {
      const value = score(candidate.weight, candidate.count)
      if (value > winningScore) {
        runnerUp = winningScore
        winner = candidate
        winningScore = value
      } else if (value > runnerUp) {
        runnerUp = value
      }
    }

    // Everyone who did not put a word here voted for nothing, and that vote
    // counts. It has to be derived rather than tallied: a slot created for a
    // word only one hypothesis had never saw the others at all, and those are
    // exactly the slots where a lone recognizer's invention gets in.
    const heard = slot.votes.reduce((sum, vote) => sum + vote.weight, 0)
    const silent = Math.max(0, ordered.length - slot.votes.length)
    const nullScore = NULL_BIAS * score(Math.max(0, total - heard), silent)
    if (!winner || nullScore > winningScore) continue

    chosen.push(winner.word)
    agreementSum += winner.count / ordered.length
    counted += 1
    if (winningScore - runnerUp < 0.12) contested.push(winner.word)
  }

  return {
    text: chosen.join(" "),
    agreement: counted ? agreementSum / counted : 0,
    contested,
  }
}
