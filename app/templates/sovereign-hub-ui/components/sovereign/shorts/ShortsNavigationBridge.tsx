"use client"

import Link from "next/link"
import { useEffect } from "react"

const routes: Record<string, string> = {
  "Обзор": "/shorts/explore",
  "Входящие": "/shorts/inbox",
  "Библиотека": "/shorts/library",
  "Профиль": "/shorts/profile",
}

export function ShortsNavigationBridge() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest("button")
      if (!button) return
      const label = String(button.textContent || "").replace(/\s+/g, " ").trim()
      const route = routes[label]
      if (!route) return
      event.preventDefault()
      event.stopPropagation()
      window.location.assign(route)
    }
    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [])

  useEffect(() => {
    const shortId = new URLSearchParams(window.location.search).get("short")
    if (!shortId) return
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(shortId) : shortId.replace(/[^a-zA-Z0-9_-]/g, "")
      const node = document.querySelector<HTMLElement>(`[data-short-id="${safe}"]`)
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" })
        window.clearInterval(timer)
      } else if (attempts > 30) window.clearInterval(timer)
    }, 250)
    return () => window.clearInterval(timer)
  }, [])

  return <details style={{ position: "fixed", zIndex: 90, right: 18, top: 18 }}>
    <summary aria-label="Разделы Malik Shorts" style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 12, background: "rgba(12,12,12,.9)", border: "1px solid rgba(255,255,255,.1)", color: "#fff", cursor: "pointer", listStyle: "none", backdropFilter: "blur(14px)", fontWeight: 800 }}>•••</summary>
    <div style={{ position: "absolute", right: 0, top: 46, width: 190, background: "#0b0b0b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 7, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
      {[
        ["Обзор", "/shorts/explore"],
        ["AI Remix", "/shorts/remix"],
        ["Malik Live", "/shorts/live"],
        ["Библиотека", "/shorts/library"],
        ["Входящие", "/shorts/inbox"],
        ["Аналитика", "/shorts/analytics"],
        ["Профиль", "/shorts/profile"],
      ].map(([label, href]) => <Link key={href} href={href} style={{ display: "block", color: "#ccc", textDecoration: "none", padding: "10px 11px", borderRadius: 9, fontSize: 12 }}>{label}</Link>)}
    </div>
  </details>
}
