"use client"

import { ChevronUp, FileText, Image as ImageIcon, Mic, MicOff, Monitor, Plus, SlidersHorizontal, Volume2, VolumeX } from "lucide-react"
import { useEffect, useRef, useState, type MutableRefObject } from "react"
import styles from "./VoiceMode.module.css"
import mobileStyles from "./VoiceMobileTarget.module.css"

export type PickedVoiceFile = { name: string; file: File }

const AUTO_FINISH_SILENCE_MS = 1350
const SPEECH_LEVEL_THRESHOLD = .115
const MIC_START_GRACE_MS = 450

export function VoiceDock({
  micActive,
  soundEnabled,
  screenActive,
  settingsOpen,
  voice,
  personality,
  pickedFile,
  energyRef,
  onMicToggle,
  onSoundToggle,
  onScreenToggle,
  onSettingsToggle,
  onPickFile,
  onSubmit,
  onStop,
}: {
  micActive: boolean
  soundEnabled: boolean
  screenActive: boolean
  settingsOpen: boolean
  voice: string
  personality: string
  pickedFile: PickedVoiceFile | null
  energyRef: MutableRefObject<number>
  onMicToggle: () => void
  onSoundToggle: () => void
  onScreenToggle: () => void
  onSettingsToggle: () => void
  onPickFile: (file: PickedVoiceFile) => void
  onSubmit: (prompt: string) => void
  onStop: () => void
}) {
  const [attachOpen, setAttachOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const rootRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dotsRef = useRef<Array<HTMLSpanElement | null>>([])
  const heardSpeechRef = useRef(false)
  const lastSpeechAtRef = useRef(0)
  const micStartedAtRef = useRef(0)
  const autoFinishTriggeredRef = useRef(false)

  useEffect(() => {
    const field = textareaRef.current
    if (!field) return
    field.style.height = "auto"
    field.style.height = `${Math.min(68, Math.max(34, field.scrollHeight))}px`
  }, [prompt])

  useEffect(() => {
    if (!attachOpen) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setAttachOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [attachOpen])

  useEffect(() => {
    heardSpeechRef.current = false
    lastSpeechAtRef.current = 0
    autoFinishTriggeredRef.current = false
    micStartedAtRef.current = micActive ? performance.now() : 0
  }, [micActive])

  useEffect(() => {
    let frame = 0
    const update = (time: number) => {
      const base = micActive ? Math.max(.06, Math.min(1, energyRef.current)) : .035
      dotsRef.current.forEach((dot, index) => {
        if (!dot) return
        const wave = .55 + .45 * Math.sin(time * .009 + index * .82)
        const amplitude = micActive ? Math.max(.08, base * (.36 + .32 * wave)) : .045
        dot.style.height = `${3 + amplitude * (2.2 + index % 3 * 1.3)}px`
        dot.style.opacity = micActive ? `${.60 + amplitude * .24}` : ".36"
      })

      if (micActive && !autoFinishTriggeredRef.current) {
        const pastGrace = !micStartedAtRef.current || time - micStartedAtRef.current >= MIC_START_GRACE_MS
        if (pastGrace && energyRef.current >= SPEECH_LEVEL_THRESHOLD) {
          heardSpeechRef.current = true
          lastSpeechAtRef.current = time
        } else if (
          heardSpeechRef.current &&
          lastSpeechAtRef.current > 0 &&
          time - lastSpeechAtRef.current >= AUTO_FINISH_SILENCE_MS
        ) {
          autoFinishTriggeredRef.current = true
          onMicToggle()
          return
        }
      }

      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [energyRef, micActive, onMicToggle])

  const choose = (file: File | undefined) => {
    if (!file) return
    onPickFile({ file, name: file.name })
    setAttachOpen(false)
  }

  const submitPrompt = () => {
    const value = prompt.trim()
    if (!value) return
    onSubmit(value)
    setPrompt("")
  }

  return (
    <section ref={rootRef} className={`${styles.dock} ${mobileStyles.mobileDock}`} aria-label="Панель голосового режима">
      {pickedFile ? <div className={styles.fileChip}>📎 {pickedFile.name}</div> : null}
      <div className={styles.promptRow}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              submitPrompt()
            }
          }}
          rows={1}
          placeholder="Спросить Malik AI"
          aria-label="Сообщение для голосового режима"
        />
      </div>

      <div className={styles.controls}>
        <div className={`${styles.attachPopover} ${attachOpen ? styles.open : ""}`}>
          <button type="button" onClick={() => imageInputRef.current?.click()}><ImageIcon size={17} /><span>Изображение</span><small>Фото</small></button>
          <button type="button" onClick={() => fileInputRef.current?.click()}><FileText size={17} /><span>Файл</span><small>Документ</small></button>
        </div>
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => choose(event.target.files?.[0])} />
        <input ref={fileInputRef} type="file" hidden onChange={(event) => choose(event.target.files?.[0])} />

        <button type="button" className={`${styles.controlButton} ${attachOpen ? styles.active : ""}`} onClick={() => setAttachOpen((value) => !value)} title="Добавить" aria-label="Добавить файл" aria-expanded={attachOpen}>
          <Plus size={20} />
        </button>
        <div className={styles.controlDivider} />

        <button type="button" className={`${styles.micPill} ${micActive ? styles.live : styles.muted}`} onClick={onMicToggle} title={micActive ? "Закончить фразу" : "Включить микрофон"} aria-label={micActive ? "Закончить фразу" : "Включить микрофон"} aria-pressed={micActive}>
          <span className={styles.micDots} aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <span key={index} ref={(node) => { dotsRef.current[index] = node }} />)}
          </span>
          {micActive ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        <button type="button" className={`${styles.controlButton} ${!soundEnabled ? styles.muted : ""}`} onClick={onSoundToggle} title={soundEnabled ? "Выключить звук" : "Включить звук"} aria-label={soundEnabled ? "Выключить звук" : "Включить звук"} aria-pressed={!soundEnabled}>
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>

        <button type="button" className={`${styles.controlButton} ${screenActive ? styles.active : ""}`} onClick={onScreenToggle} title={screenActive ? "Остановить демонстрацию" : "Показать экран"} aria-label={screenActive ? "Остановить демонстрацию экрана" : "Показать экран"} aria-pressed={screenActive}>
          <Monitor size={20} />
        </button>

        <button type="button" data-voice-settings-trigger className={`${styles.assistantButton} ${settingsOpen ? styles.active : ""}`} onClick={onSettingsToggle} aria-expanded={settingsOpen} aria-label="Настройки Sola Assistant">
          <SlidersHorizontal size={17} />
          <span>{voice}</span><small>· {personality}</small><ChevronUp size={15} />
        </button>

        <button type="button" className={styles.stopButton} onClick={onStop} aria-label="Остановить Voice">Остановить</button>
      </div>
    </section>
  )
}
