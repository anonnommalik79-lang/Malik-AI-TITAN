import assert from "node:assert/strict"
import fs from "node:fs"

/**
 * The answer: who writes it, and when it starts being spoken.
 *
 * Two complaints, and neither of them was about recognition.
 *
 * "Долго готовит голос." The speech pieces were already pipelined, so the only
 * thing left between the end of a question and the first sound was the model
 * finishing a paragraph nobody had heard. That is the larger half of the wait
 * and it is removed by speaking the first sentence while the rest is written.
 *
 * "Тупой, особенно казахский." Every turn went to the head of the shared
 * provider chain - whatever is fastest and configured. For Russian that is
 * fine. For Kazakh it is the whole problem: an open-weights model of twenty-odd
 * billion parameters has seen very little of it. No recognizer and no speech
 * engine can repair an answer that was written badly.
 */

async function load(file) {
  return import(`${process.cwd()}/${file}`)
}

let failures = 0
function check(name, fn) {
  try {
    const note = fn()
    console.log(`  ok  ${name}${note ? `  — ${note}` : ""}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const { takeSentence, providersFor } = await load("lib/voice/voice-llm-stream.ts")
const route = fs.readFileSync("app/api/voice/turn/route.ts", "utf8")
const router = fs.readFileSync("lib/voice/voice-llm-router.ts", "utf8")
const voiceMode = fs.readFileSync("components/voice/VoiceMode.tsx", "utf8")
const streamLib = fs.readFileSync("lib/voice/voice-llm-stream.ts", "utf8")

console.log("\nwho writes the answer")

check("Kazakh goes to the model that speaks Kazakh", () => {
  const kk = providersFor("kk").map((p) => p.provider)
  const ru = providersFor("ru").map((p) => p.provider)
  assert.equal(kk[0], "gemini", `Kazakh asked ${kk[0]} first`)
  assert.equal(ru[0], "groq", "everything else keeps the fast chain")
  assert.ok(kk.includes("groq"), "and Kazakh still falls back rather than failing")
  return `kk → ${kk.join(" → ")},  ru → ${ru.join(" → ")}`
})

check("the slow path routes Kazakh the same way", () => {
  // Two ways to answer, and a fix applied to only one of them is a fix that
  // disappears whenever the stream is refused.
  assert.match(router, /VOICE_LLM_KAZAKH_PROVIDER/)
  assert.match(router, /startsWith\("kk"\)/)
  assert.match(router, /provider: process\.env\.VOICE_LLM_KAZAKH_PROVIDER \|\| "gemini"/)
  // And every call site passes the language, or the routing never fires.
  assert.equal((route.match(/languageCode: language\.code/g) || []).length, 5,
    "a voiceLlmAnswer call is missing the language")
})

check("it can be turned off without editing code", () => {
  assert.match(streamLib, /VOICE_LLM_KAZAKH_PROVIDER" \) !== "off"|!== "off"/)
  assert.match(router, /!== "off"/)
})

console.log("\nwhen speech starts")

check("a sentence is handed over as soon as it ends", () => {
  // Two endings, and the first is a one-word greeting: stopping at it would
  // send "Сәлем!" to the speech engine as a request of its own.
  const first = takeSentence("Сәлем! Қалай көмектесе аламын?")
  assert.equal(first.sentence, "Сәлем! Қалай көмектесе аламын?")
  const partial = takeSentence("Сейчас посмотрю что там с")
  assert.equal(partial.sentence, "", "half a sentence must never be spoken")
})

check("an abbreviation is not mistaken for the end of a thought", () => {
  // "3." and "т.е." end in a full stop and are not sentences. Speaking them
  // alone is a mistake you hear.
  assert.equal(takeSentence("Да.").sentence, "")
  assert.equal(takeSentence("т.е.").sentence, "")
  assert.equal(takeSentence("Это работает уже сейчас.").sentence, "Это работает уже сейчас.")
})

check("a long clause does not wait forever for a full stop", () => {
  const long = "сначала мы посмотрим что именно падает на рендере и почему там кончается память, " +
    "потом уже будем чинить конкретное место и смотреть на логи сборки внимательно и по порядку"
  const { sentence, rest } = takeSentence(long)
  assert.ok(sentence.endsWith(","), `broke at "${sentence.slice(-24)}"`)
  assert.ok(rest.length > 10)
  return `broke at ${sentence.length} chars`
})

check("the tail is flushed when the model stops", () => {
  const { sentence, rest } = takeSentence("последнее без точки", true)
  assert.equal(sentence, "последнее без точки")
  assert.equal(rest, "")
})

console.log("\nnothing is spoken before it has been checked")

check("the guard runs on the server, before the first word leaves", () => {
  // The client cannot un-say a sentence, so the check cannot be its job.
  assert.match(route, /if \(!looksLikeLanguage\(sentence, language\.code\) \|\| repeatsEarlierAnswer\(sentence, history\)\)/)
  assert.match(route, /abandoned = true/)
  // And when it does catch something, the answer is rewritten on the same
  // connection rather than the stream simply dying.
  assert.match(route, /The previous attempt answered in the wrong language or repeated/)
})

check("a Kazakh greeting does not stream at all", () => {
  // Its answer is repaired after the fact when the model misses the intent, and
  // a repair cannot be applied to something already spoken.
  assert.match(route, /if \(body\?\.stream && !greeting\)/)
})

check("the response goes out before the answer is finished", () => {
  // The first version of this awaited the whole answer and then sent it in one
  // go - the old behaviour wearing a stream's clothes.
  assert.match(route, /new ReadableStream\(\{\s*async start\(controller\)/)
  assert.ok(route.indexOf("send(\"meta\"") < route.indexOf("await streamVoiceAnswer"),
    "the client must be told what is coming before the model is asked")
  assert.match(route, /"content-type": "text\/event-stream/)
  assert.match(route, /"x-accel-buffering": "no"/)
})

console.log("\nthe client speaks it as it arrives")

check("sentences are pushed to the speaker while the stream is open", () => {
  assert.match(voiceMode, /const speakStream = useCallback/)
  assert.match(voiceMode, /speaker\.push\(sentence\)/)
  assert.match(voiceMode, /speaker\.end\(\)/)
  assert.match(voiceMode, /stream: true/)
})

check("the next piece is synthesized while the current one plays", () => {
  assert.match(voiceMode, /ahead = queue\.length \? \{ text: queue\[0\], blob: synth\(queue\[0\]\) \} : null/)
})

check("a stream that gives nothing falls back to the old request", () => {
  assert.match(voiceMode, /if \(finished\) return/)
  assert.match(voiceMode, /response\.bodyUsed/)
})

check("interrupting still stops it", () => {
  // speakStream registers the same abort controller stopReplyAudio reaches for.
  assert.match(voiceMode, /const speakStream = useCallback[\s\S]{0,900}replyAbortRef\.current = abort/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall voice answer checks passed\n")
process.exit(failures ? 1 : 0)
