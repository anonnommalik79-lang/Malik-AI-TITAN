"use client"

import { X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { VoiceDock, type PickedVoiceFile } from "./VoiceDock"
import { VoiceOrb } from "./VoiceOrb"
import { VoiceSettings, defaultVoiceForLanguage, getVoiceProfile, voiceBelongsToLanguage, type VoiceLanguage } from "./VoiceSettings"
import styles from "./VoiceMode.module.css"
import { isVoiceSoundEnabled, playVoiceTransitionSound, saveVoiceSoundEnabled } from "@/lib/voice-transition-sound"
import { FluxTtsSession } from "@/lib/voice/flux-tts-client"
import { VoiceAudioPlayer, unlockVoiceAudio } from "@/lib/voice/audio-playback"
import { repairTranscript } from "@/lib/voice/speech-vocabulary"
import { speechChunks } from "@/lib/voice/speech-chunks"
import { chooseTranscript, conversationHint } from "@/lib/voice/transcript-choice"
import { VOICE_HISTORY_TURNS, type VoiceMessage } from "@/lib/voice/conversation"

type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechResultEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type VoiceWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
  webkitAudioContext?: typeof AudioContext
}
type VoiceTurnPayload = {
  ok?: boolean
  content?: string
  error?: string
  /** Any code from the shared language table, not just the three in the picker. */
  language?: string
  languageName?: string
  /** Locale for speech synthesis when the answer is not in the selected language. */
  languageLocale?: string
  transcript?: string
  usedWeb?: boolean
}
type TranscribePayload = { ok?: boolean; text?: string; error?: string; remainingSeconds?: number; confidence?: number }

const STORAGE_KEY = "malik.voice.preferences.v4"

/**
 * When the microphone decides you have stopped talking.
 *
 * This was one threshold and 1050ms of silence, which cuts people off
 * mid-thought: a natural pause inside a sentence is around a second, and it is
 * longer when someone is choosing words in a second language - exactly the case
 * this product exists for. Waiting a little longer costs a moment before the
 * answer; cutting early costs half the question.
 */
const SILENCE_MS = 1700
/** Loud enough to be speech rather than the room. */
const SPEECH_START_RMS = 0.020
/** Quiet enough to still be the tail of a word. */
const SPEECH_CONTINUE_RMS = 0.008

export function VoiceMode({ onClose, onSubmit }: { onClose: () => void; onSubmit?: (prompt: string) => void }) {
  const [phase, setPhase] = useState<"enter" | "open" | "leave">("enter")
  const [micActive, setMicActive] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [webGLError, setWebGLError] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(isVoiceSoundEnabled)
  const [screenActive, setScreenActive] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [language, setLanguage] = useState<VoiceLanguage>("kk")
  const [voice, setVoice] = useState(defaultVoiceForLanguage("kk"))
  const [personality, setPersonality] = useState("Assistant")
  const [speed, setSpeed] = useState(1)
  const [expressivity, setExpressivity] = useState(0)
  const [pickedFile, setPickedFile] = useState<PickedVoiceFile | null>(null)
  const [title, setTitle] = useState("Начни говорить")
  const [subtitle, setSubtitle] = useState("Живой туман внутри реагирует на голос")
  const [finalTranscript, setFinalTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const energyRef = useRef(.07)
  const speedRef = useRef(1)
  const languageRef = useRef<VoiceLanguage>("kk")
  const demoRef = useRef(false)
  const micActiveRef = useRef(false)
  const microphoneRef = useRef<MediaStream | null>(null)
  const screenRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef(0)
  const audioFrameRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const closingRef = useRef(false)
  const mountedRef = useRef(true)
  const micRequestRef = useRef(0)
  const replyPlayerRef = useRef<VoiceAudioPlayer | null>(null)
  const replyAbortRef = useRef<AbortController | null>(null)
  const replyVersionRef = useRef(0)
  const pendingAudioRef = useRef<Blob | null>(null)
  const lastReplyRef = useRef<{ text: string; voice: string; language: VoiceLanguage; locale?: string } | null>(null)
  /**
   * What has been said so far in this session. Sent with every turn so a
   * follow-up ("а почему?", "короче") has something to refer back to; cleared
   * when the voice window closes.
   */
  const historyRef = useRef<VoiceMessage[]>([])
  const replySettleRef = useRef<((ok: boolean) => void) | null>(null)
  const replyPlayingRef = useRef(false)
  const replyInterruptedRef = useRef(false)
  const fluxSessionRef = useRef<FluxTtsSession | null>(null)
  const autoSubmitRef = useRef<(() => void) | null>(null)
  const speechDetectedRef = useRef(false)
  const lastSpeechAtRef = useRef(0)

  useEffect(() => {
    languageRef.current = language
  }, [language])

  useEffect(() => {
    speedRef.current = speed
    fluxSessionRef.current?.configureSpeed(speed)
  }, [speed])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      const savedLanguage: VoiceLanguage = saved.language === "ru" || saved.language === "en" || saved.language === "kk" ? saved.language : "kk"
      languageRef.current = savedLanguage
      setLanguage(savedLanguage)
      if (typeof saved.voice === "string" && voiceBelongsToLanguage(saved.voice, savedLanguage)) setVoice(saved.voice)
      else setVoice(defaultVoiceForLanguage(savedLanguage))
      if (typeof saved.personality === "string") setPersonality(saved.personality)
      if (typeof saved.speed === "number" && saved.speed >= .85 && saved.speed <= 1.15) setSpeed(saved.speed)
      if (typeof saved.expressivity === "number" && saved.expressivity >= -2 && saved.expressivity <= 2) setExpressivity(Math.round(saved.expressivity))
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ language, voice, personality, speed, expressivity })) } catch {}
  }, [language, voice, personality, speed, expressivity])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 2200)
  }, [])

  const stopReplyAudio = useCallback((interrupted = true) => {
    replyVersionRef.current += 1
    replyAbortRef.current?.abort()
    replyAbortRef.current = null
    if (interrupted && replyPlayingRef.current) replyInterruptedRef.current = true
    window.speechSynthesis?.cancel()
    fluxSessionRef.current?.interrupt()
    const settle = replySettleRef.current
    replySettleRef.current = null
    settle?.(false)
    replyPlayerRef.current?.stop()
    replyPlayingRef.current = false
  }, [])

  const chooseBrowserVoice = useCallback((profileName: string, forcedLanguage: VoiceLanguage, locale?: string) => {
    const profile = getVoiceProfile(profileName)
    const voices = window.speechSynthesis?.getVoices?.() || []
    if (!voices.length) return null
    // The answer can be in any language now, so the installed voice for the
    // language actually spoken comes first; the picker is only the fallback.
    const base = String(locale || "").split("-")[0]
    const prefix = base
      ? new RegExp(`^${base}`, "i")
      : forcedLanguage === "kk" ? /^kk/i : forcedLanguage === "ru" ? /^ru/i : /^en/i
    let pool = voices.filter((item) => prefix.test(item.lang))
    if (!pool.length && base) {
      const fallback = forcedLanguage === "kk" ? /^kk/i : forcedLanguage === "ru" ? /^ru/i : /^en/i
      pool = voices.filter((item) => fallback.test(item.lang))
    }
    if (!pool.length) return null
    for (const hint of profile.hints) {
      const match = pool.find((item) => item.name.toLowerCase().includes(hint.toLowerCase()))
      if (match) return match
    }
    return pool[0] || null
  }, [])

  const speakBrowser = useCallback((text: string, profileName: string, forcedLanguage: VoiceLanguage, locale?: string) => new Promise<boolean>((resolve) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return resolve(false)
    const profile = getVoiceProfile(profileName)
    const browserVoice = chooseBrowserVoice(profileName, forcedLanguage, locale)
    if (!browserVoice) return resolve(false)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = browserVoice
    utterance.lang = locale || (forcedLanguage === "kk" ? "kk-KZ" : forcedLanguage === "ru" ? "ru-RU" : "en-US")
    utterance.rate = Math.max(.85, Math.min(1.15, profile.rate * speedRef.current))
    utterance.pitch = profile.pitch
    utterance.volume = 1
    let started = false
    let settled = false
    const settle = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (replySettleRef.current === settle) replySettleRef.current = null
      if (!ok) window.speechSynthesis.cancel()
      resolve(ok)
    }
    let timer = setTimeout(() => settle(false), 5000)
    replySettleRef.current = settle
    utterance.onstart = () => {
      if (settled) return
      started = true
      clearTimeout(timer)
      timer = setTimeout(() => settle(false), 120000)
      setTitle("Отвечаю")
    }
    utterance.onend = () => settle(started)
    utterance.onerror = () => settle(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }), [chooseBrowserVoice])

  const playBlobAudio = useCallback((blob: Blob) => {
    const player = replyPlayerRef.current || new VoiceAudioPlayer()
    replyPlayerRef.current = player
    return player.play(blob, () => { setTitle("Отвечаю"); setAudioError(null) })
  }, [])

  const speakReply = useCallback(async (text: string, overrideVoice?: string, overrideLanguage?: VoiceLanguage, spokenLocale?: string) => {
    if (!text.trim()) return false
    stopReplyAudio(false)
    const version = replyVersionRef.current
    const current = () => version === replyVersionRef.current && mountedRef.current && !closingRef.current
    const abort = new AbortController()
    replyAbortRef.current = abort
    const timeout = window.setTimeout(() => abort.abort(), 60000)
    setAudioError(null)
    pendingAudioRef.current = null
    replyInterruptedRef.current = false
    replyPlayingRef.current = true
    const selectedLanguage = overrideLanguage || languageRef.current
    const requestedVoice = overrideVoice || voice
    const selectedVoice = voiceBelongsToLanguage(requestedVoice, selectedLanguage) ? requestedVoice : defaultVoiceForLanguage(selectedLanguage)
    lastReplyRef.current = { text, voice: selectedVoice, language: selectedLanguage, locale: spokenLocale }
    if (!isVoiceSoundEnabled()) {
      window.clearTimeout(timeout)
      replyPlayingRef.current = false
      setAudioError("Звук выключен. Включи динамик или нажми «Озвучить ответ».")
      return false
    }
    let errorMessage = "Не удалось получить аудио. Проверь подключение и повтори озвучку."

    try {
      if (selectedLanguage === "en") {
        const session = fluxSessionRef.current || new FluxTtsSession()
        fluxSessionRef.current = session
        const streamed = await session.speak(text, { voice: selectedVoice, speed, expressivity, onStarted: () => setTitle("Отвечаю") })
        if (!current()) return false
        if (streamed) {
          replyPlayingRef.current = false
          return true
        }
        if (replyInterruptedRef.current) {
          replyPlayingRef.current = false
          return false
        }
      }

      // Speech is synthesized in pieces and played as each arrives. The whole
      // answer used to be rendered before a single word was heard, and the
      // screen sat on "Готовлю голос" for all of it. Only the first piece is
      // actually waited for now; the rest is made while earlier audio plays,
      // which is the entire difference between this and an assistant that
      // answers instantly.
      const chunks = speechChunks(text)
      const speakChunk = async (part: string) => {
        const response = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: part, voice: selectedVoice, language: selectedLanguage, speed, expressivity }),
          signal: abort.signal,
        })
        const type = response.headers.get("content-type") || ""
        const audio = response.ok && /^(audio\/|application\/octet-stream)/i.test(type)
        return { response, blob: audio ? await response.blob() : null }
      }

      let ahead: ReturnType<typeof speakChunk> | null = chunks.length ? speakChunk(chunks[0]) : null
      let firstResponse: Response | null = null
      let spoke = false

      for (let index = 0; index < chunks.length && ahead; index += 1) {
        const piece = await ahead
        // Ask for the next piece before playing this one, so the provider works
        // during playback instead of after it.
        ahead = index + 1 < chunks.length ? speakChunk(chunks[index + 1]) : null

        if (index === 0) firstResponse = piece.response
        if (!current()) return false
        if (!piece.blob) break

        pendingAudioRef.current = piece.blob
        const played = await playBlobAudio(piece.blob)
        if (!current()) return false
        if (!played) {
          // Keep the exact neural audio for a gesture-driven retry; never
          // silently swap a good voice for the browser's system one.
          errorMessage = "Браузер не запустил звук. Нажми «Озвучить ответ»."
          break
        }
        spoke = true
        pendingAudioRef.current = null
      }

      if (spoke) {
        replyPlayingRef.current = false
        return true
      }

      const response = firstResponse
      if (response && !response.ok) {
        // Provider diagnostics stay on the server, never in the conversation UI.
        await response.json().catch(() => null)
        if (!current()) return false
        errorMessage = response.status === 401
          ? "Войди в аккаунт, чтобы продолжить разговор."
          : response.status === 429
            ? "Лимит голосового режима достигнут. Попробуй позже."
            : "Сейчас не удалось озвучить ответ. Попробуй ещё раз."
        if (response.status === 401 || response.status === 429) {
          replyPlayingRef.current = false
          setAudioError(errorMessage)
          return false
        }
      }
    } catch {} finally { window.clearTimeout(timeout) }

    if (!current()) return false
    if (replyInterruptedRef.current) {
      replyPlayingRef.current = false
      return false
    }
    const browserPlayed = !pendingAudioRef.current && await speakBrowser(text, selectedVoice, selectedLanguage, spokenLocale)
    if (!current()) return false
    replyPlayingRef.current = false
    if (!browserPlayed) setAudioError(errorMessage)
    return browserPlayed
  }, [expressivity, playBlobAudio, speakBrowser, speed, stopReplyAudio, voice])

  const previewVoice = useCallback((profileName: string) => {
    if (!soundEnabled) return
    const profile = getVoiceProfile(profileName)
    const sample = profile.language === "kk"
      ? "Сәлем! Мен қазақша сөйлейтін Malik AI дауысымын. Қалың қалай?"
      : profile.language === "ru"
        ? `Привет! Это голос ${profileName}. Чем я могу помочь?`
        : `Hello. I'm ${profileName}. How can I help you today?`
    void speakReply(sample, profileName, profile.language)
  }, [soundEnabled, speakReply])

  const stopSpeech = useCallback(() => {
    micActiveRef.current = false
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      try { recognition.stop() } catch {}
    }
  }, [])

  const discardRecorder = useCallback(() => {
    const recorder = recorderRef.current
    recorderRef.current = null
    recorderChunksRef.current = []
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop() } catch {}
    }
  }, [])

  const collectRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === "inactive") return null
    recorderRef.current = null
    const chunks = recorderChunksRef.current
    const mime = recorder.mimeType || chunks[0]?.type || "audio/webm"
    return await new Promise<Blob | null>((resolve) => {
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data) }
      recorder.onstop = () => {
        const result = chunks.length ? new Blob(chunks, { type: mime }) : null
        recorderChunksRef.current = []
        resolve(result)
      }
      recorder.onerror = () => { recorderChunksRef.current = []; resolve(null) }
      try { recorder.requestData(); recorder.stop() } catch { resolve(null) }
    })
  }, [])

  const stopMicrophone = useCallback(async () => {
    micRequestRef.current += 1
    stopSpeech()
    discardRecorder()
    cancelAnimationFrame(audioFrameRef.current)
    microphoneRef.current?.getTracks().forEach((track) => track.stop())
    microphoneRef.current = null
    analyserRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== "closed") {
      try { await context.close() } catch {}
    }
    energyRef.current = .055
    setMicActive(false)
  }, [discardRecorder, stopSpeech])

  const stopScreen = useCallback(() => {
    screenRef.current?.getTracks().forEach((track) => track.stop())
    screenRef.current = null
    setScreenActive(false)
  }, [])

  const cleanupAll = useCallback(() => {
    demoRef.current = false
    // Closing the voice window ends the conversation, so the next one starts
    // clean rather than continuing yesterday's topic.
    historyRef.current = []
    stopReplyAudio(false)
    fluxSessionRef.current?.close()
    fluxSessionRef.current = null
    void stopMicrophone()
    stopScreen()
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
  }, [stopMicrophone, stopReplyAudio, stopScreen])

  const startSpeech = useCallback(() => {
    const voiceWindow = window as VoiceWindow
    const Recognition = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.lang = languageRef.current === "kk" ? "kk-KZ" : languageRef.current === "ru" ? "ru-RU" : "en-US"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let completed = ""
      let interim = ""
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) completed += `${result[0].transcript} `
        else interim += result[0].transcript
      }
      // The browser recognizer takes no vocabulary hint, so its output is the
      // most likely to spell a brand by sound. Repair it before it is shown or
      // sent.
      if (completed) setFinalTranscript((current) => repairTranscript(`${current} ${completed}`.trim()))
      setInterimTranscript(interim)
    }
    recognition.onend = () => {
      if (!micActiveRef.current || recognitionRef.current !== recognition) return
      try { recognition.start() } catch {}
    }
    recognition.onerror = () => {}
    recognitionRef.current = recognition
    try { recognition.start() } catch {}
  }, [])

  const startAudioLoop = useCallback((analyser: AnalyserNode) => {
    const values = new Uint8Array(analyser.frequencyBinCount)
    const waveform = new Uint8Array(analyser.fftSize)
    function tick() {
      if (!micActiveRef.current || analyserRef.current !== analyser) return
      analyser.getByteFrequencyData(values)
      analyser.getByteTimeDomainData(waveform)
      let sum = 0
      let peak = 0
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        sum += value
        if (value > peak) peak = value
      }
      let squareSum = 0
      for (let index = 0; index < waveform.length; index += 1) {
        const sample = (waveform[index] - 128) / 128
        squareSum += sample * sample
      }
      const rms = Math.sqrt(squareSum / waveform.length)
      const average = sum / values.length / 255
      energyRef.current = Math.min(1, average * 4.9 + peak / 255 * .36)

      const now = performance.now()

      // Two thresholds, not one. A single level has to be high enough not to
      // trigger on room noise, and that same level is above the tail of an
      // ordinary sentence - voices trail off at the end of a phrase - so the
      // last word kept being counted as silence and cut. Speech now has to be
      // clearly present to start, and only has to stay faintly present to
      // continue.
      const started = speechDetectedRef.current
      if (rms >= (started ? SPEECH_CONTINUE_RMS : SPEECH_START_RMS)) {
        speechDetectedRef.current = true
        lastSpeechAtRef.current = now
      } else if (started && now - lastSpeechAtRef.current >= SILENCE_MS && Date.now() - recordingStartedAtRef.current >= 700) {
        speechDetectedRef.current = false
        autoSubmitRef.current?.()
        return
      }

      audioFrameRef.current = requestAnimationFrame(tick)
    }
    audioFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const startRecorder = useCallback((stream: MediaStream) => {
    if (typeof MediaRecorder === "undefined") return
    const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
    const mimeType = candidates.find((item) => { try { return MediaRecorder.isTypeSupported(item) } catch { return false } })
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderChunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data?.size) recorderChunksRef.current.push(event.data) }
      recorder.start(300)
      recorderRef.current = recorder
      recordingStartedAtRef.current = Date.now()
    } catch {}
  }, [])

  const startMicrophone = useCallback(async () => {
    await stopMicrophone()
    const requestId = ++micRequestRef.current
    demoRef.current = false
    setMicError(null)
    setFinalTranscript("")
    setInterimTranscript("")
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Микрофон не поддерживается этим браузером.")
      setTitle("Микрофон недоступен")
      setSubtitle("Используй HTTPS и современный браузер")
      return
    }
    try {
      // Mono at 16 kHz is what the recognizer resamples to anyway; asking for it
      // here means the browser does the conversion with the raw signal instead
      // of the encoder throwing away detail first.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      })
      if (!mountedRef.current || closingRef.current || micRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const VoiceAudioContext = window.AudioContext || (window as VoiceWindow).webkitAudioContext
      if (!VoiceAudioContext) throw new Error("AudioContext unavailable")
      const context = new VoiceAudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = .92
      context.createMediaStreamSource(stream).connect(analyser)
      microphoneRef.current = stream
      audioContextRef.current = context
      analyserRef.current = analyser
      micActiveRef.current = true
      setMicActive(true)
      setTitle("Слушаю")
      setSubtitle(languageRef.current === "kk" ? "Қазақша сөйле — жауап тек қазақша болады" : languageRef.current === "ru" ? "Говори по-русски — ответ будет только по-русски" : "Speak English — the reply stays English")
      speechDetectedRef.current = false
      lastSpeechAtRef.current = 0
      startRecorder(stream)
      startAudioLoop(analyser)
      startSpeech()
    } catch {
      setMicActive(false)
      micActiveRef.current = false
      energyRef.current = .055
      setMicError("Разреши Malik AI доступ к микрофону в браузере.")
      setTitle("Разреши доступ к микрофону")
      setSubtitle("Или включи демо — живой туман продолжит двигаться")
    }
  }, [startAudioLoop, startRecorder, startSpeech, stopMicrophone])

  const runVoiceTurn = useCallback(async (prompt: string) => {
    const clean = prompt.trim()
    if (!clean || busy) return
    const selectedLanguage = languageRef.current
    setBusy(true)
    setTitle("Думаю")
    setSubtitle(`${voice} · ${personality}`)
    try {
      const response = await fetch("/api/voice/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: clean,
          personality,
          language: selectedLanguage,
          history: historyRef.current.slice(-VOICE_HISTORY_TURNS),
        }),
      })
      const payload = await response.json().catch(() => ({})) as VoiceTurnPayload
      if (!mountedRef.current || closingRef.current || selectedLanguage !== languageRef.current) return
      if (!response.ok || !payload.ok || !payload.content) throw new Error(payload.error || "voice turn failed")
      const exchange: VoiceMessage[] = [
        { role: "user", content: payload.transcript || clean },
        { role: "assistant", content: payload.content },
      ]
      historyRef.current = [...historyRef.current, ...exchange].slice(-VOICE_HISTORY_TURNS)
      setFinalTranscript(payload.content)
      setInterimTranscript("")
      setTitle("Готовлю голос")
      // The answer comes back in whatever language was spoken, which is not
      // always the one in the picker, so the label follows the answer.
      const spokenName = payload.languageName
        || (selectedLanguage === "kk" ? "Қазақша" : selectedLanguage === "ru" ? "Русский" : "English")
      setSubtitle(`${voiceBelongsToLanguage(voice, selectedLanguage) ? voice : defaultVoiceForLanguage(selectedLanguage)} · ${spokenName}${payload.usedWeb ? " · из интернета" : ""}`)
      const played = await speakReply(payload.content, undefined, selectedLanguage, payload.languageLocale)
      if (!played) {
        if (mountedRef.current && !closingRef.current && !replyInterruptedRef.current) setTitle("Не удалось озвучить")
        return
      }
      if (mountedRef.current && !closingRef.current && !micActiveRef.current) {
        setTitle("Слушаю")
        setSubtitle("Продолжай разговор · можно перебить голос")
        window.setTimeout(() => { if (mountedRef.current && !closingRef.current && !micActiveRef.current) void startMicrophone() }, 160)
      }
    } catch {
      showNotice("Голосовой ответ временно недоступен")
      onSubmit?.(clean)
      setTitle("Попробуй ещё раз")
      setSubtitle("Попробуй повторить вопрос")
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }, [busy, onSubmit, personality, showNotice, speakReply, startMicrophone, voice])

  const transcribeAndRespond = useCallback(async (blob: Blob, durationSec: number, browserFallback: string) => {
    setBusy(true)
    setTitle("Распознаю")
    setSubtitle(languageRef.current === "kk" ? "Қазақша · қатаң режим" : languageRef.current === "ru" ? "Русский · строгий режим" : "English · strict mode")
    let prompt = ""
    let whisperText = ""
    let whisperConfidence = 0
    try {
      const form = new FormData()
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"
      form.append("file", blob, `malik-voice.${extension}`)
      // Never force the recognizer into the language of the picker. Whisper
      // treats this as a fact, not a hint: with the picker on Kazakh, a Russian
      // sentence was decoded as if it were Kazakh and came back as nonsense -
      // and the same in reverse. Its own detection is better than the guess a
      // dropdown makes, and this was the whole "it hears something else" bug.
      form.append("language", "auto")
      // What has already been said in this conversation. Whisper conditions on
      // its prompt, so words used a moment ago become far more likely to be
      // recognised now - which is what makes the second mention of a name land
      // when the first one did not.
      const hint = conversationHint(historyRef.current)
      if (hint) form.append("prompt", hint)
      form.append("durationSec", String(Math.max(1, Math.round(durationSec * 10) / 10)))
      const response = await fetch("/api/transcribe", { method: "POST", body: form })
      const payload = await response.json().catch(() => ({})) as TranscribePayload
      if (response.status === 429) {
        showNotice("Лимит голосового режима достигнут. Попробуй позже.")
        setTitle("Лимит Voice использован")
        setSubtitle("Доступ восстановится завтра")
        return
      }
      if (response.ok && payload.ok) {
        whisperText = String(payload.text || "").trim()
        whisperConfidence = typeof payload.confidence === "number" ? payload.confidence : 0
        if (typeof payload.remainingSeconds === "number") showNotice(`Осталось ${Math.max(0, Math.floor(payload.remainingSeconds))} сек. Voice сегодня`)
      }
    } catch {}

    // Two recognizers ran on this utterance and only one of them used to count.
    // They fail differently, so the disagreement is information rather than a
    // problem: see lib/voice/transcript-choice.ts.
    prompt = chooseTranscript({
      whisper: whisperText,
      browser: browserFallback,
      confidence: whisperConfidence,
    }).text
    setBusy(false)
    if (!prompt) {
      setTitle("Не расслышал")
      setSubtitle("Попробуй сказать ещё раз")
      showNotice("Не удалось распознать голос")
      return
    }
    setFinalTranscript(prompt)
    setInterimTranscript("")
    await runVoiceTurn(prompt)
  }, [runVoiceTurn, showNotice])

  const toggleMicrophone = useCallback(async () => {
    unlockVoiceAudio()
    if (replyPlayingRef.current || fluxSessionRef.current?.isSpeaking()) {
      stopReplyAudio(true)
      setBusy(false)
      setTitle("Слушаю")
      setSubtitle("Перебивание принято · говори")
      void startMicrophone()
      return
    }
    if (busy) return
    if (!micActiveRef.current) {
      void startMicrophone()
      return
    }
    const fallback = `${finalTranscript} ${interimTranscript}`.trim()
    const durationSec = recordingStartedAtRef.current ? (Date.now() - recordingStartedAtRef.current) / 1000 : 0
    const blob = await collectRecorder()
    await stopMicrophone()
    if (blob && blob.size > 200) await transcribeAndRespond(blob, durationSec, fallback)
    else if (fallback) await runVoiceTurn(fallback)
    else showNotice("Скажи что-нибудь и нажми микрофон ещё раз")
  }, [busy, collectRecorder, finalTranscript, interimTranscript, runVoiceTurn, showNotice, startMicrophone, stopMicrophone, stopReplyAudio, transcribeAndRespond])

  useEffect(() => {
    autoSubmitRef.current = () => { void toggleMicrophone() }
    return () => { autoSubmitRef.current = null }
  }, [toggleMicrophone])

  const toggleScreen = useCallback(async () => {
    if (screenRef.current) {
      stopScreen()
      showNotice("Демонстрация экрана остановлена")
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showNotice("Демонстрация экрана недоступна")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      if (!mountedRef.current || closingRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      screenRef.current = stream
      setScreenActive(true)
      showNotice("Демонстрация экрана включена")
      const track = stream.getVideoTracks()[0]
      if (track) track.onended = () => {
        screenRef.current = null
        setScreenActive(false)
        showNotice("Демонстрация экрана остановлена")
      }
    } catch { showNotice("Демонстрация экрана отменена") }
  }, [showNotice, stopScreen])

  const startDemo = useCallback(() => {
    void stopMicrophone()
    demoRef.current = true
    setMicError(null)
    setTitle("Демо голосового режима")
    setSubtitle("Светлый туман плавно летит через весь шар")
  }, [stopMicrophone])

  const closeMode = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (isVoiceSoundEnabled()) playVoiceTransitionSound("close")
    cleanupAll()
    setSettingsOpen(false)
    setPhase("leave")
    closeTimerRef.current = window.setTimeout(onClose, 220)
  }, [cleanupAll, onClose])

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current
      saveVoiceSoundEnabled(next)
      if (next) playVoiceTransitionSound("open")
      else stopReplyAudio(true)
      return next
    })
  }, [stopReplyAudio])

  const submitText = useCallback((prompt: string) => { unlockVoiceAudio(); void runVoiceTurn(prompt) }, [runVoiceTurn])

  const retryReply = useCallback(async () => {
    unlockVoiceAudio()
    const last = lastReplyRef.current
    if (!last || busy) return
    await stopMicrophone()
    setBusy(true)
    setAudioError(null)
    saveVoiceSoundEnabled(true)
    setSoundEnabled(true)
    // A saved blob can play immediately after the user's gesture, without
    // paying for another TTS request. A failed request can be retried normally.
    const blob = pendingAudioRef.current
    replyInterruptedRef.current = false
    replyPlayingRef.current = true
    const version = replyVersionRef.current
    const played = blob ? await playBlobAudio(blob) : await speakReply(last.text, last.voice, last.language, last.locale)
    if (mountedRef.current) setBusy(false)
    if (!mountedRef.current || closingRef.current || (blob && version !== replyVersionRef.current)) return
    replyPlayingRef.current = false
    if (played) {
      pendingAudioRef.current = null
      setAudioError(null)
      if (mountedRef.current && !closingRef.current) void startMicrophone()
    } else if (mountedRef.current && !closingRef.current) {
      setAudioError("Сейчас не удалось озвучить ответ. Попробуй ещё раз.")
    }
  }, [busy, playBlobAudio, speakReply, startMicrophone, stopMicrophone])

  const changeLanguage = useCallback((nextLanguage: VoiceLanguage) => {
    if (languageRef.current === nextLanguage) return
    const shouldRestartMic = micActiveRef.current
    languageRef.current = nextLanguage
    setLanguage(nextLanguage)
    setVoice(defaultVoiceForLanguage(nextLanguage))
    setFinalTranscript("")
    setInterimTranscript("")
    stopReplyAudio(true)
    setTitle(nextLanguage === "kk" ? "Қазақша" : nextLanguage === "ru" ? "Русский" : "English")
    setSubtitle(nextLanguage === "kk" ? "Тек қазақша жауап беремін" : nextLanguage === "ru" ? "Отвечаю только по-русски" : "English only")
    if (shouldRestartMic) {
      void stopMicrophone().then(() => window.setTimeout(() => {
        if (mountedRef.current && !closingRef.current) void startMicrophone()
      }, 90))
    }
  }, [startMicrophone, stopMicrophone, stopReplyAudio])

  useEffect(() => {
    mountedRef.current = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const frame = requestAnimationFrame(() => setPhase("open"))
    const micTimer = window.setTimeout(() => { void startMicrophone() }, 240)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeMode() }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      mountedRef.current = false
      cancelAnimationFrame(frame)
      window.clearTimeout(micTimer)
      window.removeEventListener("keydown", onKeyDown)
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      cleanupAll()
      document.body.style.overflow = previousOverflow
    }
  }, [cleanupAll, closeMode, startMicrophone])

  return (
    <section className={`${styles.stage} ${styles[phase]}`} onPointerDownCapture={unlockVoiceAudio} data-voice-mode role="dialog" aria-modal="true" aria-label="Malik AI Voice Mode">
      <VoiceOrb energyRef={energyRef} speedRef={speedRef} demoRef={demoRef} onWebGLUnavailable={() => setWebGLError(true)} />

      <header className={styles.topbar}>
        <span className={styles.quality}>Высокий <small>⌄</small></span>
        <button type="button" className={styles.closeButton} onClick={closeMode} aria-label="Закрыть голосовой режим"><X size={20} /></button>
      </header>

      <div className={styles.center}>
        <div className={styles.orbSpacer} aria-hidden="true" />
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className={styles.transcript} aria-live="polite">
          <span>{finalTranscript}</span>{interimTranscript ? <span className={styles.interim}> {interimTranscript}</span> : null}
        </div>
        {webGLError ? <div className={styles.inlineError}>Анимация недоступна. Можно продолжить разговор.</div> : null}
        {audioError ? <div className={styles.retry} role="status"><span>{audioError}</span><button type="button" disabled={busy} onClick={() => void retryReply()}>Озвучить ответ</button></div> : null}
        {micError ? (
          <div className={styles.retry}>
            <button type="button" onClick={() => void startMicrophone()}>Разрешить микрофон</button>
            <button type="button" onClick={startDemo}>Демо-реакция</button>
          </div>
        ) : null}
      </div>

      <VoiceSettings
        open={settingsOpen}
        language={language}
        voice={voice}
        personality={personality}
        speed={speed}
        expressivity={expressivity}
        onLanguageChange={changeLanguage}
        onVoiceChange={(nextVoice) => { if (voiceBelongsToLanguage(nextVoice, languageRef.current)) setVoice(nextVoice) }}
        onPersonalityChange={setPersonality}
        onSpeedChange={setSpeed}
        onExpressivityChange={setExpressivity}
        onPreviewVoice={previewVoice}
        onClose={() => setSettingsOpen(false)}
      />
      <VoiceDock
        micActive={micActive}
        soundEnabled={soundEnabled}
        screenActive={screenActive}
        settingsOpen={settingsOpen}
        voice={voice}
        personality={personality}
        pickedFile={pickedFile}
        energyRef={energyRef}
        onMicToggle={() => { void toggleMicrophone() }}
        onSoundToggle={toggleSound}
        onScreenToggle={() => void toggleScreen()}
        onSettingsToggle={() => setSettingsOpen((value) => !value)}
        onPickFile={setPickedFile}
        onSubmit={submitText}
        onStop={closeMode}
      />

      <div className={`${styles.notice} ${notice ? styles.open : ""}`}>{notice}</div>
      <div className={styles.hint}>{busy ? "Voice обрабатывает запрос…" : "Можно перебить голос · қазақша / русский / English"}</div>
    </section>
  )
}

export default VoiceMode
