"use client"

import { useEffect, useState } from "react"

const KEY = "malik.web-search.enabled.v1"
const EVENT = "malik-web-search-changed"

export function readWebSearchEnabled(): boolean {
  if (typeof window === "undefined") return true
  try { return window.localStorage.getItem(KEY) !== "0" } catch { return true }
}

export function useWebSearchEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    const sync = () => setEnabled(readWebSearchEnabled())
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return [enabled, (next) => {
    setEnabled(next)
    try { window.localStorage.setItem(KEY, next ? "1" : "0") } catch { /* session only */ }
    window.dispatchEvent(new Event(EVENT))
  }]
}
