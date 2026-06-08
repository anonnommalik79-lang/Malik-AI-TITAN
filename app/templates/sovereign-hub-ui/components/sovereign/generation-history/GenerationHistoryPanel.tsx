"use client"

import { useEffect, useMemo, useState } from "react"
import { Clock, Download, ImageIcon, RefreshCw, Trash2, Video } from "lucide-react"
import { clearGenerationHistory, readGenerationHistory, type GenerationHistoryItem } from "@/lib/ai/history"

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")

function iconFor(type: GenerationHistoryItem["type"]) {
  return type === "video" ? Video : ImageIcon
}

export function GenerationHistoryPanel() {
  const [items, setItems] = useState<GenerationHistoryItem[]>([])

  const stats = useMemo(() => {
    return {
      total: items.length,
      ready: items.filter((item) => item.status === "completed").length,
      failed: items.filter((item) => item.status === "failed").length,
    }
  }, [items])

  const refresh = () => setItems(readGenerationHistory())

  useEffect(() => {
    refresh()
    const onStorage = () => refresh()
    window.addEventListener("storage", onStorage)
    window.addEventListener("malik-generation-history-updated", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("malik-generation-history-updated", onStorage)
    }
  }, [])

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-white shadow-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Generation History</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Фото / видео генерациялар</h2>
          <p className="mt-1 text-sm text-gray-400">Local-first history. Database sync comes in later stage.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refresh} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">
            <RefreshCw className="mr-2 inline h-4 w-4" />Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              clearGenerationHistory()
              refresh()
            }}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/20"
          >
            <Trash2 className="mr-2 inline h-4 w-4" />Clear
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          ["Total", stats.total],
          ["Ready", stats.ready],
          ["Failed", stats.failed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-1 text-xl font-black">{value}</p>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
          <Clock className="mx-auto h-8 w-8 text-gray-500" />
          <p className="mt-3 font-bold">Әзірге generation history бос</p>
          <p className="mt-1 text-sm text-gray-500">Image/video jobs пайда болғанда осында көрінеді.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const Icon = iconFor(item.type)
            return (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                <div className="aspect-video bg-gradient-to-br from-violet-500/20 via-cyan-500/10 to-fuchsia-500/20">
                  {item.resultUrl ? (
                    item.type === "video" ? (
                      <video src={item.resultUrl} controls className="h-full w-full object-cover" />
                    ) : (
                      <img src={item.resultUrl} alt={item.prompt} className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Icon className="h-10 w-10 text-white/50" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={cn(
                      "rounded-full px-2 py-1 text-[11px] font-black uppercase",
                      item.status === "completed" && "bg-emerald-500/15 text-emerald-200",
                      item.status === "failed" && "bg-red-500/15 text-red-200",
                      item.status !== "completed" && item.status !== "failed" && "bg-amber-500/15 text-amber-200",
                    )}>
                      {item.status}
                    </span>
                    <span className="text-[11px] text-gray-500">{item.engine || "MALIK Backup"}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-bold">{item.prompt}</p>
                  {item.error ? <p className="mt-2 line-clamp-2 text-xs text-red-300">{item.error}</p> : null}
                  {item.resultUrl ? (
                    <a href={item.resultUrl} download className="mt-3 inline-flex items-center rounded-xl bg-white px-3 py-2 text-xs font-black text-black">
                      <Download className="mr-2 h-3.5 w-3.5" />Download
                    </a>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default GenerationHistoryPanel

