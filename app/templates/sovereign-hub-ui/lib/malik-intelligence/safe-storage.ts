export function canUseStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage)
  } catch {
    return false
  }
}

export function safeGet(key: string, fallback = "") {
  if (!canUseStorage()) return fallback
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function safeSet(key: string, value: string) {
  if (!canUseStorage()) return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeRemove(key: string) {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function getJson<T>(key: string, fallback: T): T {
  return safeJson<T>(safeGet(key), fallback)
}

export function setJson(key: string, value: unknown) {
  try {
    return safeSet(key, JSON.stringify(value))
  } catch {
    return false
  }
}

