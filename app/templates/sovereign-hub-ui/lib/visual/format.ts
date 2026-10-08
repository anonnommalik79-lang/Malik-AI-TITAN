/** Number formatting for the Visual Engine: one place, so every block reads the same. */

export type VisualCurrency = "USD" | "KZT" | "EUR" | "RUB"

const SYMBOL: Record<VisualCurrency, string> = { USD: "$", KZT: "₸", EUR: "€", RUB: "₽" }
/** Dollars and euros read as $11,050; tenge and roubles as 11 050 ₸. */
const LOCALE: Record<VisualCurrency, string> = { USD: "en-US", EUR: "en-US", KZT: "ru-RU", RUB: "ru-RU" }

const cache = new Map<string, Intl.NumberFormat>()
function formatter(locale: string, options: Intl.NumberFormatOptions) {
  const key = locale + JSON.stringify(options)
  let value = cache.get(key)
  if (!value) { value = new Intl.NumberFormat(locale, options); cache.set(key, value) }
  return value
}

/** Up to two decimals, trailing zeros dropped; whole numbers stay whole. */
export function formatNumber(value: number, locale = "ru-RU", digits = 2) {
  if (!Number.isFinite(value)) return "—"
  const decimals = Math.abs(value) >= 1000 ? 0 : digits
  return formatter(locale, { maximumFractionDigits: decimals }).format(value)
}

export function formatCurrency(value: number, currency: VisualCurrency = "USD", digits?: number) {
  if (!Number.isFinite(value)) return "—"
  const locale = LOCALE[currency]
  const decimals = digits ?? (Math.abs(value) >= 100 || Number.isInteger(value) ? 0 : 2)
  const number = formatter(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(value))
  const sign = value < 0 ? "−" : ""
  return locale === "en-US" ? `${sign}${SYMBOL[currency]}${number}` : `${sign}${number} ${SYMBOL[currency]}`
}

export function formatPercent(value: number, locale = "ru-RU") {
  if (!Number.isFinite(value)) return "—"
  return `${formatter(locale, { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1 }).format(value)}%`
}

/** 1 329 → 1,3 тыс.; for axis ticks. */
export function formatCompact(value: number, locale = "ru-RU") {
  if (!Number.isFinite(value)) return "—"
  if (Math.abs(value) < 10_000) return formatNumber(value, locale, Math.abs(value) < 10 ? 2 : 1)
  return formatter(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function formatDuration(seconds: number, locale = "ru-RU") {
  if (!Number.isFinite(seconds)) return "—"
  if (seconds < 1) return `${formatNumber(seconds * 1000, locale, 0)} мс`
  if (seconds < 120) return `${formatNumber(seconds, locale, 1)} с`
  if (seconds < 7200) return `${formatNumber(seconds / 60, locale, 1)} мин`
  return `${formatNumber(seconds / 3600, locale, 1)} ч`
}

export function plural(count: number, one: string, few: string, many: string) {
  const n = Math.abs(Math.trunc(count)) % 100
  const last = n % 10
  if (n > 10 && n < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

/** A value with its unit; units like «%» and «$» attach, words get a space. */
export function withUnit(text: string, unit?: string) {
  if (!unit) return text
  if (unit === "$" || unit === "€") return `${unit}${text}`
  if (unit === "%") return `${text}%`
  return `${text} ${unit}`
}
