import { safeParse, safeStringify } from "./safe-json"

export function hasLocalStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage)
  } catch {
    return false
  }
}

export function ubGet(key: string, fallback = "") {
  if (!hasLocalStorage()) return fallback
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function ubSet(key: string, value: string) {
  if (!hasLocalStorage()) return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function ubRemove(key: string) {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

export function ubGetJson<T>(key: string, fallback: T): T {
  return safeParse<T>(ubGet(key), fallback)
}

export function ubSetJson(key: string, value: unknown) {
  return ubSet(key, safeStringify(value))
}

