"use client"

import { useEffect } from "react"

const BRAND_SAFE_SELECTOR = [
  "img",
  "picture",
  "video",
  "canvas",
  "[data-preserve-brand-color='true']",
  "[data-brand-color]",
  "[data-brand-icon]",
  ".plugin-logo",
  ".sma-auth-icon",
  "svg[aria-label='Uber']",
].join(",")

const COLOR_PROPERTIES = [
  ["backgroundColor", "background-color", "#1b1b1d"],
  ["borderTopColor", "border-top-color", "rgba(255,255,255,.12)"],
  ["borderRightColor", "border-right-color", "rgba(255,255,255,.12)"],
  ["borderBottomColor", "border-bottom-color", "rgba(255,255,255,.12)"],
  ["borderLeftColor", "border-left-color", "rgba(255,255,255,.12)"],
  ["outlineColor", "outline-color", "rgba(255,255,255,.44)"],
  ["color", "color", "#b9b9bd"],
  ["caretColor", "caret-color", "#f0f0f2"],
] as const

type Rgba = { r: number; g: number; b: number; a: number }

const RICH_ANSWER_STYLE_ID = "malik-rich-answer-runtime-style"
const ASSISTANT_CARD_SELECTOR = ".malik-message-card-assistant"

const RICH_ANSWER_CSS = `
  .malik-message-card-assistant {
    color: #f4f4f5 !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    font-size: 16px !important;
    font-weight: 450 !important;
    line-height: 1.72 !important;
    letter-spacing: -0.008em !important;
    white-space: normal !important;
  }

  .malik-message-card-assistant .malik-response-model {
    margin-bottom: 15px !important;
    color: #8d8d93 !important;
    font-size: 12px !important;
    font-weight: 650 !important;
    letter-spacing: 0 !important;
  }

  .malik-rich-answer {
    display: block;
    width: 100%;
    max-width: 100%;
    color: #f4f4f5;
    overflow-wrap: anywhere;
  }

  .malik-rich-answer > :first-child { margin-top: 0 !important; }
  .malik-rich-answer > :last-child { margin-bottom: 0 !important; }

  .malik-rich-answer__paragraph {
    margin: 0 0 15px;
    color: #f1f1f2;
    font-size: 16px;
    font-weight: 440;
    line-height: 1.72;
  }

  .malik-rich-answer__heading {
    margin: 24px 0 10px;
    color: #ffffff;
    font-size: 18px;
    font-weight: 760;
    line-height: 1.35;
    letter-spacing: -0.018em;
  }

  .malik-rich-answer__heading.is-large {
    margin-top: 26px;
    font-size: 20px;
  }

  .malik-rich-answer__numbered-section {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 8px;
    margin: 23px 0 10px;
    color: #ffffff;
    font-size: 17px;
    font-weight: 740;
    line-height: 1.45;
  }

  .malik-rich-answer__number {
    color: #a8a8ad;
    font-variant-numeric: tabular-nums;
  }

  .malik-rich-answer__list {
    display: grid;
    gap: 7px;
    margin: 7px 0 17px;
    padding: 0;
    list-style: none;
  }

  .malik-rich-answer__list-item {
    position: relative;
    padding-left: 21px;
    color: #eeeeef;
    line-height: 1.68;
  }

  .malik-rich-answer__list-item::before {
    content: "";
    position: absolute;
    left: 4px;
    top: .72em;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: #a5a5aa;
  }

  .malik-rich-answer__quote {
    margin: 15px 0;
    padding: 2px 0 2px 15px;
    border-left: 2px solid #5b5b60;
    color: #c8c8cc;
  }

  .malik-rich-answer__pipe-grid {
    display: grid;
    gap: 6px;
    margin: 10px 0 18px;
  }

  .malik-rich-answer__pipe-row {
    padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,.075);
    color: #ededee;
    line-height: 1.58;
  }

  .malik-rich-answer strong {
    color: #ffffff !important;
    font-weight: 760 !important;
  }

  .malik-rich-answer code {
    border: 1px solid rgba(255,255,255,.10);
    border-radius: 6px;
    background: #171719;
    padding: 2px 6px;
    color: #f2f2f3;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: .9em;
  }

  .malik-rich-answer a {
    color: #f5f5f5 !important;
    text-decoration: underline;
    text-decoration-color: #626267;
    text-underline-offset: 3px;
  }

  .malik-rich-answer__rule {
    height: 1px;
    margin: 20px 0;
    border: 0;
    background: #26262a;
  }

  .malik-source-inline {
    margin-top: 22px !important;
    padding-top: 14px !important;
    border-top: 1px solid rgba(255,255,255,.085) !important;
  }

  .malik-source-inline__links {
    color: #b6b6ba !important;
    font-size: 13px !important;
    line-height: 1.65 !important;
  }

  .malik-source-inline__links strong { color: #dedee1 !important; }
  .malik-source-inline__links a { color: #d7d7da !important; }

  .malik-model-unavailable-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    width: min(100%, 560px);
    margin-top: 4px;
    padding: 17px 18px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 16px;
    background: #101011;
    color: #f4f4f5;
  }

  .malik-model-unavailable-card__icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 10px;
    background: #19191b;
    color: #b8b8bd;
    font-size: 17px;
    font-weight: 800;
  }

  .malik-model-unavailable-card__body { min-width: 0; }

  .malik-model-unavailable-card__title {
    display: block;
    margin: 0;
    color: #ffffff !important;
    font-size: 15.5px;
    font-weight: 760 !important;
    line-height: 1.35;
  }

  .malik-model-unavailable-card__text {
    margin: 6px 0 0;
    color: #aaaab0;
    font-size: 13.5px;
    font-weight: 450;
    line-height: 1.55;
  }

  .malik-model-unavailable-card__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    margin-top: 13px;
    padding: 0 13px;
    border: 1px solid #e6e6e8;
    border-radius: 10px;
    background: #f1f1f2;
    color: #0b0b0c !important;
    font-size: 13px;
    font-weight: 720;
    cursor: pointer;
    transition: transform .15s ease, background .15s ease;
  }

  .malik-model-unavailable-card__button:hover { background: #ffffff; }
  .malik-model-unavailable-card__button:active { transform: translateY(1px); }

  @media (max-width: 640px) {
    .malik-message-card-assistant,
    .malik-rich-answer__paragraph { font-size: 15.5px !important; }
    .malik-rich-answer__heading { font-size: 17px; }
    .malik-rich-answer__heading.is-large { font-size: 18.5px; }
    .malik-model-unavailable-card { padding: 15px; border-radius: 15px; }
  }
`

function parseCssColor(value: string): Rgba | null {
  const text = String(value || "").trim().toLowerCase()
  if (!text || text === "transparent" || text === "currentcolor") return null

  const rgb = text.match(
    /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*[,/]\s*|\s+\/\s*)?([\d.]*)\s*\)$/,
  )
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] ? Number(rgb[4]) : 1,
    }
  }

  const hex = text.match(/^#([0-9a-f]{3,8})$/i)
  if (!hex) return null

  let raw = hex[1]
  if (raw.length === 3 || raw.length === 4) {
    raw = raw
      .split("")
      .map((char) => char + char)
      .join("")
  }
  if (raw.length !== 6 && raw.length !== 8) return null

  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
    a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
  }
}

function rgbToHueAndSaturation({ r, g, b }: Rgba) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let hue = 0
  if (delta !== 0) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2)
    else hue = 60 * ((rn - gn) / delta + 4)
  }
  if (hue < 0) hue += 360

  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))

  return { hue, saturation }
}

function isForbiddenBlue(value: string) {
  const rgba = parseCssColor(value)
  if (!rgba || rgba.a <= 0.04) return false

  const { hue, saturation } = rgbToHueAndSaturation(rgba)

  // Cyan -> sky -> blue -> indigo. Low-saturation neutral grays are excluded.
  return hue >= 178 && hue <= 250 && saturation >= 0.12
}

function containsForbiddenBlue(value: string) {
  const text = String(value || "")
  if (!text || text === "none") return false

  const matches = text.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g) || []
  return matches.some(isForbiddenBlue)
}

function isBrandSafe(element: Element) {
  return Boolean(element.closest(BRAND_SAFE_SELECTOR))
}

function neutralizeElement(element: Element) {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return
  if (isBrandSafe(element)) return

  const computed = window.getComputedStyle(element)

  for (const [computedKey, cssKey, replacement] of COLOR_PROPERTIES) {
    const value = computed[computedKey]
    if (isForbiddenBlue(value)) {
      element.style.setProperty(cssKey, replacement, "important")
    }
  }

  if (containsForbiddenBlue(computed.backgroundImage)) {
    element.style.setProperty("background-image", "none", "important")
    if (
      computed.backgroundColor === "rgba(0, 0, 0, 0)" ||
      computed.backgroundColor === "transparent"
    ) {
      element.style.setProperty("background-color", "#1b1b1d", "important")
    }
  }

  if (containsForbiddenBlue(computed.boxShadow)) {
    element.style.setProperty("box-shadow", "none", "important")
  }

  if (containsForbiddenBlue(computed.textShadow)) {
    element.style.setProperty("text-shadow", "none", "important")
  }

  const accentColor = computed.getPropertyValue("accent-color")
  if (isForbiddenBlue(accentColor)) {
    element.style.setProperty("accent-color", "#85858a", "important")
  }

  if (element instanceof SVGElement) {
    const fill = computed.getPropertyValue("fill")
    const stroke = computed.getPropertyValue("stroke")
    if (isForbiddenBlue(fill)) {
      element.style.setProperty("fill", "#a1a1a6", "important")
    }
    if (isForbiddenBlue(stroke)) {
      element.style.setProperty("stroke", "#a1a1a6", "important")
    }
  }
}

function directAssistantText(card: Element) {
  return Array.from(card.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join("")
    .trim()
}

function isCompletedAssistantCard(card: Element) {
  const row = card.closest("[data-malik-message='assistant']")
  if (!row) return false
  return !row.querySelector(".malik-ai-avatar.is-working")
}

function appendInlineFormatting(target: HTMLElement, raw: string) {
  const text = String(raw || "")
  const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)]+)/g
  let cursor = 0

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor) target.append(document.createTextNode(text.slice(cursor, index)))

    const token = match[0]
    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      const strong = document.createElement("strong")
      strong.textContent = token.slice(2, -2)
      target.append(strong)
    } else if (token.startsWith("`") && token.endsWith("`")) {
      const code = document.createElement("code")
      code.textContent = token.slice(1, -1)
      target.append(code)
    } else {
      const markdownLink = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
      const anchor = document.createElement("a")
      anchor.target = "_blank"
      anchor.rel = "noreferrer"
      anchor.href = markdownLink ? markdownLink[2] : token
      anchor.textContent = markdownLink ? markdownLink[1] : token.replace(/[.,;:!?]+$/, "")
      target.append(anchor)
      const tail = markdownLink ? "" : token.slice(anchor.textContent.length)
      if (tail) target.append(document.createTextNode(tail))
    }

    cursor = index + token.length
  }

  if (cursor < text.length) target.append(document.createTextNode(text.slice(cursor)))
}

function richParagraph(text: string) {
  const paragraph = document.createElement("p")
  paragraph.className = "malik-rich-answer__paragraph"
  appendInlineFormatting(paragraph, text.trim())
  return paragraph
}

function richHeading(text: string, large = false) {
  const heading = document.createElement("h3")
  heading.className = `malik-rich-answer__heading${large ? " is-large" : ""}`
  appendInlineFormatting(heading, text.trim())
  return heading
}

function makePipeGrid(line: string) {
  const parts = line
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 3) return null

  const grid = document.createElement("div")
  grid.className = "malik-rich-answer__pipe-grid"
  for (const part of parts) {
    const row = document.createElement("div")
    row.className = "malik-rich-answer__pipe-row"
    appendInlineFormatting(row, part)
    grid.append(row)
  }
  return grid
}

function buildRichAnswer(text: string) {
  const wrapper = document.createElement("div")
  wrapper.className = "malik-rich-answer"
  wrapper.dataset.malikRichAnswer = "1"
  wrapper.dataset.malikSourceLength = String(text.length)

  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  const lines = normalized.split("\n")
  let paragraphBuffer: string[] = []
  let list: HTMLUListElement | null = null

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return
    const value = paragraphBuffer.join(" ").replace(/\s+/g, " ").trim()
    paragraphBuffer = []
    if (!value) return
    const pipe = makePipeGrid(value)
    wrapper.append(pipe || richParagraph(value))
  }

  const flushList = () => {
    list = null
  }

  for (const sourceLine of lines) {
    const line = sourceLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    if (/^(?:---+|___+|\*\*\*+)$/.test(line)) {
      flushParagraph()
      flushList()
      const rule = document.createElement("hr")
      rule.className = "malik-rich-answer__rule"
      wrapper.append(rule)
      continue
    }

    const markdownHeading = line.match(/^(#{1,4})\s+(.+)$/)
    if (markdownHeading) {
      flushParagraph()
      flushList()
      wrapper.append(richHeading(markdownHeading[2], markdownHeading[1].length <= 2))
      continue
    }

    const numberedSection = line.match(/^(\d{1,2})[.)]\s+(.+)$/)
    if (numberedSection) {
      flushParagraph()
      flushList()
      const section = document.createElement("div")
      section.className = "malik-rich-answer__numbered-section"
      const number = document.createElement("span")
      number.className = "malik-rich-answer__number"
      number.textContent = `${numberedSection[1]}.`
      const copy = document.createElement("span")
      appendInlineFormatting(copy, numberedSection[2])
      section.append(number, copy)
      wrapper.append(section)
      continue
    }

    const bullet = line.match(/^[-•]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      if (!list) {
        list = document.createElement("ul")
        list.className = "malik-rich-answer__list"
        wrapper.append(list)
      }
      const item = document.createElement("li")
      item.className = "malik-rich-answer__list-item"
      appendInlineFormatting(item, bullet[1])
      list.append(item)
      continue
    }

    const quote = line.match(/^>\s*(.+)$/)
    if (quote) {
      flushParagraph()
      flushList()
      const block = document.createElement("div")
      block.className = "malik-rich-answer__quote"
      appendInlineFormatting(block, quote[1])
      wrapper.append(block)
      continue
    }

    if (/^\*\*[^*]{2,100}:?\*\*$/.test(line) || /^[A-ZА-ЯЁӘІҢҒҮҰҚӨҺ][^.!?]{2,70}:$/.test(line)) {
      flushParagraph()
      flushList()
      wrapper.append(richHeading(line.replace(/^\*\*|\*\*$/g, ""), false))
      continue
    }

    if ((line.match(/\|/g) || []).length >= 2) {
      flushParagraph()
      flushList()
      const pipe = makePipeGrid(line)
      if (pipe) wrapper.append(pipe)
      else paragraphBuffer.push(line)
      continue
    }

    flushList()
    paragraphBuffer.push(line)
  }

  flushParagraph()
  return wrapper
}

function isUnavailableModelMessage(text: string) {
  const value = String(text || "").trim().toLowerCase()
  if (!value) return false
  return /временно\s+недоступ|модель\s+недоступ|temporar(?:ily)?\s+unavailable|model\s+(?:is\s+)?unavailable|provider\s+(?:is\s+)?unavailable/.test(value)
}

function buildUnavailableCard(card: Element, originalText: string) {
  const box = document.createElement("div")
  box.className = "malik-model-unavailable-card"
  box.dataset.malikModelUnavailable = "1"

  const icon = document.createElement("span")
  icon.className = "malik-model-unavailable-card__icon"
  icon.textContent = "!"
  icon.setAttribute("aria-hidden", "true")

  const body = document.createElement("div")
  body.className = "malik-model-unavailable-card__body"

  const title = document.createElement("strong")
  title.className = "malik-model-unavailable-card__title"
  title.textContent = "Модель временно недоступна"

  const description = document.createElement("p")
  description.className = "malik-model-unavailable-card__text"
  const modelLabel = card.querySelector(".malik-response-model")?.textContent?.trim()
  description.textContent = modelLabel
    ? `${modelLabel} сейчас не отвечает. Выберите другую модель и продолжите этот чат.`
    : "Эта модель сейчас не отвечает. Выберите другую модель и продолжите этот чат."

  const button = document.createElement("button")
  button.type = "button"
  button.className = "malik-model-unavailable-card__button"
  button.textContent = "Выбрать другую модель"
  button.setAttribute("aria-label", "Выбрать другую модель Malik AI")
  button.onclick = () => {
    const chat = card.closest(".malik-chat-fullwidth") || document
    const trigger = chat.querySelector<HTMLButtonElement>(".malik-composer-panel .malik-model-selector__trigger")
      || document.querySelector<HTMLButtonElement>(".malik-model-selector__trigger")
    if (!trigger) return
    trigger.scrollIntoView({ block: "nearest", behavior: "smooth" })
    window.setTimeout(() => trigger.click(), 80)
  }

  body.append(title, description, button)
  box.append(icon, body)
  box.title = originalText
  return box
}

function enhanceAssistantCard(card: Element) {
  if (!(card instanceof HTMLElement)) return
  if (!isCompletedAssistantCard(card)) return

  const directText = directAssistantText(card)
  if (!directText) return

  const previousRich = card.querySelector(":scope > .malik-rich-answer, :scope > .malik-model-unavailable-card")
  if (previousRich) previousRich.remove()

  Array.from(card.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) node.remove()
  })

  const rendered = isUnavailableModelMessage(directText)
    ? buildUnavailableCard(card, directText)
    : buildRichAnswer(directText)

  const sourceDeck = card.querySelector(":scope > .malik-source-inline")
  if (sourceDeck) card.insertBefore(rendered, sourceDeck)
  else card.append(rendered)
}

function enhanceAssistantCards(root: Element) {
  if (root.matches(ASSISTANT_CARD_SELECTOR)) enhanceAssistantCard(root)
  root.querySelectorAll(ASSISTANT_CARD_SELECTOR).forEach(enhanceAssistantCard)
}

function scanSubtree(root: Element) {
  neutralizeElement(root)
  root.querySelectorAll("*").forEach(neutralizeElement)
  enhanceAssistantCards(root)
}

export function NoBlueUiGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const body = document.body
    if (!body) return

    let style = document.getElementById(RICH_ANSWER_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement("style")
      style.id = RICH_ANSWER_STYLE_ID
      style.textContent = RICH_ANSWER_CSS
      document.head.append(style)
    }

    scanSubtree(body)

    const pending = new Set<Element>()
    let frame = 0

    const flush = () => {
      frame = 0
      const items = Array.from(pending)
      pending.clear()
      for (const element of items) scanSubtree(element)
    }

    const schedule = (element: Element) => {
      pending.add(element)
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          schedule(mutation.target)
          continue
        }

        if (mutation.type === "characterData") {
          const parent = mutation.target.parentElement
          if (parent) schedule(parent)
          continue
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) schedule(node)
          else if (node.parentElement) schedule(node.parentElement)
        })
      }
    })

    observer.observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state", "aria-selected", "aria-pressed"],
    })

    const rescan = () => schedule(body)
    window.addEventListener("pageshow", rescan)
    window.addEventListener("resize", rescan)

    return () => {
      observer.disconnect()
      window.removeEventListener("pageshow", rescan)
      window.removeEventListener("resize", rescan)
      if (frame) window.cancelAnimationFrame(frame)
      pending.clear()
    }
  }, [])

  return null
}
