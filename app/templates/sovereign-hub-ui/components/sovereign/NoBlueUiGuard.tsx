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

function scanSubtree(root: Element) {
  neutralizeElement(root)
  root.querySelectorAll("*").forEach(neutralizeElement)
}

export function NoBlueUiGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const body = document.body
    if (!body) return

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

        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) schedule(node)
        })
      }
    })

    observer.observe(body, {
      subtree: true,
      childList: true,
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
