"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, Copy, Download, FastForward, FileDown, Moon, Sun, X } from "lucide-react"
import { MalikMarkdown } from "../MalikMarkdown"
import { sheetFileName, sheetTimeline, sheetTitle, type SheetBlockKind } from "@/lib/ai/answer-sheet"
import "./answer-sheet.css"

/**
 * The answer sheet.
 *
 * A written document — a plan, an essay, a letter — opens on its own page the
 * moment it is asked for. While the model writes, the page shows what is being
 * written; when the text is ready it is laid onto the page block by block:
 * headings are drawn in, paragraphs appear line by line, list items and table
 * rows arrive one after another, and the page follows the writing down until
 * the reader scrolls on their own.
 *
 * It is portaled to <body>, outside the chat's #malik-root, so none of the
 * chat's own markdown rules or phone overrides reach it; the page's look is
 * entirely in answer-sheet.css.
 */

type Paper = "light" | "dark"
type Phase = "writing" | "revealing" | "done"

const PAPER_KEY = "malik.sheet.paper"

function readPaper(): Paper {
  try {
    return window.localStorage.getItem(PAPER_KEY) === "dark" ? "dark" : "light"
  } catch {
    return "light"
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

function blockKind(element: Element): SheetBlockKind {
  const tag = element.tagName
  if (/^H[1-6]$/.test(tag)) return "h"
  if (tag === "P") return "p"
  if (tag === "UL" || tag === "OL") return "list"
  if (tag === "BLOCKQUOTE") return "quote"
  if (tag === "HR") return "hr"
  if (element.classList.contains("malik-md-table-wrap")) return "table"
  if (element.classList.contains("malik-md-codeblock") || tag === "PRE") return "code"
  return "other"
}

function blockSize(element: Element, kind: SheetBlockKind) {
  if (kind === "list") return element.querySelectorAll(":scope > li").length
  if (kind === "table") return element.querySelectorAll("tr").length
  return (element.textContent || "").length
}

/** The planned title, written out while the model is still writing. */
function useTyped(text: string, active: boolean) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!active) return
    if (prefersReducedMotion()) {
      setShown(text.length)
      return
    }
    let frame = 0
    const start = performance.now()
    const duration = Math.min(1500, 250 + text.length * 30)
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      setShown(Math.round(progress * text.length))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text, active])
  return text.slice(0, shown)
}

const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  body { margin: 0; font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #0a0a0a; font-size: 12pt; line-height: 1.6; }
  h2, h3, h4, h5, h6 { line-height: 1.25; break-after: avoid; margin: 1.3em 0 .45em; }
  .malik-md-h1 { font-size: 22pt; margin-top: 0; }
  .malik-md-h2 { font-size: 16pt; }
  .malik-md-h3 { font-size: 13.5pt; }
  p { margin: 0 0 .8em; }
  ul, ol { margin: 0 0 .9em; padding-left: 1.3em; }
  li { margin: .25em 0; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 1em; font-size: 10.5pt; }
  th, td { border: 1px solid #d4d4d4; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  blockquote { margin: 0 0 1em; padding-left: .9em; border-left: 3px solid #0a0a0a; color: #404040; }
  hr { border: 0; border-top: 1px solid #d4d4d4; margin: 1.4em 0; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .9em; }
  pre { white-space: pre-wrap; border: 1px solid #d4d4d4; border-radius: 6px; padding: 10px 12px; font-size: 9.5pt; break-inside: avoid; }
  .malik-md-code-line { display: block; }
  .malik-md-code-line-number, .malik-md-codebar, .malik-md-artifact-toolbar, button { display: none !important; }
  a { color: inherit; }
`

export function AnswerSheet({
  content,
  streaming,
  request,
  auto,
  onClose,
}: {
  /** The answer as the chat shows it. Empty while the model is writing. */
  content: string
  streaming: boolean
  /** What the user asked for: the title while there is no text yet. */
  request: string
  /** Opened by itself for a document request, not by the reader. */
  auto: boolean
  onClose: () => void
}) {
  // Only ever created in the browser, after a click or a sent message.
  const [paper, setPaper] = useState<Paper>(() => readPaper())
  const [phase, setPhase] = useState<Phase>(streaming || !content ? "writing" : "revealing")
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  // The title was already written out on the page while the model worked;
  // the document's own first heading then takes its place without redrawing.
  const titleShownRef = useRef(streaming || !content)
  const timersRef = useRef<number[]>([])

  const ready = !streaming && Boolean(content.trim())
  const title = sheetTitle(ready ? content : "", request)
  const typedTitle = useTyped(title, phase === "writing")

  // The text has arrived: write it onto the page.
  useEffect(() => {
    if (phase === "writing" && ready) setPhase(prefersReducedMotion() ? "done" : "revealing")
  }, [phase, ready])

  // A document request that came back as a one-line error or refusal is not
  // a document: the sheet steps aside and the chat shows it.
  useEffect(() => {
    if (auto && !streaming && content.trim().length < 280) onClose()
  }, [auto, streaming, content, onClose])

  // Every block gets its moment. Delays are written onto the elements once,
  // before the first paint of the text, so nothing flashes in and out.
  useLayoutEffect(() => {
    if (phase !== "revealing") return
    const markdown = docRef.current?.querySelector(".malik-md")
    if (!markdown) return
    const blocks = Array.from(markdown.children)
    const kinds = blocks.map((element) => blockKind(element))
    const timeline = sheetTimeline(blocks.map((element, index) => ({ kind: kinds[index], size: blockSize(element, kinds[index]) })))

    blocks.forEach((element, index) => {
      const block = element as HTMLElement
      const { start, duration } = timeline[index]
      block.dataset.sheetKind = index === 0 && kinds[index] === "h" && titleShownRef.current ? "title" : kinds[index]
      block.style.setProperty("--sd", `${start}ms`)
      block.style.setProperty("--sl", `${duration}ms`)
      const parts = kinds[index] === "list"
        ? Array.from(block.querySelectorAll(":scope > li"))
        : kinds[index] === "table"
          ? Array.from(block.querySelectorAll("tr"))
          : []
      parts.forEach((part, partIndex) => {
        const step = duration / Math.max(1, parts.length)
        ;(part as HTMLElement).style.setProperty("--sd", `${Math.round(start + partIndex * step)}ms`)
        ;(part as HTMLElement).style.setProperty("--sl", `${Math.round(Math.max(260, step * 1.6))}ms`)
      })
      // The page follows the writing down, until the reader takes over.
      timersRef.current.push(window.setTimeout(() => {
        const scroller = scrollRef.current
        if (!scroller || !followRef.current) return
        const bottom = block.offsetTop + Math.min(block.offsetHeight, scroller.clientHeight * 0.5)
        const target = bottom - scroller.clientHeight * 0.62
        if (target > scroller.scrollTop + 8) scroller.scrollTo({ top: target, behavior: "smooth" })
      }, start + 60))
    })

    const last = timeline[timeline.length - 1]
    const end = last ? last.start + last.duration + 450 : 0
    timersRef.current.push(window.setTimeout(() => setPhase("done"), end))
    ;(docRef.current as HTMLElement).dataset.armed = "true"

    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timersRef.current = []
    }
  }, [phase])

  // Wheel, touch or keys on the page mean the reader is reading: stop following.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const stop = () => { followRef.current = false }
    scroller.addEventListener("wheel", stop, { passive: true })
    scroller.addEventListener("touchmove", stop, { passive: true })
    return () => {
      scroller.removeEventListener("wheel", stop)
      scroller.removeEventListener("touchmove", stop)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " "].includes(event.key)) followRef.current = false
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const togglePaper = () => {
    const next: Paper = paper === "light" ? "dark" : "light"
    setPaper(next)
    try {
      window.localStorage.setItem(PAPER_KEY, next)
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const download = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = sheetFileName(title)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  // PDF through the browser's print dialog, from a clean copy of the page:
  // the app around the sheet never ends up in the file.
  const printPdf = useCallback(() => {
    const html = docRef.current?.innerHTML || ""
    const frame = document.createElement("iframe")
    frame.setAttribute("aria-hidden", "true")
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden"
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (!doc) {
      frame.remove()
      return
    }
    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title></title><style>${PRINT_CSS}</style></head><body></body></html>`)
    doc.close()
    doc.title = title
    doc.body.innerHTML = html
    // The on-screen reveal leaves inline animation variables behind; paper
    // gets the finished text.
    doc.querySelectorAll<HTMLElement>("[style]").forEach((element) => element.removeAttribute("style"))
    window.setTimeout(() => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      window.setTimeout(() => frame.remove(), 60_000)
    }, 120)
  }, [title])

  const writing = phase === "writing"
  const status = writing ? "Malik AI пишет" : phase === "revealing" ? "Malik AI пишет" : "Готово"

  return createPortal(
    <div className="malik-sheet" data-paper={paper} role="dialog" aria-modal="true" aria-label={title}>
      <div className="malik-sheet-bar">
        <span className="malik-sheet-status" data-live={phase !== "done"}>
          <i aria-hidden="true" />
          {status}
        </span>
        <span className="malik-sheet-title" title={title}>{title}</span>
        <span className="malik-sheet-actions">
          {phase === "revealing" ? (
            <button type="button" onClick={() => setPhase("done")} title="Показать весь текст сразу">
              <FastForward aria-hidden="true" /><span>Сразу</span>
            </button>
          ) : null}
          <button type="button" onClick={() => void copy()} disabled={!ready} title="Копировать текст">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}<span>{copied ? "Скопировано" : "Копировать"}</span>
          </button>
          <button type="button" onClick={download} disabled={!ready} title="Скачать как Markdown (.md)">
            <Download aria-hidden="true" /><span>.md</span>
          </button>
          <button type="button" onClick={printPdf} disabled={!ready} title="Сохранить в PDF">
            <FileDown aria-hidden="true" /><span>PDF</span>
          </button>
          <button type="button" onClick={togglePaper} title={paper === "light" ? "Тёмный лист" : "Белый лист"} aria-label={paper === "light" ? "Тёмный лист" : "Белый лист"}>
            {paper === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </button>
          <button type="button" className="malik-sheet-close" onClick={onClose} title="Закрыть (Esc)" aria-label="Закрыть лист">
            <X aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="malik-sheet-scroll" ref={scrollRef}>
        <div className="malik-sheet-page">
          {writing ? (
            <div className="malik-sheet-writing" aria-live="polite">
              <div className="malik-sheet-writing-title">
                {typedTitle}
                <span className="malik-sheet-caret" aria-hidden="true" />
              </div>
              <div className="malik-sheet-writing-lines" aria-hidden="true">
                {[92, 86, 95, 64, 0, 88, 91, 79, 0, 70, 93, 58].map((width, index) =>
                  width ? <i key={index} style={{ width: `${width}%`, animationDelay: `${index * 90}ms` }} /> : <b key={index} />,
                )}
              </div>
            </div>
          ) : (
            <div className="malik-sheet-doc" ref={docRef} data-phase={phase}>
              <MalikMarkdown text={content} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default AnswerSheet
