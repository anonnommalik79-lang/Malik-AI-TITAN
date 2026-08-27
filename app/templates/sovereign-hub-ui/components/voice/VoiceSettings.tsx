"use client"

import { Check, Volume2 } from "lucide-react"
import { useEffect, useRef } from "react"
import styles from "./VoiceSettingsPanel.module.css"

export type VoiceProfile = {
  name: string
  description: string
  deepgramModel: string
  rate: number
  pitch: number
  hints: readonly string[]
}

const maleHints = ["male", "david", "guy", "daniel", "george", "mark", "alex"] as const
const femaleHints = ["female", "aria", "jenny", "zira", "samantha", "susan"] as const

export const VOICES: readonly VoiceProfile[] = [
  { name: "Cliff", description: "American masculine · deep, calm, clear", deepgramModel: "flux-cliff-en", rate: .98, pitch: .86, hints: maleHints },
  { name: "Kit", description: "British masculine · friendly, energetic", deepgramModel: "flux-kit-en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Cole", description: "American masculine · clear, engaging", deepgramModel: "flux-cole-en", rate: 1.02, pitch: .96, hints: maleHints },
  { name: "Colin", description: "British masculine · warm, authoritative", deepgramModel: "flux-colin-en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Miles", description: "American masculine · calm, professional", deepgramModel: "flux-miles-en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Sean", description: "British masculine · mature, calming", deepgramModel: "flux-sean-en", rate: .96, pitch: .86, hints: maleHints },
  { name: "Bruce", description: "American masculine · natural, believable", deepgramModel: "flux-bruce-en", rate: 1, pitch: .90, hints: maleHints },
  { name: "Conor", description: "British masculine · deep, relaxed", deepgramModel: "flux-conor-en", rate: .97, pitch: .86, hints: maleHints },
  { name: "Donovan", description: "American masculine · professional, thoughtful", deepgramModel: "flux-donovan-en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Drew", description: "American masculine · soft, young, calm", deepgramModel: "flux-drew-en", rate: .98, pitch: .92, hints: maleHints },
  { name: "Jack", description: "British masculine · confident, clear", deepgramModel: "flux-jack-en", rate: 1, pitch: .90, hints: maleHints },
  { name: "Kai", description: "Singaporean masculine · clear, knowledgeable", deepgramModel: "flux-kai-en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Marcelo", description: "Filipino masculine · calm, professional", deepgramModel: "flux-marcelo-en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Marcus", description: "American masculine · smooth, helpful", deepgramModel: "flux-marcus-en", rate: .99, pitch: .90, hints: maleHints },
  { name: "Naveen", description: "Indian masculine · clear, professional", deepgramModel: "flux-naveen-en", rate: .99, pitch: .92, hints: maleHints },
  { name: "Rufus", description: "British masculine · confident, intelligent", deepgramModel: "flux-rufus-en", rate: .99, pitch: .90, hints: maleHints },
  { name: "Tanner", description: "British masculine · professional, calm", deepgramModel: "flux-tanner-en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Wade", description: "American masculine · warm, confident, clear", deepgramModel: "flux-wade-en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Wes", description: "American masculine · thoughtful, warm", deepgramModel: "flux-wes-en", rate: .98, pitch: .92, hints: maleHints },
  { name: "Hannah", description: "American feminine · clear, confident", deepgramModel: "flux-hannah-en", rate: 1, pitch: 1.06, hints: femaleHints },
  { name: "Alexis", description: "American feminine · professional, calm", deepgramModel: "flux-alexis-en", rate: 1, pitch: 1.05, hints: femaleHints },
  { name: "Sienna", description: "American feminine · warm, caring", deepgramModel: "flux-sienna-en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Brooke", description: "American feminine · intelligent, energetic", deepgramModel: "flux-brooke-en", rate: 1.03, pitch: 1.08, hints: femaleHints },
  { name: "Gemma", description: "British feminine · kind, approachable", deepgramModel: "flux-gemma-en", rate: 1, pitch: 1.06, hints: femaleHints },
  { name: "Haley", description: "American feminine · clear, caring, calm", deepgramModel: "flux-haley-en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Heather", description: "American feminine · engaging, energetic", deepgramModel: "flux-heather-en", rate: 1.02, pitch: 1.07, hints: femaleHints },
  { name: "Bree", description: "American feminine · friendly, sweet", deepgramModel: "flux-bree-en", rate: .99, pitch: 1.06, hints: femaleHints },
  { name: "Brittany", description: "American feminine · confident, soft", deepgramModel: "flux-brittany-en", rate: .98, pitch: 1.04, hints: femaleHints },
  { name: "Elise", description: "American feminine · clear, professional", deepgramModel: "flux-elise-en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Kelsey", description: "American feminine · caring, calm", deepgramModel: "flux-kelsey-en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Maeve", description: "Irish feminine · confident, gentle", deepgramModel: "flux-maeve-en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Meena", description: "Indian feminine · empathetic, reassuring", deepgramModel: "flux-meena-en", rate: .98, pitch: 1.04, hints: femaleHints },
  { name: "Meghan", description: "American feminine · friendly, energetic", deepgramModel: "flux-meghan-en", rate: 1.01, pitch: 1.06, hints: femaleHints },
  { name: "Paige", description: "American feminine · calm, comfortable", deepgramModel: "flux-paige-en", rate: .99, pitch: 1.04, hints: femaleHints },
  { name: "Priya", description: "Indian feminine · confident, empathetic", deepgramModel: "flux-priya-en", rate: .98, pitch: 1.04, hints: femaleHints },
  { name: "Sharon", description: "Australian feminine · formal, relaxed", deepgramModel: "flux-sharon-en", rate: .98, pitch: 1.04, hints: femaleHints },
] as const

export const PERSONALITIES = ["Assistant", "Therapist", "Storyteller", "Kids Story Time", "Kids Trivia Game", "Meditation", "Motivation", "Romantic", "Argumentative"] as const

export function getVoiceProfile(name: string): VoiceProfile {
  return VOICES.find((item) => item.name === name) || VOICES[0]
}

export function VoiceSettings({ open, voice, personality, speed, expressivity, onVoiceChange, onPersonalityChange, onSpeedChange, onExpressivityChange, onPreviewVoice, onClose }: {
  open: boolean
  voice: string
  personality: string
  speed: number
  expressivity: number
  onVoiceChange: (voice: string) => void
  onPersonalityChange: (personality: string) => void
  onSpeedChange: (speed: number) => void
  onExpressivityChange: (expressivity: number) => void
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
          <div className={styles.heading}><span>Голос</span><small>36 Deepgram Flux голосов · English</small></div>
          <div className={styles.list}>
            {VOICES.map((profile) => (
              <button key={profile.name} type="button" className={`${styles.item} ${voice === profile.name ? styles.selected : ""}`} onClick={() => { onVoiceChange(profile.name); onPreviewVoice(profile.name) }}>
                <span className={styles.itemText}><strong>{profile.name} <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">English</span></strong><small>{profile.description}</small></span>
                <span className={styles.actions}><span className={styles.preview} aria-hidden="true"><Volume2 size={14} /></span>{voice === profile.name ? <Check className={styles.check} size={15} /> : null}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.column} aria-label="Выбор личности">
          <div className={styles.heading}><span>Личность</span><small>влияет на стиль ответа</small></div>
          <div className={styles.list}>
            {PERSONALITIES.map((name) => (
              <button key={name} type="button" className={`${styles.item} ${personality === name ? styles.selected : ""}`} onClick={() => onPersonalityChange(name)}>
                <span className={styles.itemText}><strong>{name}</strong><small>{personalityDescription(name)}</small></span>
                {personality === name ? <Check className={styles.check} size={15} /> : null}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <label htmlFor="voice-speed">Скорость</label>
        <input id="voice-speed" type="range" min="0.85" max="1.15" step="0.05" value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))} />
        <output>{speed.toFixed(2).replace(".", ",")}x</output>
      </div>
      <div className={styles.footer}>
        <label htmlFor="voice-expressivity">Эмоция</label>
        <input id="voice-expressivity" type="range" min="-2" max="2" step="1" value={expressivity} onChange={(event) => onExpressivityChange(Number(event.target.value))} />
        <output>{expressivity > 0 ? `+${expressivity}` : expressivity}</output>
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
