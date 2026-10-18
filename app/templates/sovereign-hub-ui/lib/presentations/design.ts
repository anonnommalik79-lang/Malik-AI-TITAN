import type { DeckTheme } from "@/lib/presentations/themes"
import type { Slide, SlideLayout } from "@/lib/presentations/types"

/**
 * The design engine: everything about a slide's look that is not its text.
 *
 * Background art is one SVG per slide, 1280 × 720 — the canvas every renderer
 * shares. The screen shows it as the slide's background image; the PowerPoint
 * export rasterises the very same SVG into the slide background. That is how
 * the downloaded file can look like the deck on screen instead of a flat
 * colour with the text on it.
 *
 * The art is built from gradients, patterns and paths only — no filters, no
 * text, no external images — so it renders identically in a browser, on a
 * canvas and in librsvg (sharp) on the server, and costs almost nothing to
 * draw in a thumbnail.
 *
 * Each slide's art is seeded by its position in the deck, so no two slides
 * repeat the same composition, and covers, chapter breaks and closing slides
 * get a stronger treatment than the slides that carry dense content.
 *
 * Photo geometry lives here too: where a cover or a photo slide puts its
 * picture and how the picture is cut (a diagonal, a rounded frame, an arch,
 * an editorial half-page). The screen and PowerPoint read the same numbers.
 */

export const CANVAS_W = 1280
export const CANVAS_H = 720

/* ------------------------------------------------------------------ helpers */

/** A small deterministic random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const n = (value: number) => (Math.round(value * 100) / 100).toString()
const o = (value: number) => (Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000).toString()

/** Blends two six-digit hex colours. */
export function mixHex(a: string, b: string, t: number) {
  const pa = [0, 2, 4].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [0, 2, 4].map((i) => parseInt(b.slice(i, i + 2), 16))
  return pa.map((value, i) => Math.round(value + (pb[i] - value) * t).toString(16).padStart(2, "0")).join("").toUpperCase()
}

const STRONG: ReadonlySet<SlideLayout> = new Set(["title", "hero", "section", "closing", "quote"])

type Art = { defs: string[]; body: string[]; id: (name: string) => string }

function art(prefix: string): Art {
  let counter = 0
  return { defs: [], body: [], id: (name) => `${prefix}${name}${(counter += 1)}` }
}

/** A soft elliptical pool of colour: the building block of most backdrops. */
function pool(a: Art, cx: number, cy: number, rx: number, ry: number, color: string, opacity: number, rotate = 0) {
  const id = a.id("p")
  a.defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="#${color}" stop-opacity="${o(opacity)}"/><stop offset=".55" stop-color="#${color}" stop-opacity="${o(opacity * 0.42)}"/><stop offset="1" stop-color="#${color}" stop-opacity="0"/></radialGradient>`)
  a.body.push(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${id})"${rotate ? ` transform="rotate(${n(rotate)} ${n(cx)} ${n(cy)})"` : ""}/>`)
}

function ring(a: Art, cx: number, cy: number, r: number, color: string, opacity: number, width = 1.5) {
  a.body.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="#${color}" stroke-opacity="${o(opacity)}" stroke-width="${n(width)}"/>`)
}

/** The koshkar muiz — the ram's-horn motif of Kazakh ornament — in a 64 × 32 box. */
const KOSHKAR = "M32 31V18C32 6 50 4 54 14C57 22 48 26 44 21C41 17 46 13 49 16M32 18C32 6 14 4 10 14C7 22 16 26 20 21C23 17 18 13 15 16M32 31l4-4-4-4-4 4z"

/* ---------------------------------------------------------------- backdrops */

type Painter = (a: Art, theme: DeckTheme, ctx: { layout: SlideLayout; index: number; strong: boolean; r: () => number }) => void

const corners = [[1180, -40], [80, 760], [-60, 40], [1260, 720]] as const

const PAINTERS: Record<DeckTheme["backdrop"], Painter> = {
  glow(a, t, { layout, index, strong }) {
    const k = t.dark ? 1 : 0.55
    if (layout === "closing") {
      pool(a, 640, -60, 760, 520, t.accent, 0.26 * k)
      a.body.push(`<ellipse cx="640" cy="880" rx="660" ry="380" fill="none" stroke="#${t.accent}" stroke-opacity="${o(0.2 * k)}" stroke-width="2"/>`)
      return
    }
    if (layout === "section") {
      pool(a, 1120, 600, 620, 620, t.accent, 0.2 * k)
      ring(a, 1150, 660, 310, t.accent, 0.3 * k, 2)
      ring(a, 1150, 660, 236, t.accent, 0.12 * k, 1.5)
      return
    }
    const [x, y] = layout === "title" ? [180, 120] : corners[index % 4]
    pool(a, x, y, strong ? 700 : 620, strong ? 700 : 620, t.accent, (strong ? 0.3 : 0.22) * k)
    const [x2, y2] = corners[(index + 2) % 4]
    pool(a, x2, y2, 440, 440, t.accent2, 0.16 * k)
  },

  dots(a, t, { layout, index, strong }) {
    const dots = a.id("d")
    const fade = a.id("f")
    const mask = a.id("m")
    a.defs.push(`<pattern id="${dots}" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.7" fill="#${t.text}" fill-opacity=".34"/></pattern>`)
    const [cx, cy] = layout === "title" ? [1100, 120] : index % 2 ? [120, 640] : [1160, 90]
    a.defs.push(`<radialGradient id="${fade}" cx="${n(cx / 1280)}" cy="${n(cy / 720)}" r="${strong ? ".7" : ".5"}" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>`)
    a.defs.push(`<mask id="${mask}"><rect width="1280" height="720" fill="url(#${fade})"/></mask>`)
    a.body.push(`<rect width="1280" height="720" fill="url(#${dots})" mask="url(#${mask})"/>`)
    if (layout === "section") a.body.push(`<circle cx="1280" cy="720" r="300" fill="#${t.accent}"/>`)
    if (layout === "closing") a.body.push(`<rect x="72" y="96" width="1136" height="1.5" fill="#${t.text}" fill-opacity=".8"/><rect x="72" y="624" width="1136" height="1.5" fill="#${t.text}" fill-opacity=".8"/>`)
  },

  streaks(a, t, { index, strong, r }) {
    const grad = a.id("s")
    a.defs.push(`<linearGradient id="${grad}" x1="0" x2="1"><stop offset="0" stop-color="#${t.accent}" stop-opacity="0"/><stop offset=".55" stop-color="#${t.accent}" stop-opacity="${o(strong ? 0.5 : 0.3)}"/><stop offset="1" stop-color="#${t.accent2}" stop-opacity="0"/></linearGradient>`)
    const shift = (index % 3) * 70
    const bands = [[520 + shift, 120], [660 + shift, 46], [740 + shift, 14], [790 + shift, 4]]
    a.body.push(`<g transform="rotate(-24 640 360)">${bands.map(([y, h]) => `<rect x="-300" y="${n(y)}" width="1900" height="${n(h)}" fill="url(#${grad})"/>`).join("")}</g>`)
    pool(a, 1120 - r() * 160, -20, 520, 420, t.accent2, strong ? 0.22 : 0.14)
    pool(a, 60, 760, 520, 420, t.accent, strong ? 0.2 : 0.12)
  },

  organic(a, t, { index, strong }) {
    const flip = index % 2 ? -1 : 1
    pool(a, flip > 0 ? 1180 : 100, 40, 520, 210, t.accent, strong ? 0.26 : 0.17, flip * -32)
    pool(a, flip > 0 ? 1040 : 240, 150, 360, 140, t.accent2, strong ? 0.2 : 0.12, flip * -14)
    pool(a, flip > 0 ? 60 : 1220, 700, 560, 220, t.accent2, strong ? 0.2 : 0.12, flip * 24)
    a.body.push(`<path d="${flip > 0 ? "M-40 610C300 480 520 760 900 560S1300 380 1340 470" : "M1320 120C980 230 760 -20 380 170S-20 340 -60 260"}" fill="none" stroke="#${t.accent}" stroke-opacity="${o(strong ? 0.3 : 0.18)}" stroke-width="1.6"/>`)
  },

  sun(a, t, { layout, index, strong }) {
    const sun = a.id("sun")
    a.defs.push(`<linearGradient id="${sun}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#${t.accent2}"/><stop offset="1" stop-color="#${t.accent}"/></linearGradient>`)
    const spots = [[1090, 160], [190, 560], [1130, 590]]
    const [x, y] = layout === "title" ? [210, 150] : spots[index % spots.length]
    const r = strong ? 260 : 190
    a.body.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${sun})" fill-opacity="${o(strong ? 0.2 : 0.13)}"/>`)
    ring(a, x, y, r + 46, t.accent, strong ? 0.22 : 0.14, 1.4)
    for (let i = 0; i < 3; i += 1) a.body.push(`<rect x="${x - r - 90}" y="${y + r * 0.35 + i * 18}" width="${(r + 90) * 2}" height="1.2" fill="#${t.muted}" fill-opacity="${o(0.22 - i * 0.05)}"/>`)
  },

  rings(a, t, { layout, index, strong, r }) {
    const [x, y] = layout === "title" ? [120, 680] : corners[index % 4]
    pool(a, x, y, 640, 640, t.accent2, strong ? 0.3 : 0.2)
    ;[260, 340, 420, 500, 580].forEach((radius, i) => ring(a, x, y, radius, t.accent, (strong ? 0.34 : 0.22) - i * 0.05, 1.2))
    for (let i = 0; i < 3; i += 1) {
      // Sparkles live in the margins — the top band and the right edge — never on the words.
      const top = r() < 0.5
      const sx = top ? 120 + r() * 1040 : 1222 + r() * 34
      const sy = top ? 22 + r() * 30 : 90 + r() * 540
      const s = 5 + r() * 6
      a.body.push(`<path d="M${n(sx)} ${n(sy - s * 2)}L${n(sx + s * 0.45)} ${n(sy - s * 0.45)}L${n(sx + s * 2)} ${n(sy)}L${n(sx + s * 0.45)} ${n(sy + s * 0.45)}L${n(sx)} ${n(sy + s * 2)}L${n(sx - s * 0.45)} ${n(sy + s * 0.45)}L${n(sx - s * 2)} ${n(sy)}L${n(sx - s * 0.45)} ${n(sy - s * 0.45)}Z" fill="#${t.accent}" fill-opacity="${o(0.55)}"/>`)
    }
  },

  aurora(a, t, { strong, r }) {
    const k = strong ? 1 : 0.62
    const pink = "FF5CA8"
    const deep = mixHex(t.accent, "1A1AFF", 0.45)
    pool(a, 200 + r() * 420, -30 + r() * 120, 620, 300, t.accent, 0.62 * k, -14 + r() * 10)
    pool(a, 760 + r() * 360, 40 + r() * 120, 560, 260, t.accent2, 0.5 * k, 10 + r() * 12)
    pool(a, 980 + r() * 240, 520 + r() * 160, 480, 260, pink, 0.34 * k, -20)
    pool(a, 80 + r() * 260, 560 + r() * 140, 620, 300, deep, 0.42 * k, 16)
    for (let i = 0; i < 28; i += 1) {
      a.body.push(`<circle cx="${n(r() * 1280)}" cy="${n(r() * 720)}" r="${n(0.6 + r() * 1.1)}" fill="#FFFFFF" fill-opacity="${o(0.15 + r() * 0.4)}"/>`)
    }
    const veil = a.id("v")
    a.defs.push(`<linearGradient id="${veil}" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#${t.bg}" stop-opacity="0"/><stop offset="1" stop-color="#${t.bg}" stop-opacity="${strong ? ".35" : ".55"}"/></linearGradient>`)
    a.body.push(`<rect width="1280" height="720" fill="url(#${veil})"/>`)
  },

  grid(a, t, { layout, index, strong }) {
    const grid = a.id("g")
    const fade = a.id("f")
    const mask = a.id("m")
    a.defs.push(`<pattern id="${grid}" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#${t.accent}" stroke-opacity="${strong ? ".3" : ".2"}" stroke-width="1"/></pattern>`)
    const [cx, cy] = layout === "title" ? [0.3, 1] : index % 2 ? [0.1, 0.9] : [0.9, 0.1]
    a.defs.push(`<radialGradient id="${fade}" cx="${cx}" cy="${cy}" r=".75"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>`)
    a.defs.push(`<mask id="${mask}"><rect width="1280" height="720" fill="url(#${fade})"/></mask>`)
    a.body.push(`<rect width="1280" height="720" fill="url(#${grid})" mask="url(#${mask})"/>`)
    pool(a, cx * 1280, cy * 720, 620, 420, t.accent, strong ? 0.18 : 0.1)
    pool(a, (1 - cx) * 1280, (1 - cy) * 720, 520, 380, t.accent2, strong ? 0.2 : 0.11)
    const arm = 26
    const inset = 26
    const bracket = (x: number, y: number, dx: number, dy: number) => `<path d="M${x + dx * arm} ${y}H${x}V${y + dy * arm}" fill="none" stroke="#${t.accent}" stroke-opacity=".75" stroke-width="2"/>`
    a.body.push(bracket(inset, inset, 1, 1), bracket(1280 - inset, inset, -1, 1), bracket(inset, 720 - inset, 1, -1), bracket(1280 - inset, 720 - inset, -1, -1))
    a.body.push(`<rect x="1150" y="44" width="34" height="4" fill="#${t.accent}" fill-opacity=".8"/><rect x="1190" y="44" width="10" height="4" fill="#${t.accent2}" fill-opacity=".9"/><rect x="1206" y="44" width="4" height="4" fill="#${t.accent}" fill-opacity=".6"/>`)
  },

  rules(a, t, { layout }) {
    a.body.push(`<rect x="72" y="34" width="1136" height="1.6" fill="#${t.text}" fill-opacity=".85"/><rect x="72" y="40" width="1136" height=".6" fill="#${t.text}" fill-opacity=".55"/>`)
    a.body.push(`<rect x="72" y="20" width="30" height="6" fill="#${t.accent}"/>`)
    a.body.push(`<rect x="72" y="686" width="1136" height=".8" fill="#${t.text}" fill-opacity=".45"/>`)
    if (layout === "section") a.body.push(`<rect x="0" y="0" width="28" height="720" fill="#${t.accent}"/>`)
    if (layout === "closing") a.body.push(`<rect x="72" y="120" width="1136" height="1.2" fill="#${t.text}" fill-opacity=".6"/><rect x="72" y="600" width="1136" height="1.2" fill="#${t.text}" fill-opacity=".6"/>`)
  },

  mesh(a, t, { strong, r }) {
    const k = strong ? 1 : 0.7
    pool(a, 1100 + r() * 160, -40 + r() * 120, 620, 440, t.accent, 0.42 * k, -12)
    pool(a, 80 + r() * 160, 640 + r() * 100, 600, 420, t.accent2, 0.46 * k, 14)
    pool(a, 1020 + r() * 200, 600 + r() * 120, 460, 320, "B65CF0", 0.22 * k)
    pool(a, 120 + r() * 200, -20 + r() * 80, 480, 320, "FFC56B", 0.36 * k)
  },

  confetti(a, t, { layout, strong, r }) {
    pool(a, layout === "title" ? 1180 : 80, layout === "title" ? 620 : 60, 420, 420, t.accent2, 0.12)
    const count = strong ? 15 : 8
    const ink = t.text
    for (let i = 0; i < count; i += 1) {
      // Top and bottom bands take any shape; the side bands, which sit right
      // beside the text column, only small round ones that stay out of it.
      const zone = Math.floor(r() * 4)
      const side = zone >= 2
      const x = zone === 2 ? 22 + r() * 22 : zone === 3 ? 1236 + r() * 22 : 40 + r() * 1200
      const y = zone === 0 ? 18 + r() * 30 : zone === 1 ? 672 + r() * 30 : 120 + r() * 480
      const color = t.series[i % t.series.length]
      const kind = side ? [0, 2, 4][Math.floor(r() * 3)] : Math.floor(r() * 5)
      const rot = n(r() * 180)
      if (kind === 0) a.body.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(side ? 7 + r() * 6 : 9 + r() * 9)}" fill="#${color}" stroke="#${ink}" stroke-width="2.5"/>`)
      else if (kind === 1) a.body.push(`<rect x="${n(x - 26)}" y="${n(y - 9)}" width="52" height="18" rx="9" fill="#${color}" stroke="#${ink}" stroke-width="2.5" transform="rotate(${rot} ${n(x)} ${n(y)})"/>`)
      else if (kind === 2) a.body.push(`<path d="M${n(x)} ${n(y - 15)}L${n(x + 14)} ${n(y + 10)}L${n(x - 14)} ${n(y + 10)}Z" fill="#${color}" stroke="#${ink}" stroke-width="2.5" stroke-linejoin="round" transform="rotate(${rot} ${n(x)} ${n(y)})"/>`)
      else if (kind === 3) a.body.push(`<path d="M${n(x - 30)} ${n(y)}q7.5 -12 15 0t15 0t15 0t15 0" fill="none" stroke="#${color}" stroke-width="6" stroke-linecap="round" transform="rotate(${rot} ${n(x)} ${n(y)})"/>`)
      else a.body.push(`<path d="M${n(x - 11)} ${n(y)}H${n(x + 11)}M${n(x)} ${n(y - 11)}V${n(y + 11)}" stroke="#${color}" stroke-width="6" stroke-linecap="round"/>`)
    }
  },

  ornament(a, t, { layout, strong }) {
    pool(a, 1180, 40, 560, 420, t.accent2, strong ? 0.28 : 0.18)
    pool(a, 80, 700, 520, 360, t.accent, strong ? 0.12 : 0.07)
    const motif = (x: number, y: number, scale: number, opacity: number) =>
      `<path d="${KOSHKAR}" transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})" fill="none" stroke="#${t.accent}" stroke-opacity="${o(opacity)}" stroke-width="${n(1.6 / scale)}" stroke-linecap="round" stroke-linejoin="round"/>`
    if (strong || layout === "section") {
      a.body.push(`<rect x="0" y="664" width="1280" height="1.2" fill="#${t.accent}" fill-opacity=".45"/><rect x="0" y="712" width="1280" height="1.2" fill="#${t.accent}" fill-opacity=".45"/>`)
      for (let x = -8; x < 1280; x += 72) a.body.push(motif(x, 672, 1.1, 0.72))
      a.body.push(motif(1010, 40, 4.2, 0.26))
    } else {
      a.body.push(motif(1150, 34, 1.6, 0.6))
      a.body.push(`<rect x="1150" y="92" width="102" height="1.2" fill="#${t.accent}" fill-opacity=".35"/>`)
    }
  },

  waves(a, t, { layout, index, strong }) {
    const wave = a.id("w")
    a.defs.push(`<linearGradient id="${wave}" x1="0" x2="1"><stop offset="0" stop-color="#${t.accent}"/><stop offset="1" stop-color="#${t.accent2}"/></linearGradient>`)
    const k = strong ? 1 : 0.6
    if (index % 2 && !strong && layout !== "title") {
      a.body.push(`<path d="M1280 0V250C1180 300 1060 180 940 120S760 40 700 0Z" fill="url(#${wave})" fill-opacity="${o(0.12 * k)}"/>`)
      a.body.push(`<path d="M1280 0V150C1200 190 1110 110 1020 70S900 10 860 0Z" fill="url(#${wave})" fill-opacity="${o(0.16 * k)}"/>`)
    } else {
      a.body.push(`<path d="M${strong ? 0 : 420} 720C${strong ? "300 560 620 700" : "700 600 960 690"} 1280 ${strong ? 500 : 570}V720Z" fill="url(#${wave})" fill-opacity="${o(0.13 * k)}"/>`)
      a.body.push(`<path d="M${strong ? 300 : 720} 720C${strong ? "620 620 900 690" : "900 650 1080 700"} 1280 ${strong ? 590 : 630}V720Z" fill="url(#${wave})" fill-opacity="${o(0.2 * k)}"/>`)
    }
    pool(a, 1200, 40, 460, 360, t.accent2, 0.1 * k)
  },
}

/**
 * The background art of one slide as an SVG document, 1280 × 720. Pure: the
 * same theme, layout and position always draw the same picture.
 */
export function backdropSvg(theme: DeckTheme, layout: SlideLayout, index: number): string {
  const a = art(`k${theme.id.slice(0, 3)}${index}`)
  const strong = STRONG.has(layout)
  PAINTERS[theme.backdrop](a, theme, { layout, index, strong, r: rng(hash(`${theme.id}:${layout}:${index}`)) })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs>${a.defs.join("")}</defs><rect width="1280" height="720" fill="#${theme.bg}"/>${a.body.join("")}</svg>`
}

function base64(text: string) {
  if (typeof btoa !== "function") return Buffer.from(text, "utf8").toString("base64")
  let binary = ""
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** The art as a data URL, for CSS and for an <img> that a canvas draws. */
export function backdropDataUrl(theme: DeckTheme, layout: SlideLayout, index: number) {
  return `data:image/svg+xml;base64,${base64(backdropSvg(theme, layout, index))}`
}

/* ---------------------------------------------------------- photo geometry */

export type Box = { x: number; y: number; w: number; h: number }

export type PhotoMask =
  | { kind: "rect" }
  | { kind: "round"; r: number }
  | { kind: "arch"; r: number; foot: number }
  | { kind: "diagonal"; cut: number }

/** How a framed photo is finished: a soft shadow, a hard offset shadow, a line around it. */
export type PhotoFrame = { shadow: "none" | "soft" | "hard"; stroke?: { color: string; width: number; offset: number } }

export type PhotoSlot = {
  box: Box
  mask: PhotoMask
  frame: PhotoFrame
  /** A darkening gradient baked over the picture so white words stay legible on it. */
  shade?: "hero"
}

export function photoFrame(theme: DeckTheme): PhotoFrame {
  if (theme.surfaceStyle === "brutal") return { shadow: "hard", stroke: { color: theme.text, width: 4, offset: 0 } }
  if (theme.id === "royal") return { shadow: "none", stroke: { color: theme.accent, width: 1.5, offset: 12 } }
  if (theme.id === "cyber") return { shadow: "none", stroke: { color: theme.accent, width: 2, offset: 0 } }
  if (theme.photo === "sharp") return { shadow: "none" }
  return { shadow: "soft" }
}

function photoRadius(theme: DeckTheme) {
  return Math.min(36, Math.round(theme.radius * 1.25))
}

/** Where the cover's photograph goes, and how far the title may run. */
export function coverLayout(theme: DeckTheme): { slot: PhotoSlot; textRight: number } {
  const frame = photoFrame(theme)
  switch (theme.cover) {
    case "frame":
      return { slot: { box: { x: 690, y: 56, w: 534, h: 608 }, mask: theme.photo === "sharp" ? { kind: "rect" } : { kind: "round", r: photoRadius(theme) }, frame }, textRight: 1280 - 690 + 48 }
    case "arch":
      return { slot: { box: { x: 752, y: 56, w: 456, h: 608 }, mask: { kind: "arch", r: 228, foot: Math.min(24, theme.radius) }, frame }, textRight: 1280 - 752 + 52 }
    case "band":
      return { slot: { box: { x: 640, y: 0, w: 640, h: 720 }, mask: { kind: "rect" }, frame: { shadow: "none" } }, textRight: 1280 - 640 + 56 }
    case "diagonal":
    default:
      return { slot: { box: { x: 670, y: 0, w: 610, h: 720 }, mask: { kind: "diagonal", cut: 0.15 }, frame: { shadow: "none" } }, textRight: 632 }
  }
}

/** The photograph beside the text on an image-text slide. */
export function sidePhotoLayout(theme: DeckTheme, side: "left" | "right"): { slot: PhotoSlot; copy: { left: number; right: number } } {
  const frame = photoFrame(theme)
  if (theme.photo === "sharp") {
    const box = { x: side === "right" ? 680 : 0, y: 0, w: 600, h: 720 }
    return { slot: { box, mask: { kind: "rect" }, frame: theme.id === "cyber" ? frame : { shadow: "none" } }, copy: side === "right" ? { left: 72, right: 664 } : { left: 664, right: 72 } }
  }
  const box = { x: side === "right" ? 1280 - 44 - 520 : 44, y: 44, w: 520, h: 632 }
  const mask: PhotoMask = theme.photo === "arch" ? { kind: "arch", r: 260, foot: Math.min(24, theme.radius) } : { kind: "round", r: photoRadius(theme) }
  return { slot: { box, mask, frame }, copy: side === "right" ? { left: 72, right: 620 } : { left: 620, right: 72 } }
}

/**
 * The area a photo occupies once its shadow or frame is drawn around it. The
 * PowerPoint export bakes the picture, its cut, its shadow and the slide art
 * behind its corners into one image of exactly this box, so a rounded or
 * arched photo looks the same in every presentation app.
 */
export function bakeBox(slot: PhotoSlot): Box {
  const { frame, box } = slot
  const pad = Math.max(
    frame.shadow === "soft" ? 96 : frame.shadow === "hard" ? 18 : 0,
    frame.stroke ? frame.stroke.offset + frame.stroke.width + 3 : 0,
  )
  const x0 = Math.max(0, box.x - pad)
  const y0 = Math.max(0, box.y - pad)
  const x1 = Math.min(CANVAS_W, box.x + box.w + pad)
  const y1 = Math.min(CANVAS_H, box.y + box.h + pad)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const HERO_SLOT: PhotoSlot ={ box: { x: 0, y: 0, w: 1280, h: 720 }, mask: { kind: "rect" }, frame: { shadow: "none" }, shade: "hero" }

/** Content area of a text slide: 72 px margins, the headline above, the body below. */
export const PAD = 72
export const HEAD_TOP = 72
export const HEAD_H = 118
export const BODY_TOP = 226
export const BODY_BOTTOM = 648

/** The photographs of a gallery slide, side by side under the headline. */
export function gallerySlots(theme: DeckTheme, count: number, hasIntro: boolean): PhotoSlot[] {
  const top = BODY_TOP + (hasIntro ? 44 : 0)
  const gap = 24
  const w = (CANVAS_W - PAD * 2 - gap * (count - 1)) / count
  const h = CANVAS_H - top - 120
  const mask: PhotoMask = theme.photo === "sharp" || theme.surfaceStyle === "line" ? { kind: "rect" } : { kind: "round", r: Math.min(28, Math.max(theme.radius, 6)) }
  const frame = photoFrame(theme)
  // Gallery photos stand 24 px apart: a soft shadow baked around one would
  // spill over its neighbour, so only a tight frame (a line, a hard offset) stays.
  const tight: PhotoFrame = frame.shadow === "soft" ? { shadow: "none" } : frame
  return Array.from({ length: count }, (_, i) => ({ box: { x: PAD + i * (w + gap), y: top, w, h }, mask, frame: tight }))
}

/** CSS for a photo box on screen, from the same numbers PowerPoint uses. */
export function photoBoxStyle(slot: PhotoSlot): Record<string, string | number> {
  const { box, mask } = slot
  const style: Record<string, string | number> = { left: box.x, top: box.y, width: box.w, height: box.h }
  if (mask.kind === "round") style.borderRadius = mask.r
  if (mask.kind === "arch") style.borderRadius = `${mask.r}px ${mask.r}px ${mask.foot}px ${mask.foot}px`
  if (mask.kind === "diagonal") style.clipPath = `polygon(${mask.cut * 100}% 0, 100% 0, 100% 100%, 0 100%)`
  return style
}

/* ----------------------------------------------------------------- variants */

export type BulletsVariant = "rows" | "grid"

/**
 * Bullets as rows of numbered lines, or as a grid of numbered tiles. Which
 * one depends on the theme and on the slide's place in the deck, so a long
 * deck does not show the same list composition twice in a row.
 */
export function bulletsVariant(theme: DeckTheme, slide: Slide, index: number): BulletsVariant {
  if (slide.layout !== "bullets" || slide.points.length >= 5 || slide.points.length < 2) return "rows"
  const long = slide.points.some((point) => (point.body || "").length > 120)
  if (long) return "rows"
  if (theme.list === "grid") return "grid"
  if (theme.list === "alternate") return index % 2 ? "grid" : "rows"
  return "rows"
}

/** Stat numbers sit on tiles when the theme builds with cards. */
export function statOnTiles(theme: DeckTheme) {
  return theme.surfaceStyle === "glass" || theme.surfaceStyle === "soft" || theme.surfaceStyle === "brutal"
}
