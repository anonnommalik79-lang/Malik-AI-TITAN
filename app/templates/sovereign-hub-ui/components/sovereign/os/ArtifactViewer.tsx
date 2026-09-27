"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpRight, Download, GitCompare, History, Loader2, PencilLine, Sparkles, Wand2, X } from "lucide-react"

import { MalikMarkdown } from "../MalikMarkdown"
import { OverlayPortal } from "../OverlayPortal"
import type { Artifact, ArtifactKind } from "@/lib/os/types"

import { newRequestId, osFetch, useLiveFlow, type FlowView } from "./os-client"
import { PREVIEW_ERROR_MESSAGE, downloadBlob, foldProjectForPreview, safeFileName, withErrorReporter, zipFiles, type ProjectFile } from "./preview"
import "./os.css"

/**
 * One artifact, full size: a site or HTML in a sandboxed preview that
 * reports its errors, a document, a deck, a picture, a code project with its
 * files. From here the person edits it ("Изменить"), fixes it with AI,
 * continues it into another tool, compares versions and restores an older
 * one. Every change is a new version; nothing is overwritten.
 */

type LineageEntry = { id: string; title: string; kind: ArtifactKind; version?: number; createdAt: number }
type Lineage = { versions: LineageEntry[]; sources: LineageEntry[]; derived: LineageEntry[] }
type ArtifactPayload = { artifact: Omit<Artifact, "ownerId">; lineage: Lineage | null }
type DiffHunk = { type: "same" | "add" | "remove" | "gap"; text?: string; count?: number }
type DiffPayload = { mode: "lines"; hunks: DiffHunk[]; added: number; removed: number } | { mode: "files"; files: Array<{ path: string; status: string; added: number; removed: number; hunks: DiffHunk[] }> }

const CONTINUE_BY_KIND: Partial<Record<ArtifactKind, Array<{ target: string; label: string }>>> = {
  "business-plan": [{ target: "presentation", label: "Презентация для инвесторов" }, { target: "website", label: "Сайт" }, { target: "video-script", label: "Сценарий видео" }],
  analysis: [{ target: "business-plan", label: "Бизнес-план" }, { target: "presentation", label: "Презентация" }, { target: "document", label: "Отчёт" }],
  document: [{ target: "presentation", label: "Презентация" }, { target: "website", label: "Сайт" }],
  text: [{ target: "presentation", label: "Презентация" }, { target: "website", label: "Сайт" }, { target: "logo", label: "Логотип" }],
  website: [{ target: "presentation", label: "Презентация" }, { target: "document", label: "Описание продукта" }],
  presentation: [{ target: "website", label: "Сайт" }, { target: "document", label: "Текст выступления" }],
}

function parseJson<T>(text?: string): T | null {
  try {
    return text ? JSON.parse(text) as T : null
  } catch {
    return null
  }
}

function slideTexts(slide: Record<string, unknown>) {
  const title = String(slide.title || slide.quote || "")
  const subtitle = String(slide.subtitle || slide.intro || slide.body || slide.context || slide.takeaway || "")
  const collect = (value: unknown): string[] => Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : item && typeof item === "object" ? String((item as Record<string, unknown>).title || (item as Record<string, unknown>).text || (item as Record<string, unknown>).label || (item as Record<string, unknown>).caption || "") : "")).filter(Boolean)
    : []
  const points = [...collect(slide.points), ...collect(slide.cards), ...collect(slide.items), ...collect(slide.steps), ...collect(slide.stats)]
  return { title, subtitle, points: points.slice(0, 6) }
}

function useFlowResult(flowId: string | null, onDone: (flow: FlowView) => void) {
  const { flow } = useLiveFlow(flowId || undefined)
  const doneRef = useRef<string>("")
  useEffect(() => {
    if (!flow || !flow.finishedAt || doneRef.current === flow.id) return
    doneRef.current = flow.id
    onDone(flow)
  }, [flow, onDone])
  return flow
}

export function ArtifactViewer({ artifactId, onClose }: { artifactId: string; onClose: () => void }) {
  const [currentId, setCurrentId] = useState(artifactId)
  const [payload, setPayload] = useState<ArtifactPayload | null>(null)
  const [loadError, setLoadError] = useState("")
  const [panel, setPanel] = useState<"" | "edit" | "continue" | "versions">("")
  const [instruction, setInstruction] = useState("")
  const [pendingFlow, setPendingFlow] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [previewErrors, setPreviewErrors] = useState<string[]>([])
  const [diff, setDiff] = useState<{ against: LineageEntry; data: DiffPayload } | null>(null)
  const [activeFile, setActiveFile] = useState(0)
  const [showPreview, setShowPreview] = useState(true)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const tokenRef = useRef(newRequestId("pv"))

  const load = useCallback(async (id: string) => {
    setLoadError("")
    setPayload(null)
    setPreviewErrors([])
    setDiff(null)
    const result = await osFetch<ArtifactPayload>(`/api/os/artifacts/${id}`, { timeoutMs: 30_000 })
    if (result.ok) setPayload(result.data)
    else setLoadError(result.message)
  }, [])

  useEffect(() => { void load(currentId) }, [currentId, load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  // Runtime errors from the sandboxed preview.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: string; token?: string; message?: string }
      if (data?.type !== PREVIEW_ERROR_MESSAGE || data.token !== tokenRef.current || !data.message) return
      setPreviewErrors((previous) => (previous.includes(data.message!) || previous.length >= 8 ? previous : [...previous, data.message!]))
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const onFlowDone = useCallback((flow: FlowView) => {
    setPendingFlow(null)
    const task = flow.tasks[0]
    if (flow.status === "completed" && task?.artifactIds[0]) {
      setPanel("")
      setInstruction("")
      setCurrentId(task.artifactIds[0])
    } else {
      setActionError(task?.error?.message || "Не получилось. Попробуйте ещё раз.")
    }
  }, [])
  const pending = useFlowResult(pendingFlow, onFlowDone)

  const artifact = payload?.artifact
  const files = useMemo(() => (artifact?.kind === "code" ? parseJson<{ files: ProjectFile[] }>(artifact.content)?.files || [] : []), [artifact])
  const deck = useMemo(() => (artifact?.kind === "presentation" ? parseJson<{ title?: string; slides?: Array<Record<string, unknown>> } & Record<string, unknown>>(artifact.content) : null), [artifact])
  const html = useMemo(() => {
    if (!artifact) return null
    if (artifact.kind === "website" || (artifact.content && /^\s*<(?:!doctype|html)/i.test(artifact.content))) return artifact.content || null
    if (artifact.kind === "code" && files.length) return foldProjectForPreview(files)
    return null
  }, [artifact, files])
  const previewDoc = useMemo(() => (html ? withErrorReporter(html, tokenRef.current) : ""), [html])

  const startEdit = async (errors?: string[]) => {
    if (!artifact) return
    setActionError("")
    const result = await osFetch<{ flow: FlowView }>(`/api/os/artifacts/${artifact.id}/edit`, {
      method: "POST",
      json: { instruction: errors ? "" : instruction, errors: errors || [], clientRequestId: newRequestId("ed") },
    })
    if (result.ok) setPendingFlow(result.data.flow.id)
    else setActionError(result.message)
  }

  const startContinue = async (target: string) => {
    if (!artifact) return
    setActionError("")
    const result = await osFetch<{ flow: FlowView }>(`/api/os/artifacts/${artifact.id}/continue`, {
      method: "POST",
      json: { target, instruction, clientRequestId: newRequestId("ct") },
    })
    if (result.ok) setPendingFlow(result.data.flow.id)
    else setActionError(result.message)
  }

  const showDiff = async (against: LineageEntry) => {
    if (!artifact) return
    const result = await osFetch<DiffPayload>(`/api/os/artifacts/${artifact.id}/diff?against=${encodeURIComponent(against.id)}`)
    if (result.ok) setDiff({ against, data: result.data })
    else setActionError(result.message)
  }

  const restore = async (version: LineageEntry) => {
    if (!artifact) return
    const result = await osFetch<{ artifact: { id: string } }>(`/api/os/artifacts/${artifact.id}/restore`, { method: "POST", json: { versionId: version.id } })
    if (result.ok) {
      setPanel("")
      setCurrentId(result.data.artifact.id)
    } else setActionError(result.message)
  }

  const download = () => {
    if (!artifact) return
    if (artifact.kind === "code" && files.length) return downloadBlob(zipFiles(files), safeFileName(artifact.title, "zip"))
    if (html) return downloadBlob(new Blob([html], { type: "text/html" }), safeFileName(artifact.title, "html"))
    if (artifact.kind === "presentation" && artifact.content) return downloadBlob(new Blob([artifact.content], { type: "application/json" }), safeFileName(artifact.title, "json"))
    if (artifact.kind === "dataset" && artifact.content) return downloadBlob(new Blob([artifact.content], { type: "text/csv" }), safeFileName(artifact.title, "csv"))
    if (artifact.content) return downloadBlob(new Blob([artifact.content], { type: "text/markdown" }), safeFileName(artifact.title, "md"))
    if (artifact.url) window.open(artifact.url, "_blank", "noopener,noreferrer")
  }

  const openInNewTab = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const openInStudio = () => {
    if (!deck) return
    try {
      window.sessionStorage.setItem("malik.presentation.handoff", JSON.stringify({ deck: { ...deck, title: deck.title || artifact?.title } }))
    } catch {
      setActionError("Браузер не дал передать презентацию в студию.")
      return
    }
    window.dispatchEvent(new CustomEvent("malik-open-view", { detail: { view: "presentation-generation" } }))
    onClose()
  }

  const versions = payload?.lineage?.versions || []
  const continueTargets = artifact ? CONTINUE_BY_KIND[artifact.kind] || [] : []
  const editable = artifact && !["image", "video", "audio", "dataset"].includes(artifact.kind)
  const brand = artifact?.metadata?.role === "brand" ? artifact.metadata.brand as { colors?: Record<string, string> } | undefined : undefined
  const sources = Array.isArray(artifact?.metadata?.sources) ? artifact!.metadata.sources as Array<{ n?: number; title: string; url: string }> : []

  return (
    <OverlayPortal>
      <div className="malik-os-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
        <div className="malik-os-sheet" role="dialog" aria-modal="true" aria-label={artifact?.title || "Результат"}>
          <header className="malik-os-sheet-head">
            <h2>{artifact?.title || "Загружаю…"}</h2>
            {artifact?.version && artifact.version > 1 ? <span className="malik-os-badge">v{artifact.version}</span> : null}
            {artifact?.fallback ? <span className="malik-os-badge">сохранённая копия от {new Date(artifact.fallback.originalCreatedAt).toLocaleDateString("ru-RU")}</span> : null}
            <div className="malik-os-sheet-actions">
              {html ? <button type="button" className="malik-os-button" onClick={openInNewTab} aria-label="Открыть в новой вкладке"><ArrowUpRight aria-hidden="true" /><span className="malik-os-hide-sm">Открыть</span></button> : null}
              {artifact ? <button type="button" className="malik-os-button" onClick={download} aria-label="Скачать"><Download aria-hidden="true" /><span className="malik-os-hide-sm">Скачать</span></button> : null}
              {versions.length > 1 ? <button type="button" className="malik-os-button" onClick={() => setPanel(panel === "versions" ? "" : "versions")} aria-label="Версии"><History aria-hidden="true" /><span className="malik-os-hide-sm">Версии</span></button> : null}
              {editable ? <button type="button" className="malik-os-button" onClick={() => setPanel(panel === "edit" ? "" : "edit")} aria-label="Изменить"><PencilLine aria-hidden="true" /><span className="malik-os-hide-sm">Изменить</span></button> : null}
              {continueTargets.length ? <button type="button" className="malik-os-button" onClick={() => setPanel(panel === "continue" ? "" : "continue")} aria-label="Продолжить в другом инструменте"><Sparkles aria-hidden="true" /><span className="malik-os-hide-sm">Дальше</span></button> : null}
              <button type="button" className="malik-os-close" onClick={onClose} aria-label="Закрыть"><X aria-hidden="true" /></button>
            </div>
          </header>

          {pendingFlow ? (
            <div className="malik-os-banner" role="status">
              <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} aria-hidden="true" />
              <span>{pending?.tasks[0]?.activity || pending?.tasks[0]?.label || "Работаю"}…</span>
            </div>
          ) : null}
          {actionError ? <div className="malik-os-banner" role="alert"><span>{actionError}</span></div> : null}

          {panel === "edit" ? (
            <form className="malik-os-toolbar" onSubmit={(event) => { event.preventDefault(); if (instruction.trim()) void startEdit() }}>
              <input className="malik-os-input" style={{ flex: "1 1 260px" }} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Что изменить? Например: сделай заголовок короче и добавь раздел о команде" maxLength={2000} autoFocus />
              <button type="submit" className="malik-os-button is-primary" disabled={!instruction.trim() || Boolean(pendingFlow)}>Изменить</button>
            </form>
          ) : null}

          {panel === "continue" ? (
            <div className="malik-os-toolbar">
              <input className="malik-os-input" style={{ flex: "1 1 240px" }} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Пожелания (необязательно)" maxLength={2000} />
              {continueTargets.map((item) => (
                <button key={item.target} type="button" className="malik-os-button" disabled={Boolean(pendingFlow)} onClick={() => void startContinue(item.target)}>{item.label}</button>
              ))}
            </div>
          ) : null}

          {panel === "versions" ? (
            <ul className="malik-os-list" style={{ borderBottom: "1px solid var(--os-line)" }}>
              {versions.map((version) => (
                <li key={version.id} className="malik-os-list-item">
                  <button type="button" className="malik-os-link" onClick={() => setCurrentId(version.id)}>
                    <strong>Версия {version.version || 1}{version.id === artifact?.id ? " · открыта" : ""}</strong>
                    <span>{new Date(version.createdAt).toLocaleString("ru-RU")}</span>
                  </button>
                  <span style={{ display: "flex", gap: 6 }}>
                    {version.id !== artifact?.id ? <button type="button" className="malik-os-button" onClick={() => void showDiff(version)}><GitCompare aria-hidden="true" />Сравнить</button> : null}
                    {version.id !== artifact?.id ? <button type="button" className="malik-os-button" onClick={() => void restore(version)}>Вернуть</button> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {previewErrors.length ? (
            <div className="malik-os-banner" role="alert">
              <strong>Ошибки при запуске: {previewErrors.length}</strong>
              <code>{previewErrors[0]}</code>
              {editable ? <button type="button" className="malik-os-button is-primary" disabled={Boolean(pendingFlow)} onClick={() => void startEdit(previewErrors)}><Wand2 aria-hidden="true" />Исправить с AI</button> : null}
            </div>
          ) : null}

          <div className="malik-os-sheet-body">
            {loadError ? <div className="malik-os-empty">{loadError}</div> : null}
            {!artifact && !loadError ? <div className="malik-os-empty"><Loader2 className="animate-spin" style={{ width: 18, height: 18, display: "inline" }} aria-hidden="true" /></div> : null}

            {artifact && diff ? (
              <div>
                <div className="malik-os-toolbar">
                  <strong style={{ fontSize: 13 }}>Изменения относительно версии {diff.against.version || 1}</strong>
                  <button type="button" className="malik-os-button" style={{ marginLeft: "auto" }} onClick={() => setDiff(null)}>Закрыть сравнение</button>
                </div>
                {diff.data.mode === "lines" ? (
                  <div className="malik-os-diff">
                    <div className="is-gap">+{diff.data.added} −{diff.data.removed}</div>
                    {diff.data.hunks.map((hunk, index) => hunk.type === "gap"
                      ? <div key={index} className="is-gap">… {hunk.count} без изменений</div>
                      : <div key={index} className={hunk.type === "add" ? "is-add" : hunk.type === "remove" ? "is-remove" : ""}>{hunk.text || " "}</div>)}
                  </div>
                ) : (
                  <div className="malik-os-diff">
                    {diff.data.files.map((file) => (
                      <div key={file.path} style={{ padding: 0 }}>
                        <div className="is-gap"><strong style={{ color: "#fff" }}>{file.path}</strong> · {file.status === "added" ? "новый" : file.status === "removed" ? "удалён" : `+${file.added} −${file.removed}`}</div>
                        {file.hunks.map((hunk, index) => hunk.type === "gap"
                          ? <div key={index} className="is-gap">… {hunk.count}</div>
                          : <div key={index} className={hunk.type === "add" ? "is-add" : hunk.type === "remove" ? "is-remove" : ""}>{hunk.text || " "}</div>)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {artifact && !diff ? (
              artifact.kind === "image" && artifact.url ? (
                <div className="malik-os-image"><img src={artifact.url} alt={artifact.title} referrerPolicy="no-referrer" /></div>
              ) : artifact.kind === "code" ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <div className="malik-os-toolbar">
                    <span className="malik-os-note">{files.length} файлов{artifact.metadata?.fileCount && Number(artifact.metadata.fileCount) > files.length ? ` (показаны ${files.length} из ${String(artifact.metadata.fileCount)})` : ""}</span>
                    {html ? <button type="button" className="malik-os-button" style={{ marginLeft: "auto" }} onClick={() => setShowPreview(!showPreview)}>{showPreview ? "Файлы" : "Предпросмотр"}</button> : <span className="malik-os-note" style={{ marginLeft: "auto" }}>Этому проекту нужна сборка — скачайте ZIP и запустите локально.</span>}
                    {typeof artifact.metadata?.downloadUrl === "string" ? <a className="malik-os-button" href={artifact.metadata.downloadUrl}>ZIP с сервера</a> : null}
                  </div>
                  {html && showPreview ? (
                    <iframe ref={frameRef} className="malik-os-frame" style={{ flex: 1 }} title={`Предпросмотр ${artifact.title}`} sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={previewDoc} />
                  ) : (
                    <div className="malik-os-files" style={{ flex: 1 }}>
                      <nav aria-label="Файлы проекта">
                        {files.map((file, index) => <button key={file.path} type="button" className={index === activeFile ? "is-active" : ""} onClick={() => setActiveFile(index)}>{file.path}</button>)}
                      </nav>
                      <pre>{files[activeFile]?.content || ""}</pre>
                    </div>
                  )}
                </div>
              ) : html ? (
                <iframe ref={frameRef} className="malik-os-frame" title={`Предпросмотр ${artifact.title}`} sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={previewDoc} />
              ) : artifact.kind === "presentation" && deck?.slides ? (
                <div>
                  <div className="malik-os-toolbar">
                    <span className="malik-os-note">{deck.slides.length} слайдов</span>
                    <button type="button" className="malik-os-button is-primary" style={{ marginLeft: "auto" }} onClick={openInStudio}>Открыть в студии презентаций</button>
                  </div>
                  <div className="malik-os-slides">
                    {deck.slides.map((slide, index) => {
                      const text = slideTexts(slide)
                      return (
                        <article key={String(slide.id || index)} className="malik-os-slide">
                          <span className="malik-os-badge">{index + 1}</span>
                          <h4 style={{ marginTop: 8 }}>{text.title || "Слайд"}</h4>
                          {text.subtitle ? <p>{text.subtitle}</p> : null}
                          {text.points.length ? <ul>{text.points.map((point, i) => <li key={i}>{point}</li>)}</ul> : null}
                        </article>
                      )
                    })}
                  </div>
                </div>
              ) : artifact.kind === "dataset" ? (
                <div className="malik-os-doc">
                  <p className="malik-os-note">{artifact.summary}</p>
                  <pre style={{ whiteSpace: "pre", overflow: "auto", fontSize: 12 }}>{(artifact.content || "").split("\n").slice(0, 40).join("\n")}</pre>
                </div>
              ) : (
                <div className="malik-os-doc">
                  {brand?.colors ? (
                    <div className="malik-os-swatches">
                      {Object.entries(brand.colors).map(([name, hex]) => <span key={name}><i style={{ background: hex }} />{hex}</span>)}
                    </div>
                  ) : null}
                  <MalikMarkdown text={artifact.content || artifact.summary || ""} />
                  {sources.length ? (
                    <section style={{ marginTop: 24 }}>
                      <h4 style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: "0 0 8px" }}>Источники</h4>
                      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4, fontSize: 13 }}>
                        {sources.map((source, index) => (
                          <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>[{source.n || index + 1}] {source.title}</a></li>
                        ))}
                      </ol>
                    </section>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}
