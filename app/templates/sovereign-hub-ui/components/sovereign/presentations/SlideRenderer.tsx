"use client"

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { deckTheme, themeCssVariables } from "@/lib/presentations/themes"
import type { Slide, ThemeId } from "@/lib/presentations/types"
import { formatCounted, splitNumber } from "@/lib/presentations/count-up"
import { DECK_ICONS } from "@/lib/presentations/icon-components"
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
 *
 * With `build`, the slide assembles itself instead of simply appearing: the
 * headline is typed out, then the rule, the points, the cards, the numbers
 * (counting up) and the chart bars (growing) take their places one after
 * another. It is how a freshly written slide is shown, so the user watches
 * the deck being made rather than waiting for it.
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

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/** The line a slide is typed out from. */
export function slideHeadline(slide: Slide) {
  return slide.layout === "quote" ? slide.quote : slide.title
}

function itemCount(slide: Slide) {
  switch (slide.layout) {
    case "bullets": return slide.points.length
    case "two-column": return Math.max(slide.left.points.length, slide.right.points.length) + 1
    case "stat": return slide.stats.length
    case "image-text": return slide.points.length + 1
    case "cards": return slide.cards.length
    case "timeline": return slide.steps.length + 1
    case "comparison": return slide.rows.length + 1
    case "chart": return slide.data.length
    case "features": return slide.items.length
    case "process": return slide.steps.length + 1
    case "gallery": return slide.items.length + 1
    case "hero": return 2
    default: return 2
  }
}

/**
 * How long a slide takes to assemble: `type` is the headline being typed,
 * `total` is until the last element has settled. The studio uses `total` to
 * know when to move on to the next slide.
 */
export function slideBuildTiming(slide: Slide, pace = 1) {
  const headline = slideHeadline(slide) || ""
  const type = Math.round(Math.min(1300, 260 + headline.length * 20))
  const total = type + 750 + Math.min(itemCount(slide), 8) * 160
  return { type: Math.round(type * pace), total: Math.round(total * pace) }
}

/**
 * Text that writes itself. The part not yet written is kept in the layout,
 * invisible, so the headline wraps exactly where it will end up and nothing
 * below it jumps while it is being typed.
 */
function TypeText({ value, duration }: { value: string; duration: number }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value.length)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / Math.max(1, duration))
      setShown(Math.round(progress * value.length))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  const done = shown >= value.length
  return (
    <span aria-label={value}>
      <span aria-hidden="true">{value.slice(0, shown)}</span>
      <span className="deck-caret" data-done={done} aria-hidden="true" />
      <span aria-hidden="true" style={{ visibility: "hidden" }}>{value.slice(shown)}</span>
    </span>
  )
}

/**
 * "≈3 200", "40%", "$1.2M": the number counts up from zero and whatever
 * surrounds it — a sign, a unit, a currency — stays put. Anything that is not
 * a number is shown as it is.
 */
function CountUp({ value, delay, duration = 900 }: { value: string; delay: number; duration?: number }) {
  const [text, setText] = useState(() => {
    const parts = splitNumber(value)
    return parts ? formatCounted(parts, 0) : value
  })

  useEffect(() => {
    const parts = splitNumber(value)
    if (!parts || prefersReducedMotion()) {
      setText(value)
      return
    }
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      // The last frame is the original text, exactly as written.
      setText(progress < 1 ? formatCounted(parts, parts.target * eased) : value)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(tick)
    }, delay)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [value, delay, duration])

  return <span>{text}</span>
}

function formatNumber(value: number, language: string) {
  try {
    return new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 1 }).format(value)
  } catch {
    return String(value)
  }
}

/** Who took the photo, small in its corner, as the licence asks. */
function Credit({ text }: { text?: string }) {
  return text ? <span className="deck-credit">{text}</span> : null
}

/** The picture of a slide, or a quiet placeholder until one arrives. */
function Photo({ url, credit, className = "deck-image" }: { url?: string; credit?: string; className?: string }) {
  return (
    <div className={className} data-empty={!url}>
      {url ? <img src={url} alt="" loading="eager" decoding="async" /> : <div className="deck-image-empty" />}
      <Credit text={url ? credit : undefined} />
    </div>
  )
}

function SlideBody({
  slide,
  index,
  total,
  editable,
  onChange,
  language,
  build,
  typeMs,
  pace,
}: {
  slide: Slide
  index: number
  total: number
  editable: boolean
  onChange: (patch: SlidePatch) => void
  language: string
  build: boolean
  typeMs: number
  pace: number
}) {
  const edit = (field: string) => (next: string) => onChange({ [field]: next })
  const text = (value: string, field: string, className = "", placeholder = "", block = false) =>
    build && (field === "title" || field === "quote") ? (
      <TypeText value={value} duration={typeMs} />
    ) : (
      <Editable value={value} editable={editable} onCommit={edit(field)} className={className} placeholder={placeholder} block={block} />
    )
  const page = slide.layout === "title" || slide.layout === "closing" || slide.layout === "hero" ? null : <div className="deck-page">{index + 1} / {total}</div>

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
          {slide.imageUrl ? <Photo url={slide.imageUrl} credit={slide.imageCredit} /> : null}
        </div>
      )

    case "hero":
      return (
        <div className="deck-hero" data-image={Boolean(slide.imageUrl)} style={{ position: "absolute", inset: 0 }}>
          <Photo url={slide.imageUrl} credit={slide.imageCredit} className="deck-hero-photo" />
          <div className="deck-hero-shade" />
          <div className="deck-copy">
            {slide.kicker || editable ? <div className="deck-kicker">{text(slide.kicker || "", "kicker", "", "Надзаголовок")}</div> : null}
            <h1 className="deck-h">{text(slide.title, "title", "", "Заголовок")}</h1>
            {slide.subtitle || editable ? <p className="deck-sub">{text(slide.subtitle || "", "subtitle", "", "Подзаголовок")}</p> : null}
          </div>
        </div>
      )

    case "features": {
      const count = slide.items.length
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            {slide.intro ? <p className="deck-intro">{text(slide.intro, "intro")}</p> : null}
            <div className="deck-body deck-body--center">
              <div className="deck-features" data-count={count}>
                {slide.items.map((item, i) => {
                  const Icon = DECK_ICONS[item.icon] || DECK_ICONS.sparkles
                  return (
                    <div className="deck-feature" key={i}>
                      <span className="deck-feature-icon"><Icon strokeWidth={1.8} /></span>
                      <div>
                        <h3><Editable value={item.title} editable={editable} onCommit={(next) => onChange({ items: slide.items.map((x, j) => (j === i ? { ...x, title: next } : x)) })} /></h3>
                        <p><Editable value={item.body || ""} editable={editable} placeholder="Описание" onCommit={(next) => onChange({ items: slide.items.map((x, j) => (j === i ? { ...x, body: next || undefined } : x)) })} /></p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {page}
        </>
      )
    }

    case "process":
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            <div className="deck-body deck-body--center">
              <div className="deck-process" data-count={slide.steps.length}>
                {slide.steps.map((step, i) => (
                  <div className="deck-process-step" key={i}>
                    <div className="deck-process-arrow">
                      <b>{String(i + 1).padStart(2, "0")}</b>
                      <h3><Editable value={step.title} editable={editable} onCommit={(next) => onChange({ steps: slide.steps.map((x, j) => (j === i ? { ...x, title: next } : x)) })} /></h3>
                    </div>
                    <p><Editable value={step.body || ""} editable={editable} placeholder="Описание" onCommit={(next) => onChange({ steps: slide.steps.map((x, j) => (j === i ? { ...x, body: next || undefined } : x)) })} /></p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {page}
        </>
      )

    case "gallery":
      return (
        <>
          <div className="deck-pad">
            <div className="deck-head"><h2 className="deck-h">{text(slide.title, "title")}</h2></div>
            {slide.intro ? <p className="deck-intro">{text(slide.intro, "intro")}</p> : null}
            <div className="deck-body">
              <div className="deck-gallery" data-count={slide.items.length}>
                {slide.items.map((item, i) => (
                  <figure className="deck-gallery-item" key={i}>
                    <Photo url={item.image?.url} credit={item.image?.credit} className="deck-gallery-photo" />
                    <figcaption><Editable value={item.caption} editable={editable} onCommit={(next) => onChange({ items: slide.items.map((x, j) => (j === i ? { ...x, caption: next } : x)) })} /></figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
          {page}
        </>
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
                      {build ? (
                        <CountUp value={stat.value} delay={typeMs + ((i + 1) * 160 + 150) * pace} />
                      ) : (
                        <Editable value={stat.value} editable={editable} onCommit={(next) => onChange({ stats: slide.stats.map((s, j) => (j === i ? { ...s, value: next } : s)) })} />
                      )}
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
          <Photo url={slide.imageUrl} credit={slide.imageCredit} />
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
  build = false,
  pace = 1,
}: {
  slide: Slide
  theme: ThemeId
  index: number
  total: number
  editable?: boolean
  onChange?: (patch: SlidePatch) => void
  language?: string
  /** Assemble the slide on screen instead of showing it finished. */
  build?: boolean
  /** Speed of the assembly: 1 is normal, 0.5 is twice as fast. */
  pace?: number
}) {
  const [hostRef, root] = useShadowRoot()
  const typeMs = build ? slideBuildTiming(slide, pace).type : 0
  // --t is the headline's typing time before pace; the stylesheet applies --k.
  const style = {
    ...themeCssVariables(deckTheme(theme)),
    ...(build ? { "--t": `${Math.round(typeMs / pace)}ms`, "--k": String(pace) } : {}),
  } as CSSProperties
  return (
    <div ref={hostRef} className="deck-host" data-layout={slide.layout} data-preserve-brand-color="true">
      {root
        ? createPortal(
            <div className="deck-slide" style={style} data-layout={slide.layout} data-dark={deckTheme(theme).dark} data-editable={editable && !build} data-build={build}>
              {/* Soft shapes of light behind the content — what keeps a text
                  slide from looking like a document. Drawn per layout in CSS. */}
              <div className="deck-deco" aria-hidden="true"><i /><b /></div>
              <SlideBody
                slide={slide}
                index={index}
                total={total}
                editable={editable && !build}
                onChange={onChange || (() => undefined)}
                language={language}
                build={build}
                typeMs={typeMs}
                pace={pace}
              />
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
