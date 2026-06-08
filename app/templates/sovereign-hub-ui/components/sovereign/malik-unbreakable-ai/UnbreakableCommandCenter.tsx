"use client"

import { orchestrateUnbreakable, renderSafeCheck, storageGuardReport } from "@/lib/malik-unbreakable-ai"
import { useMemo, useState } from "react"

export function UnbreakableCommandCenter({ onPrompt }: { onPrompt?: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState("Создай видео где играют футбол ночью")
  const [kind, setKind] = useState<"chat" | "image" | "video" | "code" | "website">("video")
  const plan = useMemo(() => orchestrateUnbreakable(prompt, kind), [prompt, kind])
  const render = renderSafeCheck()
  const storage = typeof window !== "undefined" ? storageGuardReport() : { ok: true, bytes: 0, message: "SSR safe" }

  return (
    <section className="rounded-[2.4rem] border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,.14),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,.18),transparent_38%),rgba(255,255,255,.035)] p-6 shadow-[0_28px_90px_rgba(0,0,0,.45)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200/70">Unbreakable AI Command Center</p>
          <h2 className="mt-3 text-3xl font-black text-white md:text-5xl">MALIK AI final guard</h2>
        </div>
        <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-black text-emerald-100">Render Safe</span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-4">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-32 w-full resize-none bg-transparent text-sm text-white outline-none" />
          <div className="mt-4 flex flex-wrap gap-2">
            {(["chat","image","video","code","website"] as const).map((item) => (
              <button key={item} onClick={() => setKind(item)} className={`rounded-full border px-4 py-2 text-xs font-black ${kind === item ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-white/55"}`}>{item}</button>
            ))}
            <button onClick={() => onPrompt?.(prompt)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">Send to chat</button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white/60">Render: {render.ok ? "safe" : "check"}</div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white/60">Storage: {storage.message}</div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white/60">Plan: {JSON.stringify(plan).slice(0, 220)}...</div>
        </div>
      </div>
    </section>
  )
}

