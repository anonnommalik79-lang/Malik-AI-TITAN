from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app/templates/sovereign-hub-ui"


def replace_one(path: Path, old: str, new: str):
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Voice catalog + language-filtered selector.
(UI / "components/voice/VoiceSettings.tsx").write_text(r'''"use client"

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

const RUSSIAN_VOICES: readonly VoiceProfile[] = [
  { name: "Charon", description: "Русский · низкий, спокойный мужской", model: "gemini-charon-ru", language: "ru", rate: .98, pitch: .9, hints: maleHints },
  { name: "Puck", description: "Русский · живой, дружелюбный мужской", model: "gemini-puck-ru", language: "ru", rate: 1, pitch: .94, hints: maleHints },
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
''', encoding="utf-8")

# Language tabs styling.
css_path = UI / "components/voice/VoiceSettingsPanel.module.css"
css = css_path.read_text(encoding="utf-8")
if ".languageBar" not in css:
    anchor = ".columns {\n"
    language_css = r'''.languageBar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
  padding: 4px;
  border: 1px solid rgba(255,255,255,.075);
  border-radius: 15px;
  background: rgba(255,255,255,.025);
}

.languageButton {
  height: 36px;
  border: 0;
  border-radius: 11px;
  color: rgba(255,255,255,.48);
  background: transparent;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
}
.languageButton:hover { color: rgba(255,255,255,.86); background: rgba(255,255,255,.045); }
.languageSelected { color: #fff; background: rgba(255,255,255,.11); box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }

'''
    if anchor not in css:
        raise SystemExit("VoiceSettings CSS anchor missing")
    css = css.replace(anchor, language_css + anchor, 1)
    css = css.replace("  .columns { gap: 7px; }", "  .languageBar { gap: 4px; margin-bottom: 7px; padding: 3px; }\n  .languageButton { height: 33px; font-size: 10px; }\n  .columns { gap: 7px; }")
    css_path.write_text(css, encoding="utf-8")

# VoiceMode: selected language is authoritative end-to-end.
mode = UI / "components/voice/VoiceMode.tsx"
replace_one(mode,
    'import { VoiceSettings, VOICES, getVoiceProfile } from "./VoiceSettings"',
    'import { VoiceSettings, VOICES, defaultVoiceForLanguage, getVoiceProfile, voiceBelongsToLanguage, type VoiceLanguage } from "./VoiceSettings"')
replace_one(mode, 'const STORAGE_KEY = "malik.voice.preferences.v3"', 'const STORAGE_KEY = "malik.voice.preferences.v4"')
replace_one(mode,
    '  const [voice, setVoice] = useState("Cliff")',
    '  const [language, setLanguage] = useState<VoiceLanguage>("kk")\n  const [voice, setVoice] = useState(defaultVoiceForLanguage("kk"))')
replace_one(mode,
    '  const speedRef = useRef(1)',
    '  const speedRef = useRef(1)\n  const languageRef = useRef<VoiceLanguage>("kk")')
replace_one(mode,
'''  useEffect(() => {
    speedRef.current = speed
    fluxSessionRef.current?.configureSpeed(speed)
  }, [speed])
''',
'''  useEffect(() => {
    languageRef.current = language
  }, [language])

  useEffect(() => {
    speedRef.current = speed
    fluxSessionRef.current?.configureSpeed(speed)
  }, [speed])
''')
replace_one(mode,
'''      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      if (typeof saved.voice === "string" && VOICES.some((item) => item.name === saved.voice)) setVoice(saved.voice)
      if (typeof saved.personality === "string") setPersonality(saved.personality)
''',
'''      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      const savedLanguage: VoiceLanguage = saved.language === "ru" || saved.language === "en" || saved.language === "kk" ? saved.language : "kk"
      languageRef.current = savedLanguage
      setLanguage(savedLanguage)
      if (typeof saved.voice === "string" && voiceBelongsToLanguage(saved.voice, savedLanguage)) setVoice(saved.voice)
      else setVoice(defaultVoiceForLanguage(savedLanguage))
      if (typeof saved.personality === "string") setPersonality(saved.personality)
''')
replace_one(mode,
'''  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ voice, personality, speed, expressivity })) } catch {}
  }, [voice, personality, speed, expressivity])
''',
'''  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ language, voice, personality, speed, expressivity })) } catch {}
  }, [language, voice, personality, speed, expressivity])
''')
replace_one(mode,
'''  const chooseBrowserVoice = useCallback((profileName: string, text: string) => {
    const profile = getVoiceProfile(profileName)
    const voices = window.speechSynthesis?.getVoices?.() || []
    if (!voices.length) return null
    const language = detectVoiceLanguage(text)
    let pool = language === "kk" ? voices.filter((item) => /^kk/i.test(item.lang)) : language === "ru" ? voices.filter((item) => /^ru/i.test(item.lang)) : voices.filter((item) => /^en/i.test(item.lang))
    if (!pool.length && language === "kk") pool = voices.filter((item) => /^ru/i.test(item.lang))
    if (!pool.length) pool = voices
    for (const hint of profile.hints) {
      const match = pool.find((item) => item.name.toLowerCase().includes(hint.toLowerCase()))
      if (match) return match
    }
    return pool[0] || null
  }, [])

  const speakBrowser = useCallback((text: string, profileName: string) => new Promise<boolean>((resolve) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return resolve(false)
    const profile = getVoiceProfile(profileName)
    const language = detectVoiceLanguage(text)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = chooseBrowserVoice(profileName, text)
    utterance.lang = language === "kk" ? "kk-KZ" : language === "ru" ? "ru-RU" : "en-US"
    utterance.rate = Math.max(.85, Math.min(1.15, profile.rate * speedRef.current))
    utterance.pitch = profile.pitch
    utterance.volume = 1
    utterance.onend = () => resolve(true)
    utterance.onerror = () => resolve(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }), [chooseBrowserVoice])
''',
'''  const chooseBrowserVoice = useCallback((profileName: string, forcedLanguage: VoiceLanguage) => {
    const profile = getVoiceProfile(profileName)
    const voices = window.speechSynthesis?.getVoices?.() || []
    if (!voices.length) return null
    const prefix = forcedLanguage === "kk" ? /^kk/i : forcedLanguage === "ru" ? /^ru/i : /^en/i
    const pool = voices.filter((item) => prefix.test(item.lang))
    if (!pool.length) return null
    for (const hint of profile.hints) {
      const match = pool.find((item) => item.name.toLowerCase().includes(hint.toLowerCase()))
      if (match) return match
    }
    return pool[0] || null
  }, [])

  const speakBrowser = useCallback((text: string, profileName: string, forcedLanguage: VoiceLanguage) => new Promise<boolean>((resolve) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return resolve(false)
    const profile = getVoiceProfile(profileName)
    const browserVoice = chooseBrowserVoice(profileName, forcedLanguage)
    if (!browserVoice) return resolve(false)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = browserVoice
    utterance.lang = forcedLanguage === "kk" ? "kk-KZ" : forcedLanguage === "ru" ? "ru-RU" : "en-US"
    utterance.rate = Math.max(.85, Math.min(1.15, profile.rate * speedRef.current))
    utterance.pitch = profile.pitch
    utterance.volume = 1
    utterance.onend = () => resolve(true)
    utterance.onerror = () => resolve(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }), [chooseBrowserVoice])
''')
replace_one(mode,
'''  const speakReply = useCallback(async (text: string, overrideVoice?: string) => {
    if (!soundEnabled || !text.trim()) return false
    stopReplyAudio(false)
    replyInterruptedRef.current = false
    replyPlayingRef.current = true
    const selectedVoice = overrideVoice || voice
    const language = detectVoiceLanguage(text)

    try {
      if (language === "en") {
''',
'''  const speakReply = useCallback(async (text: string, overrideVoice?: string, overrideLanguage?: VoiceLanguage) => {
    if (!soundEnabled || !text.trim()) return false
    stopReplyAudio(false)
    replyInterruptedRef.current = false
    replyPlayingRef.current = true
    const selectedLanguage = overrideLanguage || languageRef.current
    const requestedVoice = overrideVoice || voice
    const selectedVoice = voiceBelongsToLanguage(requestedVoice, selectedLanguage) ? requestedVoice : defaultVoiceForLanguage(selectedLanguage)

    try {
      if (selectedLanguage === "en") {
''')
replace_one(mode,
    '        body: JSON.stringify({ text, voice: selectedVoice, speed, expressivity }),',
    '        body: JSON.stringify({ text, voice: selectedVoice, language: selectedLanguage, speed, expressivity }),')
replace_one(mode,
    '      if (response.ok && (provider === "deepgram" || provider === "gemini" || provider === "xai")) {',
    '      if (response.ok && (provider === "kokoro-kazakh" || provider === "deepgram" || provider === "gemini" || provider === "xai")) {')
replace_one(mode,
    '    const browserPlayed = await speakBrowser(text, selectedVoice)',
    '    const browserPlayed = await speakBrowser(text, selectedVoice, selectedLanguage)')
replace_one(mode,
    '  }, [expressivity, playBlobAudio, showNotice, soundEnabled, speakBrowser, speed, stopReplyAudio, voice])',
    '  }, [expressivity, playBlobAudio, showNotice, soundEnabled, speakBrowser, speed, stopReplyAudio, voice])')
replace_one(mode,
'''  const previewVoice = useCallback((profileName: string) => {
    if (!soundEnabled) return
    const sample = profileName === "Kokoro M1"
      ? "Сәлем! Мен қазақша сөйлейтін Malik AI дауысымын."
      : `Hello. I'm ${profileName}. How can I help you today?`
    void speakReply(sample, profileName)
  }, [soundEnabled, speakReply])
''',
'''  const previewVoice = useCallback((profileName: string) => {
    if (!soundEnabled) return
    const profile = getVoiceProfile(profileName)
    const sample = profile.language === "kk"
      ? "Сәлем! Мен қазақша сөйлейтін Malik AI дауысымын. Қалың қалай?"
      : profile.language === "ru"
        ? `Привет! Это голос ${profileName}. Чем я могу помочь?`
        : `Hello. I'm ${profileName}. How can I help you today?`
    void speakReply(sample, profileName, profile.language)
  }, [soundEnabled, speakReply])
''')
replace_one(mode,
    '    recognition.lang = navigator.language || "ru-RU"',
    '    recognition.lang = languageRef.current === "kk" ? "kk-KZ" : languageRef.current === "ru" ? "ru-RU" : "en-US"')
replace_one(mode,
    '      setSubtitle("Говори — после паузы я отвечу сам · Қазақша · Русский · English")',
    '      setSubtitle(languageRef.current === "kk" ? "Қазақша сөйле — жауап тек қазақша болады" : languageRef.current === "ru" ? "Говори по-русски — ответ будет только по-русски" : "Speak English — the reply stays English")')
replace_one(mode,
'''  const runVoiceTurn = useCallback(async (prompt: string) => {
    const clean = prompt.trim()
    if (!clean || busy) return
''',
'''  const runVoiceTurn = useCallback(async (prompt: string) => {
    const clean = prompt.trim()
    if (!clean || busy) return
    const selectedLanguage = languageRef.current
''')
replace_one(mode,
    '        body: JSON.stringify({ text: clean, personality }),',
    '        body: JSON.stringify({ text: clean, personality, language: selectedLanguage }),')
replace_one(mode,
    '      setSubtitle(`${payload.language === "kk" ? "Kokoro M1" : voice} · ${payload.language || detectVoiceLanguage(payload.content)}`)',
    '      setSubtitle(`${voiceBelongsToLanguage(voice, selectedLanguage) ? voice : defaultVoiceForLanguage(selectedLanguage)} · ${selectedLanguage}`)')
replace_one(mode,
    '      await speakReply(payload.content)',
    '      await speakReply(payload.content, undefined, selectedLanguage)')
replace_one(mode,
    '    setSubtitle("Қазақша · Русский · English · auto")',
    '    setSubtitle(languageRef.current === "kk" ? "Қазақша · қатаң режим" : languageRef.current === "ru" ? "Русский · строгий режим" : "English · strict mode")')
replace_one(mode,
    '      form.append("language", "auto")',
    '      form.append("language", languageRef.current)')
replace_one(mode,
'''  const submitText = useCallback((prompt: string) => { void runVoiceTurn(prompt) }, [runVoiceTurn])

  useEffect(() => {
''',
'''  const submitText = useCallback((prompt: string) => { void runVoiceTurn(prompt) }, [runVoiceTurn])

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
''')
replace_one(mode,
'''      <VoiceSettings
        open={settingsOpen}
        voice={voice}
''',
'''      <VoiceSettings
        open={settingsOpen}
        language={language}
        voice={voice}
''')
replace_one(mode,
'''        expressivity={expressivity}
        onVoiceChange={setVoice}
''',
'''        expressivity={expressivity}
        onLanguageChange={changeLanguage}
        onVoiceChange={(nextVoice) => { if (voiceBelongsToLanguage(nextVoice, languageRef.current)) setVoice(nextVoice) }}
''')

# Next voice turn: explicit selected language wins over text auto-detection and bad-language outputs are retried once.
(UI / "app/api/voice/turn/route.ts").write_text(r'''import { voiceLlmAnswer } from "@/lib/voice/voice-llm-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type VoiceLanguage = "kk" | "ru" | "en"

const PERSONALITY: Record<string, string> = {
  Assistant: "Be a natural, concise voice assistant. Use short spoken sentences and no markdown unless necessary.",
  Therapist: "Use a calm reflective conversational style. Listen carefully, ask useful gentle questions, and avoid diagnosing or presenting yourself as a medical professional.",
  Storyteller: "Answer like a vivid storyteller with natural pacing, imagery and a clear narrative arc while staying concise enough for speech.",
  "Kids Story Time": "Use a friendly age-appropriate storytelling voice. Keep content safe, simple, warm and easy to follow aloud.",
  "Kids Trivia Game": "Run a friendly spoken trivia game. Ask one clear question at a time, wait for the user's answer, then react and continue.",
  Meditation: "Use very calm, brief sentences suitable for spoken meditation. Avoid urgency and keep a slow, grounded rhythm.",
  Motivation: "Use an energetic, practical coaching style. Be specific, concise and encouraging without hype or pressure.",
  Romantic: "Use a warm, gentle, emotionally expressive conversational style while respecting boundaries and keeping the response tasteful.",
  Argumentative: "Challenge claims constructively. Point out weak assumptions, offer counterarguments and stay respectful and evidence-oriented.",
}

function detectVoiceLanguage(text: string): VoiceLanguage {
  const normalized = text.toLowerCase()
  if (/[әіңғүұқөһ]/i.test(text) || /\b(сәлем|салем|қалай|калай|жақсы|жаксы|қазақ|казак|қазақстан|казахстан|рахмет|рақмет|керек|болады|болмайды|иә|ия|жоқ|жок|менің|сенің|біздің|сіздің|қайда|кайда|қанша|канша|неге|осы|бұл|бул)\b/i.test(normalized)) return "kk"
  if (/[а-яё]/i.test(text)) return "ru"
  return "en"
}

function requestedLanguage(value: unknown): VoiceLanguage | null {
  return value === "kk" || value === "ru" || value === "en" ? value : null
}

function languageInstruction(language: VoiceLanguage) {
  if (language === "kk") return "LANGUAGE LOCK: KAZAKH ONLY. Respond ONLY in natural modern Kazakh using Cyrillic Kazakh spelling. Never answer in English or Russian. Do not mix Russian or English words except exact brands, code identifiers, URLs or proper names. Use normal Kazakh words whenever they exist. Keep pronunciation-friendly sentences suitable for TTS."
  if (language === "ru") return "LANGUAGE LOCK: RUSSIAN ONLY. Respond ONLY in natural Russian. Never answer in English or Kazakh. Do not mix other languages except exact brands, code identifiers, URLs or proper names. Keep pronunciation-friendly sentences suitable for TTS."
  return "LANGUAGE LOCK: ENGLISH ONLY. Respond ONLY in natural English. Never answer in Russian or Kazakh except an exact proper name. Keep pronunciation-friendly sentences suitable for TTS."
}

function matchesLanguage(text: string, language: VoiceLanguage) {
  if (language === "kk") return /[әіңғүұқөһ]/i.test(text) || /\b(мен|сен|сіз|бұл|осы|және|үшін|қалай|жақсы|керек|бар|жоқ|иә|рақмет|сәлем|қазақ|қазір|болады)\b/i.test(text)
  if (language === "ru") return /[а-яё]/i.test(text) && !/[әіңғүұқөһ]/i.test(text)
  return /[a-z]/i.test(text) && !/[а-яёәіңғүұқөһ]/i.test(text)
}

function localFallback(language: VoiceLanguage) {
  if (language === "kk") return "Қазір жауап алу сәтсіз болды. Бір секундтан кейін қайта айтып көр."
  if (language === "ru") return "Сейчас не получилось получить ответ. Попробуй сказать ещё раз через секунду."
  return "I couldn't get a response just now. Try saying it again in a second."
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body?.text || body?.message || "").trim().slice(0, 6000)
  const personality = String(body?.personality || "Assistant")
  if (!text) return Response.json({ ok: false, error: "Пустой Voice запрос" }, { status: 400 })

  const language = requestedLanguage(body?.language) || detectVoiceLanguage(text)
  const personalityInstruction = PERSONALITY[personality] || PERSONALITY.Assistant
  const instruction = [
    "You are Sola, the Malik AI voice assistant.",
    personalityInstruction,
    languageInstruction(language),
    "The selected Voice language overrides the language of the user's words. This is mandatory.",
    "Never output mixed-script gibberish or half-transliterated words.",
    "Never mention internal providers, routing, environment variables, or API keys.",
  ].join(" ")

  try {
    let answer = await voiceLlmAnswer({ text, instruction })
    let content = String(answer.content || "").trim()

    if (!content || !matchesLanguage(content, language)) {
      answer = await voiceLlmAnswer({
        text: `Answer this user request again. Obey the selected language lock exactly. USER REQUEST:\n${text}`,
        instruction: `${instruction} Previous output violated the language lock. A second violation is not allowed.`,
      })
      content = String(answer.content || "").trim()
    }

    if (!content || !matchesLanguage(content, language)) content = localFallback(language)

    return Response.json({ ok: true, content, personality, language, provider: answer.provider, model: answer.model }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("[VOICE_TURN_ERROR]", error instanceof Error ? error.message : error)
    return Response.json({ ok: true, content: localFallback(language), personality, language, provider: "voice-local-fallback", model: "none" }, { headers: { "cache-control": "no-store" } })
  }
}
''', encoding="utf-8")

# Next TTS honors explicit language and direct Russian voice names.
tts = UI / "app/api/voice/tts/route.ts"
replace_one(tts,
'''  sharon: "Vindemiatrix",
}''',
'''  sharon: "Vindemiatrix",
  charon: "Charon",
  puck: "Puck",
  kore: "Kore",
  aoede: "Aoede",
  fenrir: "Fenrir",
}''')
replace_one(tts,
'''  const language = detectLanguage(text)
  const speed = fluxSpeed(body?.speed)
''',
'''  const requestedLanguage = body?.language === "kk" || body?.language === "ru" || body?.language === "en" ? body.language as VoiceLanguage : null
  const language = requestedLanguage || detectLanguage(text)
  const speed = fluxSpeed(body?.speed)
''')
replace_one(tts,
'''  const multilingual = await multilingualTts(text, language, speed)
  if (multilingual) return multilingual
''',
'''  if (language === "kk") {
    return Response.json({ ok: false, language, error: "Kazakh Kokoro TTS is served by the Flask production runtime" }, { status: 503, headers: { "cache-control": "no-store" } })
  }

  const multilingual = await multilingualTts(text, language, speed)
  if (multilingual) return multilingual
''')

# Flask production: selected language wins, Kazakh never falls back to an English/multilingual voice.
flask = ROOT / "app/ai/voice_runtime.py"
replace_one(flask,
'''    "paige": "Umbriel", "priya": "Autonoe", "sharon": "Vindemiatrix",
}''',
'''    "paige": "Umbriel", "priya": "Autonoe", "sharon": "Vindemiatrix",
    "charon": "Charon", "puck": "Puck", "kore": "Kore", "aoede": "Aoede", "fenrir": "Fenrir",
}''')
replace_one(flask,
'''def _groq_transcribe(audio: bytes, filename: str, mime: str):
''',
'''def _groq_transcribe(audio: bytes, filename: str, mime: str, language: str = "auto"):
''')
replace_one(flask,
'''                    data={"model": model, "response_format": "verbose_json"},
''',
'''                    data={"model": model, "response_format": "verbose_json", **({"language": language} if language in {"kk", "ru", "en"} else {})},
''')
replace_one(flask,
'''def _cloudflare_transcribe(audio: bytes):
''',
'''def _cloudflare_transcribe(audio: bytes, language: str = "auto"):
''')
replace_one(flask,
'''                json={"audio": base64.b64encode(audio).decode("ascii"), "task": "transcribe", "vad_filter": True},
''',
'''                json={"audio": base64.b64encode(audio).decode("ascii"), "task": "transcribe", "vad_filter": True, **({"language": language} if language in {"kk", "ru", "en"} else {})},
''')
replace_one(flask,
'''def _local_voice_fallback(language: str) -> str:
''',
'''def _matches_language(text: str, language: str) -> bool:
    if language == "kk":
        return bool(_KAZAKH_SPECIAL.search(text) or re.search(r"\\b(мен|сен|сіз|бұл|осы|және|үшін|қалай|жақсы|керек|бар|жоқ|иә|рақмет|сәлем|қазақ|қазір|болады)\\b", text, re.I))
    if language == "ru":
        return bool(_RUSSIAN_CYRILLIC.search(text) and not _KAZAKH_SPECIAL.search(text))
    return bool(re.search(r"[a-z]", text, re.I) and not re.search(r"[а-яёәіңғүұқөһ]", text, re.I))


def _local_voice_fallback(language: str) -> str:
''')
replace_one(flask,
'''    language = _language(text)
    speed = _speed(body.get("speed"))
''',
'''    requested_language = str(body.get("language") or "").strip().lower()
    language = requested_language if requested_language in {"kk", "ru", "en"} else _language(text)
    speed = _speed(body.get("speed"))
''')
replace_one(flask,
'''    if language == "kk":
        try:
            started = time.time()
            audio = synthesize_kazakh(text, speed)
''',
'''    if language == "kk":
        try:
            started = time.time()
            kazakh_speed = speed
            if voice == "Kokoro M1 Calm":
                kazakh_speed = max(.85, min(1.15, speed * .93))
            elif voice == "Kokoro M1 Strong":
                kazakh_speed = max(.85, min(1.15, speed * 1.05))
            audio = synthesize_kazakh(text, kazakh_speed)
''')
replace_one(flask,
'''            response.headers["x-malik-tts-voice"] = "km_m1"
            return response
        except Exception as exc:
            print("[VOICE_KOKORO_KK_ERROR]", repr(exc))
            fallback = _xai_tts(text, language, speed)
            if fallback:
                audio, mime, used_voice = fallback
                response = Response(audio, mimetype=mime)
                response.headers["x-malik-tts-provider"] = "xai"
                response.headers["x-malik-tts-voice"] = used_voice
                response.headers["Cache-Control"] = "no-store"
                return response
            return jsonify({"ok": False, "fallback": "browser-language-aware", "language": language, "error": "Kazakh Kokoro TTS unavailable"}), 503
''',
'''            response.headers["x-malik-tts-voice"] = voice if voice.startswith("Kokoro M1") else "Kokoro M1"
            return response
        except Exception as exc:
            print("[VOICE_KOKORO_KK_ERROR]", repr(exc))
            return jsonify({"ok": False, "language": language, "error": "Kazakh Kokoro TTS unavailable; wrong-language fallback blocked"}), 503
''')
replace_one(flask,
'''    result = _groq_transcribe(audio, uploaded.filename or "malik-voice.webm", uploaded.mimetype or "audio/webm")
    if not result:
        result = _cloudflare_transcribe(audio)
''',
'''    requested_language = str(request.form.get("language") or "auto").strip().lower()
    if requested_language not in {"kk", "ru", "en"}:
        requested_language = "auto"
    result = _groq_transcribe(audio, uploaded.filename or "malik-voice.webm", uploaded.mimetype or "audio/webm", requested_language)
    if not result:
        result = _cloudflare_transcribe(audio, requested_language)
''')
replace_one(flask,
'''    language = _language(text)
    answer = _voice_answer(text, personality, language)
    if answer:
        content, provider, model = answer
    else:
        content, provider, model = _local_voice_fallback(language), "voice-local-fallback", "none"
''',
'''    requested_language = str(body.get("language") or "").strip().lower()
    language = requested_language if requested_language in {"kk", "ru", "en"} else _language(text)
    answer = _voice_answer(text, personality, language)
    if answer:
        content, provider, model = answer
        if not _matches_language(content, language):
            retry = _voice_answer(f"Answer this user request again. Obey the selected language lock exactly. USER REQUEST:\\n{text}", personality, language)
            if retry and _matches_language(retry[0], language):
                content, provider, model = retry
            else:
                content, provider, model = _local_voice_fallback(language), "voice-local-fallback", "none"
    else:
        content, provider, model = _local_voice_fallback(language), "voice-local-fallback", "none"
''')

# Strengthen Flask system wording.
replace_one(flask,
'''        return "Respond ONLY in natural modern Kazakh using Cyrillic Kazakh spelling. Do not mix Russian or English except exact brands, code, URLs or proper names. Keep sentences pronunciation-friendly for TTS."
''',
'''        return "LANGUAGE LOCK: KAZAKH ONLY. Respond ONLY in natural modern Kazakh using Cyrillic Kazakh spelling. Never answer in English or Russian. Do not mix Russian or English except exact brands, code, URLs or proper names. Keep sentences pronunciation-friendly for TTS."
''')
replace_one(flask,
'''        return "Respond ONLY in natural Russian. Do not mix Kazakh or English except exact brands, code, URLs or proper names. Keep sentences pronunciation-friendly for TTS."
''',
'''        return "LANGUAGE LOCK: RUSSIAN ONLY. Respond ONLY in natural Russian. Never answer in English or Kazakh. Do not mix Kazakh or English except exact brands, code, URLs or proper names. Keep sentences pronunciation-friendly for TTS."
''')
replace_one(flask,
'''    return "Respond ONLY in natural English. Keep sentences pronunciation-friendly for TTS."
''',
'''    return "LANGUAGE LOCK: ENGLISH ONLY. Respond ONLY in natural English. Never answer in Russian or Kazakh except exact proper names. Keep sentences pronunciation-friendly for TTS."
''')

# Keep regression suite aligned with strict selected-language behavior.
test = UI / "scripts/verify-voice-mode.mjs"
replace_one(test,
'''  ["08 live browser recognition is multilingual-friendly", () => { assert.match(mode, /webkitSpeechRecognition/); assert.match(mode, /recognition\\.lang = navigator\\.language \\|\\| "ru-RU"/); assert.match(mode, /interimResults = true/) }],
''',
'''  ["08 browser recognition follows the selected language", () => { assert.match(mode, /webkitSpeechRecognition/); assert.match(mode, /languageRef\\.current === "kk" \\? "kk-KZ"/); assert.match(mode, /"ru-RU"/); assert.match(mode, /"en-US"/); assert.match(mode, /interimResults = true/) }],
''')
replace_one(test,
'''  ["09 server STT is auto-language with Gemini 3.5 primary and Whisper fallbacks", () => { assert.match(mode, /form\\.append\\("language", "auto"\\)/); assert.match(transcribe, /gemini-3\\.5-transcribe/); assert.match(transcribe, /\\["gemini", geminiModel\\]/); assert.match(transcribe, /whisper-large-v3-turbo/); assert.match(transcribe, /@cf\\/openai\\/whisper/) }],
''',
'''  ["09 server STT is locked to selected language with provider fallbacks", () => { assert.match(mode, /form\\.append\\("language", languageRef\\.current\\)/); assert.match(transcribe, /gemini-3\\.5-transcribe/); assert.match(transcribe, /whisper-large-v3-turbo/); assert.match(transcribe, /@cf\\/openai\\/whisper/) }],
''')
replace_one(test,
'''  ["11 36 Flux English voices plus native Kazakh Kokoro voice", () => { assert.match(settings, /36 Deepgram Flux · English \\+ Kokoro · Қазақша/); assert.match(settings, /name: "Kokoro M1"/); assert.match(settings, /kokoro-kazakh-km_m1/); for (const name of ["Cliff", "Kit", "Cole", "Colin", "Hannah", "Alexis", "Sienna", "Gemma", "Haley", "Wade", "Wes"]) assert.ok(settings.includes(`name: "${name}"`), `missing Flux voice ${name}`); assert.doesNotMatch(settings, /name: "Sola"/) }],
''',
'''  ["11 voices are separated by language with Kazakh first", () => { assert.match(settings, /defaultVoiceForLanguage/); assert.match(settings, /name: "Kokoro M1"/); assert.match(settings, /name: "Kokoro M1 Calm"/); assert.match(settings, /name: "Kokoro M1 Strong"/); for (const name of ["Charon", "Puck", "Kore", "Aoede", "Fenrir"]) assert.ok(settings.includes(`name: "${name}"`), `missing Russian voice ${name}`); for (const name of ["Cliff", "Kit", "Cole", "Colin", "Hannah", "Alexis", "Sienna", "Gemma", "Haley", "Wade", "Wes"]) assert.ok(settings.includes(`name: "${name}"`), `missing Flux voice ${name}`); assert.match(settings, /voicesForLanguage\\(language\\)/); assert.match(mode, /useState<VoiceLanguage>\\("kk"\\)/) }],
''')
replace_one(test,
'''  ["17 selected voice is honored and Kazakh UI points to Kokoro", () => { assert.match(mode, /language === "en"/); assert.match(tts, /deepgram-flux-batch/); assert.match(tts, /gemini-3\\.1-flash-tts-preview/); assert.match(tts, /GEMINI_VOICE_BY_PROFILE/); assert.match(tts, /language === "ru"/); assert.match(mode, /Kokoro M1/); assert.match(settings, /Қазақша/) }],
''',
'''  ["17 selected language and provider are honored end-to-end", () => { assert.match(mode, /selectedLanguage === "en"/); assert.match(mode, /provider === "kokoro-kazakh"/); assert.match(mode, /language: selectedLanguage/); assert.match(tts, /GEMINI_VOICE_BY_PROFILE/); assert.match(tts, /requestedLanguage/); assert.match(settings, /Қазақша/); assert.match(settings, /Русский/); assert.match(settings, /English/) }],
''')
replace_one(test,
'''  ["18 Kazakh-Russian-English answer language lock is present", () => { assert.match(turn, /type VoiceLanguage = "kk" \\| "ru" \\| "en"/); assert.match(turn, /Respond ONLY in natural modern Kazakh/); assert.match(turn, /Respond ONLY in natural Russian/); assert.match(turn, /Respond ONLY in natural English/); assert.match(turn, /Never output mixed-script gibberish/) }],
''',
'''  ["18 Kazakh-Russian-English answer language lock is strict", () => { assert.match(turn, /type VoiceLanguage = "kk" \\| "ru" \\| "en"/); assert.match(turn, /requestedLanguage\\(body\\?\\.language\\)/); assert.match(turn, /LANGUAGE LOCK: KAZAKH ONLY/); assert.match(turn, /LANGUAGE LOCK: RUSSIAN ONLY/); assert.match(turn, /LANGUAGE LOCK: ENGLISH ONLY/); assert.match(turn, /matchesLanguage/); assert.match(turn, /second violation is not allowed/i) }],
''')
replace_one(test,
'''  ["19 REST fallback passes Flux speed and expressivity", () => { assert.match(tts, /speed:\\s*String\\(speed\\)/); assert.match(tts, /expressivity:\\s*String\\(expressivity\\)/); assert.match(mode, /JSON\\.stringify\\(\\{ text, voice: selectedVoice, speed, expressivity \\}\\)/) }],
''',
'''  ["19 REST fallback passes language, speed and expressivity", () => { assert.match(tts, /speed:\\s*String\\(speed\\)/); assert.match(tts, /expressivity:\\s*String\\(expressivity\\)/); assert.match(mode, /JSON\\.stringify\\(\\{ text, voice: selectedVoice, language: selectedLanguage, speed, expressivity \\}\\)/) }],
''')

print("Strict Voice language lock patch prepared.")
