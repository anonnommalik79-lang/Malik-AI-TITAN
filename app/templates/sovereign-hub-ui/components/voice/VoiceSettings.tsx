"use client"

import { Check, Volume2 } from "lucide-react"
import { useEffect, useRef } from "react"
import styles from "./VoiceSettingsPanel.module.css"

export type VoiceLanguage = "kk" | "ru" | "en"

export type VoiceProfile = {
  name: string
  description: string
  model: string
  language: VoiceLanguage
  rate: number
  pitch: number
  hints: readonly string[]
}

const maleHints = ["male", "david", "guy", "daniel", "george", "mark", "alex"] as const
const femaleHints = ["female", "aria", "jenny", "zira", "samantha", "susan"] as const

const KAZAKH_VOICES: readonly VoiceProfile[] = [
  { name: "Kokoro M1", description: "Қазақша · табиғи ер дауыс", model: "kokoro-kazakh-km_m1", language: "kk", rate: 1, pitch: 1, hints: maleHints },
  { name: "Kokoro M1 Calm", description: "Қазақша · сабырлы, жұмсақ стиль", model: "kokoro-kazakh-km_m1-calm", language: "kk", rate: .93, pitch: .96, hints: maleHints },
  { name: "Kokoro M1 Strong", description: "Қазақша · анық, нық стиль", model: "kokoro-kazakh-km_m1-strong", language: "kk", rate: 1.05, pitch: .92, hints: maleHints },
] as const

// Charon leads and is the default. Puck is gone: it is the livelier read, and
// on a long Russian answer that liveliness turns into a sing-song the listener
// has to sit through.
const RUSSIAN_VOICES: readonly VoiceProfile[] = [
  { name: "Charon", description: "Русский · низкий, спокойный мужской", model: "gemini-charon-ru", language: "ru", rate: .98, pitch: .9, hints: maleHints },
  { name: "Kore", description: "Русский · чистый, уверенный женский", model: "gemini-kore-ru", language: "ru", rate: 1, pitch: 1.04, hints: femaleHints },
  { name: "Aoede", description: "Русский · мягкий, естественный женский", model: "gemini-aoede-ru", language: "ru", rate: .99, pitch: 1.03, hints: femaleHints },
  { name: "Fenrir", description: "Русский · энергичный, выразительный мужской", model: "gemini-fenrir-ru", language: "ru", rate: 1.02, pitch: .92, hints: maleHints },
] as const

const ENGLISH_VOICES: readonly VoiceProfile[] = [
  { name: "Cliff", description: "American masculine · deep, calm, clear", model: "flux-cliff-en", language: "en", rate: .98, pitch: .86, hints: maleHints },
  { name: "Kit", description: "British masculine · friendly, energetic", model: "flux-kit-en", language: "en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Cole", description: "American masculine · clear, engaging", model: "flux-cole-en", language: "en", rate: 1.02, pitch: .96, hints: maleHints },
  { name: "Colin", description: "British masculine · warm, authoritative", model: "flux-colin-en", language: "en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Miles", description: "American masculine · calm, professional", model: "flux-miles-en", language: "en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Sean", description: "British masculine · mature, calming", model: "flux-sean-en", language: "en", rate: .96, pitch: .86, hints: maleHints },
  { name: "Bruce", description: "American masculine · natural, believable", model: "flux-bruce-en", language: "en", rate: 1, pitch: .90, hints: maleHints },
  { name: "Conor", description: "British masculine · deep, relaxed", model: "flux-conor-en", language: "en", rate: .97, pitch: .86, hints: maleHints },
  { name: "Donovan", description: "American masculine · professional, thoughtful", model: "flux-donovan-en", language: "en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Drew", description: "American masculine · soft, young, calm", model: "flux-drew-en", language: "en", rate: .98, pitch: .92, hints: maleHints },
  { name: "Jack", description: "British masculine · confident, clear", model: "flux-jack-en", language: "en", rate: 1, pitch: .90, hints: maleHints },
  { name: "Kai", description: "Singaporean masculine · clear, knowledgeable", model: "flux-kai-en", language: "en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Marcelo", description: "Filipino masculine · calm, professional", model: "flux-marcelo-en", language: "en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Marcus", description: "American masculine · smooth, helpful", model: "flux-marcus-en", language: "en", rate: .99, pitch: .90, hints: maleHints },
  { name: "Naveen", description: "Indian masculine · clear, professional", model: "flux-naveen-en", language: "en", rate: .99, pitch: .92, hints: maleHints },
  { name: "Rufus", description: "British masculine · confident, intelligent", model: "flux-rufus-en", language: "en", rate: .99, pitch: .90, hints: maleHints },
  { name: "Tanner", description: "British masculine · professional, calm", model: "flux-tanner-en", language: "en", rate: .98, pitch: .90, hints: maleHints },
  { name: "Wade", description: "American masculine · warm, confident, clear", model: "flux-wade-en", language: "en", rate: 1, pitch: .92, hints: maleHints },
  { name: "Wes", description: "American masculine · thoughtful, warm", model: "flux-wes-en", language: "en", rate: .98, pitch: .92, hints: maleHints },
  { name: "Hannah", description: "American feminine · clear, confident", model: "flux-hannah-en", language: "en", rate: 1, pitch: 1.06, hints: femaleHints },
  { name: "Alexis", description: "American feminine · professional, calm", model: "flux-alexis-en", language: "en", rate: 1, pitch: 1.05, hints: femaleHints },
  { name: "Sienna", description: "American feminine · warm, caring", model: "flux-sienna-en", language: "en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Brooke", description: "American feminine · intelligent, energetic", model: "flux-brooke-en", language: "en", rate: 1.03, pitch: 1.08, hints: femaleHints },
  { name: "Gemma", description: "British feminine · kind, approachable", model: "flux-gemma-en", language: "en", rate: 1, pitch: 1.06, hints: femaleHints },
  { name: "Haley", description: "American feminine · clear, caring, calm", model: "flux-haley-en", language: "en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Heather", description: "American feminine · engaging, energetic", model: "flux-heather-en", language: "en", rate: 1.02, pitch: 1.07, hints: femaleHints },
  { name: "Bree", description: "American feminine · friendly, sweet", model: "flux-bree-en", language: "en", rate: .99, pitch: 1.06, hints: femaleHints },
  { name: "Brittany", description: "American feminine · confident, soft", model: "flux-brittany-en", language: "en", rate: .98, pitch: 1.04, hints: femaleHints },
  { name: "Elise", description: "American feminine · clear, professional", model: "flux-elise-en", language: "en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Kelsey", description: "American feminine · caring, calm", model: "flux-kelsey-en", language: "en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Maeve", description: "Irish feminine · confident, gentle", model: "flux-maeve-en", language: "en", rate: .99, pitch: 1.05, hints: femaleHints },
  { name: "Meena", description: "Indian feminine · empathetic, reassuring", model: "flux-meena-en", language: "en", rate: .98, pitch: 1.04, hints: femaleHints },
  { name: "Meghan", description: "American feminine · friendly, energetic", model: "flux-meghan-en", language: "en", rate: 1.01, pitch: 1.06, hints: femaleHints },
  { name: "Paige", description: "American feminine · calm, comfortable", model: "flux-paige-en", language: "en", rate: .99, pitch: 1.04, hints: femaleHints },
  { name: "Priya", description: "Indian feminine · confident, empathetic", model: "flux-priya-en", language: "en", rate: .98, pitch: 1.04, hints: femaleHints },
  { name: "Sharon", description: "Australian feminine · formal, relaxed", model: "flux-sharon-en", language: "en", rate: .98, pitch: 1.04, hints: femaleHints },
] as const

export const VOICES: readonly VoiceProfile[] = [...KAZAKH_VOICES, ...RUSSIAN_VOICES, ...ENGLISH_VOICES]

export const PERSONALITIES = ["Assistant", "Therapist", "Storyteller", "Kids Story Time", "Kids Trivia Game", "Meditation", "Motivation", "Romantic", "Argumentative"] as const

export function voicesForLanguage(language: VoiceLanguage) {
  return VOICES.filter((item) => item.language === language)
}

export function defaultVoiceForLanguage(language: VoiceLanguage) {
  return language === "kk" ? "Kokoro M1" : language === "ru" ? "Charon" : "Cliff"
}

export function voiceBelongsToLanguage(name: string, language: VoiceLanguage) {
  return VOICES.some((item) => item.name === name && item.language === language)
}

export function getVoiceProfile(name: string): VoiceProfile {
  return VOICES.find((item) => item.name === name) || VOICES[0]
}

const LANGUAGE_BUTTONS: readonly { id: VoiceLanguage; label: string }[] = [
  { id: "kk", label: "Қазақша" },
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
]

export function VoiceSettings({ open, language, voice, personality, speed, expressivity, onLanguageChange, onVoiceChange, onPersonalityChange, onSpeedChange, onExpressivityChange, onPreviewVoice, onClose }: {
  open: boolean
  language: VoiceLanguage
  voice: string
  personality: string
  speed: number
  expressivity: number
  onLanguageChange: (language: VoiceLanguage) => void
  onVoiceChange: (voice: string) => void
  onPersonalityChange: (personality: string) => void
  onSpeedChange: (speed: number) => void
  onExpressivityChange: (expressivity: number) => void
  onPreviewVoice: (voice: string) => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const visibleVoices = voicesForLanguage(language)

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
      <div className={styles.languageBar} role="tablist" aria-label="Язык Voice">
        {LANGUAGE_BUTTONS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={language === item.id} className={`${styles.languageButton} ${language === item.id ? styles.languageSelected : ""}`} onClick={() => onLanguageChange(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.columns}>
        <section className={styles.column} aria-label="Выбор голоса">
          <div className={styles.heading}><span>Голос</span><small>{language === "kk" ? "Только Қазақша" : language === "ru" ? "Только Русский" : "Deepgram Flux · English"}</small></div>
          <div className={styles.list}>
            {visibleVoices.map((profile) => (
              <button key={profile.name} type="button" className={`${styles.item} ${voice === profile.name ? styles.selected : ""}`} onClick={() => { onVoiceChange(profile.name); onPreviewVoice(profile.name) }}>
                <span className={styles.itemText}><strong>{profile.name} <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{profile.language === "kk" ? "Қазақша" : profile.language === "ru" ? "Русский" : "English"}</span></strong><small>{profile.description}</small></span>
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
