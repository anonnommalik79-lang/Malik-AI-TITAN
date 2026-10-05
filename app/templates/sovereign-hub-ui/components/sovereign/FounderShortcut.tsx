"use client"

import { useEffect, useState } from "react"

export function FounderShortcut() {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const response = await fetch("/api/founder/access", { credentials: "same-origin", cache: "no-store" })
        if (alive) setAllowed(response.ok)
      } catch { if (alive) setAllowed(false) }
    }
    void check()
    window.addEventListener("malik-auth-updated", check)
    return () => { alive = false; window.removeEventListener("malik-auth-updated", check) }
  }, [])
  if (!allowed) return null
  return <a href="/founder/history" aria-label="Открыть Founder Database"
    className="fixed right-3 top-[86px] z-[95] rounded-lg border border-white/50 bg-black px-3 py-2 text-xs font-semibold text-white shadow-[0_3px_16px_#000] hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
    Founder DB
  </a>
}
