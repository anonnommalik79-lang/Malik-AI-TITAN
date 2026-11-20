export function chartPlot(values: number[]) {
  const magnitude = Math.max(Number.MIN_VALUE, ...values.map(Math.abs))
  const normalized = values.map((value) => value / magnitude)
  const min = Math.min(0, ...normalized)
  const max = Math.max(0, ...normalized)
  const padding = (max - min || 1) * 0.14
  const bottom = min < 0 ? min - padding : 0
  const range = max + padding - bottom
  const zero = -bottom / range * 100
  return {
    zero,
    marks: normalized.map((value) => ({
      bottom: (Math.min(0, value) - bottom) / range * 100,
      height: Math.abs(value) / range * 100,
    })),
  }
}

export function formatChartValue(value: number, language: string) {
  const locale = language === "kk" ? "kk-KZ" : language === "ru" ? "ru-RU" : "en-US"
  const notation = Math.abs(value) < 0.000001 && value !== 0 ? "scientific" : "standard"
  return new Intl.NumberFormat(locale, { notation, maximumFractionDigits: 6 }).format(Object.is(value, -0) ? 0 : value)
}
