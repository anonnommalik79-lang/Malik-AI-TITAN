"use client"

import { Component, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { Maximize2, X } from "lucide-react"
import { OverlayPortal } from "@/components/sovereign/OverlayPortal"
import type { VisualBlock, VisualDataKind } from "@/lib/visual/schema"

/** Categorical slots, validated for CVD and contrast on the #111 dark surface. */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
export const GRID = "#2c2c2c"
export const AXIS = "#383838"
export const INK_2 = "#c8c8c8"

const BADGE: Record<VisualDataKind, string> = { user: "Ваши данные", sourced: "По источникам", estimate: "Оценка", example: "Demo" }
const BADGE_TITLE: Record<VisualDataKind, string> = {
  user: "Построено по данным, которые вы указали",
  sourced: "Цифры взяты из перечисленных источников",
  estimate: "Оценка и допущения, а не фактические данные",
  example: "Демонстрационные данные для примера, не реальные показатели",
}

/* ------------------------------------------------------------ shared state */

/**
 * Interactive choices - period tab, slider positions, hidden series, sort -
 * live in one small store per block. The inline card and its fullscreen copy
 * read the same entry, and with a message id the choices are kept in
 * localStorage, so reopening a chat restores them. Storage is bounded and
 * optional: a private window simply starts fresh.
 */
type Entry = Record<string, unknown>
const memory = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()
const STORAGE_PREFIX = "malik-visual-v1:"
const STORAGE_LIMIT = 80

function readStored(key: string): Entry {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key)
    const value = raw ? JSON.parse(raw) : null
    return value && typeof value === "object" && !Array.isArray(value) ? value : {}
  } catch { return {} }
}

function writeStored(key: string, entry: Entry) {
  try {
    const name = STORAGE_PREFIX + key
    const keys = Object.keys(window.localStorage).filter((item) => item.startsWith(STORAGE_PREFIX))
    if (!keys.includes(name) && keys.length >= STORAGE_LIMIT) window.localStorage.removeItem(keys[0])
    const raw = JSON.stringify(entry)
    if (raw.length < 8_000) window.localStorage.setItem(name, raw)
  } catch { /* storage is a convenience, never a requirement */ }
}

function entryFor(key: string, persist: boolean) {
  let entry = memory.get(key)
  if (!entry) {
    entry = persist && typeof window !== "undefined" ? readStored(key) : {}
    memory.set(key, entry)
  }
  return entry
}

export function useVisualField<T>(storeKey: string, persist: boolean, field: string, initial: T, valid: (value: unknown) => value is T) {
  const subscribe = useCallback((notify: () => void) => {
    const set = listeners.get(storeKey) || new Set()
    set.add(notify)
    listeners.set(storeKey, set)
    return () => { set.delete(notify) }
  }, [storeKey])
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const stored = useSyncExternalStore(subscribe, () => (hydrated ? entryFor(storeKey, persist)[field] : undefined), () => undefined)
  const value = valid(stored) ? stored : initial
  const set = useCallback((next: T) => {
    const entry = { ...entryFor(storeKey, persist), [field]: next }
    memory.set(storeKey, entry)
    if (persist) writeStored(storeKey, entry)
    listeners.get(storeKey)?.forEach((notify) => notify())
  }, [storeKey, persist, field])
  const reset = useCallback(() => {
    const entry = { ...entryFor(storeKey, persist) }
    delete entry[field]
    memory.set(storeKey, entry)
    if (persist) writeStored(storeKey, entry)
    listeners.get(storeKey)?.forEach((notify) => notify())
  }, [storeKey, persist, field])
  return [value, set, reset] as const
}

export const isIndex = (max: number) => (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < max
export const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 64 && value.every((item) => typeof item === "string")

/** Short stable hash, so an answer without a message id still has one store per block. */
export function blockHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(36)
}

/* ------------------------------------------------------------------ chrome */

export function Badge({ kind }: { kind: VisualDataKind }) {
  return <span className={`mv-badge is-${kind}`} title={BADGE_TITLE[kind]}>
    <span className="mv-badge__dot" aria-hidden="true" /><span className="mv-badge__text">{BADGE[kind]}</span>
  </span>
}

export type CardProps = {
  block: VisualBlock
  icon: ReactNode
  /** Right side of the header, before the badge. */
  actions?: ReactNode
  big?: boolean
  onFullscreen?: () => void
  children: ReactNode
  label: string
}

export function VisualCard({ block, icon, actions, big, onFullscreen, children, label }: CardProps) {
  return <section className={`mv-card${big ? " is-big" : ""}`} data-malik-visual-engine={block.type} data-preserve-brand-color="true" aria-label={`${label}: ${block.title}`}>
    {/* A div, not <header>: the app hides the second div of every header element. */}
    <div className="mv-head">
      <span className="mv-head__icon" aria-hidden="true">{icon}</span>
      <div className="mv-head__text">
        <h3 className="mv-title">{block.title}</h3>
        {block.subtitle ? <p className="mv-subtitle">{block.subtitle}</p> : null}
      </div>
      <div className="mv-head__side">
        {actions}
        {onFullscreen && !big ? <button type="button" className="mv-iconbtn" onClick={onFullscreen} aria-label="Открыть на весь экран" title="На весь экран"><Maximize2 /></button> : null}
        <Badge kind={block.dataKind} />
      </div>
    </div>
    {children}
    {block.note ? <p className="mv-note">{block.note}</p> : null}
    {block.asOf ? <p className="mv-note">Актуально на {block.asOf}</p> : null}
    {block.sources?.length ? <div className="mv-sources" aria-label="Источники данных">
      {block.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer nofollow" title={source.url}>{source.title}</a>)}
    </div> : null}
  </section>
}

/** A fullscreen copy of a block, above the dashboard's stacking contexts. */
export function Fullscreen({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey) }
  }, [open, onClose])
  if (!open) return null
  return <OverlayPortal>
    <div className="mv-full" role="dialog" aria-modal="true" onClick={onClose}>
      <div style={{ width: "min(1200px, 100%)", position: "relative" }} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="mv-iconbtn" onClick={onClose} aria-label="Закрыть" style={{ position: "absolute", right: 10, top: 10, zIndex: 3 }}><X /></button>
        {children}
      </div>
    </div>
  </OverlayPortal>
}

export function Skeleton({ height }: { height: number }) {
  return <div className="mv-skeleton" style={{ height }} aria-hidden="true" />
}

export function useToast() {
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(""), 1400)
    return () => window.clearTimeout(timer)
  }, [message])
  return [message ? <div className="mv-toast" role="status">{message}</div> : null, setMessage] as const
}

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
}

/**
 * An ASCII file name. Browsers silently replace a non-Latin download name with
 * "download", so «Сравнение моделей» becomes sravnenie-modeley.csv.
 */
export function fileName(title: string, extension: string) {
  const latin = [...title.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join("")
  const base = latin.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "malik-visual"
  return `${base}.${extension}`
}

export function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  // Leading = + - @ would be read as a formula by spreadsheet apps.
  const safe = /^[=+\-@\t\r]/u.test(text) && !/^-?\d/u.test(text) ? `'${text}` : text
  return /[",\n;]/u.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** One failing block never takes the message, or its neighbours, down with it. */
export class VisualBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.warn("[MALIK_VISUAL] render failed", error instanceof Error ? error.message : error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
