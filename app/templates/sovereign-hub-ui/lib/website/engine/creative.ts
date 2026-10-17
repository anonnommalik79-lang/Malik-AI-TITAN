import { createHash } from "node:crypto"

export type CreativeBrief = {
  version: 1; id: string; hero: string; rhythm: string; typography: string
  signature: string; artDirection: string; constraints: string[]
}

// Composition instructions, not HTML/templates. The model must invent content,
// geometry and interactions for the brief. A project keeps its direction on edits.
const HEROES = [
  "Editorial split: offset headline and edge-to-edge subject image; a small contextual index, not centered marketing copy.",
  "Immersive chapter: one dominant visual, a quiet vertical index and sharply placed typography; reveal detail below the fold.",
  "Product stage: large isolated subject or original SVG/canvas scene beside a working local control panel.",
  "Typographic opening: a deliberate oversized title composition, narrow narrative column and cropped visual counterpoint.",
  "Horizontal specimen: technical annotations around a dominant visual; readable linear layout on mobile.",
  "Asymmetric gallery lead: one large image and two intentionally unequal supporting details with a clear reading order.",
  "Utility-first opening: useful interactive preview or explorer first, with concise supporting brand narrative.",
  "Quiet cinematic opening: a still/poster-first visual, generous negative space and one precise action; no gratuitous effects.",
]
const RHYTHMS = [
  "Alternate full-width narrative, narrow detail and asymmetric comparison; do not repeat equal three-card rows.",
  "Use numbered chapters, a large visual interlude and a compact technical/data section with genuine hierarchy.",
  "Use a magazine rhythm: strong opening, staggered visual essay, detailed feature and a calm functional close.",
  "Move from an interactive overview to focused drill-down, then evidence/gallery and a useful final action.",
  "Alternate dense functional panels with quiet full-bleed imagery; adapt each section to its actual content.",
]
const TYPE = [
  "Expressive display sans with compact monospaced annotations; fluid clamp sizes and restrained line lengths.",
  "Editorial serif display with clean sans body; large-small contrast, readable mobile hierarchy.",
  "Precision grotesk with tabular numerals and small uppercase labels; no tiny low-contrast body text.",
  "Humanist sans body and condensed display accents; avoid all-caps paragraphs and decorative font overload.",
]
const SIGNATURES = [
  "A subject-specific comparison/explorer with a visible state change and a useful keyboard-accessible fallback.",
  "A selectable product/story detail that updates an actual labelled information panel, not just a glow.",
  "An interactive timeline or chapter navigator with meaningful content and ordinary anchor navigation fallback.",
  "A functional filter or configurator tied to coherent local demo data, with empty state and reset.",
  "A gallery/detail interaction with accessible open/close, focus return and touch-friendly controls.",
]

export function creativeBrief(prompt: string, projectId: string): CreativeBrief {
  const bytes = createHash("sha256").update(`${projectId}\n${prompt}`).digest()
  const picks = [bytes[0] % HEROES.length, bytes[1] % RHYTHMS.length, bytes[2] % TYPE.length, bytes[3] % SIGNATURES.length]
  return {
    version: 1, id: `v1-${picks.join("-")}`, hero: HEROES[picks[0]], rhythm: RHYTHMS[picks[1]], typography: TYPE[picks[2]], signature: SIGNATURES[picks[3]],
    artDirection: "Choose a coherent subject-specific palette, imagery crop, spacing scale and visual metaphor. Explicit user references, brand, accessibility and product purpose override any suggested axis. Do not copy a competitor's branding or copyrighted layout.",
    constraints: [
      "No universal purple-gradient SaaS template, fake trust logos, repeated generic feature cards or meaningless statistic counters. A user explicitly asking for a conventional layout takes precedence.",
      "Write concrete subject-specific copy and consistent demo data. One signature interaction should feel finished before adding more decorative effects.",
      "Motion communicates hierarchy/state: enter/exit, a deliberate reveal or an original visual scene. No scroll hijack, custom-cursor dependency or motion-only navigation.",
      "Mobile is a composition, not a scaled desktop screenshot: readable type, wrapped labels, touch controls, no horizontal document scrolling.",
      "Heavy effects run in the visitor's browser, never in Render. Images/video stay on verified external CDNs; source ZIP contains metadata/credits, not media bytes.",
    ],
  }
}
