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

function scanStoppedTurns(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-malik-message='assistant']").forEach(polishStoppedTurn)
}

export function MalikStopPolish() {
  useEffect(() => {
    if (typeof document === "undefined") return

    let frame = 0
    const scan = () => {
      frame = 0
      scanStoppedTurns()
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    scan()
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
