"use client"

import { useCallback, useEffect, useState } from "react"

type NavPosition = {
  left: number
  top: number
  visible: boolean
}

const SOURCE_NOTES = new Set([
  "Опубликовано в Malik Shorts",
  "Опубликовано в YouTube",
  "Импортировано из TikTok",
])

function feedArticles() {
  return Array.from(document.querySelectorAll<HTMLElement>("article[data-short-id]"))
    .filter((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
}

function activeArticle() {
  const items = feedArticles()
  if (!items.length) return null
  const viewportCenter = window.innerHeight / 2
  return items.reduce((best, item) => {
    const rect = item.getBoundingClientRect()
    const bestRect = best.getBoundingClientRect()
    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter)
    const bestDistance = Math.abs(bestRect.top + bestRect.height / 2 - viewportCenter)
    return distance < bestDistance ? item : best
  }, items[0])
}

function youtubeCommand(frame: HTMLIFrameElement, func: "unMute") {
  frame.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args: [] }),
    "https://www.youtube.com",
  )
}

/**
 * Unlock sound after a neutral user gesture without changing playback state.
 *
 * This helper used to call play() / playVideo() every time the Shorts DOM
 * changed, scrolled or received a pointerdown. That meant pressing Pause was
 * immediately followed by another forced Play command, so the visible pause
 * button looked broken. Playback belongs to ShortPlayer; this helper may only
 * unlock audio and must never resume a video the viewer deliberately paused.
 */
function unlockSound(article: HTMLElement) {
  const muteButton = article.querySelector<HTMLButtonElement>('button[aria-label="Включить звук"]')
  muteButton?.click()

  const video = article.querySelector<HTMLVideoElement>("video")
  if (video) {
    video.muted = false
    video.defaultMuted = false
    video.volume = 1
    video.removeAttribute("muted")
  }

  const frame = article.querySelector<HTMLIFrameElement>('iframe[src*="youtube.com/embed/"]')
  if (frame) {
    youtubeCommand(frame, "unMute")
    // The iframe may receive the first audio command before its JS API is ready.
    // Retrying unMute is safe because it does not alter play/pause state.
    window.setTimeout(() => youtubeCommand(frame, "unMute"), 180)
    window.setTimeout(() => youtubeCommand(frame, "unMute"), 650)
  }
}

function findSourceBadge(article: HTMLElement) {
  return Array.from(article.querySelectorAll<HTMLElement>("span")).find((node) => {
    const text = node.textContent?.trim() || ""
    return SOURCE_NOTES.has(text)
  }) || null
}

function findSoundRow(article: HTMLElement) {
  return Array.from(article.querySelectorAll<HTMLElement>("div")).find((node) => {
    const text = node.textContent?.trim() || ""
    return text.startsWith("Оригинальный звук —") && node.querySelector("span") !== null
  }) || null
}

function moveSourceBadge(article: HTMLElement) {
  const badge = findSourceBadge(article)
  if (!badge) return
  badge.dataset.malikSourceTop = "hidden"

  const note = badge.textContent?.trim() || "Источник"
  const existing = article.querySelector<HTMLElement>("[data-malik-source-chip]")
  if (existing) {
    existing.dataset.sourceNote = note
    return
  }

  const chip = document.createElement("div")
  chip.dataset.malikSourceChip = "true"
  chip.dataset.sourceNote = note

  const sourceIcon = badge.querySelector<HTMLElement>("span")?.cloneNode(true)
  if (sourceIcon instanceof HTMLElement) {
    sourceIcon.removeAttribute("style")
    chip.appendChild(sourceIcon)
  }

  const label = document.createElement("span")
  label.textContent = note
  chip.appendChild(label)

  const soundRow = findSoundRow(article)
  if (soundRow?.parentElement) {
    soundRow.parentElement.insertBefore(chip, soundRow)
  } else {
    const card = article.querySelector<HTMLElement>("section")
    if (card) {
      chip.dataset.floating = "true"
      card.appendChild(chip)
    }
  }
}

export function ShortsUXFixes() {
  const [nav, setNav] = useState<NavPosition>({ left: 0, top: 0, visible: false })

  const sync = useCallback(() => {
    for (const article of feedArticles()) moveSourceBadge(article)

    const current = activeArticle()
    if (!current) {
      setNav((value) => value.visible ? { ...value, visible: false } : value)
      return
    }

    // Do not call play(), playVideo(), pause(), or flip mute state here. `sync`
    // runs on DOM mutations and scroll, so touching playback from this path would
    // fight the actual player controls and make user choices non-persistent.

    if (window.innerWidth <= 860) {
      setNav((value) => value.visible ? { ...value, visible: false } : value)
      return
    }

    const card = current.querySelector<HTMLElement>("section")
    if (!card) return
    const rect = card.getBoundingClientRect()
    const left = Math.min(window.innerWidth - 54, Math.max(8, rect.right + 12))
    const top = Math.min(window.innerHeight - 118, Math.max(12, rect.top + rect.height / 2 - 50))
    setNav({ left, top, visible: true })
  }, [])

  const go = useCallback((direction: -1 | 1) => {
    const items = feedArticles()
    if (!items.length) return
    const current = activeArticle()
    const index = current ? items.indexOf(current) : 0
    const nextIndex = Math.max(0, Math.min(items.length - 1, index + direction))
    const target = items[nextIndex]
    if (!target || target === current) return
    target.scrollIntoView({ behavior: "smooth", block: "start" })
    window.setTimeout(sync, 360)
  }, [sync])

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(sync)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", schedule)
    window.addEventListener("scroll", schedule, true)

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      if (event.key === "ArrowDown") { event.preventDefault(); go(1) }
      if (event.key === "ArrowUp") { event.preventDefault(); go(-1) }
    }
    window.addEventListener("keydown", onKeyDown)

    // Audible autoplay may need one real user gesture. Unlock it only from a
    // neutral tap on the video area, never from a control button: pressing
    // Pause, Mute, Like, Save, etc. must perform exactly that action and nothing
    // else. This listener removes itself after the first successful neutral tap.
    let unlocked = false
    const unlock = (event: PointerEvent | TouchEvent) => {
      if (unlocked) return
      const target = event.target as HTMLElement | null
      if (!target || target.closest("button, a, input, textarea, [role='slider'], [contenteditable='true']")) return
      const current = activeArticle()
      if (!current || !current.contains(target)) return
      unlocked = true
      unlockSound(current)
    }
    window.addEventListener("pointerdown", unlock, { capture: true, passive: true })
    window.addEventListener("touchstart", unlock, { capture: true, passive: true })

    schedule()
    const timers = [120, 450, 1100].map((delay) => window.setTimeout(schedule, delay))

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(raf)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", schedule, true)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", unlock, true)
      window.removeEventListener("touchstart", unlock, true)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [go, sync])

  if (!nav.visible) return null

  return (
    <div className="malik-shorts-desktop-scroll-nav" style={{ left: nav.left, top: nav.top }} aria-label="Навигация по роликам">
      <button type="button" aria-label="Предыдущий ролик" onClick={() => go(-1)} title="Предыдущий ролик">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 14.5 5.5-5.5 5.5 5.5" /></svg>
      </button>
      <button type="button" aria-label="Следующий ролик" onClick={() => go(1)} title="Следующий ролик">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 9.5 5.5 5.5 5.5-5.5" /></svg>
      </button>
    </div>
  )
}
