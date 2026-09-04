/**
 * Listening while the person is still talking.
 *
 * What this replaces: the microphone recorded a clip, a level meter watched for
 * 1700ms of quiet, and only then was the whole file uploaded to Whisper and
 * waited on. Three costs, and all three are what "он тупой" actually means.
 *
 * The wait. Nothing could be recognised until the sentence was over, and then
 * an upload and a decode had to happen before the model even saw the words.
 * That is a second and a half of silence on every turn before anything starts,
 * and it is why the reply never lands the way it does in the assistants he is
 * comparing this to.
 *
 * The cut. A level meter cannot tell a pause from an ending. Someone choosing
 * words in a second language pauses for longer than someone in their first, so
 * the threshold that does not cut a Russian speaker off cuts a Kazakh one off,
 * and the half-sentence that survived was answered as if it were the whole
 * question.
 *
 * The language. Whisper is given one clip with no context and has to guess the
 * language from it. On two words of Kazakh it guesses wrong, confidently, and
 * returns fluent nonsense - which is the "слышит тысячу разных вещей" part.
 *
 * Streaming fixes all three at once. Audio goes up continuously as 16kHz PCM,
 * words come back in about 250ms, and the end of a turn is decided by a model
 * that has heard the words rather than by a level meter that has heard a
 * volume. Nova-3 in multilingual mode decodes Russian, Kazakh and English in
 * one stream, including a switch inside a single sentence, which no
 * single-language decode can do.
 *
 * Whisper does not go away. It stays as the fallback for when this is not
 * configured, when the socket fails, and when the stream comes back unsure -
 * and the two-recognizer arbitration in transcript-choice.ts stays with it.
 */

import { DcBlocker, PauseTracker, Resampler } from "./dsp"

export type ListenPhase = "idle" | "connecting" | "open" | "closed" | "failed"

export type ListenEvents = {
  /** Words so far in the current utterance, replaced as they are revised. */
  onInterim?: (text: string) => void
  /** A finished utterance. `speechFinal` means the recognizer heard the end of it. */
  onFinal?: (text: string, info: { confidence: number; speechFinal: boolean; language?: string }) => void
  /** The recognizer's own end-of-turn. This is the signal to answer. */
  onTurnEnd?: () => void
  /** Voice detected. Used to interrupt the reply that is playing. */
  onSpeechStarted?: () => void
  onPhase?: (phase: ListenPhase, detail?: string) => void
}

export type ListenOptions = ListenEvents & {
  /** Names the recognizer should spell rather than sound out. */
  keyterms?: string[]
  /**
   * How long a pause has to be before the turn is over, in ms. Longer than a
   * comma, shorter than an answer. 1100 is the middle of the range where a
   * second-language speaker is still choosing a word.
   */
  utteranceEndMs?: number
  /** The language to decode as. See `streamLanguage` for why this is not always "multi". */
  language?: string
  /**
   * This speaker's pauses, kept by the caller so the estimate survives a turn.
   * A tracker owned by the socket would forget everything every time the
   * microphone stopped, which is once per sentence.
   */
  pauses?: PauseTracker
}

/**
 * Which language code to open the stream with.
 *
 * `multi` is the code-switching mode and it is the right default - but it
 * covers ten languages, and Kazakh is not one of them. Nova-3 transcribes
 * Kazakh perfectly well under `kk`; it just cannot do it inside `multi`. Open a
 * `multi` stream for a Kazakh speaker and the recognizer will render every
 * sentence as whichever of its ten languages the sounds resembled, which is
 * the exact failure this whole path exists to remove, reintroduced one layer
 * lower.
 *
 * So Kazakh gets its own stream and everything else gets code-switching. The
 * cost is that a Russian sentence inside a Kazakh conversation is decoded by
 * the Kazakh model - and that is what the recorded-audio fallback and the
 * two-recognizer arbitration behind it are for.
 */
export function streamLanguage(spoken?: string | null, selected?: string | null): string {
  const code = String(spoken || selected || "").toLowerCase()
  return code.startsWith("kk") ? "kk" : "multi"
}

/** The languages `multi` actually decodes. Kazakh is deliberately absent. */
export const MULTILINGUAL_CODES = ["en", "es", "fr", "de", "hi", "ru", "pt", "ja", "it", "nl"]

const ENDPOINT = "wss://api.deepgram.com/v1/listen"
const TARGET_RATE = 16000
/**
 * How much audio the browser hands over at a time: 2048 samples at the device
 * rate, about 43ms. Smaller risks the callback missing its deadline and
 * dropping audio; larger is latency for nothing.
 */
const CAPTURE_BLOCK = 2048

function pcm16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

function url(options: { keyterms?: string[]; utteranceEndMs: number; withKeyterms: boolean; language: string }) {
  const query = new URLSearchParams({
    model: "nova-3",
    // "multi" is code-switching across ten languages and Kazakh is not one of
    // them, so a Kazakh speaker gets a Kazakh stream instead. See
    // streamLanguage() - getting this wrong reproduces the original bug.
    language: options.language,
    encoding: "linear16",
    sample_rate: String(TARGET_RATE),
    channels: "1",
    // Words as they are spoken, so the screen fills while the person talks.
    interim_results: "true",
    // Punctuation and numbers written the way a person would write them.
    smart_format: "true",
    // The recognizer's own end-of-turn, decided from the words. `endpointing`
    // closes the utterance; `utterance_end_ms` is the backstop for when someone
    // trails off without a clear final word.
    endpointing: "400",
    utterance_end_ms: String(options.utteranceEndMs),
    // Tells us the moment a voice starts, which is how the reply gets
    // interrupted the instant the person talks over it.
    vad_events: "true",
    filler_words: "false",
  })

  if (options.withKeyterms) {
    for (const term of options.keyterms || []) {
      if (term) query.append("keyterm", term)
    }
  }

  return `${ENDPOINT}?${query.toString()}`
}

export class DeepgramListener {
  private socket: WebSocket | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  /**
   * The front end: a DC blocker and a designed low-pass decimator, each
   * holding its state across callbacks, because the audio arrives in
   * 2048-sample blocks and a filter reset at every boundary is 23 clicks a
   * second going into the recognizer.
   */
  private dc: DcBlocker | null = null
  private resampler: Resampler | null = null
  /** This speaker's own pauses, which decide when a turn is over. */
  readonly pauses: PauseTracker
  private events: ListenEvents
  private options: ListenOptions
  private stopped = false
  private keepAlive: number | null = null
  private phase: ListenPhase = "idle"
  /** Set when the socket is refused with keyterms, so the retry drops them. */
  private keytermsRejected = false

  constructor(options: ListenOptions) {
    this.options = options
    this.events = options
    this.pauses = options.pauses || new PauseTracker()
  }

  isOpen() {
    return this.phase === "open"
  }

  private setPhase(phase: ListenPhase, detail?: string) {
    this.phase = phase
    this.events.onPhase?.(phase, detail)
  }

  /**
   * Opens the stream and starts sending audio.
   *
   * Returns false rather than throwing when streaming is not available, because
   * every caller's answer to that is the same: fall back to the recorder and
   * Whisper. A voice mode that fails closed is worse than a slow one.
   */
  async start(stream: MediaStream, context: AudioContext): Promise<boolean> {
    this.stopped = false
    this.setPhase("connecting")

    let token = ""
    try {
      const response = await fetch("/api/voice/deepgram-token", { cache: "no-store", credentials: "same-origin" })
      const payload = await response.json().catch(() => null) as { ok?: boolean; accessToken?: string } | null
      token = payload?.ok && payload.accessToken ? payload.accessToken : ""
    } catch {
      token = ""
    }
    if (!token) {
      this.setPhase("failed", "no token")
      return false
    }

    const opened = await this.open(token)
    if (!opened) return false

    this.attachAudio(stream, context)
    return true
  }

  private open(token: string): Promise<boolean> {
    return new Promise((resolve) => {
      let socket: WebSocket
      try {
        socket = new WebSocket(
          url({
            keyterms: this.options.keyterms,
            // Measured from this speaker rather than fixed: a constant is
            // wrong for everybody, and the two people it is most wrong for are
            // the fast talker who waits for every reply and the one choosing
            // words in a third language who gets cut off.
            utteranceEndMs: this.options.utteranceEndMs ?? this.pauses.endpointMs(),
            withKeyterms: !this.keytermsRejected,
            language: this.options.language || "multi",
          }),
          ["bearer", token],
        )
      } catch {
        this.setPhase("failed", "socket refused")
        resolve(false)
        return
      }

      socket.binaryType = "arraybuffer"
      let settled = false

      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        try { socket.close() } catch {}
        this.setPhase("failed", "timeout")
        resolve(false)
      }, 4000)

      socket.onopen = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        this.socket = socket
        this.setPhase("open")
        // Deepgram closes an idle socket after 10s. Someone thinking about what
        // to say is idle, and losing the stream mid-thought is exactly when it
        // must not be lost.
        this.keepAlive = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try { socket.send(JSON.stringify({ type: "KeepAlive" })) } catch {}
          }
        }, 6000)
        resolve(true)
      }

      socket.onmessage = (event) => this.handle(event)

      socket.onerror = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        this.setPhase("failed", "socket error")
        resolve(false)
      }

      socket.onclose = (event) => {
        if (!settled) {
          settled = true
          window.clearTimeout(timer)
          // 1008 is a rejected parameter. The one parameter here that a given
          // model or language may refuse is keyterm, so drop it and try once
          // more rather than falling back to the slow path over a hint.
          if (event.code === 1008 && !this.keytermsRejected) {
            this.keytermsRejected = true
            this.open(token).then(resolve)
            return
          }
          this.setPhase("failed", `closed ${event.code}`)
          resolve(false)
          return
        }
        this.teardownSocket()
        if (!this.stopped) this.setPhase("closed", `closed ${event.code}`)
      }
    })
  }

  private handle(event: MessageEvent) {
    let message: {
      type?: string
      channel?: { alternatives?: Array<{ transcript?: string; confidence?: number; languages?: string[] }> }
      is_final?: boolean
      speech_final?: boolean
    }
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }

    if (message.type === "SpeechStarted") {
      this.events.onSpeechStarted?.()
      return
    }

    // The backstop end-of-turn: no clear final word, just a long enough pause.
    if (message.type === "UtteranceEnd") {
      this.pauses.reset()
      this.events.onTurnEnd?.()
      return
    }

    if (message.type !== "Results" && message.channel === undefined) return

    const alternative = message.channel?.alternatives?.[0]
    const text = String(alternative?.transcript || "").trim()

    if (!message.is_final) {
      if (text) this.events.onInterim?.(text)
      return
    }

    if (text) {
      this.pauses.mark()
      this.events.onFinal?.(text, {
        confidence: typeof alternative?.confidence === "number" ? alternative.confidence : 0,
        speechFinal: Boolean(message.speech_final),
        language: alternative?.languages?.[0],
      })
    }

    // speech_final is the recognizer saying it heard the end of the sentence,
    // which is earlier and more accurate than any pause timer.
    if (message.speech_final) {
      this.pauses.reset()
      this.events.onTurnEnd?.()
    }
  }

  private attachAudio(stream: MediaStream, context: AudioContext) {
    try {
      this.context = context
      this.source = context.createMediaStreamSource(stream)
      // ScriptProcessorNode is deprecated and is still the only thing that
      // works everywhere this ships, Safari included. An AudioWorklet would
      // need a separate module fetched over the network, which is one more
      // thing that can fail between tapping the microphone and being heard.
      this.processor = context.createScriptProcessor(CAPTURE_BLOCK, 1, 1)

      this.dc = new DcBlocker()
      this.resampler = new Resampler(context.sampleRate, TARGET_RATE)

      this.processor.onaudioprocess = (event) => {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
        const input = event.inputBuffer.getChannelData(0)
        const levelled = this.dc!.process(input)
        const resampled = this.resampler!.process(levelled)
        if (!resampled.length) return

        // Sent as it comes, without collecting it into larger frames first.
        // Buffering to a fixed frame size was 128ms of audio held back on every
        // message - latency bought for nothing, since the recognizer is happy
        // with anything from about 20ms upward.
        try { this.socket.send(pcm16(resampled)) } catch { return }
      }

      this.source.connect(this.processor)
      // Connected to a silent gain node rather than the speakers: a
      // ScriptProcessor only runs when it is part of a live graph, and routing
      // the microphone to the output would put the room through the speakers.
      const sink = context.createGain()
      sink.gain.value = 0
      this.processor.connect(sink)
      sink.connect(context.destination)
    } catch {
      this.setPhase("failed", "audio graph")
    }
  }

  private teardownSocket() {
    if (this.keepAlive !== null) {
      window.clearInterval(this.keepAlive)
      this.keepAlive = null
    }
    this.socket = null
  }

  /** Tells the recognizer no more audio is coming, so it flushes what it has. */
  finish() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify({ type: "Finalize" })) } catch {}
    }
  }

  stop() {
    this.stopped = true
    try { this.processor?.disconnect() } catch {}
    try { this.source?.disconnect() } catch {}
    this.processor = null
    this.source = null
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify({ type: "CloseStream" })) } catch {}
      try { this.socket.close() } catch {}
    }
    this.teardownSocket()
    this.setPhase("idle")
  }
}

/**
 * Whether a streamed transcript is trustworthy on its own.
 *
 * Below this the utterance goes through the recorded-audio path instead, where
 * Whisper and the browser recognizer get to disagree about it. Two words at
 * 0.6 is the case that used to produce a confident answer to something the
 * person never said.
 */
export function streamedTranscriptIsTrusted(text: string, confidence: number) {
  const words = text.split(/\s+/).filter(Boolean).length
  if (!words) return false
  if (words <= 2) return confidence >= 0.85
  if (words <= 5) return confidence >= 0.7
  return confidence >= 0.55
}
