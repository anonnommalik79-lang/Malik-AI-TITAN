"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import type { AnswerChecklistItem } from "@/lib/ai/answer-visuals"
import "./answer-blocks.css"

type Props = { title: string; items: AnswerChecklistItem[]; stateKey?: string; renderLabel?: (label: string, index: number) => ReactNode }

export function MalikAnswerChecklist({ title, items, stateKey, renderLabel }: Props) {
  const id = useId()
  const signature = JSON.stringify(items)
  const storageKey = stateKey ? `malik-checklist-v1:${stateKey}` : ""
  const [selection, setSelection] = useState<{ signature: string; values: boolean[] } | null>(null)
  const [copyStatus, setCopyStatus] = useState("")
  const values = selection?.signature === signature ? selection.values : items.map((item) => item.checked)
  const completed = values.filter(Boolean).length

  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null")
      if (saved?.signature === signature && Array.isArray(saved.values) && saved.values.length === items.length && saved.values.every((value: unknown) => typeof value === "boolean")) {
        setSelection({ signature, values: saved.values })
      }
    } catch { /* Unavailable storage does not prevent checking tasks. */ }
  }, [storageKey, signature, items.length])

  const toggle = (index: number) => {
    const next = values.map((value, position) => position === index ? !value : value)
    const result = { signature, values: next }
    setSelection(result)
    setCopyStatus("")
    if (storageKey) {
      try {
        // Keep only a small number of local turn checklists.
        const keys = Object.keys(sessionStorage).filter((key) => key.startsWith("malik-checklist-v1:"))
        if (!keys.includes(storageKey) && keys.length >= 40) sessionStorage.removeItem(keys[0])
        sessionStorage.setItem(storageKey, JSON.stringify(result))
      } catch { /* Checking works even in private browsing. */ }
    }
  }

  const copy = async () => {
    const content = `${title}\n\n${items.map((item, index) => `- [${values[index] ? "x" : " "}] ${item.label}${item.detail ? `\n  ${item.detail}` : ""}`).join("\n")}`
    try { await navigator.clipboard.writeText(content); setCopyStatus("Скопировано") }
    catch { setCopyStatus("Не удалось скопировать. Выделите текст вручную.") }
  }

  return <section className="malik-answer-checklist" data-malik-answer-visual="checklist" aria-labelledby={`${id}-title`}>
    <div className="malik-answer-checklist__header">
      <h3 id={`${id}-title`}>{title}</h3>
      <span aria-label={`Выполнено ${completed} из ${items.length}`}>{completed}/{items.length}</span>
    </div>
    <div className="malik-answer-checklist__progress" role="progressbar" aria-label="Выполненные пункты" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={completed}>
      <span style={{ width: `${completed / items.length * 100}%` }} />
    </div>
    <ul className="malik-answer-checklist__items">
      {items.map((item, index) => <li key={index} data-checked={values[index]}>
        <label>
          <input type="checkbox" checked={values[index]} onChange={() => toggle(index)} aria-describedby={item.detail ? `${id}-${index}-detail` : undefined} />
          <span className="malik-answer-checklist__check" aria-hidden="true">{values[index] ? <Check size={17} strokeWidth={2.5} /> : null}</span>
          <span className="malik-answer-checklist__text"><strong>{renderLabel ? renderLabel(item.label, index) : item.label}</strong>
            {item.detail ? <span id={`${id}-${index}-detail`}>{item.detail}</span> : null}
          </span>
        </label>
      </li>)}
    </ul>
    <button type="button" className="malik-answer-checklist__copy" onClick={() => void copy()}>{copyStatus === "Скопировано" ? <Check size={18} /> : <Copy size={18} />}{copyStatus === "Скопировано" ? copyStatus : "Копировать чек-лист"}</button>
    {copyStatus && copyStatus !== "Скопировано" ? <p role="status">{copyStatus}</p> : <span className="sr-only" role="status">{copyStatus}</span>}
  </section>
}
