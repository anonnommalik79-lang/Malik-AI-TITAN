import assert from "node:assert/strict"
import fs from "node:fs"

/**
 * Streaming voice: what has to be true for it to be faster and not louder.
 *
 * The old path recorded a clip, watched a level meter for 1700ms of quiet,
 * uploaded the file and waited for Whisper. Three failures came out of that and
 * each has a check here: the wait before anything is recognised, the level
 * meter cutting people off mid-sentence, and one clip with no context being
 * guessed at as a single language.
 */

/**
 * Node strips the types itself. An earlier version of this file tried to do it
 * with regular expressions and fell over on the first generic it met, which is
 * the usual outcome of parsing a language with a pattern.
 */
async function load(file) {
  return import(`${process.cwd()}/${file}`)
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const listenSource = fs.readFileSync("lib/voice/deepgram-listen.ts", "utf8")
const voiceMode = fs.readFileSync("components/voice/VoiceMode.tsx", "utf8")
const turnRoute = fs.readFileSync("app/api/voice/turn/route.ts", "utf8")
const choice = await load("lib/voice/transcript-choice.ts")
const listen = await load("lib/voice/deepgram-listen.ts")

console.log("\nit listens while the person is still talking")

check("audio goes up as raw 16kHz mono, not as a file afterwards", () => {
  // linear16 at 16kHz is what the recognizer wants. Sending compressed webm
  // means an encode on the way out and a decode on the way in, and both are
  // latency on a path whose whole purpose is not having any.
  assert.match(listenSource, /encoding: "linear16"/)
  assert.match(listenSource, /sample_rate: String\(TARGET_RATE\)/)
  assert.match(listenSource, /const TARGET_RATE = 16000/)
  assert.match(listenSource, /channels: "1"/)
})

check("words come back before the sentence is over", () => {
  assert.match(listenSource, /interim_results: "true"/)
  assert.match(listenSource, /onInterim/)
})

check("the recognizer decides the end of the turn, not a level meter", () => {
  // endpointing and utterance_end_ms are decided from the words; SILENCE_MS is
  // decided from a volume, and a volume cannot tell a pause from an ending.
  assert.match(listenSource, /endpointing: "400"/)
  assert.match(listenSource, /utterance_end_ms/)
  assert.match(listenSource, /speech_final/)
  assert.match(voiceMode, /if \(!streamingRef\.current\) \{[\s\S]{0,120}autoSubmitRef\.current\?\.\(\)/,
    "the silence timer must not end a turn while the stream is up")
})

check("Kazakh gets a Kazakh stream, everything else code-switches", () => {
  // The trap, and it was live for a day: "multi" is the code-switching mode and
  // it covers ten languages - Kazakh is not one of them. Opening a multi stream
  // for a Kazakh speaker renders every sentence as whichever of those ten the
  // sounds resembled, which is the original "слышит другое" bug reintroduced
  // one layer lower. Nova-3 does Kazakh perfectly well under "kk".
  assert.match(listenSource, /model: "nova-3"/)
  assert.ok(!listen.MULTILINGUAL_CODES.includes("kk"),
    "if Deepgram ever adds Kazakh to multi, this test is the place to notice")
  assert.equal(listen.streamLanguage("kk", "ru"), "kk")
  assert.equal(listen.streamLanguage("kk-KZ", null), "kk")
  assert.equal(listen.streamLanguage(null, "kk"), "kk")
  assert.equal(listen.streamLanguage("ru", "kk"), "multi", "what was spoken beats the picker")
  assert.equal(listen.streamLanguage(null, "en"), "multi")
  assert.equal(listen.streamLanguage(null, null), "multi")
  assert.match(voiceMode, /language: streamLanguage\(spokenLanguageRef\.current, languageRef\.current\)/)
})

check("the brand names are given to the recognizer, not repaired afterwards", () => {
  assert.match(listenSource, /keyterm/)
  assert.match(voiceMode, /keyterms: VOICE_BRAND_TERMS/)
  // And a model that refuses the parameter must not take the whole stream down
  // with it.
  assert.match(listenSource, /keytermsRejected/)
})

check("the audio front end is a designed chain, not an average", () => {
  // The numbers behind this are measured in verify-voice-accuracy.mjs; this
  // only checks the chain is wired, in order, with its state kept between the
  // 2048-sample blocks the browser delivers.
  assert.match(listenSource, /new DcBlocker\(\)/)
  assert.match(listenSource, /new Resampler\(context\.sampleRate, TARGET_RATE\)/)
  assert.match(listenSource, /this\.dc!\.process\(input\)[\s\S]{0,200}this\.resampler!\.process\(levelled\)/)
  // And nothing tilts the signal: the recognizer at the far end applies its own
  // pre-emphasis, and applying it twice cost a vowel 24dB.
  assert.doesNotMatch(listenSource, /PreEmphasis/)
})

check("the end of a turn is measured from this speaker, not fixed", () => {
  assert.match(listenSource, /this\.pauses\.endpointMs\(\)/)
  assert.match(listenSource, /this\.pauses\.mark\(\)/)
  assert.match(voiceMode, /pauses: pausesRef\.current/)
})

check("three transcripts are voted on, not chosen between", () => {
  assert.match(voiceMode, /fuseTranscripts\(hypotheses\)/)
  assert.match(voiceMode, /hypotheses\.length >= 3/)
})

check("a keep-alive holds the socket open while someone thinks", () => {
  // Deepgram drops an idle socket after 10s. Someone choosing their words is
  // idle, and that is the worst possible moment to lose the stream.
  assert.match(listenSource, /KeepAlive/)
  assert.match(listenSource, /6000/)
})

console.log("\nit does not answer what it did not hear")

check("a streamed transcript has to earn the fast path", () => {
  // Short and unsure is exactly where a confident wrong answer comes from, so
  // short utterances need a much higher bar before they skip the second opinion.
  assert.equal(listen.streamedTranscriptIsTrusted("калайсың", 0.62), false)
  assert.equal(listen.streamedTranscriptIsTrusted("калайсың", 0.91), true)
  assert.equal(listen.streamedTranscriptIsTrusted("", 1), false)
  assert.equal(listen.streamedTranscriptIsTrusted("сделай мне сайт для кофейни в Алматы", 0.6), true)
  assert.equal(listen.streamedTranscriptIsTrusted("сделай мне сайт для кофейни в Алматы", 0.4), false)
})

check("two unsure words are asked about, not guessed at", () => {
  assert.equal(choice.shouldAskAgain({ text: "", source: "whisper", confidence: 0, agreement: 0 }), true)
  assert.equal(choice.shouldAskAgain({ text: "ол кім", source: "browser", confidence: -0.4, agreement: 0 }), true)
  // Agreement between the two recognizers is evidence, whatever the confidence.
  assert.equal(choice.shouldAskAgain({ text: "ол кім", source: "agreed", confidence: -0.4, agreement: 1 }), false)
  // A long sentence carries enough context to be worth attempting.
  assert.equal(choice.shouldAskAgain({
    text: "расскажи как работает эта площадка",
    source: "whisper", confidence: -0.4, agreement: 0,
  }), false)
})

check("it asks again in the language it was spoken to in", () => {
  assert.match(choice.askAgainPhrase("kk"), /[әіңғүұқөһ]/i)
  assert.match(choice.askAgainPhrase("en"), /Sorry/)
  assert.match(choice.askAgainPhrase("ru"), /Прости/)
  assert.match(voiceMode, /shouldAskAgain\(choice\)/)
  assert.match(voiceMode, /askAgainPhrase/)
})

console.log("\ninterrupting actually interrupts")

check("talking over the reply stops the answer, not only its voice", () => {
  // Aborting the audio alone left the model writing, and it then spoke the
  // answer to the sentence that had just been abandoned.
  assert.match(voiceMode, /turnAbortRef/)
  assert.match(voiceMode, /signal: controller\.signal/)
  assert.match(voiceMode, /turnAbortRef\.current\?\.abort\(\)/)
  assert.match(voiceMode, /onSpeechStarted/)
  assert.match(listenSource, /vad_events: "true"/)
})

check("an interruption is not reported as a failure", () => {
  assert.match(voiceMode, /AbortError/)
})

console.log("\nthe answer is written to be heard")

check("spoken output rules reach the model", () => {
  assert.match(turnRoute, /const SPOKEN_OUTPUT/)
  assert.match(turnRoute, /no markdown/)
  assert.match(turnRoute, /one to three short sentences/)
  assert.match(turnRoute, /^\s*SPOKEN_OUTPUT,$/m, "declared but never added to the instruction")
})

console.log("\nnothing regressed when the fast path was added")

check("Whisper and the browser recognizer are still the fallback", () => {
  // All three hypotheses reach the slow path now, because that is where they
  // get to vote on each other.
  assert.match(voiceMode, /transcribeAndRespond\(blob, durationSec, fallback, streamed, streamConfidence\)/)
  assert.match(voiceMode, /chooseTranscript\(\{/)
  // And a stream that never comes up must leave the old path working.
  assert.match(listenSource, /Returns false rather than throwing/)
})

check("the stream is torn down with the microphone", () => {
  assert.match(voiceMode, /listenerRef\.current\?\.stop\(\)/)
  assert.match(voiceMode, /streamingRef\.current = false/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall voice streaming checks passed\n")
process.exit(failures ? 1 : 0)
