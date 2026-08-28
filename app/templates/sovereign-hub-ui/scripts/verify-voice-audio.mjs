import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const nativeRequire = createRequire(import.meta.url)
const stubs = { "@/lib/malik-compute/runtime": { withCompute: (handler) => handler } }
const cache = new Map()
function load(file) {
  const absolute = path.resolve(root, file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }
  cache.set(absolute, module)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const require = (name) => {
    if (name in stubs) return stubs[name]
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name)
      return load(target.endsWith(".ts") ? target : target + ".ts")
    }
    return nativeRequire(name)
  }
  new Function("require", "module", "exports", js)(require, module, module.exports)
  return module.exports
}

let checks = 0
const check = async (name, run) => { await run(); checks++; console.log("PASS " + name) }
const originalFetch = globalThis.fetch
const originalEnv = { ...process.env }
const calls = []
const tick = () => new Promise((resolve) => setImmediate(resolve))
const request = (body) => new Request("https://malik.test/api/voice/tts", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })

try {
  for (const key of Object.keys(process.env)) if (/GEMINI|DEEPGRAM|XAI|ELEVENLABS|GOOGLE_AI|GOOGLE_GENERATIVE|SERPER|TAVILY|BRAVE_SEARCH|KOKORO_TTS|MALIK_BACKEND/.test(key)) delete process.env[key]
  const sources = []
  class FakeContext {
    state = "running"
    sampleRate = 24000
    currentTime = 1
    destination = {}
    resume = async () => {}
    decodeAudioData = async () => ({ length: 24000, duration: 1 })
    createBuffer = (_channels, length, rate) => ({ length, duration: length / rate, copyToChannel() {} })
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() { this.started = true }, stop() { this.stopped = true }, onended: null }
      sources.push(source)
      return source
    }
  }
  globalThis.window = { AudioContext: FakeContext, setTimeout, clearTimeout, setInterval, clearInterval }
  const { VoiceAudioPlayer, getVoiceAudioContext, unlockVoiceAudio } = load("lib/voice/audio-playback.ts")
  const context = getVoiceAudioContext()
  const player = new VoiceAudioPlayer()
  const blob = new Blob([new Uint8Array(1024)], { type: "audio/wav" })
  await check("audio is successful only after decoded audio ends", async () => {
    let started = false, ended = false
    const result = player.play(blob, () => { started = true }).then((ok) => { ended = true; return ok })
    await tick()
    assert.equal(started, true)
    assert.equal(ended, false)
    sources.at(-1).onended()
    assert.equal(await result, true)
  })
  await check("stop actually stops reply sound and resolves false", async () => {
    const result = player.play(blob)
    await tick()
    const source = sources.at(-1)
    player.stop()
    assert.equal(source.stopped, true)
    assert.equal(await result, false)
  })
  await check("cancel during async decode never starts late audio", async () => {
    let decoded
    const previous = context.decodeAudioData
    context.decodeAudioData = () => new Promise((resolve) => { decoded = resolve })
    const before = sources.length
    const result = player.play(blob)
    await tick()
    player.stop()
    decoded({ length: 24000, duration: 1 })
    await tick()
    assert.equal(await result, false)
    assert.equal(sources.length, before)
    context.decodeAudioData = previous
  })
  await check("blocked or corrupt audio cannot report successful speech", async () => {
    const previous = context.decodeAudioData
    context.decodeAudioData = async () => { throw new Error("invalid audio") }
    assert.equal(await player.play(blob), false)
    context.decodeAudioData = previous
    context.state = "suspended"
    assert.equal(await player.play(blob), false)
    context.state = "running"
    assert.equal(await player.play(new Blob(["{}"])), false)
  })
  await check("opening gesture and replies share the output context", () => {
    unlockVoiceAudio()
    assert.equal(getVoiceAudioContext(), context)
  })

  const { FluxTtsSession } = load("lib/voice/flux-tts-client.ts")
  await check("stream metadata without PCM never counts as spoken audio", async () => {
    const stream = new FluxTtsSession()
    stream.speaking = true
    const result = new Promise((resolve) => { stream.turnResolve = resolve })
    stream.handleServerMessage({ data: JSON.stringify({ type: "SpeechMetadata" }) })
    assert.equal(await result, false)
  })
  await check("stream waits for PCM playback to finish after metadata arrives", async () => {
    const stream = new FluxTtsSession()
    stream.speaking = true
    const result = new Promise((resolve) => { stream.turnResolve = resolve })
    stream.handleServerMessage({ data: new ArrayBuffer(4800) })
    stream.handleServerMessage({ data: JSON.stringify({ type: "SpeechMetadata", audio_duration_ms: 100 }) })
    await tick()
    assert.equal(stream.speaking, true)
    sources.at(-1).onended()
    assert.equal(await result, true)
    stream.close()
    assert.equal(context.state, "running")
  })
  await check("interruption cancels PCM that was waiting for audio readiness", async () => {
    const stream = new FluxTtsSession()
    stream.speaking = true
    const result = new Promise((resolve) => { stream.turnResolve = resolve })
    const count = sources.length
    stream.handleServerMessage({ data: new ArrayBuffer(4800) })
    stream.interrupt()
    await tick()
    assert.equal(await result, false)
    assert.equal(sources.length, count)
  })

  const { shouldSearchVoice, voiceSearchContext } = load("lib/voice/web-search.ts")
  await check("ordinary conversation does not search or spend search tokens", async () => {
    globalThis.fetch = async () => { throw new Error("unexpected network") }
    for (const text of ["Привет, как дела?", "Расскажи сказку", "Что такое радуга?", "Найди ошибку в моём коде", "Не ищи в интернете", "Don't search the web", "Интернеттен іздеме"]) {
      assert.equal(shouldSearchVoice(text), false, text)
      assert.equal((await voiceSearchContext(text)).requested, false)
    }
    for (const text of ["Поищи в гугле новости", "Найди погоду в Алматы", "Look up today's weather", "Интернеттен іздеп бер"]) assert.equal(shouldSearchVoice(text), true, text)
  })
  process.env.SERPER_API_KEY = "test-only-serper"
  process.env.TAVILY_API_KEY = "test-only-tavily"
  const searchResponse = () => Response.json({ organic: [{ title: "Weather source", link: "https://weather.example/today", snippet: "Sunny, 23 degrees" }] })
  await check("voice uses Google/Serper and stops after the first successful provider", async () => {
    calls.length = 0
    globalThis.fetch = async (url) => { calls.push(String(url)); return searchResponse() }
    const result = await voiceSearchContext("Поищи погоду в Алматы")
    assert.equal(calls.length, 1)
    assert.equal(calls[0], "https://google.serper.dev/search")
    assert.equal(result.sources.length, 1)
    assert.match(result.context, /untrusted reference data/)
    assert.match(result.context, /23 degrees/)
  })
  await check("failed Google falls back once to Tavily", async () => {
    calls.length = 0
    globalThis.fetch = async (url) => { calls.push(String(url)); return calls.length === 1 ? new Response("", { status: 503 }) : Response.json({ results: [{ title: "Source", url: "https://example.com", content: "Fact" }] }) }
    assert.equal((await voiceSearchContext("Поищи факт")).sources[0].provider, "tavily")
    assert.equal(calls.length, 2)
  })
  let instruction = ""
  stubs["@/lib/voice/voice-llm-router"] = { voiceLlmAnswer: async (input) => { instruction = input.instruction; return { content: "Сегодня солнечно, двадцать три градуса.", provider: "test", model: "test" } } }
  const turn = load("app/api/voice/turn/route.ts")
  await check("spoken answer receives actual search context and returns source URLs", async () => {
    globalThis.fetch = async () => searchResponse()
    const result = await (await turn.POST(request({ text: "Поищи погоду", language: "ru" }))).json()
    assert.equal(result.usedWeb, true)
    assert.equal(result.sources[0].url, "https://weather.example/today")
    assert.match(instruction, /23 degrees/)
  })
  await check("search failure cannot pretend to have found web results", async () => {
    globalThis.fetch = async () => new Response("", { status: 503 })
    instruction = "not called"
    const result = await (await turn.POST(request({ text: "Поищи погоду", language: "ru" }))).json()
    assert.equal(result.usedWeb, false)
    assert.equal(instruction, "not called")
    assert.match(result.content, /не удалось/)
  })

  const tts = load("app/api/voice/tts/route.ts")
  await check("missing TTS credentials returns an honest 503, not pretend audio", async () => {
    globalThis.fetch = async () => { throw new Error("unexpected network") }
    const result = await tts.POST(request({ text: "Привет", language: "ru" }))
    assert.equal(result.status, 503)
    assert.equal((await result.json()).ok, false)
  })
  await check("Gemini PCM is returned as a valid 24kHz WAV", async () => {
    process.env.GEMINI_API_KEY = "test-only-gemini"
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /generativelanguage.googleapis.com/)
      const body = JSON.parse(init.body)
      assert.equal(body.generationConfig.speechConfig.languageCode, "ru-RU")
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.alloc(4800, 3).toString("base64"), mimeType: "audio/L16;rate=24000" } }] } }] })
    }
    const response = await tts.POST(request({ text: "Привет", language: "ru", voice: "Charon" }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("content-type"), "audio/wav")
    const audio = Buffer.from(await response.arrayBuffer())
    assert.equal(audio.toString("ascii", 0, 4), "RIFF")
    assert.equal(audio.readUInt32LE(24), 24000)
    assert.equal(audio.readUInt32LE(40), 4800)
  })
  await check("wrong MIME from TTS is not playable success", async () => {
    delete process.env.GEMINI_API_KEY
    process.env.DEEPGRAM_API_KEY = "test-only-deepgram"
    globalThis.fetch = async () => Response.json({ error: "x".repeat(150) })
    assert.equal((await tts.POST(request({ text: "Hello", language: "en" }))).status, 503)
  })
  await check("Kazakh audio uses a configured Python service without looping", async () => {
    process.env.KOKORO_TTS_URL = "https://voice.example"
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://voice.example/api/voice/tts")
      assert.equal(JSON.parse(init.body).language, "kk")
      return new Response(new Uint8Array(1024), { headers: { "content-type": "audio/wav" } })
    }
    assert.equal((await tts.POST(request({ text: "Сәлем", language: "kk" }))).status, 200)
    process.env.KOKORO_TTS_URL = "https://malik.test"
    assert.equal((await tts.POST(request({ text: "Сәлем", language: "kk" }))).status, 503)
  })
  delete process.env.KOKORO_TTS_URL
  delete process.env.DEEPGRAM_API_KEY
  const mp3Fixture = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(1024, 3)])
  for (const language of ["ru", "kk"]) {
    await check(`ElevenLabs returns MP3 for ${language} without Gemini or a Python server`, async () => {
      process.env.ELEVENLABS_API_KEY = "test-only-elevenlabs"
      calls.length = 0
      globalThis.fetch = async (url, init) => {
        calls.push(String(url))
        assert.equal(String(url), "https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128")
        assert.equal(init.headers["xi-api-key"], "test-only-elevenlabs")
        const body = JSON.parse(init.body)
        assert.equal(body.model_id, "eleven_v3")
        assert.equal(body.language_code, language)
        assert.equal(body.text, language === "kk" ? "Сәлем!" : "Привет!")
        assert.equal(body.voice_settings.stability, .5)
        return new Response(mp3Fixture, { headers: { "content-type": "audio/mpeg" } })
      }
      const response = await tts.POST(request({ text: language === "kk" ? "Сәлем!" : "Привет!", language }))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("content-type"), "audio/mpeg")
      assert.equal(response.headers.get("x-malik-tts-provider"), "elevenlabs")
      assert.equal(response.headers.get("x-malik-tts-language"), language)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp3Fixture)
      assert.equal(calls.length, 1)
    })
  }
  await check("ElevenLabs alias, selected voice and calm settings reach the API", async () => {
    process.env.ELEVENLABS_VOICE_API_KEY = "test-only-voice-key"
    process.env.ELEVENLABS_VOICE_ID = "custom-default"
    process.env.ELEVENLABS_VOICE_ID_KK = "custom-kazakh"
    process.env.ELEVENLABS_VOICE_ID_KOKORO_M1_CALM = "custom-calm"
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /text-to-speech\/custom-calm\?/)
      assert.equal(init.headers["xi-api-key"], "test-only-voice-key")
      const body = JSON.parse(init.body)
      assert.equal(body.voice_settings.stability, 1)
      assert.equal(body.voice_settings.speed, .93)
      return new Response(mp3Fixture, { headers: { "content-type": "audio/mpeg" } })
    }
    assert.equal((await tts.POST(request({ text: "Сәлем", language: "kk", voice: "Kokoro M1 Calm", speed: 1 }))).status, 200)
  })
  await check("ElevenLabs JSON, empty and fake audio never count as speech", async () => {
    for (const response of [Response.json({ error: "x".repeat(200) }), new Response("", { headers: { "content-type": "audio/mpeg" } }), new Response("x".repeat(300), { headers: { "content-type": "audio/mpeg" } })]) {
      globalThis.fetch = async () => response
      const result = await tts.POST(request({ text: "Сәлем", language: "kk" }))
      assert.equal(result.status, 503)
      const body = await result.json()
      assert.equal(body.code, "VOICE_TTS_UNAVAILABLE")
      assert.doesNotMatch(body.error, /API_KEY|GEMINI|KOKORO/)
    }
  })
  await check("failed ElevenLabs can still use the existing Russian fallback", async () => {
    process.env.XAI_API_KEY = "test-only-xai"
    calls.length = 0
    globalThis.fetch = async (url) => {
      calls.push(String(url))
      return String(url).includes("elevenlabs.io") ? new Response("", { status: 401 }) : new Response(mp3Fixture, { headers: { "content-type": "audio/mpeg" } })
    }
    const result = await tts.POST(request({ text: "Привет", language: "ru" }))
    assert.equal(result.headers.get("x-malik-tts-provider"), "xai")
    assert.equal(calls.length, 2)
    delete process.env.XAI_API_KEY
  })
  await check("English remains on Deepgram even when ElevenLabs is configured", async () => {
    process.env.DEEPGRAM_API_KEY = "test-only-deepgram"
    calls.length = 0
    globalThis.fetch = async (url) => {
      calls.push(String(url))
      assert.match(String(url), /api\.deepgram\.com\/v2\/speak/)
      return new Response(mp3Fixture, { headers: { "content-type": "audio/mpeg" } })
    }
    const result = await tts.POST(request({ text: "Hello", language: "en", voice: "Cliff" }))
    assert.equal(result.headers.get("x-malik-tts-provider"), "deepgram")
    assert.equal(calls.length, 1)
  })
  console.log(`Voice audio behavior: ${checks}/${checks} PASS (mock audio/providers, not a device listening test)`)
} finally {
  globalThis.fetch = originalFetch
  delete globalThis.window
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
}
