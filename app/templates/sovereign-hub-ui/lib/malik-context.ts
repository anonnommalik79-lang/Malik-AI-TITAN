"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * The "Контекст" switch in the right rail and the "Memory" chip in the composer
 * are the same setting shown twice, so they share one persisted value and one
 * event. Turning it off makes handleSendMessage send only the current message
 * instead of the last twelve — the switch changes what leaves the browser, it
 * is not a label.
 */
const STORAGE_KEY = "malik.context.enabled.v1"
const EVENT = "malik-context-changed"

export function readContextEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? true : raw === "1"
  } catch {
    return true
  }
}

export function writeContextEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    /* private mode — the setting still applies for this session */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: enabled }))
}

/** Subscribe to the shared switch. Returns the current value and a setter. */
export function useContextEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    setEnabled(readContextEnabled())
    const sync = () => setEnabled(readContextEnabled())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const update = useCallback((next: boolean) => {
    setEnabled(next)
    writeContextEnabled(next)
  }, [])

  return [enabled, update]
}

/**
 * Rough token count for the context meter. Russian and Kazakh run about three
 * characters per token on byte-pair vocabularies, English closer to four; three
 * and a half is a fair middle and keeps the number honest as an estimate rather
 * than presenting a precise figure nobody measured.
 */
export function estimateTokens(texts: string[]): number {
  const characters = texts.reduce((total, text) => total + (text ? text.length : 0), 0)
  return Math.round(characters / 3.5)
}

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`
  return `${(count / 1000).toFixed(1).replace(".0", "")}K`
}

/** Prefill the home composer from anywhere (sidebar tools, shortcuts). */
export const PREFILL_EVENT = "malik-prefill-prompt"
const PREFILL_STORAGE_KEY = "malik.prefill.prompt.v1"

export function prefillPrompt(text: string): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(PREFILL_STORAGE_KEY, text)
  } catch {
    /* The event still fills a mounted workspace when storage is unavailable. */
  }
  window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: text }))
}

/** Read a template prompt exactly once when the destination workspace mounts. */
export function takePrefillPrompt(): string {
  if (typeof window === "undefined") return ""
  try {
    const value = window.sessionStorage.getItem(PREFILL_STORAGE_KEY) || ""
    window.sessionStorage.removeItem(PREFILL_STORAGE_KEY)
    return value
  } catch {
    return ""
  }
}
