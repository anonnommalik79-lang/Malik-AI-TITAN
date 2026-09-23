"use client"

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { deckTheme, themeCssVariables } from "@/lib/presentations/themes"
import type { Slide, ThemeId } from "@/lib/presentations/types"
import { DECK_CSS } from "./deck-css"

/**
 * One slide, drawn at 1280 × 720 and scaled as a whole to whatever box it is
 * given. The same component is the thumbnail, the editor, the full-screen show
 * and the printed page, so they cannot drift apart.
 *
 * With `editable`, every piece of text on the slide can be clicked and typed
 * into directly — the way people expect to fix a word in a deck — and changes
 * are committed on blur, not on every keystroke, so the caret never jumps.
 *
 * Each slide is drawn inside its own shadow root. This app's global CSS has
 * hundreds of !important rules aimed at headings, paragraphs and phone
 * layouts; inside the shadow root none of them apply, so a slide is exactly
 * the slide the stylesheet in deck-css.ts describes — on a phone, in the
 * dashboard, in the show and on the printed page.
 */

export type SlidePatch = Record<string, unknown>

type EditableProps = {
  value: string
  editable: boolean
  onCommit: (next: string) => void
  className?: string
  placeholder?: string
  block?: boolean
}

/**
 * The editable span manages its own text: React renders it empty and the
 * layout effect writes the value in, but never while it has focus. That is
 * what keeps React from fighting the browser over a contentEditable node.
 */
function Editable({ value, editable, onCommit, className = "", placeholder = "", block = false }: EditableProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    // Inside a shadow root document.activeElement is the host, not the span.
    const root = element?.getRootNode() as Document | ShadowRoot | undefined
    if (!element || root?.activeElement === element) return
    if (element.textContent !== value) element.textContent = value
  }, [value, editable])

  const style: CSSProperties | undefined = block ? { display: "block" } : undefined

  if (!editable) return <span className={className} style={style}>{value}</span>

  const finish = (element: HTMLSpanElement) => {
    const next = (element.textContent || "").replace(/\s+/g, " ").trim()
    if (next !== value) onCommit(next)
  }

  return (
    <span
      ref={ref}
      className={`${className} deck-edit`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={placeholder || "Текст слайда"}
      data-placeholder={placeholder}
      onBlur={(event) => finish(event.currentTarget)}
      onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === "Escape") {
          event.currentTarget.textContent = value
          event.currentTarget.blur()
        }
        event.stopPropagation()
      }}
      onPaste={(event) => {
        // Formatting from wherever the text came from has no place on a slide.
        event.preventDefault()
        const text = event.clipboardData.getData("text/plain").replace(/\s+/g, " ")
        if (!document.execCommand?.("insertText", false, text)) event.currentTarget.textContent += text
      }}
    />
  )
}

function formatNumber(value: number, language: string) {
  try {
    return new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 1 }).format(value)
  } catch {
    return String(value)
  }
}

function SlideBody({
  slide,
  index,
  total,
  editable,
  onChange,
  language,
}: {
  slide: Slide
  index: number
  total: number
  editable: boolean
  onChange: (patch: SlidePatch) => void
  language: string
}) {
  const edit = (field: string) => (next: string) => onChange({ [field]: next })
  const text = (value: string, field: string, className = "", placeholder = "", block = false) => (
    <Editable value={value} editable={editable} onCommit={edit(field)} className={className} placeholder={placeholder} block={block} />
  )
  const page = slide.layout === "title" || slide.layout === "closing" ? null : <div className="deck-page">{index + 1} / {total}</div>

  switch (slide.layout) {
    case "title":
      return (
        <div className="deck-title-slide" data-image={Boolean(slide.imageUrl)} style={{ position: "absolute", inset: 0 }}>
          <div className="deck-copy">
            {slide.kicker || editable ? <div className="deck-kicker">{text(slide.kicker || "", "kicker", "", "Надзаголовок")}</div> : null}
            <h1 className="deck-h">{text(slide.title, "title", "", "Заголовок")}</h1>
            <div className="deck-title-rule" />
            {slide.subtitle || editable ? <p className="deck-sub" style={{ margin: "26px 0 0" }}>{text(slide.subtitle || "", "subtitle", "", "Подзаголовок")}</p> : null}
          </div>
          {slide.imageUrl ? (
            <div className="deck-image">
              <img src={slide.imageUrl} alt="" />
            </div>
          ) : null}
        </div>
      )

    case "section":
      return (
        <div className="deck-section-slide" style={{ position: "absolute", inset: 0 }}>
          <div className="deck-copy">
            <div className="deck-num">{text(slide.number || String(index + 1).padStart(2, "0"), "number")}</div>
            <h2 className="deck-h">{text(slide.title, "title", "", "Раздел")}</h2>
            {slide.subtitle || editable ? <p className="deck-sub" style={{ margin: 0 }}>{text(slide.subtitle || "", "subtitle", "", "Подзаголовок")}</p> : null}
          </div>
          {page}
        </div>
      )

    case "bullets":
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            {slide.intro ? <p className="deck-intro">{text(slide.intro, "intro")}</p> : null}
            <div className="deck-body">
              <div className="deck-rows" data-count={slide.points.length}>
                {slide.points.map((point, i) => (
                  <div className="deck-row" key={i}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <strong>
                      <Editable value={point.title} editable={editable} onCommit={(next) => onChange({ points: slide.points.map((p, j) => (j === i ? { ...p, title: next } : p)) })} />
                    </strong>
                    <p>
                      <Editable value={point.body || ""} editable={editable} placeholder="Пояснение" onCommit={(next) => onChange({ points: slide.points.map((p, j) => (j === i ? { ...p, body: next || undefined } : p)) })} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {page}
        </>
      )

    case "two-column":
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            <div className="deck-body">
              <div className="deck-cols">
                {(["left", "right"] as const).map((side) => {
                  const column = slide[side]
                  return (
                    <div className="deck-col deck-panel" key={side}>
                      <h3><Editable value={column.heading} editable={editable} onCommit={(next) => onChange({ [side]: { ...column, heading: next } })} /></h3>
                      <ul>
                        {column.points.map((point, i) => (
                          <li key={i}>
                            <Editable value={point} editable={editable} onCommit={(next) => onChange({ [side]: { ...column, points: column.points.map((p, j) => (j === i ? next : p)).filter(Boolean) } })} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {page}
        </>
      )

    case "stat": {
      const count = slide.stats.length
      const cellWidth = (1136 - 40 * (count - 1)) / count
      const longest = Math.max(...slide.stats.map((stat) => stat.value.length), 2)
      const valueSize = Math.min(count === 1 ? 210 : 136, Math.floor(cellWidth / (longest * 0.6)))
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            <div className="deck-body deck-body--center">
              <div className="deck-stats" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
                {slide.stats.map((stat, i) => (
                  <div className="deck-stat" key={i}>
                    <div className="deck-stat-value" style={{ fontSize: valueSize }}>
                      <Editable value={stat.value} editable={editable} onCommit={(next) => onChange({ stats: slide.stats.map((s, j) => (j === i ? { ...s, value: next } : s)) })} />
                    </div>
                    <div className="deck-stat-label">
                      <Editable value={stat.label} editable={editable} onCommit={(next) => onChange({ stats: slide.stats.map((s, j) => (j === i ? { ...s, label: next } : s)) })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {slide.context ? <div className="deck-context">{text(slide.context, "context")}</div> : null}
          {page}
        </>
      )
    }

    case "quote":
      return (
        <div className="deck-quote-slide" style={{ position: "absolute", inset: 0 }}>
          <div className="deck-copy">
            <div className="deck-quote-mark">“</div>
            <div className="deck-quote-text">{text(slide.quote, "quote", "", "Цитата")}</div>
            {slide.author || editable ? (
              <div className="deck-quote-by">
                <strong>{text(slide.author || "", "author", "", "Автор")}</strong>
                {slide.role || editable ? <span>{text(slide.role || "", "role", "", "Кто это")}</span> : null}
              </div>
            ) : null}
          </div>
          {page}
        </div>
      )

    case "image-text":
      return (
        <div className="deck-imgtext" data-side={slide.imageSide} style={{ position: "absolute", inset: 0 }}>
          <div className="deck-image">
            {slide.imageUrl ? (
              <img src={slide.imageUrl} alt="" />
            ) : (
              <div className="deck-image-empty">Изображение</div>
            )}
          </div>
          <div className="deck-copy">
            <h2 className="deck-h">{text(slide.title, "title")}</h2>
            {slide.body ? <p className="deck-text">{text(slide.body, "body")}</p> : null}
            {slide.points.length ? (
              <ul>
                {slide.points.map((point, i) => (
                  <li key={i}>
                    <Editable value={point} editable={editable} onCommit={(next) => onChange({ points: slide.points.map((p, j) => (j === i ? next : p)).filter(Boolean) })} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {page}
        </div>
      )

    case "cards":
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            <div className="deck-body">
              <div className="deck-cards" style={{ gridTemplateColumns: `repeat(${slide.cards.length}, minmax(0, 1fr))` }}>
                {slide.cards.map((card, i) => (
                  <div className="deck-card deck-panel" key={i}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <h3><Editable value={card.title} editable={editable} onCommit={(next) => onChange({ cards: slide.cards.map((c, j) => (j === i ? { ...c, title: next } : c)) })} /></h3>
                    <p><Editable value={card.body || ""} editable={editable} placeholder="Описание" onCommit={(next) => onChange({ cards: slide.cards.map((c, j) => (j === i ? { ...c, body: next || undefined } : c)) })} /></p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {page}
        </>
      )

    case "timeline":
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            <div className="deck-body deck-body--center">
              <div className="deck-timeline" style={{ gridTemplateColumns: `repeat(${slide.steps.length}, minmax(0, 1fr))` }}>
                {slide.steps.map((step, i) => (
                  <div className="deck-step" key={i}>
                    <div className="deck-step-label"><Editable value={step.label} editable={editable} onCommit={(next) => onChange({ steps: slide.steps.map((s, j) => (j === i ? { ...s, label: next } : s)) })} /></div>
                    <div className="deck-step-dot" />
                    <h3><Editable value={step.title} editable={editable} onCommit={(next) => onChange({ steps: slide.steps.map((s, j) => (j === i ? { ...s, title: next } : s)) })} /></h3>
                    <p><Editable value={step.body || ""} editable={editable} placeholder="Описание" onCommit={(next) => onChange({ steps: slide.steps.map((s, j) => (j === i ? { ...s, body: next || undefined } : s)) })} /></p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {page}
        </>
      )

    case "comparison":
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            <div className="deck-body">
              <table className="deck-table">
                <thead>
                  <tr>
                    <th />
                    {slide.columns.map((column, i) => (
                      <th key={i}><Editable value={column} editable={editable} onCommit={(next) => onChange({ columns: slide.columns.map((c, j) => (j === i ? next : c)) })} /></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slide.rows.map((row, r) => (
                    <tr key={r}>
                      <th><Editable value={row.label} editable={editable} onCommit={(next) => onChange({ rows: slide.rows.map((x, j) => (j === r ? { ...x, label: next } : x)) })} /></th>
                      {row.values.map((value, c) => (
                        <td key={c}>
                          <Editable
                            value={value}
                            editable={editable}
                            onCommit={(next) => onChange({ rows: slide.rows.map((x, j) => (j === r ? { ...x, values: x.values.map((v, k) => (k === c ? next : v)) } : x)) })}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {slide.verdict ? <div className="deck-verdict">{text(slide.verdict, "verdict")}</div> : null}
            </div>
          </div>
          {page}
        </>
      )

    case "chart": {
      const max = Math.max(...slide.data.map((datum) => datum.value), 1)
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            {slide.unit ? <div className="deck-unit">{slide.unit}</div> : null}
            <div className="deck-body">
              <div className="deck-chart" data-takeaway={Boolean(slide.takeaway)}>
                <div className="deck-bars">
                  {slide.data.map((datum, i) => (
                    <div className="deck-bar" key={i}>
                      <div className="deck-bar-value">{formatNumber(datum.value, language)}</div>
                      <div className="deck-bar-fill" style={{ height: `${Math.max(1.5, (Math.max(0, datum.value) / max) * 82)}%`, opacity: 1 - (i === slide.data.length - 1 ? 0 : 0.18) }} />
                      <div className="deck-bar-label">{datum.label}</div>
                    </div>
                  ))}
                </div>
                {slide.takeaway ? <div className="deck-takeaway">{text(slide.takeaway, "takeaway")}</div> : null}
              </div>
            </div>
          </div>
          {page}
        </>
      )
    }

    case "closing":
      return (
        <div className="deck-closing-slide" style={{ position: "absolute", inset: 0 }}>
          <div className="deck-copy">
            <div className="deck-title-rule" />
            <h2 className="deck-h">{text(slide.title, "title")}</h2>
            {slide.subtitle || editable ? <p className="deck-sub" style={{ margin: 0 }}>{text(slide.subtitle || "", "subtitle", "", "Подзаголовок")}</p> : null}
            {slide.contact || editable ? <div className="deck-contact">{text(slide.contact || "", "contact", "", "Контакт")}</div> : null}
          </div>
        </div>
      )
  }
}

let sharedSheet: CSSStyleSheet | null | undefined

/** One parsed stylesheet, adopted by every slide's shadow root. */
function deckSheet() {
  if (sharedSheet !== undefined) return sharedSheet
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(DECK_CSS)
    sharedSheet = sheet
  } catch {
    sharedSheet = null
  }
  return sharedSheet
}

function useShadowRoot() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<ShadowRoot | null>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    const sheet = deckSheet()
    if (sheet && "adoptedStyleSheets" in shadow) {
      shadow.adoptedStyleSheets = [sheet]
    } else if (!shadow.querySelector("style[data-deck]")) {
      const style = document.createElement("style")
      style.setAttribute("data-deck", "")
      style.textContent = DECK_CSS
      shadow.prepend(style)
    }
    setRoot(shadow)
  }, [])

  return [hostRef, root] as const
}

/** The slide at its true size, 1280 × 720. */
export function SlideCanvas({
  slide,
  theme,
  index,
  total,
  editable = false,
  onChange,
  language = "ru",
}: {
  slide: Slide
  theme: ThemeId
  index: number
  total: number
  editable?: boolean
  onChange?: (patch: SlidePatch) => void
  language?: string
}) {
  const [hostRef, root] = useShadowRoot()
  const style = themeCssVariables(deckTheme(theme)) as CSSProperties
  return (
    <div ref={hostRef} className="deck-host" data-layout={slide.layout} data-preserve-brand-color="true">
      {root
        ? createPortal(
            <div className="deck-slide" style={style} data-layout={slide.layout} data-editable={editable}>
              <SlideBody slide={slide} index={index} total={total} editable={editable} onChange={onChange || (() => undefined)} language={language} />
            </div>,
            root,
          )
        : null}
    </div>
  )
}

/** The slide scaled to fill its box at 16:9. */
export function SlideFrame(props: Parameters<typeof SlideCanvas>[0] & { className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => setScale(frame.clientWidth / 1280)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frameRef} className={`deck-frame ${props.className || ""}`}>
      {scale > 0 ? (
        <div className="deck-scale" style={{ transform: `scale(${scale})` }}>
          <SlideCanvas {...props} />
        </div>
      ) : null}
    </div>
  )
}
