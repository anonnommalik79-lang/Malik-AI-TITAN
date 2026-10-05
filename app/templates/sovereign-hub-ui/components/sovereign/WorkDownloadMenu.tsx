"use client"
import { useState } from "react"
import { Download } from "lucide-react"
import { artifactFormats, hasDocumentTable } from "@/lib/work/documents/formats"
import "./work-download.css"
export function WorkDownloadMenu({ markdown, title = "Ответ Malik AI", artifactId, kind }: { markdown: string; title?: string; artifactId?: string; kind?: string }) {
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const formats = artifactId ? artifactFormats(kind || "", markdown) : ["docx", "pdf", "md", ...(hasDocumentTable(markdown) ? ["xlsx", "csv"] : [])]
  if (!formats.length || !markdown.trim()) return null
  async function download(format: string) {
    if (busy) return
    setBusy(format); setError("")
    try {
      const response = await fetch(artifactId ? `/api/os/artifacts/${encodeURIComponent(artifactId)}/export?format=${format}` : "/api/work/export", artifactId ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ format, title: title.slice(0, 160), markdown }) })
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error || "Не удалось скачать файл.") }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      const encoded = response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      link.href = url; link.download = encoded ? decodeURIComponent(encoded) : `Документ.${format}`
      document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось скачать файл.") }
    finally { setBusy("") }
  }
  return <details className="malik-work-download"><summary><Download size={16} aria-hidden="true" />{busy ? `Создаю ${busy.toUpperCase()}…` : "Скачать"}</summary><div className="malik-work-download__formats" aria-label="Форматы скачивания">{formats.map((format) => <button type="button" key={format} disabled={Boolean(busy)} onClick={() => void download(format)}>{format.toUpperCase()}</button>)}</div>{error ? <p role="alert">{error}</p> : null}</details>
}
