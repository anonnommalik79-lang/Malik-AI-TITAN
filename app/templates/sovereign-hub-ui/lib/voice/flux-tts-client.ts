"use client"

type FluxConfig = {
  voice: string
  speed: number
  expressivity: number
}

type TokenPayload = { ok?: boolean; accessToken?: string; error?: string }

type FluxServerMessage = {
  type?: string
  audio_duration_ms?: number
  audio_played_ms?: number
  text_spoken?: string
  text_remaining?: string
  metadata?: { audio_duration_ms?: number }
}

const SAMPLE_RATE = 24000
const ALLOWED_SPEEDS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15] as const

function normalizedSpeed(value: number) {
  return ALLOWED_SPEEDS.reduce((best, item) => Math.abs(item - value) < Math.abs(best - value) ? item : best, 1)
}

function normalizedExpressivity(value: number) {
  return Math.max(-2, Math.min(2, Math.round(Number.isFinite(value) ? value : 0)))
}

function voiceModel(voice: string) {
  const slug = String(voice || "Cliff").trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "cliff"
  return `flux-${slug}-en`
}

function textChunks(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > 180 && current) {
      chunks.push(`${current} `)
      current = word
      continue
    }
    current = next
    if (/[.!?…]$/.test(word) && current.length >= 28) {
      chunks.push(`${current} `)
      current = ""
    }
  }
  if (current) chunks.push(current)
  return chunks.length ? chunks : [text]
}

function browserAudioContext() {
  const ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return ctor ? new ctor() : null
}

export function detectVoiceLanguage(text: string): "kk" | "ru" | "en" {
  const normalized = text.toLowerCase()
  if (
    /[әіңғүұқөһ]/i.test(text) ||
    /\b(сәлем|салем|қалай|калай|жақсы|жаксы|қазақ|казак|қазақстан|казахстан|рахмет|рақмет|керек|болады|болмайды|иә|ия|жоқ|жок|менің|сенің|біздің|сіздің|қайда|кайда|қанша|канша|неге|осы|бұл|бул)\b/i.test(normalized)
  ) return "kk"
  if (/[а-яё]/i.test(text)) return "ru"
  return "en"
}

export class FluxTtsSession {
  private socket: WebSocket | null = null
  private socketKey = ""
  private connecting: Promise<boolean> | null = null
  private audioContext: AudioContext | null = null
  private sources = new Set<AudioBufferSourceNode>()
  private audioCursor = 0
  private currentSpeed = 1
  private currentExpressivity = 0
  private speaking = false
  private interrupted = false
  private turnResolve: ((ok: boolean) => void) | null = null
  private metadataReceived = false
  private metadataDurationMs = 0
  private turnStartContextTime = 0
  private turnScheduledMs = 0
  private sessionPlayedMs = 0
  private lastInterruptOffset = 0
  private keepAliveTimer: number | null = null

  isSpeaking() {
    return this.speaking
  }

  private async getToken() {
    const response = await fetch("/api/voice/deepgram-token", { cache: "no-store", credentials: "same-origin" })
    const payload = await response.json().catch(() => ({})) as TokenPayload
    if (!response.ok || !payload.accessToken) throw new Error(payload.error || "Deepgram token unavailable")
    return payload.accessToken
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) window.clearInterval(this.keepAliveTimer)
    this.keepAliveTimer = null
  }

  private startKeepAlive() {
    this.stopKeepAlive()
    this.keepAliveTimer = window.setInterval(() => {
      const socket = this.socket
      if (!socket || socket.readyState !== WebSocket.OPEN || this.speaking) return
      try { socket.send(JSON.stringify({ type: "Configure", speed: this.currentSpeed })) } catch {}
    }, 45000)
  }

  private stopSources() {
    for (const source of this.sources) {
      try { source.onended = null; source.stop() } catch {}
    }
    this.sources.clear()
    if (this.audioContext) this.audioCursor = this.audioContext.currentTime
  }

  private finishTurn(ok: boolean) {
    const resolve = this.turnResolve
    this.turnResolve = null
    this.speaking = false
    if (ok && !this.interrupted && this.metadataDurationMs > 0) {
      this.sessionPlayedMs += this.metadataDurationMs
    }
    this.metadataReceived = false
    this.metadataDurationMs = 0
    this.turnStartContextTime = 0
    this.turnScheduledMs = 0
    this.interrupted = false
    resolve?.(ok)
  }

  private maybeFinishTurn() {
    if (this.speaking && this.metadataReceived && this.sources.size === 0) this.finishTurn(true)
  }

  private async schedulePcm(data: ArrayBuffer) {
    if (!this.speaking || this.interrupted || data.byteLength < 2) return
    if (!this.audioContext || this.audioContext.state === "closed") this.audioContext = browserAudioContext()
    const context = this.audioContext
    if (!context) return
    if (context.state === "suspended") {
      try { await context.resume() } catch {}
    }

    const sampleCount = Math.floor(data.byteLength / 2)
    if (!sampleCount) return
    const pcm = new Float32Array(sampleCount)
    const view = new DataView(data)
    for (let i = 0; i < sampleCount; i += 1) pcm[i] = view.getInt16(i * 2, true) / 32768

    const buffer = context.createBuffer(1, sampleCount, SAMPLE_RATE)
    buffer.copyToChannel(pcm, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)

    const startAt = Math.max(context.currentTime + 0.025, this.audioCursor || 0)
    if (!this.turnStartContextTime) this.turnStartContextTime = startAt
    this.audioCursor = startAt + buffer.duration
    this.turnScheduledMs += buffer.duration * 1000
    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
      this.maybeFinishTurn()
    }
    source.start(startAt)
  }

  private handleServerMessage(event: MessageEvent) {
    if (event.data instanceof ArrayBuffer) {
      void this.schedulePcm(event.data)
      return
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((data) => this.schedulePcm(data))
      return
    }
    if (typeof event.data !== "string") return

    let message: FluxServerMessage | null = null
    try { message = JSON.parse(event.data) as FluxServerMessage } catch { return }
    if (!message?.type) return

    if (message.type === "SpeechMetadata") {
      this.metadataReceived = true
      this.metadataDurationMs = Number(message.audio_duration_ms || message.metadata?.audio_duration_ms || this.turnScheduledMs || 0)
      this.maybeFinishTurn()
      return
    }

    if (message.type === "SpeechInterrupted") {
      const played = Number(message.audio_played_ms || 0)
      if (played > 0) this.sessionPlayedMs = Math.max(this.sessionPlayedMs, played)
    }
  }

  private destroySocket() {
    this.stopKeepAlive()
    const socket = this.socket
    this.socket = null
    this.socketKey = ""
    this.connecting = null
    if (socket) {
      try { socket.send(JSON.stringify({ type: "Close" })) } catch {}
      try { socket.close() } catch {}
    }
  }

  private async connect(config: FluxConfig) {
    const speed = normalizedSpeed(config.speed)
    const expressivity = normalizedExpressivity(config.expressivity)
    const model = voiceModel(config.voice)
    const key = `${model}:${expressivity}`

    if (this.socket?.readyState === WebSocket.OPEN && this.socketKey === key) {
      if (this.currentSpeed !== speed) this.configureSpeed(speed)
      return true
    }
    if (this.connecting && this.socketKey === key) return this.connecting

    this.destroySocket()
    this.currentSpeed = speed
    this.currentExpressivity = expressivity
    this.socketKey = key

    this.connecting = (async () => {
      try {
        const token = await this.getToken()
        const query = new URLSearchParams({
          model,
          encoding: "linear16",
          sample_rate: String(SAMPLE_RATE),
          speed: String(speed),
          expressivity: String(expressivity),
        })
        const socket = new WebSocket(`wss://api.deepgram.com/v2/speak?${query.toString()}`, ["bearer", token])
        socket.binaryType = "arraybuffer"
        this.socket = socket

        const opened = await new Promise<boolean>((resolve) => {
          let settled = false
          const done = (value: boolean) => {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            resolve(value)
          }
          const timer = window.setTimeout(() => done(false), 8000)
          socket.onopen = () => done(true)
          socket.onerror = () => done(false)
          socket.onclose = () => {
            if (this.socket === socket) {
              this.socket = null
              this.stopKeepAlive()
              if (this.speaking) {
                this.stopSources()
                this.finishTurn(false)
              }
            }
            done(false)
          }
        })

        if (!opened || this.socket !== socket) {
          try { socket.close() } catch {}
          return false
        }

        socket.onmessage = (event) => this.handleServerMessage(event)
        socket.onerror = () => {
          if (this.speaking) {
            this.stopSources()
            this.finishTurn(false)
          }
        }
        this.startKeepAlive()
        return true
      } catch (error) {
        console.warn("[FLUX_TTS_CONNECT]", error instanceof Error ? error.message : error)
        return false
      } finally {
        this.connecting = null
      }
    })()

    return this.connecting
  }

  configureSpeed(value: number) {
    const speed = normalizedSpeed(value)
    this.currentSpeed = speed
    const socket = this.socket
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ type: "Configure", speed })) } catch {}
    }
  }

  async speak(text: string, config: FluxConfig) {
    const clean = text.trim()
    if (!clean) return false
    const connected = await this.connect(config)
    const socket = this.socket
    if (!connected || !socket || socket.readyState !== WebSocket.OPEN) return false

    if (this.speaking) this.interrupt()
    this.stopSources()
    this.speaking = true
    this.interrupted = false
    this.metadataReceived = false
    this.metadataDurationMs = 0
    this.turnStartContextTime = 0
    this.turnScheduledMs = 0

    const result = new Promise<boolean>((resolve) => { this.turnResolve = resolve })
    try {
      for (const chunk of textChunks(clean)) socket.send(JSON.stringify({ type: "Speak", text: chunk }))
      socket.send(JSON.stringify({ type: "Flush" }))
    } catch {
      this.stopSources()
      this.finishTurn(false)
    }
    return result
  }

  interrupt() {
    if (!this.speaking) return false
    const context = this.audioContext
    let elapsed = 0
    if (context && this.turnStartContextTime) {
      elapsed = Math.max(0, Math.min(this.turnScheduledMs, (context.currentTime - this.turnStartContextTime) * 1000))
    }
    let offset = Math.floor(this.sessionPlayedMs + elapsed)
    if (offset <= this.lastInterruptOffset) offset = this.lastInterruptOffset + 1
    this.lastInterruptOffset = offset

    const socket = this.socket
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({
          type: "Interrupt",
          playback_offset: { type: "time_ms", value: offset },
        }))
      } catch {}
    }

    this.interrupted = true
    this.sessionPlayedMs = Math.max(this.sessionPlayedMs, offset)
    this.stopSources()
    this.finishTurn(false)
    return true
  }

  close() {
    this.interrupt()
    this.stopSources()
    this.destroySocket()
    if (this.audioContext && this.audioContext.state !== "closed") {
      try { void this.audioContext.close() } catch {}
    }
    this.audioContext = null
  }
}
