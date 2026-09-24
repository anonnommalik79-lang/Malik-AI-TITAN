import { DECK_ICON_NAMES, type DeckLanguage, type DeckOutline, type DeckTone, type OutlineItem, type Slide, type SlideLayout } from "@/lib/presentations/types"

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

const IMAGE_FIELDS = `"imageQuery":"English photo search words, 2–6 words, exactly this slide's subject","imageKind":"subject|mood","imagePrompt":"English, a concrete photographic scene, no text"`

export const LAYOUT_SCHEMAS: Record<SlideLayout, string> = {
  title: `{"layout":"title","kicker":"≤4 words above the title","title":"≤9 words","subtitle":"≤20 words",${IMAGE_FIELDS},"notes":"…"}`,
  hero: `{"layout":"hero","kicker":"≤4 words","title":"≤8 words, set large over a full-bleed photograph","subtitle":"≤18 words",${IMAGE_FIELDS},"notes":"…"}`,
  section: `{"layout":"section","number":"01","title":"≤7 words","subtitle":"≤16 words","notes":"…"}`,
  bullets: `{"layout":"bullets","title":"a claim, ≤10 words","intro":"optional, ≤20 words","points":[{"title":"≤7 words","body":"≤22 words"}],"notes":"…"}  — 3 to 5 points`,
  "two-column": `{"layout":"two-column","title":"a claim","left":{"heading":"≤4 words","points":["≤14 words", "…"]},"right":{"heading":"≤4 words","points":["…"]},"notes":"…"}  — 2 to 4 points per side`,
  stat: `{"layout":"stat","title":"what the numbers prove","stats":[{"value":"≤8 chars, e.g. 14 мес, 3×, ≈40%","label":"≤10 words"}],"context":"≤25 words: where the numbers come from","notes":"…"}  — 1 to 3 stats`,
  quote: `{"layout":"quote","quote":"≤35 words","author":"name","role":"who they are","notes":"…"}`,
  "image-text": `{"layout":"image-text","title":"a claim","body":"≤45 words","points":["≤14 words"],"imageSide":"left|right",${IMAGE_FIELDS},"notes":"…"}  — 0 to 3 points`,
  cards: `{"layout":"cards","title":"a claim","cards":[{"title":"≤5 words","body":"≤20 words"}],"notes":"…"}  — 3 or 4 cards`,
  features: `{"layout":"features","title":"a claim","intro":"optional, ≤18 words","items":[{"icon":"one of: ${DECK_ICON_NAMES.join(", ")}","title":"≤5 words","body":"≤18 words"}],"notes":"…"}  — 3 to 6 items, the icon must fit the item's meaning`,
  process: `{"layout":"process","title":"a claim about how it gets done","steps":[{"title":"≤4 words, a verb first","body":"≤16 words"}],"notes":"…"}  — 3 to 5 steps, in order`,
  timeline: `{"layout":"timeline","title":"a claim","steps":[{"label":"Q1 2026 | 1771 | Неделя 1","title":"≤5 words","body":"≤16 words"}],"notes":"…"}  — 3 to 5 dated steps`,
  comparison: `{"layout":"comparison","title":"a claim","columns":["option A","option B"],"rows":[{"label":"criterion","values":["≤8 words","≤8 words"]}],"verdict":"≤18 words","notes":"…"}  — 3 to 5 rows`,
  chart: `{"layout":"chart","title":"what the chart shows","unit":"%, млн ₸, users…","data":[{"label":"≤3 words","value":123}],"takeaway":"≤20 words","notes":"…"}  — 3 to 7 bars, value is a plain number`,
  gallery: `{"layout":"gallery","title":"a claim","intro":"optional, ≤18 words","items":[{"caption":"≤8 words","imageQuery":"English photo search words for exactly this item"}],"imageKind":"subject|mood","notes":"…"}  — 2 or 3 items`,
  closing: `{"layout":"closing","title":"the one thing to remember or do","subtitle":"≤20 words","contact":"optional: site, email or handle","notes":"…"}`,
}

const WRITING_RULES = `
WRITING RULES — these decide whether the deck is good:
1. Every title is a CLAIM the audience should believe after the slide, not a topic label.
   Bad: "Рынок". Good: "Рынок кофе в Алматы растёт на 12% в год".
2. One idea per slide. If a slide needs two ideas, it is two slides.
3. Respect the word limits in the schema. Fewer words always beat more words.
4. No filler: never "в современном мире", "играет важную роль", "уникальный", "инновационный", "In today's world".
5. Be specific: names, places, dates, amounts, examples from the person's own request. Teach something the audience
   did not know: a fact, a cause, a consequence, a concrete example — not a generality anyone could write.
6. NEVER invent precise statistics and present them as fact. Use a figure only if it is widely known or the person gave it.
   Otherwise write an estimate with "≈" or "оценка" and, in notes, say what real source would confirm it.
7. Speaker notes: 2–4 natural sentences the presenter actually says — not a repeat of the slide text.
8. PHOTOS. Every slide with an image slot gets:
   - imageQuery: English words a photographer would tag the picture with, about THIS slide's subject, not the deck in
     general. Specific beats generic: "Abylai Khan monument Almaty" not "history"; "barista pouring latte art" not
     "coffee"; "wind turbines Kazakhstan steppe" not "energy". No abstract words (success, growth, innovation).
   - imageKind: "subject" when the picture must show a specific real person, place, building, event or artwork
     (encyclopedic photo); "mood" when any good photograph of the scene will do (stock photo).
   - imagePrompt: an English description of the ideal photograph (subject, setting, light), used if no photo is found.
   Never ask for text, logos or letters inside an image.
9. Plain text only inside JSON strings: no Markdown, no asterisks, no emoji, no leading dashes.
`.trim()

function languageLine(language: DeckLanguage) {
  return `Write every visible string in ${LANGUAGE_NAME[language]}. imageQuery and imagePrompt stay in English.`
}

export function outlineSystemPrompt(input: { language: DeckLanguage; tone: DeckTone; count: number }) {
  return `
You are the story architect of a world-class presentation studio. You plan decks; you do not design them.

Return ONLY a JSON object, no prose, no code fence:
{"title":"deck title, ≤8 words","items":[{"title":"slide claim, ≤10 words","point":"one sentence: what this slide must make the audience believe","layout":"<layout>"}]}

Produce EXACTLY ${input.count} items.

Layouts you may choose, by what the slide's idea IS:
- title: a cover with a photograph beside the title. Item 1, unless hero is better.
- hero: a full-bleed photograph with a large headline over it. A powerful cover, a chapter opener, or an emotional
  moment (a place, a person, a vision). Can be item 1 instead of title.
- section: a chapter break in a long deck (only if ${input.count} ≥ 12; at most 2).
- stat: the idea is one to three numbers.
- chart: the idea is a trend or comparison of 3–7 quantities.
- timeline: the idea is dated events or a roadmap with dates.
- process: the idea is how something gets done, step by step (no dates needed).
- comparison: the idea is a choice between two options, or before/after, criterion by criterion.
- features: the idea is 3–6 parallel things — benefits, pillars, services, reasons — each with an icon.
- cards: the idea is 3–4 parallel things that need a little more text than features.
- two-column: the idea is a contrast of two sides (problem/solution, today/tomorrow).
- image-text: the idea is best felt through one photograph (a place, a product, a person) plus a few lines.
- gallery: the idea is shown by 2–3 photographs side by side (places, products, examples, people).
- quote: the idea is someone else's voice (a customer, an expert, a historical figure).
- bullets: only when nothing above fits.
- closing: the last item. The one thing to remember or do.

Design like a world-class deck, not a document:
- Photos carry a deck. In a 10-slide deck use at least 4 photo slides (title/hero, image-text, gallery).
- Show structure visually: steps → process, dates → timeline, parallel ideas → features, numbers → stat or chart.
- Never three slides of the same layout in a row; at least 6 different layouts in a 10-slide deck; bullets at most twice.

Arc: open with why this matters to THIS audience, show what is broken or possible, show what changes, prove it, say how,
end with the ask or the one thing to remember. For a history or education topic: context, key events, people, meaning
today, what to remember.

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
  const { id: _id, imageUrl: _imageUrl, imageCredit: _credit, imageLink: _link, ...content } = input.slide as Slide & { imageUrl?: string }
  void _credit
  void _link
  return `
Deck: "${input.deckTitle}"
Neighbouring slide titles, for context: ${input.neighbours.filter(Boolean).join(" | ") || "—"}

Current slide:
${JSON.stringify(content)}

Instruction from the person: ${input.instruction?.trim() || "(none — make it sharper)"}
`.trim()
}
