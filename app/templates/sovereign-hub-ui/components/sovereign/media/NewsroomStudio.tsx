"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  FileAudio,
  Globe,
  Languages,
  Newspaper,
  Play,
  Radio,
  RefreshCw,
  Share2,
  Sparkles,
  Volume2,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { BUSINESS_SECTIONS } from "@/lib/business/sections"
import { BUSINESS_MODES, modesForSection } from "@/lib/business/modes"
import type { BusinessMode, BusinessRunContext, BusinessSectionId } from "@/lib/business/types"
import { kazakhTransliterateAuto, kazakhCyrillicToLatin, kazakhLatinToCyrillic } from "@/lib/kazakh/translit"

export type NewsroomStudioProps = {
  username?: string
  onViewChange?: (view: string) => void
  onNewChat?: () => void
}

const ENDPOINT = "/api/business/run"

const MEDIA_SECTION_IDS: BusinessSectionId[] = [
  "newsroom-desk",
  "social-media-desk",
  "broadcast-desk",
  "media-language",
]

const SECTION_ICONS: Partial<Record<BusinessSectionId, typeof Newspaper>> = {
  "newsroom-desk": Newspaper,
  "social-media-desk": Share2,
  "broadcast-desk": Radio,
  "media-language": Languages,
}

const ACCENT: Record<string, string> = {
  cyan: "#e4bb5e",
  emerald: "#34d399",
  violet: "#e8c56a",
  amber: "#fbbf24",
  rose: "#fb7185",
  blue: "#e4bb5e",
}

const OUTPUT_LABELS: Record<string, string> = {
  standard: "Текст",
  article: "Статья",
  social: "Соцсети",
  "social-pack": "5 соцсетей",
  "tv-script": "ТВ",
  interview: "Интервью",
  factcheck: "Фактчек",
  checklist: "Чеклист",
  scripts: "Скрипты",
}

type ContextField = { key: keyof BusinessRunContext; label: string; placeholder: string }

const CONTEXT_FIELDS: ContextField[] = [
  { key: "outlet", label: "Издание / канал", placeholder: "Например: Astana News, 24.kz" },
  { key: "beat", label: "Рубрика / тема", placeholder: "Политика, экономика, спорт…" },
  { key: "audience", label: "Аудитория", placeholder: "Молодёжь РК, бизнес, регионы…" },
  { key: "region", label: "Регион / гео", placeholder: "Астана, Алматы, вся РК" },
]

const MEDIA_SECTIONS = BUSINESS_SECTIONS.filter((s) => MEDIA_SECTION_IDS.includes(s.id))
const MEDIA_MODES = BUSINESS_MODES.filter((m) => MEDIA_SECTION_IDS.includes(m.sectionId))

function CapBadge({ label, state }: { label: string; state?: boolean }) {
  if (state === undefined) {
    return (
      <span className="nrs__cap nrs__cap--loading" title="Проверяю…">
        <i className="nrs__cap-dot" /> {label} · проверяю…
      </span>
    )
  }
  return (
    <span
      className={`nrs__cap ${state ? "nrs__cap--on" : "nrs__cap--off"}`}
      title={state ? "Подключено" : "Не подключено — добавьте ключи в Render Environment"}
    >
      <i className="nrs__cap-dot" /> {label}{state ? "" : " · не подключено"}
    </span>
  )
}

export function NewsroomStudio({ username, onViewChange, onNewChat }: NewsroomStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const [activeSection, setActiveSection] = useState<BusinessSectionId>("newsroom-desk")
  const [selectedMode, setSelectedMode] = useState<BusinessMode | null>(MEDIA_MODES[0] ?? null)
  const [input, setInput] = useState("")
  const [context, setContext] = useState<BusinessRunContext>({ language: "ru" })
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(`Newsroom Engine готов · ${MEDIA_MODES.length} режимов`)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState("")
  const [copied, setCopied] = useState(false)

  // Live capability check — shows which AI powers are actually wired.
  const [caps, setCaps] = useState<{ transcribe: boolean; translate: boolean; tts: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    const probe = async (url: string) => {
      try {
        const res = await fetch(url, { method: "GET" })
        const data = await res.json().catch(() => ({}))
        return Boolean(data?.configured)
      } catch {
        return false
      }
    }
    Promise.all([
      probe("/api/transcribe"),
      probe("/api/aws/translate"),
      probe("/api/aws/tts"),
    ]).then(([transcribe, translate, tts]) => {
      if (alive) setCaps({ transcribe, translate, tts })
    })
    return () => {
      alive = false
    }
  }, [])

  // Instant offline transliteration (Language Desk) — no AI, no API key.
  const [translitInput, setTranslitInput] = useState("")
  const [translitOutput, setTranslitOutput] = useState("")
  const [translitCopied, setTranslitCopied] = useState(false)

  // AWS Translate (real machine translation) + AWS Polly (voiceover).
  const [translateTarget, setTranslateTarget] = useState<"kk" | "ru" | "en">("en")
  const [translateBusy, setTranslateBusy] = useState(false)
  const [translateNote, setTranslateNote] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [ttsBusy, setTtsBusy] = useState(false)

  const awsTranslate = useCallback(async () => {
    const text = translitInput.trim()
    if (!text) {
      setTranslateNote("Введите текст для перевода")
      return
    }
    setTranslateBusy(true)
    setTranslateNote(null)
    try {
      const res = await clientFetchWithTimeout(
        "/api/aws/translate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, target: translateTarget, source: "auto" }),
        },
        45_000,
      )
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        setTranslateNote("AWS Translate не подключён. Добавьте ключи AWS в Render Environment")
        return
      }
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setTranslitOutput(String(data.translated || ""))
      setTranslateNote(`AWS Translate · ${data.sourceLang || "auto"} → ${data.targetLang || translateTarget}`)
    } catch (err) {
      setTranslateNote(err instanceof Error ? err.message : "Ошибка перевода")
    } finally {
      setTranslateBusy(false)
    }
  }, [translitInput, translateTarget])

  // Transcription (Groq Whisper) — Broadcast desk.
  const [transcribeBusy, setTranscribeBusy] = useState(false)
  const [transcribeText, setTranscribeText] = useState("")
  const [transcribeLang, setTranscribeLang] = useState<"auto" | "kk" | "ru" | "en">("auto")
  const [transcribeNote, setTranscribeNote] = useState<string | null>(null)

  const handleTranscribe = useCallback(async (file: File) => {
    if (!file) return
    setTranscribeBusy(true)
    setTranscribeNote(`Расшифровываю · ${file.name}…`)
    setTranscribeText("")
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("language", transcribeLang)
      const res = await fetch("/api/transcribe", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        setTranscribeNote("Транскрипция не подключена. Добавьте GROQ_API_KEY в Render Environment")
        return
      }
      if (!res.ok || data.ok === false || !data.text) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setTranscribeText(String(data.text))
      const detected = data.language ? ` · язык: ${data.language}` : ""
      setTranscribeNote(`Готово${detected}`)
    } catch (err) {
      setTranscribeNote(err instanceof Error ? err.message : "Ошибка транскрипции")
    } finally {
      setTranscribeBusy(false)
    }
  }, [transcribeLang])

  const sendTranscriptToInput = useCallback(() => {
    if (!transcribeText) return
    setInput((prev) => (prev.trim() ? `${prev.trim()}\n\n${transcribeText}` : transcribeText))
  }, [transcribeText])

  const speakResult = useCallback(async () => {
    const text = result.trim()
    if (!text) return
    setTtsBusy(true)
    setError(null)
    try {
      const voice = context.language === "en" ? "Joanna" : "Tatyana"
      const res = await clientFetchWithTimeout(
        "/api/aws/tts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
        },
        60_000,
      )
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        setError("AWS Polly не подключён. Добавьте ключи AWS в Render Environment")
        return
      }
      if (!res.ok || data.ok === false || !data.audio) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setAudioUrl(String(data.audio))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка озвучки")
    } finally {
      setTtsBusy(false)
    }
  }, [result, context.language])

  const runTranslit = useCallback((dir: "auto" | "to-latin" | "to-cyrillic") => {
    const text = translitInput.trim()
    if (!text) {
      setTranslitOutput("")
      return
    }
    if (dir === "to-latin") setTranslitOutput(kazakhCyrillicToLatin(text))
    else if (dir === "to-cyrillic") setTranslitOutput(kazakhLatinToCyrillic(text))
    else setTranslitOutput(kazakhTransliterateAuto(text).output)
  }, [translitInput])

  const copyTranslit = useCallback(async () => {
    if (!translitOutput) return
    try {
      await navigator.clipboard.writeText(translitOutput)
      setTranslitCopied(true)
      window.setTimeout(() => setTranslitCopied(false), 2000)
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }, [translitOutput])

  const sectionModes = useMemo(() => modesForSection(activeSection), [activeSection])
  const activeSectionMeta = useMemo(
    () => MEDIA_SECTIONS.find((s) => s.id === activeSection),
    [activeSection],
  )

  const selectSection = useCallback((sectionId: BusinessSectionId) => {
    setActiveSection(sectionId)
    const modes = modesForSection(sectionId)
    setSelectedMode(modes[0] ?? null)
    setError(null)
  }, [])

  const selectMode = useCallback((mode: BusinessMode) => {
    setSelectedMode(mode)
    setError(null)
    if (!input.trim() && mode.taskHint) {
      setInput(mode.taskHint)
    }
  }, [input])

  const runMode = async () => {
    if (!selectedMode) {
      setError("Выберите режим")
      return
    }
    if (!input.trim()) {
      setError("Опишите тему, инфоповод или вставьте исходный текст")
      return
    }
    setLoading(true)
    setError(null)
    setStatus(`Готовлю · ${selectedMode.titleRu}…`)
    try {
      const res = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: selectedMode.id,
            input: input.trim(),
            context,
            language: context.language || "ru",
          }),
        },
        90_000,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || data.publicError || `HTTP ${res.status}`)
      }
      const text = String(data.content || data.text || "").trim()
      setResult(text || "Ответ получен, но пустой.")
      setStatus(`Готово · ${selectedMode.titleRu}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка запуска"
      setError(msg)
      setStatus("Ошибка")
    } finally {
      setLoading(false)
    }
  }

  const copyResult = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Не удалось скопировать")
    }
  }

  const clearAll = () => {
    onNewChat?.()
    setInput("")
    setResult("")
    setError(null)
    setAudioUrl(null)
    setContext({ language: "ru" })
    setStatus(`Newsroom Engine готов · ${MEDIA_MODES.length} режимов`)
  }

  const accentColor = ACCENT[activeSectionMeta?.accent || "blue"] || "#e4bb5e"

  return (
    <main className="nrs" data-view="media-newsroom">
      <div className="nrs__bg" aria-hidden="true" />
      <div className="nrs__inner">
        <div className="nrs__status">
          <span className="nrs__status-left">
            <span className="nrs__dot" style={{ background: accentColor }} />
            <span className="nrs__status-key">Malik Newsroom · СМИ-студия</span>
            <strong className="nrs__status-val">Онлайн</strong>
          </span>
          <span className="nrs__status-right">
            Режимов
            <strong>{MEDIA_MODES.length}</strong>
          </span>
        </div>

        <header className="nrs__head">
          <span className="nrs__eyebrow"><Newspaper size={13} /> Суверенная редакция Казахстана</span>
          <h1 className="nrs__title">Newsroom Studio</h1>
          <p className="nrs__lede">
            AI-редакция полного цикла: новости, фактчек, интервью, соцсети, ТВ-сценарии и перевод
            KZ↔RU↔EN. Казахский медиа-мозг знает реалии РК и работает по журналистским стандартам —
            результат сразу под публикацию.
          </p>
        </header>

        <section className="nrs__caps" aria-label="Возможности">
          <span className="nrs__caps-label"><Sparkles size={13} /> Возможности студии</span>
          <div className="nrs__caps-grid">
            <span className="nrs__cap nrs__cap--on" title="Всегда активно">
              <i className="nrs__cap-dot" /> Медиа-мозг + анти-фейк
            </span>
            <CapBadge label="Переводчик KZ↔RU↔EN" state={caps?.translate} />
            <CapBadge label="Транскрипция аудио/видео" state={caps?.transcribe} />
            <CapBadge label="Озвучка текста" state={caps?.tts} />
            <span className="nrs__cap nrs__cap--on" title="Всегда активно">
              <i className="nrs__cap-dot" /> Латиница ↔ кириллица
            </span>
          </div>
        </section>

        <nav className="nrs__tabs" aria-label="Секции">
          {MEDIA_SECTIONS.map((section) => {
            const Icon = SECTION_ICONS[section.id] ?? Newspaper
            const active = activeSection === section.id
            const count = modesForSection(section.id).length
            return (
              <button
                key={section.id}
                type="button"
                className={`nrs__tab${active ? " nrs__tab--active" : ""}`}
                onClick={() => selectSection(section.id)}
                style={active ? { borderColor: ACCENT[section.accent], color: ACCENT[section.accent] } : undefined}
              >
                <Icon size={14} />
                <span>{section.titleRu}</span>
                <em>{count}</em>
              </button>
            )
          })}
        </nav>

        {activeSectionMeta ? (
          <p className="nrs__section-sub">{activeSectionMeta.subtitleRu}</p>
        ) : null}

        {activeSection === "media-language" ? (
          <section className="nrs__translit" aria-label="Мгновенная транслитерация">
            <div className="nrs__translit-head">
              <span className="nrs__shelf-label"><Languages size={13} /> Мгновенно · латиница ↔ кириллица</span>
              <span className="nrs__translit-badge">Offline · без AI · &lt;1мс</span>
            </div>
            <textarea
              className="nrs__textarea nrs__translit-area"
              value={translitInput}
              onChange={(e) => setTranslitInput(e.target.value)}
              rows={3}
              placeholder="Қазақ мәтінін осында жаз — лезде латынша/кириллицаға аударамын…"
            />
            <div className="nrs__translit-actions">
              <button type="button" className="nrs__btn nrs__btn--primary" onClick={() => runTranslit("auto")}>
                <Languages size={15} /> Авто
              </button>
              <button type="button" className="nrs__btn nrs__btn--ghost" onClick={() => runTranslit("to-latin")}>
                → Latyn
              </button>
              <button type="button" className="nrs__btn nrs__btn--ghost" onClick={() => runTranslit("to-cyrillic")}>
                → Кирил
              </button>
              {translitOutput ? (
                <button type="button" className="nrs__btn nrs__btn--ghost" onClick={copyTranslit}>
                  {translitCopied ? <Check size={15} /> : <Copy size={15} />}
                  {translitCopied ? "Скопировано" : "Копировать"}
                </button>
              ) : null}
            </div>
            <div className="nrs__translit-aws">
              <span className="nrs__shelf-label"><Globe size={13} /> Машинный перевод · AWS Translate</span>
              <div className="nrs__translit-actions">
                <select
                  className="nrs__aws-select"
                  value={translateTarget}
                  onChange={(e) => setTranslateTarget(e.target.value as "kk" | "ru" | "en")}
                  aria-label="Язык перевода"
                >
                  <option value="kk">→ Қазақша</option>
                  <option value="ru">→ Русский</option>
                  <option value="en">→ English</option>
                </select>
                <button
                  type="button"
                  className="nrs__btn nrs__btn--ghost"
                  onClick={awsTranslate}
                  disabled={translateBusy}
                >
                  <Globe size={15} /> {translateBusy ? "Перевожу…" : "Перевести"}
                </button>
              </div>
              {translateNote ? <p className="nrs__status-line">{translateNote}</p> : null}
            </div>
            {translitOutput ? <pre className="nrs__result nrs__translit-out">{translitOutput}</pre> : null}
          </section>
        ) : null}

        {activeSection === "broadcast-desk" ? (
          <section className="nrs__translit" aria-label="Транскрипция аудио">
            <div className="nrs__translit-head">
              <span className="nrs__shelf-label"><FileAudio size={13} /> Транскрипция · аудио/видео → текст</span>
              <span className="nrs__translit-badge">Groq Whisper · до 25 МБ</span>
            </div>
            <div className="nrs__translit-actions">
              <label className="nrs__btn nrs__btn--primary nrs__file-btn">
                <FileAudio size={15} /> {transcribeBusy ? "Расшифровываю…" : "Выбрать файл"}
                <input
                  type="file"
                  accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.webm,.mp4"
                  hidden
                  disabled={transcribeBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleTranscribe(f)
                    e.target.value = ""
                  }}
                />
              </label>
              <select
                className="nrs__aws-select"
                value={transcribeLang}
                onChange={(e) => setTranscribeLang(e.target.value as "auto" | "kk" | "ru" | "en")}
                aria-label="Язык записи"
                disabled={transcribeBusy}
              >
                <option value="auto">Авто-язык</option>
                <option value="kk">Қазақша</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
              {transcribeText ? (
                <button type="button" className="nrs__btn nrs__btn--ghost" onClick={sendTranscriptToInput}>
                  <Sparkles size={15} /> В материал
                </button>
              ) : null}
            </div>
            {transcribeNote ? <p className="nrs__status-line">{transcribeNote}</p> : null}
            {transcribeText ? <pre className="nrs__result nrs__translit-out">{transcribeText}</pre> : null}
          </section>
        ) : null}

        <section className="nrs__modes" aria-label="Режимы">
          <div className="nrs__mode-grid">
            {sectionModes.map((mode) => {
              const active = selectedMode?.id === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={`nrs__mode-card${active ? " nrs__mode-card--active" : ""}`}
                  onClick={() => selectMode(mode)}
                  style={active ? { borderColor: accentColor } : undefined}
                >
                  <strong>{mode.titleRu}</strong>
                  <p>{mode.descriptionRu}</p>
                  <span className="nrs__mode-tag">{OUTPUT_LABELS[mode.outputFormat] || mode.outputFormat}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="nrs__shelf nrs__workspace">
          <div className="nrs__workspace-head">
            <div>
              <span className="nrs__shelf-label"><Sparkles size={13} /> Материал</span>
              <h2 className="nrs__shelf-title">
                {selectedMode ? selectedMode.titleRu : "Выберите режим"}
              </h2>
            </div>
            {selectedMode ? (
              <span className="nrs__mode-id">{selectedMode.id}</span>
            ) : null}
          </div>

          <textarea
            className="nrs__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            placeholder={
              selectedMode?.taskHint ||
              "Тема, инфоповод, факты или исходный текст для обработки…"
            }
          />

          <div className="nrs__context-grid">
            {CONTEXT_FIELDS.map((field) => (
              <label key={field.key} className="nrs__field">
                <span>{field.label}</span>
                <input
                  type="text"
                  value={String(context[field.key] ?? "")}
                  onChange={(e) =>
                    setContext((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))
                  }
                  placeholder={field.placeholder}
                />
              </label>
            ))}
            <label className="nrs__field">
              <span>Язык материала</span>
              <select
                value={context.language || "ru"}
                onChange={(e) =>
                  setContext((prev) => ({
                    ...prev,
                    language: e.target.value as BusinessRunContext["language"],
                  }))
                }
              >
                <option value="ru">Русский</option>
                <option value="kz">Қазақша</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          {error ? <p className="nrs__error">{error}</p> : null}
          <p className="nrs__status-line">{status}</p>

          {result ? <pre className="nrs__result">{result}</pre> : null}

          {audioUrl ? (
            <audio className="nrs__audio" src={audioUrl} controls autoPlay aria-label="Озвучка материала" />
          ) : null}

          <div className="nrs__actions">
            <button
              type="button"
              className="nrs__btn nrs__btn--primary"
              onClick={runMode}
              disabled={loading || !selectedMode}
            >
              <Play size={15} />
              {loading ? "Готовлю материал…" : "Сгенерировать"}
            </button>
            <button
              type="button"
              className="nrs__btn nrs__btn--ghost"
              onClick={copyResult}
              disabled={!result}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button
              type="button"
              className="nrs__btn nrs__btn--ghost"
              onClick={speakResult}
              disabled={!result || ttsBusy}
            >
              <Volume2 size={15} /> {ttsBusy ? "Озвучиваю…" : "Озвучить"}
            </button>
            <button type="button" className="nrs__btn nrs__btn--ghost" onClick={clearAll}>
              <RefreshCw size={15} /> Очистить
            </button>
            {onViewChange ? (
              <button
                type="button"
                className="nrs__btn nrs__btn--ghost"
                onClick={() => onViewChange("business-command-center")}
              >
                Business Center
              </button>
            ) : null}
          </div>
        </section>

        <footer className="nrs__footer">
          <span><AlertTriangle size={12} /> Проверяйте факты перед публикацией · AI помогает, ответственность за выпуск — за редакцией</span>
          <span>Оператор · {operator}</span>
        </footer>
      </div>

      <style jsx>{`
        .nrs {
          position: relative;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(96px, 8vw, 116px) clamp(16px, 3vw, 44px) 88px;
          color: #e7eae8;
          -webkit-font-smoothing: antialiased;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
        }
        .nrs::-webkit-scrollbar { width: 6px; }
        .nrs::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
        @media (max-width: 920px) { .nrs { padding-top: clamp(20px, 3vw, 32px); } }
        .nrs__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(55% 40% at 12% 0%, rgba(228, 187, 94, 0.06), transparent 60%),
            radial-gradient(45% 35% at 95% 4%, rgba(232, 197, 106, 0.05), transparent 62%);
        }
        .nrs__inner { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; }
        .nrs__status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          margin-bottom: 30px;
        }
        .nrs__status-left { display: inline-flex; align-items: center; gap: 10px; }
        .nrs__dot { width: 8px; height: 8px; border-radius: 999px; }
        .nrs__status-key { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a958f; }
        .nrs__status-val { font-size: 12.5px; font-weight: 700; color: #f0d288; }
        .nrs__status-right { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a958f; }
        .nrs__status-right strong { margin-left: 8px; font-weight: 700; color: #f0d288; }
        .nrs__head { max-width: 70ch; margin: 0 0 28px; }
        .nrs__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #8ba3b8;
          margin-bottom: 18px;
        }
        .nrs__title {
          margin: 0 0 18px;
          font-size: clamp(32px, 5vw, 56px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #f4f6f5;
        }
        .nrs__lede {
          margin: 0;
          font-size: clamp(15px, 1.6vw, 18px);
          line-height: 1.55;
          color: #aab4af;
          max-width: 64ch;
        }
        .nrs__caps {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.015);
          padding: 14px 16px;
          margin-bottom: 22px;
        }
        .nrs__caps-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #8ba3b8;
          margin-bottom: 12px;
        }
        .nrs__caps-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .nrs__cap {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
        }
        .nrs__cap-dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
        .nrs__cap--on { color: #34d399; border-color: rgba(52, 211, 153, 0.3); }
        .nrs__cap--off { color: #6b756f; }
        .nrs__cap--loading { color: #8ba3b8; }
        .nrs__tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .nrs__tab {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.02);
          color: #aab4af;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 14px;
          cursor: pointer;
          transition: border-color 0.16s, color 0.16s;
        }
        .nrs__tab em {
          font-style: normal;
          font-size: 10px;
          opacity: 0.7;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
        }
        .nrs__tab:hover { border-color: rgba(255, 255, 255, 0.22); color: #e7ece9; }
        .nrs__tab--active { background: rgba(255, 255, 255, 0.04); }
        .nrs__section-sub { margin: 0 0 18px; font-size: 13px; color: #8a958f; }
        .nrs__translit {
          border-radius: 18px;
          border: 1px solid rgba(228, 187, 94, 0.2);
          background: rgba(228, 187, 94, 0.04);
          padding: 18px;
          margin-bottom: 22px;
        }
        .nrs__translit-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .nrs__translit-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #f0d288;
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid rgba(240, 210, 136, 0.3);
        }
        .nrs__translit-area { min-height: 80px; margin-bottom: 12px; }
        .nrs__translit-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
        .nrs__translit-out { margin-bottom: 0; max-height: 220px; }
        .nrs__translit-aws {
          margin: 14px 0 4px;
          padding-top: 14px;
          border-top: 1px dashed rgba(255, 255, 255, 0.1);
        }
        .nrs__translit-aws .nrs__shelf-label { margin-bottom: 10px; display: inline-flex; }
        .nrs__aws-select {
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.25);
          color: #e8ece9;
          font-size: 13px;
          font-weight: 600;
          padding: 10px 12px;
          outline: none;
          cursor: pointer;
        }
        .nrs__aws-select:focus { border-color: rgba(228, 187, 94, 0.4); }
        .nrs__audio { width: 100%; margin: 0 0 16px; border-radius: 10px; }
        .nrs__file-btn { cursor: pointer; }
        .nrs__file-btn input { display: none; }
        .nrs__modes { margin-bottom: 22px; }
        .nrs__mode-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }
        @media (max-width: 520px) { .nrs__mode-grid { grid-template-columns: 1fr; } }
        .nrs__mode-card {
          text-align: left;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.015);
          padding: 16px;
          color: inherit;
          cursor: pointer;
          transition: border-color 0.16s, background 0.16s;
        }
        .nrs__mode-card:hover { border-color: rgba(255, 255, 255, 0.16); }
        .nrs__mode-card--active { background: rgba(255, 255, 255, 0.03); }
        .nrs__mode-card strong { display: block; font-size: 14px; color: #f1f4f2; margin-bottom: 6px; }
        .nrs__mode-card p { margin: 0 0 10px; font-size: 12px; line-height: 1.5; color: #9aa6a0; }
        .nrs__mode-tag {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #8ba3b8;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .nrs__shelf {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 38px);
          margin-bottom: 22px;
        }
        .nrs__shelf-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8ba3b8;
        }
        .nrs__shelf-title {
          margin: 14px 0 14px;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 600;
          line-height: 1.2;
          color: #f1f4f2;
        }
        .nrs__workspace-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .nrs__mode-id {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 11px;
          color: #64748b;
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .nrs__textarea {
          width: 100%;
          resize: vertical;
          min-height: 140px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.25);
          color: #e8ece9;
          font-size: 15px;
          line-height: 1.55;
          padding: 16px 18px;
          outline: none;
        }
        .nrs__textarea:focus { border-color: rgba(228, 187, 94, 0.4); }
        .nrs__context-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin: 16px 0;
        }
        @media (max-width: 700px) { .nrs__context-grid { grid-template-columns: 1fr; } }
        .nrs__field { display: flex; flex-direction: column; gap: 6px; }
        .nrs__field span { font-size: 11px; font-weight: 600; color: #8a958f; text-transform: uppercase; letter-spacing: 0.06em; }
        .nrs__field input,
        .nrs__field select {
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.2);
          color: #e8ece9;
          font-size: 13px;
          padding: 10px 12px;
          outline: none;
        }
        .nrs__field input:focus,
        .nrs__field select:focus { border-color: rgba(228, 187, 94, 0.35); }
        .nrs__error { margin: 0 0 8px; font-size: 13px; color: #fca5a5; }
        .nrs__status-line { margin: 0 0 12px; font-size: 12px; color: #8ba3b8; }
        .nrs__result {
          margin: 0 0 16px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
          font-size: 13px;
          line-height: 1.65;
          color: #c5cdc8;
          white-space: pre-wrap;
          overflow-x: auto;
          max-height: 520px;
          overflow-y: auto;
        }
        .nrs__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
        .nrs__btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          padding: 11px 18px;
          cursor: pointer;
          transition: background 0.16s, border-color 0.16s, color 0.16s;
        }
        .nrs__btn--primary {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #f4f6f5;
          color: #0a0a0a;
        }
        .nrs__btn--primary:hover:not(:disabled) { background: #ffffff; }
        .nrs__btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .nrs__btn--ghost {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: transparent;
          color: #d1d9d4;
        }
        .nrs__btn--ghost:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.28); color: #f4f6f5; }
        .nrs__btn--ghost:disabled { opacity: 0.45; cursor: not-allowed; }
        .nrs__footer {
          display: flex;
          flex-wrap: wrap;
          gap: 16px 24px;
          margin-top: 8px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: #6b756f;
        }
        .nrs__footer span { display: inline-flex; align-items: center; gap: 6px; }
      `}</style>
    </main>
  )
}

export default NewsroomStudio
