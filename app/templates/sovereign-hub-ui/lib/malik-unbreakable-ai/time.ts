export function isoNow() {
  try {
    return new Date().toISOString()
  } catch {
    return String(Date.now())
  }
}

export function ageMs(iso?: string) {
  const time = iso ? Date.parse(iso) : NaN
  return Number.isFinite(time) ? Date.now() - time : 0
}

export function humanTime(ms: number) {
  if (!Number.isFinite(ms)) return "0ms"
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

