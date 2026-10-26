import assert from "node:assert/strict"
import { requestVoiceMicrophone } from "../lib/voice/microphone.ts"
import { shouldSearchVoice } from "../lib/voice/search-intent.ts"
import { GeminiLiveSession } from "../lib/voice/gemini-live-client.ts"

let passed = 0
async function check(name, run) {
  await run()
  passed++
  console.log(`PASS ${name}`)
}

for (const question of [
  "Кто сейчас CEO NVIDIA?", "Найди последние новости NVIDIA", "Какие последние AI продукты Google?",
  "Проверь текущую версию Next.js", "Что произошло сегодня в AI?", "Какая погода в Алматы?",
  "Сколько сейчас стоит iPhone?", "Кто выиграл сегодня?", "Какой курс доллара?",
  "Who is the current CEO of NVIDIA?", "Latest Google AI products?", "What is the latest Next.js version?",
  "Қазір президент кім?", "Бүгін ауа райы қандай?", "Соңғы жаңалықтарды ізде",
]) await check(`auto web: ${question}`, () => assert.equal(shouldSearchVoice(question), true))

for (const question of [
  "Объясни CUDA", "Реши 17 * 23", "Напиши стих", "Привет", "сегодня я устал",
  "Translate this sentence", "Write a React component", "не ищи, кто сейчас CEO NVIDIA?",
  "Don't search: latest NVIDIA news", "Іздеме, жай сөйлесейік",
]) await check(`no unwanted web: ${question}`, () => assert.equal(shouldSearchVoice(question), false))

const wanted = { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
const stream = { id: "test-stream" }
await check("microphone options retained on success", async () => {
  const calls = []
  const actual = await requestVoiceMicrophone({ getUserMedia: async (options) => { calls.push(options); return stream } }, wanted)
  assert.equal(actual, stream)
  assert.deepEqual(calls, [{ audio: wanted }])
})
for (const name of ["OverconstrainedError", "ConstraintNotSatisfiedError", "NotSupportedError", "TypeError"]) {
  await check(`unsupported options recover once: ${name}`, async () => {
    const calls = []
    const result = await requestVoiceMicrophone({ getUserMedia: async (options) => {
      calls.push(options)
      if (calls.length === 1) throw Object.assign(new Error(name), { name })
      return stream
    } }, wanted)
    assert.equal(result, stream)
    assert.deepEqual(calls, [{ audio: wanted }, { audio: true }])
  })
}
for (const name of ["NotAllowedError", "SecurityError", "NotFoundError", "NotReadableError", "AbortError"]) {
  await check(`no repeated permission request: ${name}`, async () => {
    let calls = 0
    const error = Object.assign(new Error(name), { name })
    await assert.rejects(requestVoiceMicrophone({ getUserMedia: async () => { calls++; throw error } }, wanted), (value) => value === error)
    assert.equal(calls, 1)
  })
}
await check("closing Voice prevents fallback microphone prompt", async () => {
  let current = true, calls = 0
  await assert.rejects(requestVoiceMicrophone({ getUserMedia: async () => {
    calls++; current = false
    throw Object.assign(new Error("unsupported"), { name: "OverconstrainedError" })
  } }, wanted, () => current), { name: "AbortError" })
  assert.equal(calls, 1)
})
await check("already cancelled capture makes no browser request", async () => {
  await assert.rejects(requestVoiceMicrophone({ getUserMedia: async () => { assert.fail("stale request") } }, wanted, () => false), { name: "AbortError" })
})
await check("second capture error is returned without retry loop", async () => {
  let calls = 0
  await assert.rejects(requestVoiceMicrophone({ getUserMedia: async () => {
    calls++
    throw Object.assign(new Error("unsupported"), { name: "OverconstrainedError" })
  } }, wanted), { name: "OverconstrainedError" })
  assert.equal(calls, 2)
})

// Exercise real PCM scheduling across mobile AudioContext.resume(), without
// connecting a model, requesting microphone permission or playing real audio.
let active
const contexts = []
class Context {
  constructor() { contexts.push(this); this.state = "suspended"; this.currentTime = 0; this.destination = {}; this.sources = [] }
  resume() { return new Promise((resolve) => { this.release = () => { this.state = "running"; resolve() } }) }
  createBuffer(_channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) } }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start() { this.started = true }, stop() { this.stopped = true } }
    this.sources.push(source)
    return source
  }
}
globalThis.window = { AudioContext: Context, clearTimeout, clearInterval }
const pcm = Buffer.alloc(480).toString("base64")
for (const action of ["stop", "close"]) {
  await check(`pending PCM cannot restart after ${action}`, async () => {
    if (active) active.state = "closed"
    const session = new GeminiLiveSession({ language: "ru" })
    const pending = session.playPcm(pcm, 24000)
    active = contexts.at(-1)
    const context = active
    if (action === "close") session.close()
    else session.stopOutput()
    context.release()
    await pending
    assert.equal(context.sources.length, 0)
    session.close()
  })
}
await check("a new reply plays after the previous one was cancelled", async () => {
  active.state = "closed"
  const session = new GeminiLiveSession({})
  const old = session.playPcm(pcm, 24000)
  active = contexts.at(-1)
  session.stopOutput()
  active.release()
  await old
  await session.playPcm(pcm, 24000)
  assert.equal(active.sources.length, 1)
  assert.equal(active.sources[0].started, true)
  session.stopOutput()
  assert.equal(active.sources[0].stopped, true)
  session.close()
})
await check("malformed PCM is catchable and schedules no audio", async () => {
  const session = new GeminiLiveSession({})
  const count = active.sources.length
  await assert.rejects(session.playPcm("%%%", 24000))
  assert.equal(active.sources.length, count)
  session.close()
})
console.log(`Voice reliability: ${passed}/${passed} PASS (no external model calls)`)
