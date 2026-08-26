"use client"

import { X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { VoiceDock, type PickedVoiceFile } from "./VoiceDock"
import { VoiceOrb } from "./VoiceOrb"
import { VoiceSettings } from "./VoiceSettings"
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

  const energyRef = useRef(.07)
  const speedRef = useRef(1)
  const demoRef = useRef(false)
  const micActiveRef = useRef(false)
  const microphoneRef = useRef<MediaStream | null>(null)
  const screenRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const audioFrameRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const closingRef = useRef(false)
  const mountedRef = useRef(true)
  const micRequestRef = useRef(0)

  useEffect(() => { speedRef.current = speed }, [speed])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 1700)
  }, [])

  const stopSpeech = useCallback(() => {
    micActiveRef.current = false
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      try { recognition.stop() } catch {}
    }
  }, [])

  const stopMicrophone = useCallback(async () => {
    micRequestRef.current += 1
    stopSpeech()
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
  }, [stopSpeech])

  const stopScreen = useCallback(() => {
    screenRef.current?.getTracks().forEach((track) => track.stop())
    screenRef.current = null
    setScreenActive(false)
  }, [])

  const cleanupAll = useCallback(() => {
    demoRef.current = false
    void stopMicrophone()
    stopScreen()
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
  }, [stopMicrophone, stopScreen])

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

  const startMicrophone = useCallback(async () => {
    await stopMicrophone()
    const requestId = ++micRequestRef.current
    demoRef.current = false
    setMicError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Микрофон не поддерживается этим браузером.")
      setTitle("Микрофон недоступен")
      setSubtitle("Используй localhost или HTTPS и современный браузер")
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
      setSubtitle("Светлый туман плавно летит через весь шар")
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
  }, [startAudioLoop, startSpeech, stopMicrophone])

  const toggleMicrophone = useCallback(() => {
    if (micActiveRef.current) {
      void stopMicrophone().then(() => {
        setTitle("Микрофон выключен")
        setSubtitle("Нажми на микрофон, чтобы продолжить")
      })
    } else {
      void startMicrophone()
    }
  }, [startMicrophone, stopMicrophone])

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
    } catch {
      showNotice("Демонстрация экрана отменена")
    }
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
      return next
    })
  }, [])

  const submitText = useCallback((prompt: string) => {
    onSubmit?.(prompt)
    closeMode()
  }, [closeMode, onSubmit])

  useEffect(() => {
    mountedRef.current = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const frame = requestAnimationFrame(() => setPhase("open"))
    const micTimer = window.setTimeout(() => { void startMicrophone() }, 240)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMode()
    }
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
        onMicToggle={toggleMicrophone}
        onSoundToggle={toggleSound}
        onScreenToggle={() => void toggleScreen()}
        onSettingsToggle={() => setSettingsOpen((value) => !value)}
        onPickFile={setPickedFile}
        onSubmit={submitText}
        onStop={closeMode}
      />

      <div className={`${styles.notice} ${notice ? styles.open : ""}`}>{notice}</div>
      <div className={styles.hint}>Esc — выйти из голосового режима</div>
    </section>
  )
}

export default VoiceMode
