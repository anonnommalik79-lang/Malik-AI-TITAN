"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Image as ImageIcon, Search, X } from "lucide-react"

type LibraryItem = {
  id: string
  src: string
  prompt?: string
  provider?: string
  quality?: string
  createdAt?: string
}

type ChatLibraryPickerProps = {
  open: boolean
  onClose: () => void
  onSelect: (url: string, label?: string) => void | Promise<void>
}

export function ChatLibraryPicker({ open, onClose, onSelect }: ChatLibraryPickerProps) {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError("")
    fetch("/api/media/library?limit=120", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.ok) throw new Error(data?.error || "Не удалось открыть библиотеку")
        return data
      })
      .then((data) => {
        if (cancelled) return
        setItems(Array.isArray(data?.items) ? data.items : [])
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось открыть библиотеку")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      [item.prompt, item.provider, item.quality, item.createdAt]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
  }, [items, query])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Библиотека файлов">
      <div className="flex max-h-[82dvh] w-full max-w-[860px] flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#151516] shadow-[0_30px_120px_rgba(0,0,0,.7)]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold text-white">Добавить файл из библиотеки</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">Ваши сохранённые изображения Malik AI — можно найти и прикрепить снова</div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.07] hover:text-white" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/[0.06] p-3">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 text-zinc-500">
            <Search className="h-4 w-4" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по библиотеке…" className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-zinc-600" />
          </label>
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto p-3">
          {loading ? <div className="grid min-h-[260px] place-items-center text-sm text-zinc-500">Загружаю библиотеку…</div> : null}
          {!loading && error ? <div className="grid min-h-[260px] place-items-center px-6 text-center text-sm text-red-300">{error}</div> : null}
          {!loading && !error && !filtered.length ? (
            <div className="grid min-h-[260px] place-items-center px-6 text-center text-sm text-zinc-500">
              <div><ImageIcon className="mx-auto mb-3 h-6 w-6" />В библиотеке пока нет подходящих изображений.</div>
            </div>
          ) : null}
          {!loading && !error && filtered.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void Promise.resolve(onSelect(item.src, item.prompt || "Изображение из библиотеки")).then(onClose)}
                  className="group overflow-hidden rounded-[14px] border border-white/[0.08] bg-black/20 text-left hover:border-white/[0.18]"
                >
                  <img src={item.src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  <span className="block truncate px-2.5 py-2 text-[10px] text-zinc-400 group-hover:text-white">{item.prompt || item.provider || "Malik AI"}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    , document.body)
}
