"use client"

import { useCallback, useEffect, useState } from "react"
import { getMalikPlugin } from "@/components/sovereign/features/plugin-registry"

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
 * User-controlled long-term memory. It is deliberately browser-local for now:
 * no private fact is uploaded merely because it was saved. The chat runtime may
 * opt in to serialising this context only while the main memory switch is on.
 */
export type MalikMemoryItem = {
  id: string
  text: string
  createdAt: string
  updatedAt: string
}

const MEMORY_ACCOUNT_PREFIX = "malik.memory.items.v2:account:"
export const MEMORY_EVENT = "malik-memory-changed"
export const MAX_MEMORY_ITEMS = 40
export const MAX_MEMORY_ITEM_CHARS = 600
const MAX_MEMORY_CONTEXT_CHARS = 4200

type MemoryScopedWindow = Window & { __malikMemoryAccountScopeV2?: string }

/** Authenticated identity comes from the existing account boundary. Keep it
 * browser-local, not in mutable module scope shared by concurrent SSR requests.
 */
export function setMalikMemoryAccountScope(accountId: string): void {
  if (typeof window === "undefined") return
  const account = String(accountId || "").trim().toLowerCase()
  const scope = account && account.length <= 320 ? encodeURIComponent(account) : ""
  const browser = window as MemoryScopedWindow
  if (browser.__malikMemoryAccountScopeV2 === scope) return
  browser.__malikMemoryAccountScopeV2 = scope
  window.dispatchEvent(new CustomEvent(MEMORY_EVENT))
}

function memoryStorageKey(): string {
  if (typeof window === "undefined") return ""
  const scope = (window as MemoryScopedWindow).__malikMemoryAccountScopeV2
  // Never assign legacy unowned v1 memories to whichever account logs in
  // next. The legacy key is retained unchanged for an explicit owner-led recovery.
  return scope ? MEMORY_ACCOUNT_PREFIX + scope : ""
}

function normaliseMemoryText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_ITEM_CHARS)
}

function isMemoryItem(value: unknown): value is MalikMemoryItem {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<MalikMemoryItem>
  return typeof item.id === "string"
    && typeof item.text === "string"
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string"
}

function memoryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export function readMalikMemories(): MalikMemoryItem[] {
  if (typeof window === "undefined") return []
  const key = memoryStorageKey()
  if (!key) return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isMemoryItem)
      .map((item) => ({ ...item, text: normaliseMemoryText(item.text) }))
      .filter((item) => Boolean(item.text))
      .slice(0, MAX_MEMORY_ITEMS)
  } catch {
    return []
  }
}

function writeMalikMemories(items: MalikMemoryItem[]) {
  const key = memoryStorageKey()
  if (!key || typeof window === "undefined") return false
  const safe = items
    .filter(isMemoryItem)
    .map((item) => ({ ...item, text: normaliseMemoryText(item.text) }))
    .filter((item) => Boolean(item.text))
    .slice(0, MAX_MEMORY_ITEMS)
  try {
    window.localStorage.setItem(key, JSON.stringify(safe))
  } catch {
    /* Storage can be unavailable in private/restricted browser modes. */
    return false
  }
  window.dispatchEvent(new CustomEvent(MEMORY_EVENT, { detail: safe }))
  return true
}

export function addMalikMemory(text: string): MalikMemoryItem | null {
  const clean = normaliseMemoryText(text)
  if (!clean) return null
  const now = new Date().toISOString()
  const item: MalikMemoryItem = { id: memoryId(), text: clean, createdAt: now, updatedAt: now }
  return writeMalikMemories([item, ...readMalikMemories()]) ? item : null
}

export function updateMalikMemory(id: string, text: string): boolean {
  const clean = normaliseMemoryText(text)
  if (!clean) return false
  const items = readMalikMemories()
  let changed = false
  const next = items.map((item) => {
    if (item.id !== id) return item
    changed = true
    return { ...item, text: clean, updatedAt: new Date().toISOString() }
  })
  return changed && writeMalikMemories(next)
}

export function removeMalikMemory(id: string): void {
  writeMalikMemories(readMalikMemories().filter((item) => item.id !== id))
}

export function clearMalikMemories(): void {
  writeMalikMemories([])
}

export function buildMalikMemoryContext(): string {
  if (!readContextEnabled()) return ""
  const items = readMalikMemories()
  if (!items.length) return ""
  const lines = items.map((item) => `- ${item.text}`)
  return [
    "User-controlled Malik AI memory. Use it only when relevant; never claim a remembered fact that is not listed here:",
    ...lines,
  ].join("\n").slice(0, MAX_MEMORY_CONTEXT_CHARS)
}

export function useMalikMemories(): MalikMemoryItem[] {
  const [items, setItems] = useState<MalikMemoryItem[]>([])

  useEffect(() => {
    const sync = () => setItems(readMalikMemories())
    sync()
    window.addEventListener(MEMORY_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(MEMORY_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  return items
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
const PLUGIN_COMMAND = /^\/plugin\s+([a-z0-9_-]+)(?:\s|$)/i
export const VERIFIED_PLUGIN_USE_KEY = "malik.plugin.verified.once"

function accountPluginConnectTarget(text: string): string {
  if (typeof window === "undefined") return ""

  const match = text.trim().match(PLUGIN_COMMAND)
  if (!match) return ""

  const plugin = getMalikPlugin(match[1])
  if (!plugin || plugin.runtime !== "pipes") return ""

  // The marketplace has just checked this connection server-side. Avoid a
  // redundant OAuth redirect when the user presses "Use" on a connected card.
  // The plugin runtime still validates the credential before any API call.
  try {
    if (window.sessionStorage.getItem(VERIFIED_PLUGIN_USE_KEY) === plugin.id) {
      window.sessionStorage.removeItem(VERIFIED_PLUGIN_USE_KEY)
      return ""
    }
  } catch {}

  const current = new URL(window.location.href)
  const returnedPlugin = current.searchParams.get("plugin")
  const returnedStatus = current.searchParams.get("plugin_status")

  // /api/plugins/connect adds these markers when the account is confirmed.
  // Consume the pending prompt normally after OAuth instead of redirecting again.
  if (returnedPlugin === plugin.id && returnedStatus === "connected") {
    current.searchParams.delete("plugin")
    current.searchParams.delete("plugin_status")
    window.history.replaceState(window.history.state, "", `${current.pathname}${current.search}${current.hash}`)
    return ""
  }

  const returnTo = `${current.pathname}${current.search}${current.hash}` || "/dashboard"
  return `/api/plugins/connect?id=${encodeURIComponent(plugin.id)}&return_to=${encodeURIComponent(returnTo)}`
}

export function prefillPrompt(text: string): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(PREFILL_STORAGE_KEY, text)
  } catch {
    /* The event still fills a mounted workspace when storage is unavailable. */
  }
  window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: text }))
}

/**
 * Read a template prompt exactly once when the destination workspace mounts.
 * Account-backed plugin commands are gated through the real WorkOS connection
 * route first; public plugins keep the zero-click prefill behavior.
 */
export function takePrefillPrompt(): string {
  if (typeof window === "undefined") return ""
  try {
    const value = window.sessionStorage.getItem(PREFILL_STORAGE_KEY) || ""
    if (!value) return ""

    const connectTarget = accountPluginConnectTarget(value)
    if (connectTarget) {
      // Keep the prompt in sessionStorage across the OAuth round trip. Once the
      // provider is connected, the status marker lets the next mount consume it.
      window.location.assign(connectTarget)
      return ""
    }

    window.sessionStorage.removeItem(PREFILL_STORAGE_KEY)
    return value
  } catch {
    return ""
  }
}
