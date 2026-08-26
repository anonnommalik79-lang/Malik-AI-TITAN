"use client"

import { X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { VoiceDock, type PickedVoiceFile } from "./VoiceDock"
import { VoiceOrb } from "./VoiceOrb"
import { VoiceSettings, VOICES, getVoiceProfile } from "./VoiceSettings"
import styles from "./VoiceMode.module.css"
import { isVoiceSoundEnabled, playVoiceTransitionSound, saveVoiceSoundEnabled } from "@/lib/voice-transition-sound"

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

type VoiceTurnPayload = { ok?: boolean; content?: string; error?: string }
type TranscribePayload = { ok?: boolean; text?: string; error?: string; remainingSeconds?: number }

const STORAGE_KEY = "malik.voice.preferences.v2"

export function VoiceMode({ onClose, onSubmit }: { onClose: () => void; onSubmit?: (prompt: string) => void }) {
  const [phase, setPhase] = useState<"enter" | "open" | "leave">("enter")
  const [micActive, setMicActive] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [webGLError, setWebGLError] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(isVoiceSoundEnabled)
  const [screenActive, setScreenActive] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [voice, setVoice] = useState("Sola")
  const [personality, setPersonality] = useState("Assistant")
  const [speed, setSpeed] = useState(1)
  const [pickedFile, setPickedFile] = useState<PickedVoiceFile | null>(null)
  const [title, setTitle] = useState("Начни говорить")
  const [subtitle, setSubtitle] = useState("Живой туман внутри реагирует на голос")
  const [finalTranscript, setFinalTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const energyRef = useRef(.07)
  const speedRef = useRef(1)
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
  const replyAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => { speedRef.current = speed }, [speed])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      if (typeof saved.voice === "string" && VOICES.some((item) => item.name === saved.voice)) setVoice(saved.voice)
      if (typeof saved.personality === "string") setPersonality(saved.personality)
      if (typeof saved.speed === "number" && saved.speed >= .7 && saved.speed <= 1.35) setSpeed(saved.speed)
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ voice, personality, speed })) } catch {}
  }, [voice, personality, speed])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 2200)
  }, [])

  const stopReplyAudio = useCallback(() => {
    window.speechSynthesis?.cancel()
    const audio = replyAudioRef.current
    replyAudioRef.current = null
    if (audio) {
      audio.pause()
      audio.src = ""
    }
  }, [])

  const chooseBrowserVoice = useCallback((profileName: string, text: string) => {
    const profile = getVoiceProfile(profileName)
    const voices = window.speechSynthesis?.getVoices?.() || []
    if (!voices.length) return null
    const wantsRu = /[а-яёәіңғүұқөһ]/i.test(text)
    const languagePool = voices.filter((item) => wantsRu ? /^ru|^kk/i.test(item.lang) : /^en/i.test(item.lang))
    const pool = languagePool.length ? languagePool : voices
    for (const hint of profile.hints) {
      const match = pool.find((item) => item.name.toLowerCase().includes(hint.toLowerCase()))
      if (match) return match
    }
    const index = Math.max(0, VOICES.findIndex((item) => item.name === profileName))
    return pool[index % pool.length] || pool[0]
  }, [])

  const speakBrowser = useCallback((text: string, profileName: string) => new Promise<boolean>((resolve) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return resolve(false)
    const profile = getVoiceProfile(profileName)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = chooseBrowserVoice(profileName, text)
    utterance.lang = /[а-яёәіңғүұқөһ]/i.test(text) ? "ru-RU" : "en-US"
    utterance.rate = Math.max(.7, Math.min(1.35, profile.rate * speedRef.current))
    utterance.pitch = profile.pitch
    utterance.volume = 1
    utterance.onend = () => resolve(true)
    utterance.onerror = () => resolve(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }), [chooseBrowserVoice])

  const previewVoice = useCallback((profileName: string) => {
    if (!soundEnabled) return
    stopReplyAudio()
    void speakBrowser(`Привет. Я ${profileName}. Готов помочь.`, profileName)
  }, [soundEnabled, speakBrowser, stopReplyAudio])

  const speakReply = useCallback(async (text: string) => {
    if (!soundEnabled || !text.trim()) return
    stopReplyAudio()
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice }),
      })
      const provider = response.headers.get("x-malik-tts-provider")
      if (response.ok && (provider === "xai" || (provider === "cloudflare" && voice === "Sola"))) {
        const blob = await response.blob()
        if (blob.size > 128) {
          const url = URL.createObjectURL(blob)
          await new Promise<void>((resolve) => {
            const audio = new Audio(url)
            replyAudioRef.current = audio
            audio.playbackRate = Math.max(.75, Math.min(1.3, speedRef.current))
            audio.onended = () => { URL.revokeObjectURL(url); replyAudioRef.current = null; resolve() }
            audio.onerror = () => { URL.revokeObjectURL(url); replyAudioRef.current = null; resolve() }
            void audio.play().catch(() => resolve())
          })
          return
        }
      }
    } catch {}
    await speakBrowser(text, voice)
  }, [soundEnabled, speakBrowser, stopReplyAudio, voice])

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
    stopReplyAudio()
    void stopMicrophone()
    stopScreen()
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
  }, [stopMicrophone, stopReplyAudio, stopScreen])

  const startSpeech = useCallback(() => {
    const voiceWindow = window as VoiceWindow
    const Recognition = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.lang = "ru-RU"
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
      if (completed) setFinalTranscript((current) => `${current} ${completed}`.trim())
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
    function tick() {
      if (!micActiveRef.current || analyserRef.current !== analyser) return
      analyser.getByteFrequencyData(values)
      let sum = 0
      let peak = 0
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        sum += value
        if (value > peak) peak = value
      }
      const average = sum / values.length / 255
      energyRef.current = Math.min(1, average * 4.9 + peak / 255 * .36)
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
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
      setSubtitle("Говори естественно · нажми микрофон, когда закончишь")
      startAudioLoop(analyser)
      startSpeech()
      startRecorder(stream)
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
    setBusy(true)
    setTitle("Думаю")
    setSubtitle(`${voice} · ${personality}`)
    try {
      const response = await fetch("/api/voice/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean, personality }),
      })
      const payload = await response.json().catch(() => ({})) as VoiceTurnPayload
      if (!response.ok || !payload.ok || !payload.content) throw new Error(payload.error || "voice turn failed")
      setFinalTranscript(payload.content)
      setInterimTranscript("")
      setTitle("Отвечаю")
      setSubtitle(`${voice} · ${personality}`)
      await speakReply(payload.content)
      if (mountedRef.current && !closingRef.current) {
        setTitle("Слушаю")
        setSubtitle("Продолжай разговор")
        window.setTimeout(() => { if (mountedRef.current && !closingRef.current) void startMicrophone() }, 180)
      }
    } catch {
      showNotice("Voice-ответ временно недоступен — отправляю в обычный чат")
      onSubmit?.(clean)
      setTitle("Попробуй ещё раз")
      setSubtitle("Voice автоматически переключит провайдера")
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }, [busy, onSubmit, personality, showNotice, speakReply, startMicrophone, voice])

  const transcribeAndRespond = useCallback(async (blob: Blob, durationSec: number, browserFallback: string) => {
    setBusy(true)
    setTitle("Распознаю")
    setSubtitle("Groq → Cloudflare · автоматический fallback")
    let prompt = ""
    try {
      const form = new FormData()
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"
      form.append("file", blob, `malik-voice.${extension}`)
      form.append("language", "auto")
      form.append("durationSec", String(Math.max(1, Math.round(durationSec * 10) / 10)))
      const response = await fetch("/api/transcribe", { method: "POST", body: form })
      const payload = await response.json().catch(() => ({})) as TranscribePayload
      if (response.status === 429) {
        showNotice(payload.error || "Лимит Voice на сегодня использован")
        setTitle("Лимит Voice использован")
        setSubtitle("Доступ восстановится завтра")
        return
      }
      if (response.ok && payload.ok && payload.text) {
        prompt = payload.text.trim()
        if (typeof payload.remainingSeconds === "number") showNotice(`Осталось ${Math.max(0, Math.floor(payload.remainingSeconds))} сек. Voice сегодня`)
      }
    } catch {}
    if (!prompt) prompt = browserFallback.trim()
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
  }, [busy, collectRecorder, finalTranscript, interimTranscript, runVoiceTurn, showNotice, startMicrophone, stopMicrophone, transcribeAndRespond])

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
    if (soundEnabled) playVoiceTransitionSound("close")
    cleanupAll()
    setSettingsOpen(false)
    setPhase("leave")
    closeTimerRef.current = window.setTimeout(onClose, 220)
  }, [cleanupAll, onClose, soundEnabled])

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current
      saveVoiceSoundEnabled(next)
      if (next) playVoiceTransitionSound("open")
      else stopReplyAudio()
      return next
    })
  }, [stopReplyAudio])

  const submitText = useCallback((prompt: string) => { void runVoiceTurn(prompt) }, [runVoiceTurn])

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
    <section className={`${styles.stage} ${styles[phase]}`} data-voice-mode role="dialog" aria-modal="true" aria-label="Malik AI Voice Mode">
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
        {webGLError ? <div className={styles.inlineError}>WebGL недоступен — управление голосом продолжает работать.</div> : null}
        {micError ? (
          <div className={styles.retry}>
            <button type="button" onClick={() => void startMicrophone()}>Разрешить микрофон</button>
            <button type="button" onClick={startDemo}>Демо-реакция</button>
          </div>
        ) : null}
      </div>

      <VoiceSettings
        open={settingsOpen}
        voice={voice}
        personality={personality}
        speed={speed}
        onVoiceChange={setVoice}
        onPersonalityChange={setPersonality}
        onSpeedChange={setSpeed}
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
      <div className={styles.hint}>{busy ? "Voice обрабатывает запрос…" : "Нажми микрофон после фразы · Esc — выйти"}</div>
    </section>
  )
}

export default VoiceMode
