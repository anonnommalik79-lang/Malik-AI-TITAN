"use client"

import { Github, Mail, Search, Telescope, X } from "lucide-react"
import { CONNECTOR_NAME, CONNECTOR_SUGGESTIONS, type ConnectorId, type ResearchMode } from "./model"
import "./composer-tools.css"

/**
 * The connection the next message goes to, shown inside the composer: «GitHub ×».
 * While the field is empty it also offers a few starting questions.
 */
export function ConnectorChip({
  connector,
  showSuggestions,
  onClear,
  onSuggestion,
}: {
  connector: ConnectorId | null
  showSuggestions: boolean
  onClear: () => void
  onSuggestion: (text: string) => void
}) {
  if (!connector) return null
  const Icon = connector === "github" ? Github : Mail
  return (
    <div className="mct-chips" data-preserve-brand-color="true" data-composer-connector={connector}>
      <span className="mct-chip" title={`Следующее сообщение уйдёт в ${CONNECTOR_NAME[connector]}`}>
        <Icon aria-hidden="true" />
        {CONNECTOR_NAME[connector]}
        <button type="button" className="mct-chip__close" onClick={onClear} aria-label={`Выключить ${CONNECTOR_NAME[connector]}`}>
          <X aria-hidden="true" />
        </button>
      </span>
      {showSuggestions ? (
        <span className="mct-suggestions">
          {CONNECTOR_SUGGESTIONS[connector].map((text) => (
            <button key={text} type="button" className="mct-suggestion" onClick={() => onSuggestion(text)}>{text}</button>
          ))}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Web search or deep research, shown inside the composer where the page has
 * no other switch for it (phones hide the answer controls row).
 */
export function ResearchChip({ mode, onClear, className = "" }: { mode: ResearchMode; onClear: () => void; className?: string }) {
  if (mode === "off") return null
  const Icon = mode === "deep" ? Telescope : Search
  const label = mode === "deep" ? "Глубокое исследование" : "Поиск в сети"
  return (
    <div className={`mct-chips ${className}`.trim()} data-composer-research={mode}>
      <span className="mct-chip">
        <Icon aria-hidden="true" />
        {label}
        <button type="button" className="mct-chip__close" onClick={onClear} aria-label={`Выключить: ${label}`}>
          <X aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}
