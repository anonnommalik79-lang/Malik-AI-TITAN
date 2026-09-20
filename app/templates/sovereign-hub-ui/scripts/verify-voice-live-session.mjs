import assert from "node:assert/strict"

/**
 * Gemini Live, executed.
 *
 * Voice Mode had three faults that no amount of reading the file would have
 * caught, because each of them is a thing that happens over time: the reply
 * arrived in English, the microphone switched itself off in the middle of a
 * conversation, and a dropped websocket ended the session for good.
 *
 * So this builds the browser - a fake WebSocket, a fake AudioContext whose
 * ScriptProcessor can be made to fire, a fake token endpoint - and drives the
 * real GeminiLiveSession through a real conversation, including the parts
 * where the wire misbehaves.
 *
 * What it cannot prove is that Google agrees with the setup it is sent.
 * Nothing short of a key can. What it does prove is that everything on this
 * side of the wire behaves the way the conversation needs it to.
 */

let failures = 0
async function check(name, fn) {
  try {
    const note = await fn()
    console.log(`  ok  ${name}${note ? `  — ${note}` : ""}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

/** A microphone stream that can be ended the way an operating system ends one. */
function fakeStream() {
  const track = { kind: "audio", readyState: "live", muted: false, onended: null, onmute: null, stop() { this.readyState = "ended" } }
  return {
    track,
    getAudioTracks: () => [track],
    getTracks: () => [track],
    /** The call that comes in, the headset that is unplugged. */
    end() { track.readyState = "ended"; track.onended?.() },
    mute() { track.muted = true; track.onmute?.() },
  }
}

/** Everything the module reaches for that only exists in a browser. */
function install({ token = "tok_live", sampleRate = 48000, nativeRate = true } = {}) {
  const sockets = []
  const timers = new Set()
  let tokenRequests = 0

  class FakeSocket {
    constructor(url) {
      this.url = url
      this.readyState = 0
      this.sent = []
      sockets.push(this)
      queueMicrotask(() => {
        if (this.readyState === 3) return
        this.readyState = 1
        this.onopen?.()
      })
    }
    send(data) { this.sent.push(data) }
    close(code = 1000, reason = "") {
      if (this.readyState === 3) return
      this.readyState = 3
      this.onclose?.({ code, reason })
    }
    /** What the server sends back. */
    deliver(message) { this.onmessage?.({ data: JSON.stringify(message) }) }
    /** The wire dropping underneath a live conversation. */
    drop(code = 1011) {
      this.readyState = 3
      this.onclose?.({ code, reason: "server fault" })
    }
    setup() { return JSON.parse(this.sent[0] || "{}").setup || {} }
    audio() {
      return this.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.realtimeInput?.audio)
        .map((message) => message.realtimeInput.audio)
    }
    /** Answers the setup the way Google does, handing out a resumption handle. */
    async accept(handle = "handle-1") {
      await tick()
      this.deliver({ setupComplete: {} })
      this.deliver({ sessionResumptionUpdate: { newHandle: handle, resumable: true } })
      await tick()
    }
  }
  FakeSocket.OPEN = 1

  const processors = []
  const filters = []
  class FakeContext {
    constructor(options) {
      this.sampleRate = options?.sampleRate && nativeRate ? options.sampleRate : sampleRate
      this.state = "running"
      this.currentTime = 0
      this.destination = {}
    }
    createMediaStreamSource() { return { connect() {} } }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} } }
    createBiquadFilter() {
      const filter = { type: "", frequency: { value: 0 }, Q: { value: 0 }, connect() {}, disconnect() {} }
      filters.push(filter)
      return filter
    }
    createScriptProcessor(size) {
      const processor = { size, onaudioprocess: null, connect() {}, disconnect() {} }
      processors.push(processor)
      return processor
    }
    async resume() { this.state = "running" }
    async close() { this.state = "closed" }
  }

  globalThis.WebSocket = FakeSocket
  globalThis.btoa = (binary) => Buffer.from(binary, "binary").toString("base64")
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary")
  globalThis.window = {
    AudioContext: FakeContext,
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id },
    clearTimeout: (id) => { clearTimeout(id); timers.delete(id) },
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); timers.add(id); return id },
    clearInterval: (id) => { clearInterval(id); timers.delete(id) },
  }
  let liveToken = token
  globalThis.fetch = async () => {
    tokenRequests += 1
    const value = liveToken
    return {
      ok: Boolean(value),
      json: async () => (value
        ? { ok: true, accessToken: `${value}-${tokenRequests}`, model: "gemini-3.8-live" }
        : { ok: false, error: "voice_live_not_configured" }),
    }
  }

  const context = new FakeContext()
  return {
    sockets,
    context,
    get tokenRequests() { return tokenRequests },
    /** The network goes away in the middle of a conversation. */
    breakToken() { liveToken = null },
    /** Pushes one block of microphone audio through the real handler. */
    feed(blocks = 1) {
      const last = processors[processors.length - 1]
      if (!last?.onaudioprocess) return 0
      const samples = last.size
      const data = new Float32Array(samples)
      for (let index = 0; index < samples; index += 1) {
        data[index] = Math.sin((2 * Math.PI * 440 * index) / 48000) * .4
      }
      for (let block = 0; block < blocks; block += 1) {
        last.onaudioprocess({ inputBuffer: { getChannelData: () => data } })
      }
      return blocks
    },
    get processorCount() { return processors.length },
    get filters() { return filters },
    cleanup() { for (const id of timers) { clearTimeout(id); clearInterval(id) } },
  }
}

const { GeminiLiveSession } = await import(`${process.cwd()}/lib/voice/gemini-live-client.ts`)

async function connected(options = {}) {
  const browser = install(options.install)
  const events = []
  const session = new GeminiLiveSession({
    voice: options.voice || "Charon",
    language: options.language || "kk",
    callbacks: {
      onReady: () => events.push("ready"),
      onInputInterim: (text) => events.push(`hear~:${text}`),
      onInputText: (text) => events.push(`hear:${text}`),
      onReconnecting: () => events.push("reconnecting"),
      onReconnected: () => events.push("reconnected"),
      onClosed: () => events.push("closed"),
      onStruggling: () => events.push("struggling"),
      onMicrophoneLost: () => events.push("mic-lost"),
      onOutputText: (text) => events.push(`say:${text}`),
      onInterrupted: () => events.push("interrupted"),
      onTurnComplete: () => events.push("turn"),
    },
  })
  const opening = session.connect()
  await tick()
  await browser.sockets[0].accept()
  const ready = await opening
  return { browser, session, events, ready }
}

console.log("\nthe language of the answer")

await check("the system prompt is written in the language it asks for", async () => {
  const notes = []
  for (const [language, marker] of [["kk", "қазақ"], ["ru", "по-русски"], ["en", "English"]]) {
    const { browser, session } = await connected({ language })
    const instruction = browser.sockets[0].setup().systemInstruction?.parts?.[0]?.text || ""
    assert.ok(instruction.includes(marker), `${language} prompt does not mention ${marker}`)
    notes.push(`${language}→${marker}`)
    session.close()
    browser.cleanup()
  }
  return notes.join(", ")
})

await check("unclear audio is not an excuse to switch to English", async () => {
  const { browser, session } = await connected({ language: "ru" })
  const instruction = browser.sockets[0].setup().systemInstruction?.parts?.[0]?.text || ""
  // This is the whole bug: a model told "answer in the user's language" falls
  // back to English the moment it is unsure what it heard.
  assert.match(instruction, /ЯЗЫКОВОЙ ЗАМОК/)
  assert.match(instruction, /неразборчив/)
  assert.match(instruction, /транскрипция выглядит китайской/)
  session.close()
  browser.cleanup()
})

await check("interim and final input transcripts stay separate", async () => {
  const { browser, session, events } = await connected({ language: "kk" })
  browser.sockets[0].deliver({ serverContent: { interimInputTranscription: { text: "сәл" } } })
  browser.sockets[0].deliver({ serverContent: { inputTranscription: { text: "сәлем" } } })
  await tick()
  assert.ok(events.includes("hear~:сәл"))
  assert.ok(events.includes("hear:сәлем"))
  session.close()
  browser.cleanup()
})

await check("changing the language restarts the session with the new prompt", async () => {
  const { browser, session } = await connected({ language: "kk" })
  const change = session.setLanguage("ru")
  await tick()
  await browser.sockets[1].accept("handle-2")
  await change
  assert.equal(browser.sockets.length, 2, "the session was not reopened")
  const instruction = browser.sockets[1].setup().systemInstruction?.parts?.[0]?.text || ""
  assert.ok(instruction.includes("по-русски"), "the new session kept the old language")
  session.close()
  browser.cleanup()
  return "kk → ru"
})

console.log("\nwhat reaches the model")

await check("the microphone streams 16 kHz little-endian PCM", async () => {
  const { browser, session } = await connected()
  assert.equal(await session.attachMicrophone(fakeStream(), browser.context), true)
  browser.feed(4)
  const audio = browser.sockets[0].audio()
  assert.equal(audio.length, 2, "100ms packets did not reach the socket")
  assert.equal(audio[0].mimeType, "audio/pcm;rate=16000")
  const bytes = Buffer.from(audio[0].data, "base64")
  assert.equal(bytes.length, 1600 * 2, "a live packet must be 100ms of 16-bit PCM")
  assert.notEqual(bytes.readInt16LE(200), 0, "the audio arrived silent")
  session.close()
  browser.cleanup()
  return `${audio.length} packets, ${bytes.length} bytes each`
})

await check("capture runs at 16 kHz natively when the browser allows it", async () => {
  const { browser, session } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  // A 16 kHz context means the browser's own resampler did the conversion on
  // the raw signal. Two 1024-sample callbacks are packetized into one exact
  // 1600-sample (100ms) websocket frame, leaving the tail queued.
  browser.feed(2)
  const bytes = Buffer.from(browser.sockets[0].audio()[0].data, "base64").length
  assert.equal(bytes, 1600 * 2, "native capture should be packetized to 100ms")
  session.close()
  browser.cleanup()
  return "1600-sample packets, 100ms"
})

await check("a 48 kHz context is filtered before it is decimated", async () => {
  // Older Safari refuses a 16 kHz context. Decimating 48 kHz by picking every
  // third sample folds everything above 8 kHz back over the voice, so the
  // filtered path has to exist and has to be used.
  const { browser, session } = await connected({ install: { nativeRate: false } })
  await session.attachMicrophone(fakeStream(), browser.context)
  browser.feed(3)
  const audio = browser.sockets[0].audio()
  assert.equal(audio.length, 1)
  assert.equal(audio[0].mimeType, "audio/pcm;rate=16000")
  const frames = Buffer.from(audio[0].data, "base64").length / 2
  assert.equal(frames, 1600, "48 kHz input must still reach Gemini as 100ms 16 kHz packets")
  // The averaging alone is a weak filter; the biquads in front of it are what
  // keep the fold-back out of the speech band.
  assert.equal(browser.filters.length, 2, "the anti-alias filters were not built")
  for (const filter of browser.filters) {
    assert.equal(filter.type, "lowpass")
    assert.equal(filter.frequency.value, 7000)
  }
  session.close()
  browser.cleanup()
  return `48k → ${frames}-sample @16k packets, 2 lowpass at 7kHz`
})

await check("ending one utterance flushes the short tail without muting the microphone", async () => {
  const { browser, session } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  browser.feed(1)
  assert.equal(browser.sockets[0].audio().length, 0, "a sub-100ms tail should still be queued")
  assert.equal(session.endUtterance(), true)
  assert.equal(browser.sockets[0].audio().length, 1, "the tail was not flushed")
  const ended = browser.sockets[0].sent.map((raw) => JSON.parse(raw)).some((message) => message.realtimeInput?.audioStreamEnd)
  assert.equal(ended, true, "hybrid VAD did not signal turn end")
  assert.equal(session.isReady(), true, "ending an utterance must not close the session")
  session.close()
  browser.cleanup()
})

await check("a typed question goes to the same session", async () => {
  const { browser, session } = await connected()
  assert.equal(session.sendText("сәлем"), true)
  const sent = browser.sockets[0].sent.map((raw) => JSON.parse(raw)).find((message) => message.clientContent)
  assert.equal(sent.clientContent.turns[0].parts[0].text, "сәлем")
  assert.equal(sent.clientContent.turnComplete, true)
  session.close()
  browser.cleanup()
})

console.log("\nwhen the wire drops")

await check("a dropped socket reconnects and keeps the microphone", async () => {
  const { browser, session, events } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  browser.feed(4)
  assert.equal(browser.sockets[0].audio().length, 2)

  browser.sockets[0].drop()
  assert.ok(events.includes("reconnecting"), "nothing told the screen the link had dropped")

  await tick(500)
  assert.equal(browser.sockets.length, 2, "the session did not reopen")
  await browser.sockets[1].accept("handle-2")
  await tick(20)

  assert.ok(events.includes("reconnected"), "the screen was never told the link came back")
  // The point of all of it: the person keeps talking and never touches the
  // microphone button.
  browser.feed(4)
  assert.equal(browser.sockets[1].audio().length, 2, "the microphone did not come back")
  session.close()
  browser.cleanup()
  return `${browser.sockets[1].audio().length} frames after the drop`
})

await check("the restored session resumes instead of starting over", async () => {
  const { browser, session } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  assert.deepEqual(browser.sockets[0].setup().sessionResumption, {}, "the first setup should ask for a handle")

  browser.sockets[0].drop()
  await tick(500)
  await browser.sockets[1].accept("handle-2")
  // Without the handle the model would have forgotten the conversation and
  // answered the next sentence as if it were the first.
  assert.equal(browser.sockets[1].setup().sessionResumption?.handle, "handle-1")
  session.close()
  browser.cleanup()
  return "handle-1 replayed"
})

await check("a goAway warning is acted on before the server hangs up", async () => {
  const { browser, session } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  browser.sockets[0].deliver({ goAway: { timeLeft: "2s" } })
  await tick(300)
  assert.equal(browser.sockets.length, 2, "the warning was ignored")
  session.close()
  browser.cleanup()
})

await check("each reconnect asks for its own token", async () => {
  const { browser, session } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  const before = browser.tokenRequests
  browser.sockets[0].drop()
  await tick(500)
  assert.ok(browser.tokenRequests > before, "an ephemeral token was reused")
  assert.notEqual(new URL(browser.sockets[1].url).searchParams.get("access_token"), new URL(browser.sockets[0].url).searchParams.get("access_token"))
  session.close()
  browser.cleanup()
})

await check("a setup the server refuses is retried smaller, not abandoned", async () => {
  const browser = install()
  const session = new GeminiLiveSession({ language: "ru", callbacks: {} })
  const opening = session.connect()
  await tick()
  // 1007 is what Google sends when one field of the setup is not accepted.
  // Losing Voice entirely because a single option is unsupported would be the
  // worst possible trade.
  browser.sockets[0].drop(1007)
  const first = await opening
  assert.equal(first, false)
  const full = browser.sockets[0].setup()
  assert.ok(full.contextWindowCompression, "the first attempt should send everything")

  const retry = session.connect()
  await tick()
  await browser.sockets[1].accept()
  assert.equal(await retry, true, "the smaller setup did not connect")
  const reduced = browser.sockets[1].setup()
  assert.equal(reduced.contextWindowCompression, undefined, "the refused option was sent again")
  assert.ok(reduced.systemInstruction, "the language rule must survive the downgrade")
  session.close()
  browser.cleanup()
  return `${Object.keys(full).length} fields → ${Object.keys(reduced).length}`
})

await check("switching the microphone off is deliberate and stays off", async () => {
  const { browser, session, events } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  session.detachMicrophone()
  const ended = browser.sockets[0].sent.map((raw) => JSON.parse(raw)).some((message) => message.realtimeInput?.audioStreamEnd)
  assert.equal(ended, true, "the model was not told the stream ended")

  browser.sockets[0].drop()
  await tick(500)
  // Nothing is streaming and nothing was resumed, so there is nothing to
  // reconnect for: a muted microphone must not quietly reopen the socket.
  assert.ok(!events.includes("reconnected"))
  session.close()
  browser.cleanup()
})

await check("no token means Live says so rather than half-starting", async () => {
  const browser = install({ token: null })
  const session = new GeminiLiveSession({ callbacks: {} })
  assert.equal(await session.connect(), false)
  assert.equal(session.isReady(), false)
  assert.equal(browser.sockets.length, 0, "a socket was opened without a token")
  session.close()
  browser.cleanup()
})

console.log("\nthe session is not cut short")

await check("compression is requested so an audio session has no time limit", async () => {
  const { browser, session } = await connected()
  const setup = browser.sockets[0].setup()
  assert.ok(setup.contextWindowCompression?.slidingWindow, "without this the session ends at its context limit")
  assert.deepEqual(setup.generationConfig.responseModalities, ["AUDIO"])
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Charon")
  assert.ok(setup.inputAudioTranscription && setup.outputAudioTranscription, "subtitles need both transcriptions")
  session.close()
  browser.cleanup()
})

await check("an unknown voice name never reaches the wire", async () => {
  const { browser, session } = await connected({ voice: "Kokoro M1" })
  const name = browser.sockets[0].setup().generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName
  assert.equal(name, "Charon", "a name Gemini does not know would fail the whole setup")
  session.close()
  browser.cleanup()
})

console.log("\nthe setup the server checks with is the setup the browser sends")

const { buildLiveSetup, LIVE_WS_URL, LIVE_TOKEN_URL, DEFAULT_LIVE_MODEL } =
  await import(`${process.cwd()}/lib/voice/gemini-live-setup.ts`)

await check("both sides build it from the same module", async () => {
  const { browser, session } = await connected({ language: "ru", voice: "Kore" })
  const overTheWire = browser.sockets[0].setup()
  // /api/voice/gemini-live-check calls buildLiveSetup and sends the result to
  // Google. If that ever drifted from what the browser sends, a green check
  // would mean nothing.
  const fromTheServer = buildLiveSetup({ model: overTheWire.model.replace("models/", ""), language: "ru", voice: "Kore" }).setup
  assert.deepEqual(fromTheServer, overTheWire)
  session.close()
  browser.cleanup()
})

await check("the endpoints are Google's, not a test stand", async () => {
  // This file points them elsewhere while it runs against the fake server, and
  // a forgotten override would ship a product that talks to nobody.
  assert.match(LIVE_WS_URL, /^wss:\/\/generativelanguage\.googleapis\.com\//)
  assert.match(LIVE_TOKEN_URL, /^https:\/\/generativelanguage\.googleapis\.com\//)
  assert.match(LIVE_WS_URL, /BidiGenerateContentConstrained$/)
  assert.equal(DEFAULT_LIVE_MODEL, "gemini-3.8-live")
  return DEFAULT_LIVE_MODEL
})

await check("each smaller tier drops options and keeps the language rule", async () => {
  const sizes = [0, 1, 2].map((tier) => Object.keys(buildLiveSetup({ tier, language: "kk" }).setup))
  assert.ok(sizes[0].includes("contextWindowCompression"))
  assert.ok(sizes[0].includes("realtimeInputConfig"), "full setup should tune VAD for natural pauses")
  assert.ok(!sizes[1].includes("realtimeInputConfig") && !sizes[2].includes("realtimeInputConfig"), "fallback tiers must use provider-default VAD")
  assert.ok(!sizes[1].includes("contextWindowCompression") && sizes[1].includes("sessionResumption"))
  assert.ok(!sizes[2].includes("sessionResumption"))
  for (const tier of [0, 1, 2]) {
    const setup = buildLiveSetup({ tier, language: "kk" }).setup
    assert.ok(setup.systemInstruction.parts[0].text.includes("қазақ"), `tier ${tier} lost the language rule`)
    assert.deepEqual(setup.generationConfig.responseModalities, ["AUDIO"], `tier ${tier} lost audio output`)
  }
  const fullSetup = buildLiveSetup({ tier: 0, language: "kk" }).setup
  assert.deepEqual(fullSetup.inputAudioTranscription.languageCodes, ["kk-KZ"])
  assert.equal(fullSetup.inputAudioTranscription.mode, "SMART")
  assert.ok(fullSetup.inputAudioTranscription.customVocabulary.includes("Malik AI"))
  assert.equal(fullSetup.realtimeInputConfig.automaticActivityDetection.endOfSpeechSensitivity, "END_SENSITIVITY_LOW")
  return sizes.map((keys) => keys.length).join(" → ")
})

console.log("\nthe microphone does not go away")

await check("a microphone taken by the system is reported, not guessed at", async () => {
  const { browser, session, events } = await connected()
  const stream = fakeStream()
  await session.attachMicrophone(stream, browser.context)
  browser.feed(4)
  assert.equal(browser.sockets[0].audio().length, 2)

  // A phone call takes the microphone. Nothing throws; audio just stops.
  stream.end()
  await tick(50)
  assert.ok(events.includes("mic-lost"), "the page was never told the microphone had gone")
  assert.equal(events.filter((event) => event === "mic-lost").length, 1, "one loss must not become a loop")
  session.close()
  browser.cleanup()
})

await check("a microphone muted for good is treated the same", async () => {
  const { browser, session, events } = await connected()
  const stream = fakeStream()
  await session.attachMicrophone(stream, browser.context)
  stream.mute()
  await tick(200)
  assert.ok(!events.includes("mic-lost"), "a momentary mute must not reopen the microphone")
  await tick(1300)
  assert.ok(events.includes("mic-lost"), "a mute that lasts is a lost microphone")
  session.close()
  browser.cleanup()
  return "ignored for 1.2s, then reported"
})

await check("a dead stream is never streamed into silence", async () => {
  const { browser, session } = await connected()
  const stream = fakeStream()
  stream.track.readyState = "ended"
  assert.equal(await session.attachMicrophone(stream, browser.context), false)
  assert.equal(browser.sockets[0].audio().length, 0)
  session.close()
  browser.cleanup()
})

await check("retrying never gives up on its own", async () => {
  const { browser, session, events } = await connected()
  await session.attachMicrophone(fakeStream(), browser.context)
  // The network goes; every reconnect from here fails at the token.
  browser.breakToken()
  browser.sockets[0].drop()
  await tick(4000)
  const attempts = events.filter((event) => event === "reconnecting").length
  assert.ok(attempts >= 3, `only ${attempts} attempts in four seconds`)
  assert.ok(!events.includes("closed"), "the session gave up and released the conversation")
  session.close()
  browser.cleanup()
  return `${attempts} attempts, still going`
})

console.log("\nwhat the model is told")

await check("it is told not to fill in what it did not hear", async () => {
  for (const [language, phrases] of [
    ["ru", ["ЯЗЫКОВОЙ ЗАМОК", "неразборчива", "выбранный язык Voice"]],
    ["kk", ["ТІЛ ҚҰЛПЫ", "қазақша нақтылап", "таңдалған Voice тілі"]],
    ["en", ["LANGUAGE LOCK", "clarifying question in English", "selected Voice language"]],
  ]) {
    const { browser, session } = await connected({ language })
    const instruction = browser.sockets[0].setup().systemInstruction?.parts?.[0]?.text || ""
    for (const phrase of phrases) {
      assert.ok(instruction.includes(phrase), `${language} prompt is missing: ${phrase}`)
    }
    session.close()
    browser.cleanup()
  }
  return "strict language lock + same-language clarification"
})

console.log(failures ? `\n${failures} failing\n` : "\nall Gemini Live session checks passed\n")
process.exit(failures ? 1 : 0)
