"use client"

import { getVoiceAudioContext, readyVoiceAudio } from "./audio-playback"

type LiveCallbacks = {
  onReady?: (model: string) => void
  onInputText?: (text: string) => void
  onOutputText?: (text: string) => void
  onSpeaking?: () => void
  onTurnComplete?: () => void
  onInterrupted?: () => void
  onClosed?: () => void
  onError?: () => void
}

type TokenPayload = {
  ok?: boolean
  accessToken?: string
  model?: string
  websocketUrl?: string
}

const DEFAULT_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained"
const INPUT_RATE = 16000
const DEFAULT_OUTPUT_RATE = 24000

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

function resample(input: Float32Array, inputRate: number, outputRate = INPUT_RATE) {
  if (inputRate === outputRate) return input
  const ratio = inputRate / outputRate
  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(input.length - 1, left + 1)
    const mix = position - left
    output[index] = input[left] * (1 - mix) + input[right] * mix
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

function safeLiveVoice(value: string) {
  const known = new Set([
    "Puck", "Charon", "Kore", "Aoede", "Fenrir", "Leda", "Achird", "Sulafat",
    "Iapetus", "Rasalgethi", "Schedar", "Gacrux", "Orus", "Algenib", "Sadaltager",
    "Alnilam", "Zubenelgenubi", "Laomedeia", "Algieba", "Enceladus", "Autonoe",
    "Vindemiatrix", "Sadachbia", "Achernar", "Zephyr", "Callirrhoe", "Erinome",
    "Despina", "Pulcherrima", "Umbriel",
  ])
  const head = String(value || "").trim().split(/\s+/)[0]
  return known.has(head) ? head : "Charon"
}

/**
 * Native Gemini Live audio-to-audio session.
 *
 * The permanent Render key never reaches the browser. The browser receives a
 * one-use ephemeral token from /api/voice/gemini-live-token and talks directly
 * to Google's constrained Live websocket for the lowest possible latency.
 */
export class GeminiLiveSession {
  private socket: WebSocket | null = null
  private ready = false
  private connecting: Promise<boolean> | null = null
  private inputSource: MediaStreamAudioSourceNode | null = null
  private inputProcessor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private outputHead = 0
  private outputSources = new Set<AudioBufferSourceNode>()
  private callbacks: LiveCallbacks
  private voice: string
  private model = "gemini-3.8-live"

  constructor(input: { voice?: string; callbacks?: LiveCallbacks }) {
    this.voice = safeLiveVoice(input.voice || "Charon")
    this.callbacks = input.callbacks || {}
  }

  isReady() {
    return this.ready && this.socket?.readyState === WebSocket.OPEN
  }

  async connect() {
    if (this.isReady()) return true
    if (this.connecting) return this.connecting
    this.connecting = this.open()
    try { return await this.connecting }
    finally { this.connecting = null }
  }

  private async open() {
    try {
      const response = await fetch("/api/voice/gemini-live-token", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      })
      const token = await response.json().catch(() => ({})) as TokenPayload
      if (!response.ok || !token.ok || !token.accessToken) return false

      this.model = token.model || "gemini-3.8-live"
      const base = token.websocketUrl || DEFAULT_WS
      const url = `${base}?access_token=${encodeURIComponent(token.accessToken)}`
      const socket = new WebSocket(url)
      this.socket = socket

      const opened = await new Promise<boolean>((resolve) => {
        let settled = false
        const finish = (value: boolean) => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          resolve(value)
        }
        const timer = window.setTimeout(() => finish(false), 9000)

        socket.onopen = () => {
          socket.send(JSON.stringify({
            setup: {
              model: `models/${this.model}`,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{
                  text: "You are Malik AI Voice. Listen carefully and answer naturally in the language the user speaks. Support Kazakh, Russian and English. Be concise by default, keep context across turns, and never mention internal providers or API keys.",
                }],
              },
            },
          }))
        }

        socket.onmessage = (event) => {
          let message: any
          try { message = JSON.parse(typeof event.data === "string" ? event.data : "") }
          catch { return }

          if (message.setupComplete) {
            this.ready = true
            this.callbacks.onReady?.(this.model)
            finish(true)
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
          this.ready = false
          this.callbacks.onError?.()
          finish(false)
        }

        socket.onclose = () => {
          const wasReady = this.ready
          this.ready = false
          this.detachMicrophone()
          this.stopOutput()
          if (wasReady) this.callbacks.onClosed?.()
          finish(false)
        }
      })

      if (!opened) {
        try { socket.close() } catch {}
        if (this.socket === socket) this.socket = null
      }
      return opened
    } catch {
      this.ready = false
      this.callbacks.onError?.()
      return false
    }
  }

  attachMicrophone(stream: MediaStream, context: AudioContext) {
    if (!this.isReady()) return false
    this.detachMicrophone()

    try {
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(2048, 1, 1)
      const gain = context.createGain()
      gain.gain.value = 0

      processor.onaudioprocess = (event) => {
        if (!this.isReady()) return
        const mono = event.inputBuffer.getChannelData(0)
        const samples = resample(mono, context.sampleRate, INPUT_RATE)
        const bytes = pcm16(samples)
        this.socket?.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: toBase64(bytes),
              mimeType: `audio/pcm;rate=${INPUT_RATE}`,
            },
          },
        }))
      }

      source.connect(processor)
      processor.connect(gain)
      gain.connect(context.destination)
      this.inputSource = source
      this.inputProcessor = processor
      this.silentGain = gain
      return true
    } catch {
      this.detachMicrophone()
      return false
    }
  }

  detachMicrophone() {
    if (this.inputProcessor) this.inputProcessor.onaudioprocess = null
    try { this.inputSource?.disconnect() } catch {}
    try { this.inputProcessor?.disconnect() } catch {}
    try { this.silentGain?.disconnect() } catch {}
    this.inputSource = null
    this.inputProcessor = null
    this.silentGain = null
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
    this.ready = false
    this.detachMicrophone()
    this.stopOutput()
    const socket = this.socket
    this.socket = null
    try { socket?.close(1000, "Voice closed") } catch {}
  }
}
