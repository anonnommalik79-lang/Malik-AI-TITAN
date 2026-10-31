"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, Download, Eye, FileCode2, Folder, Loader2, Play, X } from "lucide-react"
import type { ExecutionTrace } from "@/lib/ai/chat-execution"
import {
  chatBuildCopy, chatBuildFacts, chatBuildFolder, chatBuildIsEdit, chatBuildSteps, chatBuildTotalMs, chatBuildWriting,
  formatBuildBytes, formatBuildSeconds, ruCount, type ChatBuildFile, type ChatBuildKind,
} from "@/lib/ai/chat-build"
import { buildCanvasProjectSrcDoc, buildCanvasSrcDoc } from "@/lib/canvas-preview"
import { downloadProjectZip } from "@/lib/business/project-zip"
import { buildPreviewCanAutoOpen, closeBuildPreview, openBuildPreview, useBuildPreview } from "./ChatBuildPreview"
import "./chat-build.css"

/**
 * A site, game or app being built in the chat: its steps one by one (the
 * current one spins, a finished one gets its check and its time), then the
 * result — the files, a thumbnail and what the build contains — and the
 * large Live Preview beside the chat. The code is not streamed on screen.
 */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect
const LINES = ["строка", "строки", "строк"] as const

function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The trace's times are the server's clock; a running step is timed against
 * it, corrected by the smallest gap seen between an event and its arrival.
 */
function useServerNow(trace: ExecutionTrace | undefined, live: boolean) {
  const skew = useRef<{ id: string; value: number } | null>(null)
  const [, tick] = useState(0)
  if (trace) {
    const latest = Math.max(trace.startedAt, ...trace.steps.map((step) => step.endedAt ?? step.startedAt))
    const estimate = Date.now() - latest
    skew.current = skew.current?.id === trace.id ? { id: trace.id, value: Math.min(skew.current.value, estimate) } : { id: trace.id, value: estimate }
  }
  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => { if (!document.hidden) tick((value) => value + 1) }, 200)
    return () => window.clearInterval(timer)
  }, [live])
  return Date.now() - (skew.current?.value ?? 0)
}

export function ChatBuildSteps({ kind, question, trace, live, content, tookMs }: {
  kind: ChatBuildKind
  question: string
  trace?: ExecutionTrace
  live: boolean
  content: string
  tookMs?: number
}) {
  const copy = chatBuildCopy(question)
  const english = copy.total === "Total"
  const now = useServerNow(trace, live)
  const steps = chatBuildSteps(trace, { kind, now })
  const writing = live ? chatBuildWriting(content) : null
  const total = live ? undefined : chatBuildTotalMs(trace, tookMs)
  const edit = chatBuildIsEdit(question)
  const elapsed = live && trace ? Math.max(0, now - trace.startedAt) : total
  const failed = steps.at(-1)?.state === "failed"
  if (!live && steps.length <= 1 && total === undefined) return null
  return <section className="malik-build" data-state={live ? "running" : failed ? "failed" : "done"} aria-label={live ? (edit ? copy.editing[kind] : copy.working[kind]) : copy.done[kind]}>
    <header className="malik-build__head">
      <span className="malik-build__mark" aria-hidden="true">{live ? <Loader2 className="animate-spin" /> : <Check />}</span>
      <strong>{live ? (edit ? copy.editing[kind] : copy.working[kind]) : copy.steps}</strong>
      {elapsed !== undefined ? <time aria-live="off">{formatBuildSeconds(elapsed, english)}</time> : null}
    </header>
    {steps.length > (live ? 0 : 1) ? <ol className="malik-build__steps" aria-live="polite">
      {steps.map((step, index) => {
        const current = step.state === "running"
        const codeLine = current && writing?.started && /^Пишу код/u.test(step.title)
          ? `${writing.current}${writing.files > 1 ? ` · файлов: ${writing.files}` : ""} · ${ruCount(writing.lines, LINES)}`
          : ""
        return <li key={`${step.id}:${index}`} data-state={step.state}>
          <span className="malik-build__icon" aria-hidden="true">{current ? <Loader2 className="animate-spin" /> : step.state === "failed" ? <X /> : <Check />}</span>
          <span className="malik-build__title">{step.title}{codeLine ? <em> · {codeLine}</em> : null}</span>
          <span className="malik-build__time">{formatBuildSeconds(step.ms, english)}</span>
          <span className="malik-build__sr">{current ? "выполняется" : step.state === "failed" ? "ошибка" : "готово"}</span>
        </li>
      })}
    </ol> : null}
    {!live && !failed && total !== undefined ? <p className="malik-build__done" role="status">
      <span className="malik-build__icon" aria-hidden="true"><Check /></span>
      <span>{edit ? copy.edited[kind] : copy.done[kind]} {copy.total}: <b>{formatBuildSeconds(total, english)}</b></span>
    </p> : null}
  </section>
}

/**
 * A game runs (with its sound) only in the large preview: its thumbnail is
 * the page without its scripts. A site's thumbnail runs its own script.
 */
function Thumbnail({ srcDoc, kind, title, onOpen }: { srcDoc: string; kind: ChatBuildKind; title: string; onOpen: () => void }) {
  const box = useRef<HTMLButtonElement>(null)
  const page = useMemo(() => kind === "game" ? srcDoc.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/\sautofocus(?:=["'][^"']*["'])?/gi, "") : srcDoc, [kind, srcDoc])
  const [width, setWidth] = useState(0)
  useIsoLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = width ? width / 1280 : 0
  return <button ref={box} type="button" className="malik-build-result__thumb" onClick={onOpen} aria-label={`Открыть превью: ${title}`}>
    {scale ? <iframe
      srcDoc={page}
      title={`Миниатюра ${title}`}
      tabIndex={-1}
      aria-hidden="true"
      loading="lazy"
      style={{ width: 1280, height: 800, transform: `scale(${scale})` }}
      sandbox={kind === "game" ? "" : "allow-scripts"}
    /> : null}
    {/* Without its script a game shows only its backdrop: its name says what it is. */}
    {kind === "game" ? <span className="malik-build-result__thumb-title" aria-hidden="true"><Play />{title}</span> : null}
    <span className="malik-build-result__thumb-label"><Eye aria-hidden="true" />Открыть превью</span>
  </button>
}

/** Answers this browser has already opened in the panel by themselves. */
const autoOpened = new Set<string>()

export function ChatBuildResult({ messageId, kind, question, files, primary, warnings, autoOpen }: {
  messageId: string
  kind: ChatBuildKind
  question: string
  files: ChatBuildFile[]
  primary: ChatBuildFile
  /** The answer itself says something did not pass. */
  warnings: boolean
  /** The build finished while this chat was open. */
  autoOpen: boolean
}) {
  const facts = useMemo(() => chatBuildFacts(files, primary), [files, primary])
  const srcDoc = useMemo(() => /\.html?$/i.test(primary.name) && files.length > 1
    ? buildCanvasProjectSrcDoc(files.map((file) => ({ name: file.name, content: file.content })), primary.name) || buildCanvasSrcDoc(primary.content)
    : buildCanvasSrcDoc(primary.content), [files, primary])
  const preview = useBuildPreview()
  const showing = preview?.id === messageId
  const folder = chatBuildFolder(facts.title, kind)
  const title = facts.title || primary.name
  const open = () => openBuildPreview({ id: messageId, title, filename: primary.name, srcDoc, kind, lines: primary.lines })
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    if (!autoOpen || autoOpened.has(messageId) || !buildPreviewCanAutoOpen()) return
    autoOpened.add(messageId)
    openRef.current()
  }, [autoOpen, messageId])
  // A newer version of this answer replaces what the panel shows.
  useEffect(() => {
    if (preview?.id === messageId && preview.srcDoc !== srcDoc) openRef.current()
  }, [preview, messageId, srcDoc])
  const download = () => {
    if (files.length === 1) downloadFile(files[0].name.split("/").pop() || files[0].name, files[0].content, files[0].language === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8")
    else downloadProjectZip(`${folder}.zip`, files.map((file) => ({ name: file.name, content: file.content })))
  }
  const details: Array<[string, string]> = [
    kind === "game" && facts.game?.engine ? ["Движок", facts.game.engine] : ["Страницы", facts.pages > 1 ? String(facts.pages) : facts.sections > 1 ? `1 · ${ruCount(facts.sections, ["раздел", "раздела", "разделов"])}` : "1"],
    ["Технологии", facts.technologies.join(", ") || primary.language.toUpperCase()],
    ["Адаптивность", facts.responsive ? "ПК, планшет, телефон" : "Без мобильной вёрстки"],
    ["Статус", warnings ? "Готово, есть замечания" : "Готово"],
  ]
  return <section className="malik-build-result" aria-label="Результат">
    <header className="malik-build-result__head">
      <strong>Результат</strong>
      <span>{formatBuildBytes(facts.bytes)} · {ruCount(facts.lines, LINES)}</span>
    </header>
    <div className="malik-build-result__body">
      <div className="malik-build-result__tree" role="tree" aria-label="Файлы">
        <div className="malik-build-result__folder" role="treeitem" aria-level={1} aria-expanded="true"><Folder aria-hidden="true" /><span>{folder}/</span></div>
        <ul role="group">
          {files.map((file) => <li key={file.name} role="treeitem" aria-level={2} data-primary={file === primary || undefined}>
            <FileCode2 aria-hidden="true" />
            <span className="malik-build-result__file">{file.name}</span>
            <span className="malik-build-result__file-size">{formatBuildBytes(file.bytes)}</span>
          </li>)}
        </ul>
      </div>
      <Thumbnail srcDoc={srcDoc} kind={kind} title={title} onOpen={open} />
    </div>
    {title && title !== primary.name ? <p className="malik-build-result__name">{title}{kind === "game" && facts.game?.genre ? <span> · {facts.game.genre}</span> : null}</p> : null}
    <dl className="malik-build-result__facts">
      {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="malik-build-result__actions">
      <button type="button" className="is-primary" onClick={() => showing ? closeBuildPreview(messageId) : open()} aria-pressed={showing}>
        <Eye aria-hidden="true" />{showing ? "Скрыть превью" : "Открыть превью"}
      </button>
      <button type="button" onClick={download}><Download aria-hidden="true" />{files.length > 1 ? "Скачать ZIP" : "Скачать"}</button>
    </div>
  </section>
}
