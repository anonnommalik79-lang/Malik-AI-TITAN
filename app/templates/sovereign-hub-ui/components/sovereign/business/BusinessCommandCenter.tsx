"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Briefcase,
  Check,
  Copy,
  Play,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Target,
  TrendingUp,
  Users,
  AlertTriangle,
  Rocket,
  Megaphone,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { takePrefillPrompt } from "@/lib/malik-context"
import { BUSINESS_SECTIONS } from "@/lib/business/sections"
import { BUSINESS_MODES, modesForSection } from "@/lib/business/modes"
import type { BusinessMode, BusinessModeId, BusinessRunContext, BusinessSectionId } from "@/lib/business/types"

export type BusinessCommandCenterProps = {
  username?: string
  onViewChange?: (view: string) => void
  onNewChat?: () => void
}

const ENDPOINT = "/api/business/run"

const SECTION_ICONS: Partial<Record<BusinessSectionId, typeof Briefcase>> = {
  "business-doctor": Stethoscope,
  "sales-booster": TrendingUp,
  "marketing-war-room": Megaphone,
  "founder-commander": Users,
  "investor-mode": Target,
  "crisis-mode": AlertTriangle,
  "launch-engine": Rocket,
  "demo-day": Rocket,
}

const MEDIA_SECTION_IDS = new Set<BusinessSectionId>([
  "newsroom-desk",
  "social-media-desk",
  "broadcast-desk",
  "media-language",
])

const BUSINESS_ONLY_SECTIONS = BUSINESS_SECTIONS.filter((s) => !MEDIA_SECTION_IDS.has(s.id))
const BUSINESS_ONLY_MODE_COUNT = BUSINESS_MODES.filter((m) => !MEDIA_SECTION_IDS.has(m.sectionId)).length

const ACCENT: Record<string, string> = {
  cyan: "#e4bb5e",
  emerald: "#34d399",
  violet: "#e8c56a",
  amber: "#fbbf24",
  rose: "#fb7185",
  blue: "#e4bb5e",
}

const OUTPUT_LABELS: Record<string, string> = {
  standard: "Стандарт",
  score: "Оценка",
  scripts: "Скрипты",
  checklist: "Чеклист",
  battle: "Battle",
  launch: "Launch Pack",
  "pitch-deck": "Pitch Deck",
  "demo-script": "Demo",
}

type ContextField = { key: keyof BusinessRunContext; label: string; placeholder: string }

const CONTEXT_FIELDS: ContextField[] = [
  { key: "website", label: "Сайт", placeholder: "https://…" },
  { key: "instagram", label: "Instagram / соцсети", placeholder: "@brand или ссылка" },
  { key: "industry", label: "Ниша", placeholder: "EdTech, SaaS, e-commerce…" },
  { key: "prices", label: "Цены", placeholder: "от 9 900 ₸ / мес" },
  { key: "revenue", label: "Доход / оборот", placeholder: "500K ₸ / мес" },
  { key: "teamSize", label: "Команда", placeholder: "3 человека" },
]

export function BusinessCommandCenter({ username, onViewChange, onNewChat }: BusinessCommandCenterProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const [activeSection, setActiveSection] = useState<BusinessSectionId>("business-doctor")
  const [selectedMode, setSelectedMode] = useState<BusinessMode | null>(BUSINESS_MODES[0] ?? null)
  const [input, setInput] = useState(() => takePrefillPrompt())
  const [context, setContext] = useState<BusinessRunContext>({ language: "ru" })
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Business Engine готов · 30 режимов")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState("")
  const [copied, setCopied] = useState(false)

  const sectionModes = useMemo(() => modesForSection(activeSection), [activeSection])
  const activeSectionMeta = useMemo(
    () => BUSINESS_SECTIONS.find((s) => s.id === activeSection),
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
      setError("Введите запрос или контекст задачи")
      return
    }
    setLoading(true)
    setError(null)
    setStatus(`Запуск · ${selectedMode.titleRu}…`)
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
    setContext({ language: "ru" })
    setStatus("Business Engine готов · 30 режимов")
  }

  const accentColor = ACCENT[activeSectionMeta?.accent || "cyan"] || "#e4bb5e"

  return (
    <main className="bcc" data-view="business-command-center">
      <div className="bcc__bg" aria-hidden="true" />
      <div className="bcc__inner">
        <div className="bcc__status">
          <span className="bcc__status-left">
            <span className="bcc__dot" style={{ background: accentColor }} />
            <span className="bcc__status-key">Business Command Center</span>
            <strong className="bcc__status-val">Онлайн</strong>
          </span>
          <span className="bcc__status-right">
            Режимов
            <strong>{BUSINESS_ONLY_MODE_COUNT}</strong>
          </span>
        </div>

        <header className="bcc__head">
          <span className="bcc__eyebrow"><Briefcase size={13} /> Бизнес-штаб</span>
          <h1 className="bcc__title">Business Command Center</h1>
          <p className="bcc__lede">
            30 AI-режимов для бизнеса: диагностика, продажи, маркетинг, founder-операции, инвесторы,
            кризис и launch. Выберите секцию, режим, опишите задачу — результат в markdown.
          </p>
        </header>

        <nav className="bcc__tabs" aria-label="Секции">
          {BUSINESS_ONLY_SECTIONS.map((section) => {
            const Icon = SECTION_ICONS[section.id] ?? Briefcase
            const active = activeSection === section.id
            const count = modesForSection(section.id).length
            return (
              <button
                key={section.id}
                type="button"
                className={`bcc__tab${active ? " bcc__tab--active" : ""}`}
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
          <p className="bcc__section-sub">{activeSectionMeta.subtitleRu}</p>
        ) : null}

        <section className="bcc__modes" aria-label="Режимы">
          <div className="bcc__mode-grid">
            {sectionModes.map((mode) => {
              const active = selectedMode?.id === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={`bcc__mode-card${active ? " bcc__mode-card--active" : ""}`}
                  onClick={() => selectMode(mode)}
                  style={active ? { borderColor: accentColor } : undefined}
                >
                  <strong>{mode.titleRu}</strong>
                  <p>{mode.descriptionRu}</p>
                  <span className="bcc__mode-tag">{OUTPUT_LABELS[mode.outputFormat] || mode.outputFormat}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="bcc__shelf bcc__workspace">
          <div className="bcc__workspace-head">
            <div>
              <span className="bcc__shelf-label"><Sparkles size={13} /> Запрос</span>
              <h2 className="bcc__shelf-title">
                {selectedMode ? selectedMode.titleRu : "Выберите режим"}
              </h2>
            </div>
            {selectedMode ? (
              <span className="bcc__mode-id">{selectedMode.id as BusinessModeId}</span>
            ) : null}
          </div>

          <textarea
            className="bcc__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            placeholder={
              selectedMode?.taskHint ||
              "Опишите задачу: продукт, аудитория, проблема, цель…"
            }
          />

          <div className="bcc__context-grid">
            {CONTEXT_FIELDS.map((field) => (
              <label key={field.key} className="bcc__field">
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
            <label className="bcc__field">
              <span>Язык ответа</span>
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

          {error ? <p className="bcc__error">{error}</p> : null}
          <p className="bcc__status-line">{status}</p>

          {result ? (
            <pre className="bcc__result">{result}</pre>
          ) : null}

          <div className="bcc__actions">
            <button
              type="button"
              className="bcc__btn bcc__btn--primary"
              onClick={runMode}
              disabled={loading || !selectedMode}
            >
              <Play size={15} />
              {loading ? "Генерирую…" : "Запустить режим"}
            </button>
            <button
              type="button"
              className="bcc__btn bcc__btn--ghost"
              onClick={copyResult}
              disabled={!result}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button type="button" className="bcc__btn bcc__btn--ghost" onClick={clearAll}>
              <RefreshCw size={15} /> Очистить
            </button>
            {onViewChange ? (
              <button
                type="button"
                className="bcc__btn bcc__btn--ghost"
                onClick={() => onViewChange("command-center")}
              >
                Command Center
              </button>
            ) : null}
          </div>
        </section>

        <footer className="bcc__footer">
          <span><Briefcase size={12} /> Malik Business Engine · v1</span>
          <span>Оператор · {operator}</span>
          <span>Эндпоинт · {ENDPOINT}</span>
        </footer>
      </div>

      <style jsx>{`
        .bcc {
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
        .bcc::-webkit-scrollbar { width: 6px; }
        .bcc::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
        @media (max-width: 920px) { .bcc { padding-top: clamp(20px, 3vw, 32px); } }
        .bcc__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(55% 40% at 12% 0%, rgba(228, 187, 94, 0.05), transparent 60%),
            radial-gradient(45% 35% at 95% 4%, rgba(52, 211, 153, 0.04), transparent 62%);
        }
        .bcc__inner { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; }
        .bcc__status {
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
        .bcc__status-left { display: inline-flex; align-items: center; gap: 10px; }
        .bcc__dot { width: 8px; height: 8px; border-radius: 999px; }
        .bcc__status-key { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a958f; }
        .bcc__status-val { font-size: 12.5px; font-weight: 700; color: #5eead4; }
        .bcc__status-right { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a958f; }
        .bcc__status-right strong { margin-left: 8px; font-weight: 700; color: #5eead4; }
        .bcc__head { max-width: 70ch; margin: 0 0 28px; }
        .bcc__eyebrow {
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
        .bcc__title {
          margin: 0 0 18px;
          font-size: clamp(32px, 5vw, 56px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #f4f6f5;
        }
        .bcc__lede {
          margin: 0;
          font-size: clamp(15px, 1.6vw, 18px);
          line-height: 1.55;
          color: #aab4af;
          max-width: 62ch;
        }
        .bcc__tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }
        .bcc__tab {
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
        .bcc__tab em {
          font-style: normal;
          font-size: 10px;
          opacity: 0.7;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
        }
        .bcc__tab:hover { border-color: rgba(255, 255, 255, 0.22); color: #e7ece9; }
        .bcc__tab--active { background: rgba(255, 255, 255, 0.04); }
        .bcc__section-sub {
          margin: 0 0 18px;
          font-size: 13px;
          color: #8a958f;
        }
        .bcc__modes { margin-bottom: 22px; }
        .bcc__mode-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }
        @media (max-width: 520px) {
          .bcc__mode-grid { grid-template-columns: 1fr; }
        }
        .bcc__mode-card {
          text-align: left;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.015);
          padding: 16px;
          color: inherit;
          cursor: pointer;
          transition: border-color 0.16s, background 0.16s;
        }
        .bcc__mode-card:hover { border-color: rgba(255, 255, 255, 0.16); }
        .bcc__mode-card--active { background: rgba(255, 255, 255, 0.03); }
        .bcc__mode-card strong {
          display: block;
          font-size: 14px;
          color: #f1f4f2;
          margin-bottom: 6px;
        }
        .bcc__mode-card p {
          margin: 0 0 10px;
          font-size: 12px;
          line-height: 1.5;
          color: #9aa6a0;
        }
        .bcc__mode-tag {
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
        .bcc__shelf {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 38px);
          margin-bottom: 22px;
        }
        .bcc__shelf-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8ba3b8;
        }
        .bcc__shelf-title {
          margin: 14px 0 14px;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 600;
          line-height: 1.2;
          color: #f1f4f2;
        }
        .bcc__workspace-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .bcc__mode-id {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 11px;
          color: #64748b;
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .bcc__textarea {
          width: 100%;
          resize: vertical;
          min-height: 120px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.25);
          color: #e8ece9;
          font-size: 15px;
          line-height: 1.55;
          padding: 16px 18px;
          outline: none;
        }
        .bcc__textarea:focus { border-color: rgba(228, 187, 94, 0.35); }
        .bcc__context-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin: 16px 0;
        }
        @media (max-width: 700px) {
          .bcc__context-grid { grid-template-columns: 1fr; }
        }
        .bcc__field { display: flex; flex-direction: column; gap: 6px; }
        .bcc__field span { font-size: 11px; font-weight: 600; color: #8a958f; text-transform: uppercase; letter-spacing: 0.06em; }
        .bcc__field input,
        .bcc__field select {
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.2);
          color: #e8ece9;
          font-size: 13px;
          padding: 10px 12px;
          outline: none;
        }
        .bcc__field input:focus,
        .bcc__field select:focus { border-color: rgba(228, 187, 94, 0.3); }
        .bcc__error { margin: 0 0 8px; font-size: 13px; color: #fca5a5; }
        .bcc__status-line { margin: 0 0 12px; font-size: 12px; color: #8ba3b8; }
        .bcc__result {
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
          max-height: 480px;
          overflow-y: auto;
        }
        .bcc__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
        .bcc__btn {
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
        .bcc__btn--primary {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #f4f6f5;
          color: #0a0a0a;
        }
        .bcc__btn--primary:hover:not(:disabled) { background: #ffffff; }
        .bcc__btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .bcc__btn--ghost {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: transparent;
          color: #d1d9d4;
        }
        .bcc__btn--ghost:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.28); color: #f4f6f5; }
        .bcc__btn--ghost:disabled { opacity: 0.45; cursor: not-allowed; }
        .bcc__footer {
          display: flex;
          flex-wrap: wrap;
          gap: 16px 24px;
          margin-top: 8px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: #6b756f;
        }
        .bcc__footer span { display: inline-flex; align-items: center; gap: 6px; }
      `}</style>
    </main>
  )
}
