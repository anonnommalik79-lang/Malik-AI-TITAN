"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, ImageOff, X } from "lucide-react"
import { isReferenceImageRequest } from "@/lib/ai/image-intent"

import { planReferenceVisuals } from "@/lib/ai/reference-visual-policy"
import { isSafeVisualUrl, type MalikVisualImage } from "@/lib/media/reference-catalog"
import { referenceCacheKey, subscribeReferenceImages } from "@/lib/media/client-reference-cache"
export { isSafeVisualUrl, type MalikVisualImage } from "@/lib/media/reference-catalog"

function safeSourceUrl(value?: string): string {
  if (!value) return ""
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : ""
  } catch {
    return ""
  }
}

function ReferenceCard({ image, portrait, onOpen }: { image: MalikVisualImage; portrait: boolean; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  const source = safeSourceUrl(image.sourceUrl) || image.url
  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-black">
      <button type="button" onClick={onOpen} aria-label={"Увеличить изображение: " + image.alt} className={"block w-full overflow-hidden bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " + (portrait ? "aspect-[3/4]" : "aspect-[4/3]")}>
        {failed ? (
          <span className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-sm text-zinc-400">
            <ImageOff className="h-6 w-6" aria-hidden="true" />Превью недоступно
          </span>
        ) : (
          <img
            src={image.url}
            alt={image.alt || "Визуальный референс"}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
            onError={() => setFailed(true)}
          />
        )}
      </button>
      <figcaption className="min-w-0 border-t border-white/10 px-2.5 py-2">
        <span className="block truncate text-sm font-medium text-zinc-100" title={image.alt}>{image.alt || "Изображение"}</span>
        <a href={source} target="_blank" rel="noopener noreferrer" className="mt-1 flex min-w-0 items-center gap-1 text-xs text-zinc-400 hover:text-white" aria-label={"Источник изображения: " + (image.credit || image.alt)}>
          <span className="truncate">{[image.credit, image.license].filter(Boolean).join(" · ") || "Источник фото"}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  )
}

function ReferenceLightbox({ image, onClose }: { image: MalikVisualImage; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => { if (node?.open) node.close() }
  }, [])
  return (
    <dialog ref={dialog} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }} aria-label={image.alt} className="fixed inset-0 m-auto w-[94vw] max-w-[960px] rounded-2xl border border-white/20 bg-black p-4 text-white backdrop:bg-black/90">
      <button type="button" onClick={onClose} aria-label="Закрыть изображение" autoFocus className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black"><X className="h-5 w-5" /></button>
      <img src={image.url} alt={image.alt} decoding="async" referrerPolicy="no-referrer" className="mx-auto max-h-[75dvh] w-full object-contain" />
      <p className="mt-3 text-sm">{image.alt}</p>
      <a href={safeSourceUrl(image.sourceUrl) || image.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">Источник · {image.credit || "Фото"}<ExternalLink className="h-3 w-3" /></a>
    </dialog>
  )
}

export function MalikVisualGallery({ images, title, portrait = false }: { images: MalikVisualImage[]; title?: string; portrait?: boolean }) {
  const [selected, setSelected] = useState<MalikVisualImage | null>(null)
  const visible = images.filter((image) => isSafeVisualUrl(image.url)).slice(0, 3)
  if (!visible.length) return null
  return (
    <section data-malik-reference-gallery className="my-5 w-full min-w-0 max-w-[760px]" aria-label={title || "Изображения в ответе"}>
      {title ? <h3 className="mb-3 text-base font-semibold text-white">{title}</h3> : null}
      <div className={"grid gap-2 sm:gap-3 " + (visible.length === 1 ? "max-w-[360px] grid-cols-1" : visible.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {visible.map((image) => <ReferenceCard key={image.url} image={image} portrait={portrait} onOpen={() => setSelected(image)} />)}
      </div>
      {selected ? <ReferenceLightbox image={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  )
}

/** Existing callers can still test explicit reference intent. */
export function wantsReferenceImages(question: string): boolean {
  return isReferenceImageRequest(question)
}

/** Direct browser catalogue requests: no image proxy, no generation credits. */
export function MalikReferenceImages({ question, previousQuestion = "", hasAttachment = false, isLatest = false }: { question: string; previousQuestion?: string; hasAttachment?: boolean; isLatest?: boolean }) {
  const plan = useMemo(() => planReferenceVisuals(question, previousQuestion, hasAttachment), [question, previousQuestion, hasAttachment])
  const container = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [result, setResult] = useState<{ key: string; images: MalikVisualImage[] } | null>(null)
  const key = plan ? referenceCacheKey(plan) : ""
  const active = isLatest || nearViewport
  useEffect(() => {
    const node = container.current
    if (!plan || !node || active) return
    if (typeof IntersectionObserver === "undefined") { queueMicrotask(() => setNearViewport(true)); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNearViewport(true); observer.disconnect() }
    }, { rootMargin: "160px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [plan, active])
  useEffect(() => {
    if (!plan || !active) return
    return subscribeReferenceImages(plan, (images) => setResult({ key: referenceCacheKey(plan), images }))
  }, [plan, active])
  if (!plan) return null
  const images = result?.key === key ? result.images : null
  return (
    <div ref={container} className="min-w-0" data-malik-reference-topic={plan.topic}>
      {images?.length ? <MalikVisualGallery title={plan.topic} images={images} portrait={plan.layout === "portrait"} />
        : images === null ? <div role="status" className="my-4 flex items-center gap-2 text-sm text-zinc-400"><span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500" />{active ? "Ищу фотографии…" : "Фотографии"}</div>
          : plan.explicit ? <p className="my-3 text-sm text-zinc-400">Фотографии сейчас недоступны. <a href={"https://commons.wikimedia.org/w/index.php?search=" + encodeURIComponent(plan.queries[0]) + "&title=Special:MediaSearch&type=image"} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Открыть поиск фото</a></p> : null}
    </div>
  )
}
