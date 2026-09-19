"use client"

import { getVoiceAudioContext, readyVoiceAudio } from "./audio-playback"
import {
  DEFAULT_LIVE_MODEL,
  LIVE_INPUT_RATE,
  LIVE_WS_URL,
  buildLiveSetup,
  safeLiveLanguage,
  safeLiveVoice,
  type LiveLanguage,
} from "./gemini-live-setup"

export type { LiveLanguage }

type LiveCallbacks = {
  onReady?: (model: string) => void
  onInputText?: (text: string) => void
  onOutputText?: (text: string) => void
  onSpeaking?: () => void
  onTurnComplete?: () => void
  onInterrupted?: () => void
  /** The link dropped and the session is being restored. The microphone stays open. */
  onReconnecting?: (attempt: number) => void
  /** The link is back and the microphone is streaming again. */
  onReconnected?: () => void
  /** The session is gone for good - every retry failed. */
  onClosed?: () => void
  onError?: () => void
}

type TokenPayload = {
  ok?: boolean
  accessToken?: string
  model?: string
  websocketUrl?: string
}

type VoiceWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext }

const DEFAULT_WS = LIVE_WS_URL
const INPUT_RATE = LIVE_INPUT_RATE
const DEFAULT_OUTPUT_RATE = 24000

/** Back-off between reconnect attempts. The last value repeats until the cap. */
const RETRY_DELAYS = [350, 900, 1800, 3200, 5000]
const MAX_RETRIES = 12

/**
 * Anti-alias corner for the 48 kHz -> 16 kHz step.
 *
 * Everything above 8 kHz folds back into the speech band when the signal is
 * decimated, which is heard by the model as a hiss laid over the voice. 7 kHz
 * leaves the whole speech range intact and puts the filter's skirt where the
 * fold would start.
 */
const ANTI_ALIAS_HZ = 7000

function toBase64(bytes: Uint8Array) {
  let binary = ""
  const step = 0x8000
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

function fromBase64(value: string) {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index)
  return out
}

/**
 * Rate conversion by averaging, not by picking.
 *
 * Taking every third sample throws away two out of three and folds their
 * energy back over the voice. Averaging the window the sample stands for is a
 * box filter: cheap, and together with the biquad in front of it enough to
 * keep the 16 kHz stream clean.
 */
function downsample(input: Float32Array, inputRate: number, outputRate = INPUT_RATE) {
  if (inputRate === outputRate) return input
  const ratio = inputRate / outputRate
  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const start = index * ratio
    const end = Math.min(input.length, start + ratio)
    let sum = 0
    let count = 0
    for (let position = Math.floor(start); position < end; position += 1) {
      sum += input[position]
      count += 1
    }
    output[index] = count ? sum / count : input[Math.min(input.length - 1, Math.floor(start))]
  }
  return output
}

function pcm16(input: Float32Array) {
  const output = new Int16Array(input.length)
  for (let index = 0; index < input.length; index += 1) {
    const value = Math.max(-1, Math.min(1, input[index]))
    output[index] = value < 0 ? Math.round(value * 0x8000) : Math.round(value * 0x7fff)
  }
  return new Uint8Array(output.buffer)
}

function sampleRate(mime: string) {
  const parsed = /rate=(\d+)/i.exec(mime || "")
  return parsed ? Math.max(8000, Number(parsed[1]) || DEFAULT_OUTPUT_RATE) : DEFAULT_OUTPUT_RATE
}

/**
 * Native Gemini Live audio-to-audio session.
 *
 * The permanent Render key never reaches the browser. The browser receives a
 * short-lived ephemeral token from /api/voice/gemini-live-token and talks
 * directly to Google's constrained Live websocket for the lowest possible
 * latency.
 *
 * Everything past the first connection exists because a websocket that lives
 * for a whole conversation will be closed at some point by something: a phone
 * changing cell, a laptop lid, Google rotating the serving host, the session
 * reaching its audio limit. The old client treated every one of those as the
 * end of Voice and released the microphone. Here the microphone is kept, the
 * session is restored from its resumption handle, and the person keeps talking.
 */
export class GeminiLiveSession {
  private socket: WebSocket | null = null
  private ready = false
  private connecting: Promise<boolean> | null = null
  private generation = 0
  private disposed = false

  private inputSource: MediaStreamAudioSourceNode | null = null
  private inputProcessor: ScriptProcessorNode | null = null
  private inputFilters: BiquadFilterNode[] = []
  private silentGain: GainNode | null = null
  private captureContext: AudioContext | null = null
  private captureOwned = false
  private lastFrameAt = 0
  private watchdog = 0

  private micStream: MediaStream | null = null
  private hostContext: AudioContext | null = null
  private wantsMic = false

  private resumeHandle: string | null = null
  private retries = 0
  private retryTimer = 0
  /** 0 = every documented option, 1 = core options, 2 = the bare minimum. */
  private setupTier: 0 | 1 | 2 = 0
  private sawSetupComplete = false

  private outputHead = 0
  private outputSources = new Set<AudioBufferSourceNode>()
  private callbacks: LiveCallbacks
  private voice: string
  private language: LiveLanguage
  private model = DEFAULT_LIVE_MODEL

  constructor(input: { voice?: string; language?: LiveLanguage; callbacks?: LiveCallbacks }) {
    this.voice = safeLiveVoice(input.voice || "Charon")
    this.language = safeLiveLanguage(input.language)
    this.callbacks = input.callbacks || {}
  }

  isReady() {
    return this.ready && this.socket?.readyState === WebSocket.OPEN
  }

  getLanguage() {
    return this.language
  }

  /**
   * Switching the answer language rewrites the system prompt, and a system
   * prompt only takes effect at setup. The session is therefore restarted -
   * without the resumption handle, because resuming would restore the old one.
   */
  async setLanguage(language: LiveLanguage) {
    const next = safeLiveLanguage(language)
    if (next === this.language) return
    this.language = next
    this.resumeHandle = null
    if (!this.socket && !this.wantsMic) return
    await this.restart()
  }

  /** Same story as the language: the voice is fixed when the session is set up. */
  async setVoice(voice: string) {
    const next = safeLiveVoice(voice)
    if (next === this.voice) return
    this.voice = next
    this.resumeHandle = null
    if (!this.socket && !this.wantsMic) return
    await this.restart()
  }

  async connect() {
    if (this.disposed) return false
    if (this.isReady()) return true
    if (this.connecting) return this.connecting
    const attempt = this.open()
    this.connecting = attempt
    try { return await attempt }
    finally { if (this.connecting === attempt) this.connecting = null }
  }

  private buildSetup() {
    return buildLiveSetup({
      model: this.model,
      voice: this.voice,
      language: this.language,
      tier: this.setupTier,
      resumeHandle: this.resumeHandle,
    })
  }

  private async open(): Promise<boolean> {
    if (this.disposed) return false
    const generation = ++this.generation

    let token: TokenPayload
    try {
      const response = await fetch("/api/voice/gemini-live-token", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      token = await response.json().catch(() => ({})) as TokenPayload
      if (!response.ok || !token.ok || !token.accessToken) {
        console.error("[VOICE_GEMINI_LIVE_TOKEN_UNAVAILABLE]", response.status)
        return false
      }
    } catch (error) {
      console.error("[VOICE_GEMINI_LIVE_TOKEN_FETCH]", error instanceof Error ? error.message : String(error))
      return false
    }

    if (this.disposed || generation !== this.generation) return false

    this.model = token.model || this.model
    const base = token.websocketUrl || DEFAULT_WS

    let socket: WebSocket
    try {
      socket = new WebSocket(`${base}?access_token=${encodeURIComponent(token.accessToken)}`)
    } catch (error) {
      console.error("[VOICE_GEMINI_LIVE_WS_OPEN]", error instanceof Error ? error.message : String(error))
      return false
    }
    this.socket = socket
    this.sawSetupComplete = false

    const opened = await new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(value)
      }
      const timer = window.setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN || !this.sawSetupComplete) {
          try { socket.close(4000, "setup timeout") } catch {}
        }
        finish(false)
      }, 9000)

      const mine = () => !this.disposed && generation === this.generation

      socket.onopen = () => {
        try { socket.send(JSON.stringify(this.buildSetup())) }
        catch { finish(false) }
      }

      socket.onmessage = async (event) => {
        let raw = ""
        try {
          raw = typeof event.data === "string"
            ? event.data
            : event.data instanceof Blob
              ? await event.data.text()
              : ""
        } catch {}
        let message: any
        try { message = JSON.parse(raw) }
        catch { return }
        if (!mine()) return

        if (message.setupComplete) {
          this.ready = true
          this.sawSetupComplete = true
          this.retries = 0
          this.callbacks.onReady?.(this.model)
          finish(true)
          return
        }

        // Google hands out a fresh handle as the conversation moves. The last
        // one received is what a reconnect resumes from.
        const handle = message.sessionResumptionUpdate?.newHandle
        if (typeof handle === "string" && handle) this.resumeHandle = handle

        // A warning that this connection is about to be taken away. Moving
        // first means the gap is a few hundred milliseconds instead of a dead
        // microphone.
        if (message.goAway) {
          console.warn("[VOICE_GEMINI_LIVE_GOAWAY]", message.goAway?.timeLeft || "")
          this.restartSoon(0)
          return
        }

        const server = message.serverContent
        if (!server) return

        if (server.interrupted) {
          this.stopOutput()
          this.callbacks.onInterrupted?.()
        }

        const inputText = String(server.inputTranscription?.text || "")
        if (inputText) this.callbacks.onInputText?.(inputText)

        const outputText = String(server.outputTranscription?.text || "")
        if (outputText) this.callbacks.onOutputText?.(outputText)

        for (const part of server.modelTurn?.parts || []) {
          const inline = part?.inlineData || part?.inline_data
          const data = inline?.data
          const mime = String(inline?.mimeType || inline?.mime_type || "")
          if (typeof data === "string" && data && /^audio\/pcm/i.test(mime)) {
            this.callbacks.onSpeaking?.()
            void this.playPcm(data, sampleRate(mime))
          }
        }

        if (server.turnComplete) this.callbacks.onTurnComplete?.()
      }

      socket.onerror = () => {
        if (!mine()) return
        console.error("[VOICE_GEMINI_LIVE_WS_ERROR]")
        finish(false)
      }

      socket.onclose = (event) => {
        if (!mine()) {
          finish(false)
          return
        }
        const wasReady = this.ready
        this.ready = false
        if (event.code !== 1000) {
          console.error("[VOICE_GEMINI_LIVE_WS_CLOSE]", event.code, event.reason || "no reason")
        }
        this.stopCapture()
        this.stopOutput()

        // Closed before setup ever succeeded, with a code that means the
        // server refused what was sent. Rather than leave Voice dead because
        // one option is not supported on this account, the same session is
        // retried with a smaller setup.
        if (!this.sawSetupComplete && this.setupTier < 2 && (event.code === 1007 || event.code === 1008 || event.code === 1003 || event.code === 1002)) {
          this.setupTier = (this.setupTier + 1) as 1 | 2
          console.warn("[VOICE_GEMINI_LIVE_SETUP_DOWNGRADE]", this.setupTier)
        }

        finish(false)
        // Deliberate hang-ups (close(), restart()) bump the generation first,
        // so anything arriving here is a drop the person did not ask for.
        if (this.wantsMic || wasReady) this.restartSoon()
      }
    })

    if (!opened) {
      if (this.socket === socket) {
        try { socket.close() } catch {}
        if (this.socket === socket) this.socket = null
      }
    }
    return opened
  }

  /** Tears the current link down without letting its handlers trigger a retry. */
  private dropSocket() {
    this.generation += 1
    this.ready = false
    this.connecting = null
    const socket = this.socket
    this.socket = null
    try { socket?.close(1000, "restarting") } catch {}
  }

  private async restart() {
    this.dropSocket()
    this.stopCapture()
    const ok = await this.connect()
    if (ok && this.wantsMic) await this.startCapture()
    return ok
  }

  /**
   * Bring the session back, keeping the microphone open the whole time.
   *
   * The person sees the subtitle change and keeps talking; nothing is
   * released, so there is nothing for them to switch back on afterwards.
   */
  private restartSoon(delay?: number) {
    if (this.disposed || this.retryTimer) return
    if (!this.wantsMic && !this.resumeHandle) return
    if (this.retries >= MAX_RETRIES) {
      this.callbacks.onClosed?.()
      return
    }
    const wait = typeof delay === "number"
      ? delay
      : RETRY_DELAYS[Math.min(this.retries, RETRY_DELAYS.length - 1)]
    this.retries += 1
    this.callbacks.onReconnecting?.(this.retries)

    this.retryTimer = window.setTimeout(async () => {
      this.retryTimer = 0
      if (this.disposed) return
      this.dropSocket()
      const ok = await this.connect()
      if (this.disposed) return
      if (!ok) {
        this.restartSoon()
        return
      }
      if (this.wantsMic) {
        const attached = await this.startCapture()
        if (!attached) {
          this.restartSoon()
          return
        }
      }
      this.retries = 0
      this.callbacks.onReconnected?.()
    }, wait)
  }

  /**
   * Hands the microphone to the session.
   *
   * The stream and the page's audio context are remembered, so every later
   * reconnect re-arms capture on its own without asking the page for the
   * microphone a second time.
   */
  async attachMicrophone(stream: MediaStream, context: AudioContext) {
    if (!this.isReady()) return false
    this.micStream = stream
    this.hostContext = context
    this.wantsMic = true
    const started = await this.startCapture()
    if (!started) this.wantsMic = false
    return started
  }

  private async startCapture(): Promise<boolean> {
    const stream = this.micStream
    if (!stream || !this.isReady()) return false
    this.stopCapture()

    try {
      let context = this.hostContext
      let owned = false

      // Capturing straight into a 16 kHz context lets the browser's own
      // resampler do the conversion on the raw signal. That is both better
      // than anything done by hand here and cheaper.
      if (!context || context.state === "closed" || context.sampleRate !== INPUT_RATE) {
        const Ctor = (window as VoiceWindow).AudioContext || (window as VoiceWindow).webkitAudioContext
        if (Ctor) {
          try {
            const native = new Ctor({ sampleRate: INPUT_RATE })
            if (native.sampleRate === INPUT_RATE) {
              context = native
              owned = true
            } else {
              try { await native.close() } catch {}
            }
          } catch {}
        }
      }
      if (!context || context.state === "closed") return false
      if (context.state === "suspended") {
        try { await context.resume() } catch {}
      }

      const source = context.createMediaStreamSource(stream)
      const native = context.sampleRate === INPUT_RATE
      const processor = context.createScriptProcessor(native ? 1024 : 2048, 1, 1)
      const gain = context.createGain()
      gain.gain.value = 0

      const filters: BiquadFilterNode[] = []
      if (!native) {
        for (let index = 0; index < 2; index += 1) {
          const filter = context.createBiquadFilter()
          filter.type = "lowpass"
          filter.frequency.value = ANTI_ALIAS_HZ
          filter.Q.value = Math.SQRT1_2
          filters.push(filter)
        }
      }

      const rate = context.sampleRate
      processor.onaudioprocess = (event) => {
        if (!this.isReady()) return
        this.lastFrameAt = Date.now()
        const mono = event.inputBuffer.getChannelData(0)
        const samples = downsample(mono, rate, INPUT_RATE)
        const bytes = pcm16(samples)
        try {
          this.socket?.send(JSON.stringify({
            realtimeInput: {
              audio: {
                data: toBase64(bytes),
                mimeType: `audio/pcm;rate=${INPUT_RATE}`,
              },
            },
          }))
        } catch {}
      }

      let tail: AudioNode = source
      for (const filter of filters) {
        tail.connect(filter)
        tail = filter
      }
      tail.connect(processor)
      processor.connect(gain)
      gain.connect(context.destination)

      this.inputSource = source
      this.inputProcessor = processor
      this.inputFilters = filters
      this.silentGain = gain
      this.captureContext = context
      this.captureOwned = owned
      this.lastFrameAt = Date.now()
      this.startWatchdog()
      console.info("[VOICE_GEMINI_LIVE_CAPTURE_READY]", `${rate}Hz`, native ? "native" : "resampled")
      return true
    } catch (error) {
      console.error("[VOICE_GEMINI_LIVE_CAPTURE]", error instanceof Error ? error.message : String(error))
      this.stopCapture()
      return false
    }
  }

  /**
   * A ScriptProcessor stops firing without warning when the tab is backgrounded
   * on a phone or the audio context is suspended by the system. Nothing throws;
   * the microphone simply goes quiet, which is exactly how "the mic turns
   * itself off" looks from the outside. This notices the silence and rebuilds
   * the capture chain.
   */
  private startWatchdog() {
    if (this.watchdog) return
    this.watchdog = window.setInterval(() => {
      if (this.disposed || !this.wantsMic) return
      const context = this.captureContext
      if (context && context.state === "suspended") {
        void context.resume().catch(() => {})
      }
      if (!this.isReady()) return
      if (this.lastFrameAt && Date.now() - this.lastFrameAt > 3500) {
        console.warn("[VOICE_GEMINI_LIVE_CAPTURE_STALLED]")
        this.lastFrameAt = Date.now()
        void this.startCapture()
      }
    }, 1500)
  }

  private stopWatchdog() {
    if (!this.watchdog) return
    window.clearInterval(this.watchdog)
    this.watchdog = 0
  }

  private stopCapture() {
    if (this.inputProcessor) this.inputProcessor.onaudioprocess = null
    try { this.inputSource?.disconnect() } catch {}
    for (const filter of this.inputFilters) { try { filter.disconnect() } catch {} }
    try { this.inputProcessor?.disconnect() } catch {}
    try { this.silentGain?.disconnect() } catch {}
    this.inputSource = null
    this.inputProcessor = null
    this.inputFilters = []
    this.silentGain = null
    if (this.captureOwned && this.captureContext && this.captureContext.state !== "closed") {
      const owned = this.captureContext
      void owned.close().catch(() => {})
    }
    this.captureContext = null
    this.captureOwned = false
  }

  /**
   * A typed question, answered by the same session that answers the spoken
   * ones - so the conversation stays one conversation rather than splitting
   * between two models the moment somebody uses the keyboard.
   */
  sendText(text: string) {
    const value = String(text || "").trim()
    if (!value || !this.isReady()) return false
    try {
      this.socket?.send(JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: value }] }],
          turnComplete: true,
        },
      }))
      return true
    } catch {
      return false
    }
  }

  /** The person switched the microphone off. This one is deliberate. */
  detachMicrophone() {
    this.wantsMic = false
    this.stopWatchdog()
    if (this.isReady()) {
      try { this.socket?.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })) } catch {}
    }
    this.stopCapture()
    this.micStream = null
    this.hostContext = null
  }

  private async playPcm(encoded: string, rate: number) {
    const context = getVoiceAudioContext()
    if (!context || !await readyVoiceAudio(context)) return

    const bytes = fromBase64(encoded)
    const frames = Math.floor(bytes.byteLength / 2)
    if (!frames) return
    const audio = context.createBuffer(1, frames, rate)
    const channel = audio.getChannelData(0)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < frames; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 32768
    }

    const source = context.createBufferSource()
    source.buffer = audio
    source.connect(context.destination)
    const when = Math.max(context.currentTime + .012, this.outputHead)
    source.start(when)
    this.outputHead = when + audio.duration
    this.outputSources.add(source)
    source.onended = () => {
      this.outputSources.delete(source)
      try { source.disconnect() } catch {}
    }
  }

  stopOutput() {
    for (const source of this.outputSources) {
      try { source.stop(); source.disconnect() } catch {}
    }
    this.outputSources.clear()
    const context = getVoiceAudioContext()
    this.outputHead = context?.currentTime || 0
  }

  close() {
    this.disposed = true
    this.wantsMic = false
    this.resumeHandle = null
    if (this.retryTimer) { window.clearTimeout(this.retryTimer); this.retryTimer = 0 }
    this.stopWatchdog()
    this.stopCapture()
    this.stopOutput()
    this.micStream = null
    this.hostContext = null
    this.dropSocket()
  }
}
