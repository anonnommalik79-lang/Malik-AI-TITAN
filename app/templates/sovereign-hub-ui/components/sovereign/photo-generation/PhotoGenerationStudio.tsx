"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { ImagePlus } from "lucide-react"
import { ImageStudio, type StudioAttachment, type StudioCredits } from "@/components/sovereign/image-studio/ImageStudio"

export type PhotoGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

/**
 * Voltframe launch takeover, with Malik's own image studio one click away.
 *
 * The founder's artwork stays exactly as supplied (landscape on desktop, the
 * portrait artwork on phones, native <img>, object-contain). It used to be the
 * whole section, so «Генерация изображений» led nowhere: the working studio
 * was reachable only from the chat's «+» menu. The bar at the bottom now
 * opens that same studio — templates, models, styles, aspect, quality, edits
 * of an uploaded photo — with the account's real image credits.
 */
export function PhotoGenerationStudio(_props: PhotoGenerationStudioProps) {
  const [open, setOpen] = useState(false)
  const [credits, setCredits] = useState<StudioCredits | null>(null)
  const [plan, setPlan] = useState<string | undefined>(undefined)
  const [attachments, setAttachments] = useState<StudioAttachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const loadCredits = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/image/credits", { cache: "no-store", credentials: "same-origin" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) return
      setPlan(typeof payload.plan === "string" ? payload.plan : undefined)
      setCredits({
        remaining: Number(payload.remaining || 0),
        daily: Number(payload.daily || 0),
        costs: { "1K": Number(payload?.costs?.["1K"] ?? 1), "2K": Number(payload?.costs?.["2K"] ?? 2), "4K": Number(payload?.costs?.["4K"] ?? 5) },
        remaining4k: Number(payload.remaining4k ?? 0),
      } as StudioCredits)
    } catch { /* the studio still opens; the server enforces credits */ }
  }, [])

  useEffect(() => {
    void loadCredits()
    const refresh = () => void loadCredits()
    window.addEventListener("malik-image-credits-changed", refresh)
    return () => window.removeEventListener("malik-image-credits-changed", refresh)
  }, [loadCredits])

  const addFiles = useCallback((files: File[]) => {
    for (const file of files.filter((item) => item.type.startsWith("image/")).slice(0, 4)) {
      if (file.size > 20 * 1024 * 1024) continue
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result || "")
        const base64 = url.includes(",") ? url.split(",").pop() || "" : ""
        if (!base64) return
        setAttachments((current) => [...current, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, mime: file.type, kind: "image", url, base64 }].slice(-4))
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []))
    event.target.value = ""
  }

  return (
    <main
      className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black"
      data-view="photo-generation"
      aria-label="Генерация изображений"
    >
      <picture className="block h-full w-full">
        <source media="(max-width: 767px)" srcSet="/voltframe/mobile.png" type="image/png" />
        <img
          src="/voltframe/desktop.png"
          alt="Voltframe AI скоро в Malik AI"
          width={1672}
          height={941}
          draggable={false}
          decoding="async"
          fetchPriority="high"
          className="block h-full w-full select-none object-contain object-center"
        />
      </picture>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto flex w-full max-w-[560px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-black/80 px-4 py-3 text-white shadow-[0_16px_48px_rgba(0,0,0,.6)] backdrop-blur-md">
          <div className="min-w-0">
            <strong className="block text-[15px] font-semibold">Генерация изображений уже работает</strong>
            <span className="block text-[13px] text-white/65">Шаблоны, стили, форматы и правка своих фото{credits ? ` · осталось ${credits.remaining} из ${credits.daily}` : ""}</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-black transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ImagePlus size={18} aria-hidden="true" />
            Создать изображение
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
      {open ? (
        <ImageStudio
          attachments={attachments}
          credits={credits}
          plan={plan}
          onAddImage={() => fileRef.current?.click()}
          onAddFiles={addFiles}
          onRemoveAttachment={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </main>
  )
}

export default PhotoGenerationStudio
