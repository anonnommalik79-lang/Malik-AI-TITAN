import assert from "node:assert/strict"

/**
 * Running the streaming path, end to end, without a network.
 *
 * Everything else about this feature was checked as arithmetic or as source
 * text, and both leave the same hole: the code had never executed. A socket
 * that is never opened, an audio graph that is never built and a message that
 * is never parsed are all equally green under a test that reads the file.
 *
 * So this builds the browser instead. A fake WebSocket, a fake AudioContext
 * whose ScriptProcessor can be made to fire, and a fake fetch for the token -
 * then the real DeepgramListener is driven through a real conversation using
 * the message shapes Deepgram actually sends, and what it does is checked.
 *
 * What this cannot prove is that Deepgram agrees with the parameters. Nothing
 * short of a key can. What it does prove is that everything on this side of the
 * wire behaves - which is where all the code is.
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

/** Everything the module reaches for that only exists in a browser. */
function install({ token = "tok_live", closeWith = null } = {}) {
  const sockets = []

  class FakeSocket {
    constructor(url, protocols) {
      this.url = url
      this.protocols = protocols
      this.readyState = 0
      this.sent = []
      this.binaryType = ""
      sockets.push(this)
      queueMicrotask(() => {
        if (closeWith && sockets.length === 1) {
          this.readyState = 3
          this.onclose?.({ code: closeWith })
          return
        }
        this.readyState = 1
        this.onopen?.()
      })
    }
    send(data) { this.sent.push(data) }
    close() { this.readyState = 3 }
    deliver(message) { this.onmessage?.({ data: JSON.stringify(message) }) }
  }
  FakeSocket.OPEN = 1

  const timers = new Set()
  globalThis.WebSocket = FakeSocket
  globalThis.window = {
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id },
    clearTimeout: (id) => { clearTimeout(id); timers.delete(id) },
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); timers.add(id); return id },
    clearInterval: (id) => { clearInterval(id); timers.delete(id) },
  }
  globalThis.fetch = async () => ({
    json: async () => (token ? { ok: true, accessToken: token } : { ok: false }),
  })

  let processor = null
  const context = {
    sampleRate: 48000,
    createMediaStreamSource: () => ({ connect() {} }),
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createScriptProcessor: () => {
      processor = { onaudioprocess: null, connect() {}, disconnect() {} }
      return processor
    },
    destination: {},
  }

  return {
    sockets,
    context,
    /** Pushes one block of microphone audio through the real handler. */
    feed(samples) {
      const data = new Float32Array(samples)
      for (let i = 0; i < samples; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.4
      processor?.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } })
    },
    get hasProcessor() { return Boolean(processor?.onaudioprocess) },
    cleanup() { for (const id of timers) { clearTimeout(id); clearInterval(id) } },
  }
}

const { DeepgramListener, streamLanguage } = await import(`${process.cwd()}/lib/voice/deepgram-listen.ts`)

console.log("\nthe socket path, executed")

await check("it fetches a token, opens the stream, and asks for the right thing", async () => {
  const browser = install()
  const listener = new DeepgramListener({ keyterms: ["Malik AI", "Kaspi"] })
  const started = await listener.start({}, browser.context)
  assert.equal(started, true, "the listener refused to start")

  const socket = browser.sockets[0]
  const url = new URL(socket.url)
  assert.equal(url.origin + url.pathname, "wss://api.deepgram.com/v1/listen")
  assert.equal(url.searchParams.get("model"), "nova-3")
  assert.equal(url.searchParams.get("encoding"), "linear16")
  assert.equal(url.searchParams.get("sample_rate"), "16000")
  assert.equal(url.searchParams.get("interim_results"), "true")
  assert.equal(url.searchParams.get("vad_events"), "true")
  assert.deepEqual(url.searchParams.getAll("keyterm"), ["Malik AI", "Kaspi"])
  // Token auth goes in the subprotocol, not a header - a browser cannot set
  // headers on a WebSocket at all.
  assert.deepEqual(socket.protocols, ["bearer", "tok_live"])

  listener.stop()
  browser.cleanup()
  return `${url.searchParams.get("utterance_end_ms")}ms endpoint, 2 keyterms`
})

await check("microphone audio arrives as 16-bit little-endian frames", async () => {
  const browser = install()
  const listener = new DeepgramListener({})
  await listener.start({}, browser.context)
  assert.ok(browser.hasProcessor, "no audio handler was attached")

  const socket = browser.sockets[0]
  // 48kHz in, 16kHz out: each 2048-sample block becomes about 683 samples, and
  // each goes out as it is produced rather than being held back to fill a
  // larger frame.
  for (let i = 0; i < 4; i++) browser.feed(2048)
  const audio = socket.sent.filter((item) => item instanceof ArrayBuffer)
  assert.equal(audio.length, 4, "one message per captured block, no buffering")
  for (const frame of audio) {
    const samples = frame.byteLength / 2
    assert.ok(samples > 600 && samples < 700, `${samples} samples - not a 43ms block resampled to 16kHz`)
    // Under 20ms a recognizer starts paying more in overhead than it gets in
    // audio; over 250ms the latency is audible.
    const ms = (samples / 16000) * 1000
    assert.ok(ms > 20 && ms < 250, `${ms.toFixed(0)}ms per message`)
  }
  // A 440Hz tone at 0.4 amplitude has to arrive at roughly 0.4 - that is
  // 13100 in PCM16. Far below it means something in the chain is eating the
  // signal, which is how the pre-emphasis mistake was found.
  const view = new Int16Array(audio[0])
  let peak = 0
  for (const sample of view) peak = Math.max(peak, Math.abs(sample))
  assert.ok(peak > 11000, `peak ${peak} - the chain is eating the signal`)
  assert.ok(peak < 32700, `peak ${peak} - the chain is clipping`)

  listener.stop()
  browser.cleanup()
  return `${audio.length} messages of ${(audio[0].byteLength / 2 / 16) | 0}ms, peak ${peak}`
})

await check("a whole spoken turn comes back in the right order", async () => {
  const browser = install()
  const seen = []
  const listener = new DeepgramListener({
    onInterim: (text) => seen.push(["interim", text]),
    onFinal: (text, info) => seen.push(["final", text, info.confidence, info.speechFinal]),
    onTurnEnd: () => seen.push(["end"]),
    onSpeechStarted: () => seen.push(["speech"]),
  })
  await listener.start({}, browser.context)
  const socket = browser.sockets[0]

  // The shapes Deepgram actually sends, in the order it sends them.
  socket.deliver({ type: "SpeechStarted" })
  socket.deliver({ type: "Results", is_final: false, channel: { alternatives: [{ transcript: "сделай мне" }] } })
  socket.deliver({ type: "Results", is_final: false, channel: { alternatives: [{ transcript: "сделай мне сайт" }] } })
  socket.deliver({
    type: "Results", is_final: true, speech_final: true,
    channel: { alternatives: [{ transcript: "сделай мне сайт для кофейни", confidence: 0.94, languages: ["ru"] }] },
  })

  assert.deepEqual(seen.map((item) => item[0]), ["speech", "interim", "interim", "final", "end"])
  assert.equal(seen[3][1], "сделай мне сайт для кофейни")
  assert.equal(seen[3][2], 0.94)
  assert.equal(seen[3][3], true)

  listener.stop()
  browser.cleanup()
})

await check("a pause with no closing word still ends the turn", async () => {
  const browser = install()
  let ended = 0
  const listener = new DeepgramListener({ onTurnEnd: () => { ended += 1 } })
  await listener.start({}, browser.context)
  // Someone trailing off: a final with no speech_final, then the backstop.
  browser.sockets[0].deliver({
    type: "Results", is_final: true, speech_final: false,
    channel: { alternatives: [{ transcript: "ну это самое", confidence: 0.7 }] },
  })
  assert.equal(ended, 0, "a final without speech_final must not end the turn on its own")
  browser.sockets[0].deliver({ type: "UtteranceEnd" })
  assert.equal(ended, 1)
  listener.stop()
  browser.cleanup()
})

await check("the endpoint moves as it learns this speaker", async () => {
  const browser = install()
  const listener = new DeepgramListener({})
  await listener.start({}, browser.context)
  const before = listener.pauses.endpointMs()
  const socket = browser.sockets[0]
  // A slow speaker: many words, each after a long gap.
  let now = Date.now()
  for (let i = 0; i < 30; i++) {
    now += 900
    listener.pauses.mark(now)
  }
  const after = listener.pauses.endpointMs()
  assert.ok(after > before, `${after} is not longer than ${before}`)
  void socket
  listener.stop()
  browser.cleanup()
  return `${before}ms → ${after}ms`
})

console.log("\nwhen the wire says no")

await check("a rejected parameter reconnects without it instead of giving up", async () => {
  // 1008 is a policy close. The one parameter here a model may refuse is
  // keyterm, and losing the whole stream over a spelling hint would be absurd.
  const browser = install({ closeWith: 1008 })
  const listener = new DeepgramListener({ keyterms: ["Malik AI"] })
  const started = await listener.start({}, browser.context)
  assert.equal(started, true, "it gave up instead of retrying")
  assert.equal(browser.sockets.length, 2, "it did not reconnect")
  assert.deepEqual(new URL(browser.sockets[0].url).searchParams.getAll("keyterm"), ["Malik AI"])
  assert.deepEqual(new URL(browser.sockets[1].url).searchParams.getAll("keyterm"), [])
  listener.stop()
  browser.cleanup()
  return "second attempt drops the hint and keeps the stream"
})

await check("no token means the slow path, not an error", async () => {
  const browser = install({ token: "" })
  const phases = []
  const listener = new DeepgramListener({ onPhase: (phase) => phases.push(phase) })
  const started = await listener.start({}, browser.context)
  assert.equal(started, false)
  assert.ok(phases.includes("failed"))
  assert.equal(browser.sockets.length, 0)
  browser.cleanup()
})

await check("a hard close is not mistaken for a working stream", async () => {
  const browser = install({ closeWith: 1006 })
  const listener = new DeepgramListener({})
  assert.equal(await listener.start({}, browser.context), false)
  browser.cleanup()
})

console.log("\nshutting down")

await check("stopping flushes, closes, and stops the keep-alive", async () => {
  const browser = install()
  const listener = new DeepgramListener({})
  await listener.start({}, browser.context)
  const socket = browser.sockets[0]

  listener.finish()
  assert.ok(socket.sent.some((item) => typeof item === "string" && item.includes("Finalize")),
    "the last word was never asked for")

  listener.stop()
  assert.ok(socket.sent.some((item) => typeof item === "string" && item.includes("CloseStream")))
  assert.equal(socket.readyState, 3)
  assert.equal(listener.isOpen(), false)

  // Nothing left running: a keep-alive that outlives the microphone holds a
  // paid socket open for as long as the tab is.
  const before = socket.sent.length
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(socket.sent.length, before)
  browser.cleanup()
})

await check("Kazakh gets its own stream when the speaker is speaking Kazakh", async () => {
  const browser = install()
  const listener = new DeepgramListener({ language: streamLanguage("kk", "ru") })
  await listener.start({}, browser.context)
  assert.equal(new URL(browser.sockets[0].url).searchParams.get("language"), "kk")
  listener.stop()
  browser.cleanup()
})

console.log(failures ? `\n${failures} failing\n` : "\nall live-path checks passed\n")
process.exit(failures ? 1 : 0)
