"use client"

import { useEffect } from "react"

const STOP_MARKERS = [
  "Генерация остановлена пользователем.",
  "Остановлено пользователем.",
]

const TEXT_REPLACEMENTS: Array<[string, string]> = [
  ["Ошибка генерации", "Остановлено"],
  ["Видео создаётся", "Генерация остановлена"],
  ["Изображение создаётся", "Генерация остановлена"],
  ["Видео ещё рендерится", "Генерация остановлена"],
]

function polishStoppedTurn(row: HTMLElement) {
  const text = row.textContent || ""
  if (!STOP_MARKERS.some((marker) => text.includes(marker))) return

  row.setAttribute("data-malik-stopped", "1")

  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    if (node instanceof Text) nodes.push(node)
    node = walker.nextNode()
  }

  for (const textNode of nodes) {
    let value = textNode.nodeValue || ""
    for (const [from, to] of TEXT_REPLACEMENTS) value = value.replaceAll(from, to)
    if (value !== textNode.nodeValue) textNode.nodeValue = value
  }
}

const MEDIA_ROW = "[data-malik-message='assistant']:not([data-malik-text-turn])"

export function MalikStopPolish() {
  useEffect(() => {
    if (typeof document === "undefined") return

    // Only the answers that changed are read again. Rereading every answer's
    // text on each frame of a long stream cost the whole thread's length per
    // frame; the streaming answer alone is enough.
    let frame = 0
    const pending = new Set<HTMLElement>()
    const scan = () => {
      frame = 0
      pending.forEach((row) => { if (row.isConnected) polishStoppedTurn(row) })
      pending.clear()
    }
    const schedule = (records: MutationRecord[]) => {
      for (const record of records) {
        const at = record.target instanceof Element ? record.target : record.target.parentElement
        const row = at?.closest<HTMLElement>("[data-malik-message]")
        if (row) {
          if (row.matches(MEDIA_ROW)) pending.add(row)
          continue
        }
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.matches(MEDIA_ROW)) pending.add(node as HTMLElement)
          else node.querySelectorAll<HTMLElement>(MEDIA_ROW).forEach((item) => pending.add(item))
        })
      }
      if (pending.size && !frame) frame = window.requestAnimationFrame(scan)
    }

    document.querySelectorAll<HTMLElement>(MEDIA_ROW).forEach(polishStoppedTurn)
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <style>{`
      [data-malik-stopped="1"] [class*="text-red"] {
        color: #a8a8ad !important;
      }
      [data-malik-stopped="1"] [class*="bg-red"] {
        background: #171719 !important;
      }
      [data-malik-stopped="1"] [class*="border-red"] {
        border-color: rgba(255,255,255,.11) !important;
      }
    `}</style>
  )
}

export default MalikStopPolish
