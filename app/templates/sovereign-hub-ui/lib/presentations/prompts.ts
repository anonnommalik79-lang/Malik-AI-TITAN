import type { DeckLanguage, DeckOutline, DeckTone, OutlineItem, Slide, SlideLayout } from "@/lib/presentations/types"

/**
 * What the model is told.
 *
 * The difference between a deck people present and a deck people apologise
 * for is almost never design — the renderer owns design. It is the writing:
 *
 *  - headlines that state a claim ("Кофейня окупается за 14 месяцев") rather
 *    than name a topic ("Окупаемость"), so the titles alone tell the story;
 *  - one idea per slide, with the layout chosen by what the idea is — a
 *    number gets a number slide, a process gets a timeline, a choice gets a
 *    comparison — instead of bullets for everything;
 *  - an arc: why this matters, what is broken, what changes, why it works,
 *    what to do next;
 *  - and no invented statistics dressed as facts. When the person has not
 *    given numbers, the deck says "≈" and "оценка" and the notes say where a
 *    real number should come from. A deck is presented to people who will
 *    ask where a figure came from.
 */

const LANGUAGE_NAME: Record<DeckLanguage, string> = {
  ru: "Russian",
  kk: "Kazakh",
  en: "English",
}

const TONE_GUIDE: Record<DeckTone, string> = {
  confident: "Confident and clear, like a founder who knows the numbers. Short declarative sentences.",
  friendly: "Warm and plain-spoken, like explaining to a smart friend. No jargon.",
  academic: "Precise and measured. Define terms once, qualify claims, prefer evidence over adjectives.",
  bold: "Punchy and memorable. Strong verbs, provocative headlines, no hedging where none is needed.",
}

export const LAYOUT_SCHEMAS: Record<SlideLayout, string> = {
  title: `{"layout":"title","kicker":"≤4 words above the title","title":"≤9 words","subtitle":"≤20 words","imagePrompt":"English, concrete scene, no text in the image","notes":"…"}`,
  section: `{"layout":"section","number":"01","title":"≤7 words","subtitle":"≤16 words","notes":"…"}`,
  bullets: `{"layout":"bullets","title":"a claim, ≤10 words","intro":"optional, ≤20 words","points":[{"title":"≤7 words","body":"≤22 words"}],"notes":"…"}  — 3 to 5 points`,
  "two-column": `{"layout":"two-column","title":"a claim","left":{"heading":"≤4 words","points":["≤14 words", "…"]},"right":{"heading":"≤4 words","points":["…"]},"notes":"…"}  — 2 to 4 points per side`,
  stat: `{"layout":"stat","title":"what the numbers prove","stats":[{"value":"≤8 chars, e.g. 14 мес, 3×, ≈40%","label":"≤10 words"}],"context":"≤25 words: where the numbers come from","notes":"…"}  — 1 to 3 stats`,
  quote: `{"layout":"quote","quote":"≤35 words","author":"name","role":"who they are","notes":"…"}`,
  "image-text": `{"layout":"image-text","title":"a claim","body":"≤45 words","points":["≤14 words"],"imageSide":"left|right","imagePrompt":"English, concrete scene, no text","notes":"…"}  — 0 to 3 points`,
  cards: `{"layout":"cards","title":"a claim","cards":[{"title":"≤5 words","body":"≤20 words"}],"notes":"…"}  — 3 or 4 cards`,
  timeline: `{"layout":"timeline","title":"a claim","steps":[{"label":"Q1 2026 | Шаг 1 | Неделя 1","title":"≤5 words","body":"≤16 words"}],"notes":"…"}  — 3 to 5 steps`,
  comparison: `{"layout":"comparison","title":"a claim","columns":["option A","option B"],"rows":[{"label":"criterion","values":["≤8 words","≤8 words"]}],"verdict":"≤18 words","notes":"…"}  — 3 to 5 rows`,
  chart: `{"layout":"chart","title":"what the chart shows","unit":"%, млн ₸, users…","data":[{"label":"≤3 words","value":123}],"takeaway":"≤20 words","notes":"…"}  — 3 to 7 bars, value is a plain number`,
  closing: `{"layout":"closing","title":"the one thing to remember or do","subtitle":"≤20 words","contact":"optional: site, email or handle","notes":"…"}`,
}

const WRITING_RULES = `
WRITING RULES — these decide whether the deck is good:
1. Every title is a CLAIM the audience should believe after the slide, not a topic label.
   Bad: "Рынок". Good: "Рынок кофе в Алматы растёт на 12% в год".
2. One idea per slide. If a slide needs two ideas, it is two slides.
3. Respect the word limits in the schema. Fewer words always beat more words.
4. No filler: never "в современном мире", "играет важную роль", "уникальный", "инновационный", "In today's world".
5. Be specific: names, places, amounts, timeframes, examples from the person's own request.
6. NEVER invent precise statistics and present them as fact. Use a figure only if it is widely known or the person gave it.
   Otherwise write an estimate with "≈" or "оценка" and, in notes, say what real source would confirm it.
7. Speaker notes: 2–4 natural sentences the presenter actually says — not a repeat of the slide text.
8. imagePrompt is always English and describes a concrete photograph or illustration: subject, setting, light, mood.
   Never ask for text, logos or letters inside the image.
9. Plain text only inside JSON strings: no Markdown, no asterisks, no emoji, no leading dashes.
`.trim()

function languageLine(language: DeckLanguage) {
  return `Write every visible string in ${LANGUAGE_NAME[language]}. imagePrompt stays in English.`
}

export function outlineSystemPrompt(input: { language: DeckLanguage; tone: DeckTone; count: number }) {
  return `
You are the story architect of a world-class presentation studio. You plan decks; you do not design them.

Return ONLY a JSON object, no prose, no code fence:
{"title":"deck title, ≤8 words","items":[{"title":"slide claim, ≤10 words","point":"one sentence: what this slide must make the audience believe","layout":"<layout>"}]}

Produce EXACTLY ${input.count} items.

Layouts you may choose, by what the slide's idea IS:
- title: the cover. Always item 1.
- section: a chapter break in a long deck (only if ${input.count} ≥ 12; at most 2).
- stat: the idea is a number or two.
- chart: the idea is a trend or comparison of 3–7 quantities.
- timeline: the idea is a sequence, plan, roadmap or process.
- comparison: the idea is a choice between two options, or before/after.
- cards: the idea is 3–4 parallel things (features, pillars, segments).
- two-column: the idea is a contrast of two sides (problem/solution, today/tomorrow).
- image-text: the idea is best felt through a picture (a place, a product, a person).
- quote: the idea is someone else's voice (a customer, an expert).
- bullets: only when nothing above fits.
- closing: the last item. The one thing to remember or do.

Arc: open with why this matters to THIS audience, show what is broken or possible, show what changes, prove it, say how, end with the ask.
Variety: never three slides of the same layout in a row; use at least 5 different layouts in a 10-slide deck.

Tone: ${TONE_GUIDE[input.tone]}
${languageLine(input.language)}

${WRITING_RULES}
`.trim()
}

export function outlineUserPrompt(topic: string, count: number) {
  return `Plan a ${count}-slide presentation.\n\nRequest from the person:\n"""\n${topic}\n"""`
}

function schemaFor(items: OutlineItem[]) {
  const layouts = [...new Set(items.map((item) => item.layout))]
  return layouts.map((layout) => `${layout}: ${LAYOUT_SCHEMAS[layout]}`).join("\n")
}

export function slidesSystemPrompt(input: { language: DeckLanguage; tone: DeckTone; items: OutlineItem[] }) {
  return `
You are the lead writer of a world-class presentation studio. The deck is already planned; you write the slides you are given.

Return ONLY a JSON object, no prose, no code fence:
{"slides":[ …one object per requested slide, in the same order… ]}

Each slide MUST use the layout it was assigned and follow its schema exactly:
${schemaFor(input.items)}

Tone: ${TONE_GUIDE[input.tone]}
${languageLine(input.language)}

${WRITING_RULES}
`.trim()
}

export function slidesUserPrompt(input: { topic: string; outline: DeckOutline; startIndex: number; items: OutlineItem[] }) {
  const plan = input.outline.items
    .map((item, index) => `${index + 1}. [${item.layout}] ${item.title}${item.point ? ` — ${item.point}` : ""}`)
    .join("\n")
  const assigned = input.items
    .map((item, offset) => `Slide ${input.startIndex + offset + 1} — layout "${item.layout}": ${item.title}${item.point ? ` (${item.point})` : ""}`)
    .join("\n")

  return `
Deck: "${input.outline.title}"
Original request:
"""
${input.topic}
"""

The full plan, so every slide knows its neighbours:
${plan}

Write ONLY these ${input.items.length} slide(s):
${assigned}
`.trim()
}

export function rewriteSlideSystemPrompt(input: { language: DeckLanguage; tone: DeckTone; layout: SlideLayout }) {
  return `
You rewrite a single slide in a world-class presentation studio.

Return ONLY one JSON object for the slide, no prose, no code fence, using this schema:
${input.layout}: ${LAYOUT_SCHEMAS[input.layout]}

Keep what already works. Change what the instruction asks for. If there is no instruction, make it sharper:
a stronger claim in the title, fewer and more specific words, a better example.

Tone: ${TONE_GUIDE[input.tone]}
${languageLine(input.language)}

${WRITING_RULES}
`.trim()
}

export function rewriteSlideUserPrompt(input: { deckTitle: string; slide: Slide; instruction?: string; neighbours: string[] }) {
  const { id: _id, imageUrl: _imageUrl, ...content } = input.slide as Slide & { imageUrl?: string }
  return `
Deck: "${input.deckTitle}"
Neighbouring slide titles, for context: ${input.neighbours.filter(Boolean).join(" | ") || "—"}

Current slide:
${JSON.stringify(content)}

Instruction from the person: ${input.instruction?.trim() || "(none — make it sharper)"}
`.trim()
}
