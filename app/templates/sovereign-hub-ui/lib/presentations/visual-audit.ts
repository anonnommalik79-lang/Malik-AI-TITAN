/**
 * Actual on-screen layout measurement, only for the editor's active slide.
 * No model calls, uploaded screenshots, canvas snapshots or extra RAM-heavy
 * workers. Run after layout/paint, never during slide build animations.
 *
 * Heuristics do not prove every glyph fits: the text can still be too small
 * to present comfortably, hence the separate editorial quality inspector.
 */
export type VisualIssue = {
  code: "canvas-edge" | "cell-overflow" | "clipped-text"
  label: string
}

const TARGETS = [
  ".deck-h", ".deck-sub", ".deck-intro", ".deck-kicker",
  ".deck-row strong", ".deck-row p", ".deck-col h3", ".deck-col li",
  ".deck-card h3", ".deck-card p", ".deck-feature h3", ".deck-feature p",
  ".deck-stat-value", ".deck-stat-label", ".deck-quote-text", ".deck-quote-by",
  ".deck-imgtext .deck-text", ".deck-imgtext li",
  ".deck-step h3", ".deck-step p", ".deck-process-arrow h3", ".deck-process-step p",
  ".deck-table th", ".deck-table td", ".deck-verdict", ".deck-bar-label",
  ".deck-takeaway", ".deck-gallery-item figcaption", ".deck-contact",
].join(",")

const CELLS = [
  ".deck-row", ".deck-col", ".deck-card", ".deck-feature",
  ".deck-step", ".deck-process-arrow", ".deck-gallery-item",
].join(",")

/** Browser geometry is in CSS pixels transformed by the thumbnail/phone scale. */
export function inspectVisualOverflow(slide: HTMLElement): VisualIssue[] {
  const canvas = slide.getBoundingClientRect()
  if (canvas.width <= 0 || canvas.height <= 0) return []
  const scale = canvas.width / 1280
  const epsilon = Math.max(1.5, 3 * scale)
  const issues: VisualIssue[] = []
  const seen = new Set<string>()

  for (const node of Array.from(slide.querySelectorAll<HTMLElement>(TARGETS))) {
    const label = (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 72)
    if (!label || !node.getClientRects().length) continue
    const bounds = node.getBoundingClientRect()
    if (bounds.width < 1 || bounds.height < 1) continue

    let code: VisualIssue["code"] | null = null
    if (bounds.right > canvas.right + epsilon || bounds.bottom > canvas.bottom + epsilon ||
        bounds.left < canvas.left - epsilon || bounds.top < canvas.top - epsilon) {
      code = "canvas-edge"
    } else if (node.scrollWidth > node.clientWidth + 4 || node.scrollHeight > node.clientHeight + 4) {
      code = "clipped-text"
    } else {
      const cell = node.closest<HTMLElement>(CELLS)
      if (cell && cell !== node) {
        const box = cell.getBoundingClientRect()
        if (bounds.bottom > box.bottom + epsilon || bounds.right > box.right + epsilon) code = "cell-overflow"
      }
    }
    if (!code) continue
    const key = `${code}:${label}`
    if (seen.has(key)) continue
    seen.add(key)
    issues.push({ code, label })
    if (issues.length >= 6) break
  }
  return issues
}
