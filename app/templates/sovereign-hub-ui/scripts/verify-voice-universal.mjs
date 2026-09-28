// Voice in any language: the Live session answers in the language the person
// speaks, the settings (personality, pace, emotion) reach the model, and a
// restarted session keeps the conversation.
//
//   npm run test:voice-universal

import assert from "node:assert/strict"

const root = new URL("..", import.meta.url).pathname
const setup = await import(`${root}lib/voice/gemini-live-setup.ts`)

let failed = 0
let count = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 3).join("\n       ")}`)
  }
}

const textOf = (built) => built.setup.systemInstruction.parts[0].text

await check("any language is the default and answers in the user's language", () => {
  assert.equal(setup.safeLiveLanguage(undefined), "auto")
  assert.equal(setup.safeLiveLanguage("de"), "auto")
  const built = setup.buildLiveSetup({})
  const text = textOf(built)
  assert.match(text, /answer in the language the user is speaking/i)
  assert.match(text, /Kazakh is not Russian/)
  assert.match(text, /switch with them at once/)
  assert.match(text, /never changes the language/)
  assert.match(text, /Reply language: the language the user speaks right now/)
})

await check("in any-language mode the transcriber is not locked to one language", () => {
  for (const tier of [0, 1, 2]) {
    const built = setup.buildLiveSetup({ language: "auto", tier })
    assert.equal(built.setup.inputAudioTranscription.languageCodes, undefined, `tier ${tier}`)
  }
  // A locked language still tells the transcriber what to expect.
  assert.deepEqual(setup.buildLiveSetup({ language: "kk", tier: 1 }).setup.inputAudioTranscription.languageCodes, ["kk-KZ"])
})

await check("a locked language stays locked and ends with a reminder in that language", () => {
  const kk = textOf(setup.buildLiveSetup({ language: "kk", style: { personality: "Therapist" } }))
  assert.match(kk, /ТІЛ ҚҰЛПЫ/)
  assert.ok(kk.trim().endsWith("Жауап тілі — тек қазақша."))
  const ru = textOf(setup.buildLiveSetup({ language: "ru" }))
  assert.ok(ru.trim().endsWith("Язык ответа — только русский."))
})

await check("how to talk: short spoken answers, finish the thought, no markdown aloud", () => {
  const text = textOf(setup.buildLiveSetup({ language: "auto" }))
  assert.match(text, /Always finish the sentence/)
  assert.match(text, /Never read markdown/)
  assert.match(text, /never repeat an answer/)
})

await check("personality, pace and emotion become instructions", () => {
  assert.equal(setup.styleInstruction({}), "")
  assert.equal(setup.styleInstruction({ personality: "Assistant", speed: 1, expressivity: 0 }), "")
  assert.match(setup.styleInstruction({ personality: "Meditation" }), /meditation guide/i)
  assert.match(setup.styleInstruction({ speed: 1.15 }), /noticeably faster/)
  assert.match(setup.styleInstruction({ speed: 0.85 }), /noticeably slower/)
  assert.match(setup.styleInstruction({ speed: 1.05 }), /a little faster/)
  assert.match(setup.styleInstruction({ expressivity: 2 }), /very expressive/)
  assert.match(setup.styleInstruction({ expressivity: -2 }), /very calm/)
  const text = textOf(setup.buildLiveSetup({ language: "auto", style: { personality: "Kids Trivia Game", speed: 0.9 } }))
  assert.match(text, /quiz host for children/)
  assert.match(text, /slower/)
})

await check("a new session carries the conversation; a resumed one does not need to", () => {
  const context = [
    { role: "user", text: "Сәлем, мен Алматыда тұрамын" },
    { role: "assistant", text: "Сәлем! Алматы — керемет қала." },
  ]
  const fresh = textOf(setup.buildLiveSetup({ language: "auto", context }))
  assert.match(fresh, /CONVERSATION SO FAR/)
  assert.match(fresh, /Алматыда тұрамын/)
  const resumed = textOf(setup.buildLiveSetup({ language: "auto", context, resumeHandle: "handle-1" }))
  assert.doesNotMatch(resumed, /CONVERSATION SO FAR/)
})

await check("the carried conversation is bounded and keeps the newest turns", () => {
  const turns = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `turn ${index} ${"x".repeat(600)}` }))
  const line = setup.contextInstruction(turns)
  assert.ok(line.length < 2_800, `too long: ${line.length}`)
  assert.match(line, /turn 29/)
  assert.doesNotMatch(line, /turn 3 /)
  assert.equal(setup.contextInstruction([]), "")
})

console.log(`\n${count - failed}/${count} passed`)
process.exit(failed ? 1 : 0)
