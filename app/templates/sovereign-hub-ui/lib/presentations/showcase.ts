import type { Slide } from "@/lib/presentations/types"

/**
 * The sample deck on the studio's start screen (desktop): four slides about
 * Abylai Khan, drawn by the real slide renderer, so what the preview shows is
 * exactly what the studio makes. The pictures are small vector landscapes
 * built here — no photos to download, crisp at any size.
 */

type Art = { top: string; mid: string; low: string; sun: string; sunY: number; far: string; hill: string; near: string; star?: boolean }

const ART: Art[] = [
  { top: "#130c22", mid: "#4a2644", low: "#e39a55", sun: "#ffdca4", sunY: 470, far: "#5b3551", hill: "#2c1a32", near: "#110a18" },
  { top: "#1a1026", mid: "#6b3a3f", low: "#f2b66b", sun: "#fff0c8", sunY: 430, far: "#7a4a4c", hill: "#3a2230", near: "#170d17" },
  { top: "#0d0a1c", mid: "#2c1f46", low: "#8f5a78", sun: "#f3e3c2", sunY: 250, far: "#3e2d55", hill: "#231937", near: "#0c0814", star: true },
  { top: "#170f1f", mid: "#57304a", low: "#d98c4f", sun: "#ffe0a8", sunY: 500, far: "#653b4f", hill: "#331d31", near: "#140b15" },
]

function steppe(index: number) {
  const a = ART[index % ART.length]
  const stars = a.star
    ? Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 97) % 600}" cy="${(i * 53) % 300 + 20}" r="${i % 3 ? 1.2 : 2}" fill="#fff" opacity="${0.35 + (i % 4) * 0.15}"/>`).join("")
    : ""
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 720" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.top}"/><stop offset=".56" stop-color="${a.mid}"/><stop offset=".8" stop-color="${a.low}"/></linearGradient>
<radialGradient id="g" cx=".62" cy="${(a.sunY / 720).toFixed(2)}" r=".5"><stop offset="0" stop-color="${a.sun}" stop-opacity=".9"/><stop offset=".22" stop-color="${a.sun}" stop-opacity=".32"/><stop offset="1" stop-color="${a.sun}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="600" height="720" fill="url(#s)"/>${stars}
<rect width="600" height="720" fill="url(#g)"/>
<circle cx="372" cy="${a.sunY}" r="${a.star ? 34 : 46}" fill="${a.sun}"/>
<path d="M0 470L70 418L128 452L210 376L282 440L352 398L424 456L502 386L600 436V720H0Z" fill="${a.far}" opacity=".9"/>
<path d="M0 544L92 480L172 522L262 468L342 526L432 484L522 532L600 500V720H0Z" fill="${a.hill}"/>
<path d="M0 612Q150 560 300 602T600 588V720H0Z" fill="${a.near}"/>
<path d="M112 596Q146 552 180 596Z" fill="${a.near}"/><rect x="110" y="594" width="72" height="28" fill="${a.near}"/>
<line x1="468" y1="580" x2="468" y2="478" stroke="${a.near}" stroke-width="5"/><path d="M471 480L526 495L471 511Z" fill="${a.near}"/>
<path d="M232 300q9-9 18 0q9-9 18 0M292 270q7-7 14 0q7-7 14 0" stroke="${a.near}" stroke-width="3" fill="none" opacity=".7"/>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const SHOWCASE_THEME = "royal" as const

export const SHOWCASE_SLIDES: Slide[] = [
  {
    id: "showcase-1",
    layout: "title",
    kicker: "История Казахстана",
    title: "Абылай хан",
    subtitle: "Великий правитель Великой степи",
    imageUrl: steppe(0),
  },
  {
    id: "showcase-2",
    layout: "image-text",
    title: "Ранние годы",
    body: "Юность в эпоху джунгарских набегов сделала из него воина и дипломата.",
    points: ["Родился в 1711 году", "Прославился в битвах с джунгарами"],
    imageSide: "right",
    imageUrl: steppe(1),
  },
  {
    id: "showcase-3",
    layout: "timeline",
    title: "Путь к власти",
    steps: [
      { label: "1711", title: "Рождение", body: "Потомок Чингизидов" },
      { label: "1730-е", title: "Батыр", body: "Слава в войнах с джунгарами" },
      { label: "1771", title: "Хан", body: "Провозглашён ханом в Туркестане" },
      { label: "1781", title: "Наследие", body: "Единство трёх жузов" },
    ],
  },
  {
    id: "showcase-4",
    layout: "closing",
    title: "Наследие",
    subtitle: "Единство степи и дипломатия между двумя империями",
    contact: "История. Наследие. Будущее.",
  },
] as Slide[]

/** Labels under the thumbnails of the sample deck. */
export const SHOWCASE_LABELS = ["Абылай хан", "Ранние годы", "Путь к власти", "Наследие"]
