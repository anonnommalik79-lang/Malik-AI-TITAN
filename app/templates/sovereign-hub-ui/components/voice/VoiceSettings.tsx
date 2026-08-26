"use client"

import { Check, ChevronDown } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import styles from "./VoiceMode.module.css"

export const VOICES = [
  ["Sola", "Warm, natural and clear."],
  ["Eve", "Energetic and upbeat."],
  ["Leo", "Authoritative and strong."],
  ["Rex", "Confident and clear."],
  ["Sal", "Smooth and balanced."],
  ["Carina", "Soft, empathetic, and soothing."],
  ["Zagan", "Powerful, dramatic, unmistakable."],
  ["Helix", "Bold, dynamic and adrenaline-fueled."],
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

export function VoiceSettings({
  open,
  voice,
  personality,
  speed,
  onVoiceChange,
  onPersonalityChange,
  onSpeedChange,
  onClose,
}: {
  open: boolean
  voice: string
  personality: string
  speed: number
  onVoiceChange: (voice: string) => void
  onPersonalityChange: (personality: string) => void
  onSpeedChange: (speed: number) => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<"voice" | "personality" | null>(null)

  useEffect(() => {
    if (open) return
    const timer = window.setTimeout(() => setMenu(null), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !(target as Element).closest?.("[data-voice-settings-trigger]")) onClose()
    }
    document.addEventListener("pointerdown", closeOutside)
    return () => document.removeEventListener("pointerdown", closeOutside)
  }, [onClose, open])

  const fill = `${((speed - .7) / .8) * 100}%`

  return (
    <div ref={rootRef} className={`${styles.settings} ${open ? styles.open : ""}`} aria-hidden={!open}>
      <div className={styles.settingLabel}>Голос</div>
      <button type="button" className={`${styles.settingField} ${menu === "voice" ? styles.fieldOpen : ""}`} onClick={() => setMenu((current) => current === "voice" ? null : "voice")} aria-expanded={menu === "voice"}>
        <span>{voice}</span><ChevronDown size={17} />
      </button>
      <div className={`${styles.optionMenu} ${styles.voiceMenu} ${menu === "voice" ? styles.open : ""}`}>
        {VOICES.map(([name, description]) => (
          <button key={name} type="button" className={styles.option} onClick={() => { onVoiceChange(name); setMenu(null) }}>
            <span className={styles.optionText}><strong>{name}</strong><small>{description}</small></span>
            {voice === name ? <Check size={16} /> : null}
          </button>
        ))}
      </div>

      <div className={styles.settingLabel}>Личность</div>
      <button type="button" className={`${styles.settingField} ${menu === "personality" ? styles.fieldOpen : ""}`} onClick={() => setMenu((current) => current === "personality" ? null : "personality")} aria-expanded={menu === "personality"}>
        <span>{personality}</span><ChevronDown size={17} />
      </button>
      <div className={`${styles.optionMenu} ${styles.personalityMenu} ${menu === "personality" ? styles.open : ""}`}>
        {PERSONALITIES.map((name) => (
          <button key={name} type="button" className={styles.option} onClick={() => { onPersonalityChange(name); setMenu(null) }}>
            <span className={styles.optionText}><strong>{name}</strong></span>
            {personality === name ? <Check size={16} /> : null}
          </button>
        ))}
      </div>

      <div className={styles.settingLabel}>Скорость</div>
      <div className={styles.speedRow}>
        <div className={styles.speedTrack}>
          <input
            type="range"
            min="0.7"
            max="1.5"
            step="0.1"
            value={speed}
            style={{ "--voice-fill": fill } as CSSProperties}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            aria-label="Скорость визуального тумана"
          />
        </div>
        <output className={styles.speedValue}>{speed.toFixed(1).replace(".", ",")}x</output>
      </div>
    </div>
  )
}
