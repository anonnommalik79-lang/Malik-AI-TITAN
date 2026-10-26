/**
 * What is wrong with a site the chat model just wrote, found without a
 * browser: a cut-off document, a script that does not parse, links to
 * sections that do not exist, placeholder copy, or a page too flat for the
 * cinematic brief. A weak first draft gets one upgrade pass (route-impl).
 */

export type SiteIssue = { code: string; severity: "critical" | "quality"; detail: string }

const FENCE = /(^|\n)(`{3,}|~{3,})[ \t]*(html?)\b[^\n]*\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/gi

/** The largest complete-looking HTML document in a chat answer, with where it sits. */
export function siteDocumentIn(markdown: string): { html: string; start: number; end: number } | null {
  let best: { html: string; start: number; end: number } | null = null
  for (const match of String(markdown || "").matchAll(FENCE)) {
    const html = match[4]
    if (!/<html[\s>]|<body[\s>]|<!doctype html/i.test(html)) continue
    const start = (match.index || 0) + match[0].indexOf(html)
    if (!best || html.length > best.html.length) best = { html, start, end: start + html.length }
  }
  return best
}

/** The answer with its site document swapped for a new one. */
export function replaceSiteDocument(markdown: string, html: string): string {
  const doc = siteDocumentIn(markdown)
  return doc ? markdown.slice(0, doc.start) + html + markdown.slice(doc.end) : markdown
}

/** A whole HTML document out of a model reply, fenced or bare. */
export function extractSiteDocument(reply: string): string {
  const fenced = siteDocumentIn(reply)?.html
  if (fenced) return fenced.trim()
  const bare = String(reply || "").match(/<!doctype html[\s\S]*<\/html>/i)?.[0]
  return bare ? bare.trim() : ""
}

const CINEMA = /\sdata-(?:reveal|split|scene|scrub-[a-z]+|parallax|count|nav|progress|gallery|tilt|magnetic|autoplay|marquee|cursor|loader|bg|skew|grain|shader|smooth|scramble|kenburns)\b/gi

export function auditSite(html: string, options: { motion: boolean }): SiteIssue[] {
  const issues: SiteIssue[] = []
  const doc = String(html || "")
  const add = (code: string, severity: SiteIssue["severity"], detail: string) => issues.push({ code, severity, detail })
  if (!/<\/body\s*>/i.test(doc) || !/<\/html\s*>\s*$/i.test(doc.trim())) add("INCOMPLETE", "critical", "the document is cut off: it must end with </body></html>")
  if (!/<meta[^>]+name\s*=\s*["']?viewport/i.test(doc)) add("NO_VIEWPORT", "critical", "no <meta name=\"viewport\"> — phones render it zoomed out")

  for (const [, attrs, code] of doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(attrs) || /type\s*=\s*["']?(?:module|application\/(?:ld\+)?json|text\/(?:template|html))/i.test(attrs) || !code.trim()) continue
    try { new Function(code) }
    catch (error) {
      add("SCRIPT_SYNTAX", "critical", `a <script> does not parse (${error instanceof Error ? error.message : "syntax error"}) — nothing on the page that depends on it works`)
      break
    }
  }

  const ids = new Set([...doc.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))
  const broken = [...new Set([...doc.matchAll(/\shref\s*=\s*["']#([^"'\s]+)["']/gi)].map((m) => m[1]))].filter((id) => !ids.has(id) && id !== "top")
  if (broken.length) add("BROKEN_ANCHORS", "critical", `links point at sections that do not exist: #${broken.slice(0, 6).join(", #")}`)

  const visible = doc.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
  const placeholder = visible.match(/lorem ipsum|\bTODO\b|your (?:company|brand|business) name|название компании|ваш(?:а|е)? (?:компания|бренд) здесь|placeholder text|insert (?:image|text)|example\.com/i)
  if (placeholder) add("PLACEHOLDER", "critical", `placeholder copy is visible: "${placeholder[0]}"`)

  const badImages = [...doc.matchAll(/<img\b[^>]*\ssrc\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]).filter((src) => !/^(?:https:\/\/|data:image\/)/i.test(src))
  if (badImages.length) add("LOCAL_IMAGES", "quality", `images point at files that do not exist in a single-file site: ${badImages.slice(0, 3).join(", ")}`)

  const chapters = (doc.match(/<section\b/gi) || []).length
  if (chapters < 8) add("FEW_CHAPTERS", "quality", `only ${chapters} <section> chapters — a flagship site needs 10–14`)
  const words = visible.split(/\s+/).filter((word) => /[\p{L}\p{N}]{2,}/u.test(word)).length
  if (words < 900) add("THIN_COPY", "quality", `only about ${words} words of copy — write at least 1,200 words of specific, finished text`)
  const visuals = (doc.match(/<(?:img|video|canvas|picture)\b/gi) || []).length + (doc.match(/<svg\b[^>]*\bviewBox/gi) || []).length
  if (visuals < 4) add("FEW_VISUALS", "quality", `only ${visuals} images, videos or drawn visuals — use every verified photo and video, large`)
  if (options.motion) {
    const cinema = (doc.match(CINEMA) || []).length
    if (cinema < 8) add("FLAT_MOTION", "quality", `only ${cinema} MALIK Cinema attributes — reveals, split headings, a nav and a scene are expected`)
    if (!/\sdata-scene\s*=/i.test(doc)) add("NO_SCENE", "quality", "no data-scene chapter — the signature scroll scenes of the recipe are missing")
  }
  return issues
}

/** A broken draft, or one weak in two or more ways, is worth a second pass. */
export function siteNeedsUpgrade(issues: SiteIssue[]) {
  return issues.some((issue) => issue.severity === "critical") || issues.length >= 2
}
