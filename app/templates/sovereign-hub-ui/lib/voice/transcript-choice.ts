/**
 * Two recognizers run on every utterance, and only one of them was ever used.
 *
 * The browser's own speech recognition runs live while the person is talking,
 * and the recorded audio is sent to Whisper afterwards. The browser's result was
 * kept only as a fallback for when Whisper returned nothing at all - so on every
 * successful turn, a complete second opinion was thrown away.
 *
 * That is worth having, because the two fail differently. Whisper hears a whole
 * utterance at once and punctuates it, but on a low-resource language it will
 * confidently produce a fluent sentence that is not what was said. The browser
 * decodes incrementally and gives no punctuation, but it rarely invents whole
 * clauses. When they agree, the answer is almost certainly right; when they
 * disagree, which one to trust is a decision that can be made rather than
 * guessed.
 *
 * Whisper also reports how sure it is and that was being discarded too - the
 * router asks for verbose_json and read only the text out of it.
 */

export type TranscriptChoice = {
  text: string
  source: "whisper" | "browser" | "agreed"
  confidence: number
  agreement: number
}

/**
 * Whisper's confidence, from -1 (worthless) to 1 (certain).
 *
 * `avg_logprob` is the model's average token log-probability: around -0.2 is a
 * clean decode, below about -0.9 means it was guessing. `no_speech_prob` is its
 * own estimate that the audio was not speech at all, which on a noisy recording
 * is the more honest signal of the two.
 */
export function transcriptConfidence(payload: unknown): number {
  const segments = (payload as { segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }> })?.segments
  if (!Array.isArray(segments) || !segments.length) return 0

  let logprob = 0
  let noSpeech = 0
  let counted = 0

  for (const segment of segments) {
    if (typeof segment?.avg_logprob !== "number") continue
    logprob += segment.avg_logprob
    noSpeech += typeof segment.no_speech_prob === "number" ? segment.no_speech_prob : 0
    counted += 1
  }
  if (!counted) return 0

  // -0.2 and better maps to ~1, -1.0 maps to ~0, worse goes negative.
  const quality = Math.max(-1, Math.min(1, (logprob / counted + 1) / 0.8))
  const speech = 1 - Math.min(1, noSpeech / counted)
  return Math.max(-1, Math.min(1, quality * 0.7 + speech * 0.3))
}

function words(value: string) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean)
}

/** Share of the shorter transcript's words that appear in the longer one. */
export function agreement(a: string, b: string) {
  const left = words(a)
  const right = new Set(words(b))
  if (!left.length || !right.size) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / left.length
}

/**
 * Picks what the person most likely said.
 *
 * The rules are deliberately few, and each one exists for a failure that
 * actually happens rather than a hypothetical: an empty result, a hallucinated
 * fluent sentence, and a truncated decode that drops the end of a long
 * question.
 */
export function chooseTranscript(input: {
  whisper?: string
  browser?: string
  confidence?: number
}): TranscriptChoice {
  const whisper = String(input.whisper || "").trim()
  const browser = String(input.browser || "").trim()
  const confidence = typeof input.confidence === "number" ? input.confidence : 0

  if (!whisper && !browser) return { text: "", source: "whisper", confidence, agreement: 0 }
  if (!whisper) return { text: browser, source: "browser", confidence, agreement: 0 }
  if (!browser) return { text: whisper, source: "whisper", confidence, agreement: 0 }

  const overlap = agreement(whisper, browser)
  const whisperWords = words(whisper).length
  const browserWords = words(browser).length

  // Truncation is checked before agreement, because a truncated decode looks
  // like perfect agreement: every word of "мне нужно" appears in "мне нужно
  // сделать сайт для кофейни", so the overlap is 1.0 while most of the question
  // is missing. The live recognizer heard the whole thing as it was spoken, so
  // it is the better record even without punctuation.
  if (browserWords >= 6 && whisperWords < browserWords * 0.6) {
    return { text: browser, source: "browser", confidence, agreement: overlap }
  }

  // Both heard the same thing: Whisper's version wins on punctuation and
  // casing, and the agreement itself is the evidence that it is right.
  if (overlap >= 0.7) return { text: whisper, source: "agreed", confidence, agreement: overlap }

  // A greeting is where this went wrong.
  //
  // Say "калайсың" and the live recognizer, locked to kk-KZ, gets it. Whisper
  // gets a word and a half of audio with no context to condition on, returns
  // something else entirely, and used to win anyway - so the screen showed
  // "калайсың" while the model was answering a different word. The person sees
  // the right transcript and a reply to something they never said, which reads
  // as the assistant being stupid rather than mishearing.
  //
  // Two or three words is exactly where Whisper is weakest and the browser is
  // strongest, and total disagreement on an utterance that short means one of
  // them is simply wrong. The live recognizer heard it in the language it was
  // told to expect, so it wins unless Whisper is clearly sure of itself.
  if (browserWords > 0 && whisperWords <= 3 && browserWords <= 3 && overlap === 0 && confidence < 0.35) {
    return { text: browser, source: "browser", confidence, agreement: overlap }
  }

  // Whisper was unsure and the two do not agree at all. A fluent, well-formed
  // sentence produced at low confidence is the classic hallucination - on quiet
  // or non-English audio it emits subtitle boilerplate it saw in training - and
  // the browser's clumsier text is the safer of the two.
  if (confidence < -0.15 && browserWords >= 1 && overlap < 0.3) {
    return { text: browser, source: "browser", confidence, agreement: overlap }
  }

  return { text: whisper, source: "whisper", confidence, agreement: overlap }
}

/**
 * Recent turns, given to the recognizer as context.
 *
 * Whisper conditions on its prompt, so the words already used in this
 * conversation become far more likely to be recognised in the next sentence.
 * A person who has been talking about a площадка and ChatGPT will say those
 * words again, and this is what makes the second mention land when the first
 * one did not.
 */
export function conversationHint(history: Array<{ role: string; content: string }>, limit = 380) {
  const recent = history
    .filter((message) => message?.content)
    .slice(-4)
    .map((message) => String(message.content).replace(/\s+/g, " ").trim())
    .filter(Boolean)

  if (!recent.length) return ""
  // Newest last: it is the closest context to whatever is about to be said.
  return recent.join(" ").slice(-limit)
}

/**
 * When to ask again instead of answering.
 *
 * The worst failure in a voice assistant is not mishearing - it is answering
 * confidently to something that was never said. The person watches a reply to a
 * different question arrive and concludes the thing is stupid, when all that
 * happened is that two seconds of audio were ambiguous and nobody checked.
 *
 * Every assistant worth comparing this to asks again here. The bar is
 * deliberately narrow: short utterance, both recognizers unsure, and no
 * agreement between them. A long sentence carries enough context to be worth
 * attempting even at low confidence.
 */
export function shouldAskAgain(choice: TranscriptChoice): boolean {
  const words = choice.text.split(/\s+/).filter(Boolean).length
  if (!words) return true
  if (words > 4) return false
  if (choice.source === "agreed") return false
  return choice.confidence < -0.05 && choice.agreement < 0.34
}

/** Said out loud, in the language the person was speaking. */
export function askAgainPhrase(code: string): string {
  const language = String(code || "").toLowerCase()
  if (language.startsWith("kk")) return "Кешір, естімей қалдым. Тағы бір рет айтасың ба?"
  if (language.startsWith("en")) return "Sorry, I didn't catch that. Say it again?"
  return "Прости, не расслышал. Скажи ещё раз?"
}
