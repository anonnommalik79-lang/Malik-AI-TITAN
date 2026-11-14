"use client"

import type { ReactNode } from "react"
import { normalizeWebSource, sourceEvidenceLabel, sourceWasRead } from "@/lib/ai/source-evidence"
import type { MalikWebSource } from "@/lib/ai/web-research-types"

export function SourceEvidenceDetails({ source, index, icon }: { source: MalikWebSource; index: number; icon?: ReactNode }) {
  const safe = normalizeWebSource(source)
  if (!safe) return null
  const read = sourceWasRead(safe)
  return <div className="malik-source-evidence" data-source-access={read ? "read" : "search"}>
    <a href={safe.url} target="_blank" rel="noopener noreferrer">
      {icon}
      <span><strong>{safe.title}</strong><small>{safe.domain}</small></span>
      <em>{index + 1}</em>
    </a>
    <details>
      <summary>{read ? "Прочитана · сведения об источнике" : "Найдена · сведения об источнике"}</summary>
      <p>{sourceEvidenceLabel(safe)}</p>
      {safe.snippet ? <blockquote aria-label={read ? "Фрагмент полученной страницы" : "Фрагмент поисковой выдачи"}>{safe.snippet}</blockquote> : <p>Текст страницы недоступен.</p>}
    </details>
  </div>
}
