"use client"

import { Check, Volume2 } from "lucide-react"
import { useEffect, useRef } from "react"
import styles from "./VoiceSettingsPanel.module.css"

export type VoiceProfile = {
  name: string
  description: string
  xaiVoiceId?: string
  rate: number
  pitch: number
  hints: readonly string[]
}

export const VOICES: readonly VoiceProfile[] = [
  { name: "Sola", description: "Warm, natural and clear.", xaiVoiceId: "ara", rate: 1.00, pitch: 1.02, hints: ["natural", "female", "samantha", "google"] },
  { name: "Eve", description: "Energetic and upbeat.", xaiVoiceId: "eve", rate: 1.06, pitch: 1.08, hints: ["female", "aria", "jenny", "zira"] },
  { name: "Leo", description: "Authoritative and strong.", xaiVoiceId: "leo", rate: .96, pitch: .88, hints: ["male", "david", "guy", "daniel"] },
  { name: "Rex", description: "Confident and direct.", xaiVoiceId: "rex", rate: 1.00, pitch: .82, hints: ["male", "mark", "david", "guy"] },
  { name: "Sal", description: "Smooth and balanced.", xaiVoiceId: "sal", rate: .98, pitch: .95, hints: ["natural", "alex", "daniel", "google"] },
  { name: "Carina", description: "Soft, empathetic and soothing.", xaiVoiceId: "ara", rate: .92, pitch: 1.06, hints: ["female", "samantha", "aria", "jenny"] },
  { name: "Luna", description: "Calm, bright and conversational.", xaiVoiceId: "eve", rate: .97, pitch: 1.10, hints: ["female", "susan", "samantha", "google"] },
  { name: "Orion", description: "Deep, cinematic and focused.", xaiVoiceId: "leo", rate: .94, pitch: .78, hints: ["male", "daniel", "george", "david"] },
  { name: "Aurora", description: "Expressive, vivid and friendly.", xaiVoiceId: "eve", rate: 1.03, pitch: 1.13, hints: ["female", "aria", "jenny", "samantha"] },
  { name: "Atlas", description: "Steady, mature and powerful.", xaiVoiceId: "rex", rate: .93, pitch: .74, hints: ["male", "george", "david", "daniel"] },
] as const

export const PERSONALITIES = [
  "Assistant",
  "Therapist",
  "Storyteller",
  "Kids Story Time",
  "Kids Trivia Game",
  "Meditation",
  "Motivation",
  "Romantic",
  "Argumentative",
] as const

export function getVoiceProfile(name: string): VoiceProfile {
  return VOICES.find((item) => item.name === name) || VOICES[0]
}

export function VoiceSettings({
  open,
  voice,
  personality,
  speed,
  onVoiceChange,
  onPersonalityChange,
  onSpeedChange,
  onPreviewVoice,
  onClose,
}: {
  open: boolean
  voice: string
  personality: string
  speed: number
  onVoiceChange: (voice: string) => void
  onPersonalityChange: (personality: string) => void
  onSpeedChange: (speed: number) => void
  onPreviewVoice: (voice: string) => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !(target as Element).closest?.("[data-voice-settings-trigger]")) onClose()
    }
    document.addEventListener("pointerdown", closeOutside)
    return () => document.removeEventListener("pointerdown", closeOutside)
  }, [onClose, open])

  return (
    <div ref={rootRef} className={`${styles.panel} ${open ? styles.open : ""}`} aria-hidden={!open}>
      <div className={styles.columns}>
        <section className={styles.column} aria-label="Выбор голоса">
          <div className={styles.heading}><span>Голос</span><small>10 человеческих профилей</small></div>
          <div className={styles.list}>
            {VOICES.map((profile) => (
              <button
                key={profile.name}
                type="button"
                className={`${styles.item} ${voice === profile.name ? styles.selected : ""}`}
                onClick={() => { onVoiceChange(profile.name); onPreviewVoice(profile.name) }}
              >
                <span className={styles.itemText}><strong>{profile.name}</strong><small>{profile.description}</small></span>
                <span className={styles.actions}>
                  <span className={styles.preview} aria-hidden="true"><Volume2 size={14} /></span>
                  {voice === profile.name ? <Check className={styles.check} size={15} /> : null}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.column} aria-label="Выбор личности">
          <div className={styles.heading}><span>Личность</span><small>влияет на стиль ответа</small></div>
          <div className={styles.list}>
            {PERSONALITIES.map((name) => (
              <button
                key={name}
                type="button"
                className={`${styles.item} ${personality === name ? styles.selected : ""}`}
                onClick={() => onPersonalityChange(name)}
              >
                <span className={styles.itemText}><strong>{name}</strong><small>{personalityDescription(name)}</small></span>
                {personality === name ? <Check className={styles.check} size={15} /> : null}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <label htmlFor="voice-speed">Скорость</label>
        <input id="voice-speed" type="range" min="0.7" max="1.35" step="0.05" value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))} />
        <output>{speed.toFixed(2).replace(".", ",")}x</output>
      </div>
    </div>
  )
}

function personalityDescription(name: string) {
  switch (name) {
    case "Therapist": return "Спокойно слушает и задаёт мягкие вопросы."
    case "Storyteller": return "Рассказывает ярко и образно."
    case "Kids Story Time": return "Добрые короткие истории для детей."
    case "Kids Trivia Game": return "Весёлая викторина вопрос за вопросом."
    case "Meditation": return "Медленный, тихий и расслабляющий стиль."
    case "Motivation": return "Энергичный тренер без лишней воды."
    case "Romantic": return "Тёплый, мягкий и эмоциональный стиль."
    case "Argumentative": return "Спорит по существу и проверяет аргументы."
    default: return "Естественный универсальный помощник."
  }
}
