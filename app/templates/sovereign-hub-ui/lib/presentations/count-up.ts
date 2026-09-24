/**
 * The number inside a slide's figure — "≈3 200", "40%", "$1.2M", "1 600 ₸" —
 * split from whatever surrounds it, so the figure can count up from zero while
 * its sign, unit and currency stay where they are.
 *
 * Anything that is not one plain number ("1/14", "2024–2026", "x3 и x5")
 * returns null and is shown as written, never mangled into a wrong count.
 */

export type NumberParts = {
  before: string
  after: string
  target: number
  decimals: number
  decimalMark: string
  groupMark: string
}

export function splitNumber(value: string): NumberParts | null {
  const match = String(value || "").match(/^(\D*?)(\d(?:[\d\s.,]*\d)?)(\D*)$/u)
  if (!match) return null
  const [, before, digits, after] = match

  const decimalMatch = digits.match(/[.,](\d{1,2})$/)
  const decimalMark = decimalMatch ? decimalMatch[0][0] : ""
  const decimals = decimalMatch ? decimalMatch[1].length : 0
  const whole = decimalMatch ? digits.slice(0, -decimalMatch[0].length) : digits

  // \s covers the no-break spaces numbers are often grouped with.
  const groupMark = /\s/.test(whole) ? "\u00A0" : (whole.match(/[.,](?=\d{3}(?:\D|$))/)?.[0] ?? "")
  // A separator that is neither a decimal mark nor a clean thousands group
  // ("1.2.3", "12,34,5") means this is not a number we can count.
  if (/[.,]/.test(whole.replace(/[.,](?=\d{3}(?:[.,\s]|$))/g, ""))) return null

  const target = Number(`${whole.replace(/[^\d]/g, "")}${decimals ? `.${decimalMatch?.[1]}` : ""}`)
  if (!Number.isFinite(target) || target > 1e12) return null

  return { before, after, target, decimals, decimalMark, groupMark }
}

/** The figure at `n` on its way to `parts.target`, written the way the original was. */
export function formatCounted(parts: NumberParts, n: number) {
  const [whole, fraction] = Math.max(0, n).toFixed(parts.decimals).split(".")
  const grouped = parts.groupMark ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, parts.groupMark) : whole
  return `${parts.before}${grouped}${fraction ? `${parts.decimalMark}${fraction}` : ""}${parts.after}`
}
