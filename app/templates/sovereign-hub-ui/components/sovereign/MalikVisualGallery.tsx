"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ExternalLink, ImageOff, X } from "lucide-react"
import { isReferenceImageRequest } from "@/lib/ai/image-intent"

import { planReferenceVisuals, referenceSearchTopic, type ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { isSafeVisualUrl, type MalikVisualImage } from "@/lib/media/reference-catalog"
import { invalidateReferenceImages, referenceCacheKey, reportReferenceImageFailure, subscribeReferenceImages } from "@/lib/media/client-reference-cache"
import "./answer-blocks.css"
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

function ReferenceCard({ image, portrait, onOpen, onFailure }: { image: MalikVisualImage; portrait: boolean; onOpen: () => void; onFailure?: (url: string) => void }) {
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
            className={"h-full w-full transition-transform duration-300 hover:scale-[1.03] " + (portrait ? "object-contain" : "object-cover")}
            onError={() => { setFailed(true); onFailure?.(image.url) }}
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

export function MalikVisualGallery({ images, title, portrait = false, onFailure }: { images: MalikVisualImage[]; title?: string; portrait?: boolean; onFailure?: (url: string) => void }) {
  const [selected, setSelected] = useState<MalikVisualImage | null>(null)
  const visible = images.filter((image) => isSafeVisualUrl(image.url)).slice(0, 3)
  if (!visible.length) return null
  return (
    <section data-malik-reference-gallery className="my-5 w-full min-w-0 max-w-[760px]" aria-label={title || "Изображения в ответе"}>
      {title ? <h3 className="mb-3 text-base font-semibold text-white">{title}</h3> : null}
      <div className={"grid gap-2 sm:gap-3 " + (visible.length === 1 ? "max-w-[360px] grid-cols-1" : visible.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {visible.map((image) => <ReferenceCard key={image.url} image={image} portrait={portrait} onOpen={() => setSelected(image)} onFailure={(url) => { setSelected(null); onFailure?.(url) }} />)}
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
export function MalikReferenceImages({ question, previousQuestion = "", hasAttachment = false, isLatest = false, planOverride, row = false, compact = false, children }: { question: string; previousQuestion?: string; hasAttachment?: boolean; isLatest?: boolean; planOverride?: ReferenceVisualPlan; row?: boolean; compact?: boolean; children?: ReactNode }) {
  const candidate = useMemo(() => planOverride || planReferenceVisuals(question, previousQuestion, hasAttachment), [planOverride, question, previousQuestion, hasAttachment])
  // The answer grows while streaming. Keep subscriptions stable for identical queries.
  const serializedPlan = candidate ? JSON.stringify(candidate) : ""
  const plan = useMemo<ReferenceVisualPlan | null>(() => serializedPlan ? JSON.parse(serializedPlan) : null, [serializedPlan])
  const container = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [result, setResult] = useState<{ key: string; images: MalikVisualImage[] } | null>(null)
  const [selected, setSelected] = useState<MalikVisualImage | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = plan ? referenceCacheKey(plan) : ""
  const active = isLatest || nearViewport
  const collection = Boolean(plan?.subjects?.length)
  useEffect(() => {
    const node = container.current
    if (!plan || !node || active || collection) return
    if (typeof IntersectionObserver === "undefined") { queueMicrotask(() => setNearViewport(true)); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNearViewport(true); observer.disconnect() }
    }, { rootMargin: "160px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [plan, active, collection])
  useEffect(() => {
    if (!plan || !active || collection) return
    return subscribeReferenceImages(plan, (images) => setResult({ key: referenceCacheKey(plan), images }))
  }, [plan, active, collection, attempt])
  if (!plan) return children || null
  const images = result?.key === key ? result.images : null
  const retry = () => { invalidateReferenceImages(plan); setResult(null); setAttempt((value) => value + 1) }
  const failed = (url: string) => {
    setSelected(null)
    if (reportReferenceImageFailure(plan, url)) retry()
    else setResult((current) => current?.key === key ? { key, images: current.images.filter((image) => image.url !== url) } : current)
  }
  const status = images === null
    ? <p role="status" className="my-3 text-sm text-zinc-400">{active ? "Ищу фото по теме…" : plan.topic}</p>
    : <p className="my-3 text-sm text-zinc-400">Подходящее фото не загрузилось. <button type="button" onClick={retry} className="underline underline-offset-4">Повторить поиск</button></p>
  if (collection) return <div className="min-w-0" data-malik-reference-topic={plan.topic}>
    {children}
    <section className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={"Фотографии · " + plan.topic} data-malik-reference-collection>
      {plan.subjects!.slice(0, 60).map((subject, index) => <MalikReferenceImages key={subject} question="" compact isLatest={isLatest && index < 6}
        planOverride={{ topic: subject, queries: [...new Set([referenceSearchTopic(subject), subject])], explicit: true, entity: true, kind: "reference", layout: "portrait" }} />)}
    </section>
  </div>
  if (compact) return <div ref={container} className="min-w-0" data-malik-reference-topic={plan.topic}>
    {images?.[0] ? <ReferenceCard key={images[0].url} image={images[0]} portrait={plan.layout === "portrait"} onOpen={() => setSelected(images[0])} onFailure={failed} />
      : <div className="flex aspect-[3/4] flex-col justify-center rounded-2xl border border-white/15 px-3 text-center"><span className="text-sm font-medium text-white">{plan.topic}</span>{status}</div>}
    {selected ? <ReferenceLightbox image={selected} onClose={() => setSelected(null)} /> : null}
  </div>
  if (row) return (
    <div ref={container} className="malik-answer-photo-row min-w-0" data-malik-reference-topic={plan.topic} data-malik-inline-visual>
      <div className={images?.length ? "flex items-start gap-3 sm:gap-5" : ""}>
        {images?.[0] ? <figure className={"malik-answer-photo-row__image shrink-0 overflow-hidden rounded-xl " + (plan.kind === "tutorial" ? "bg-white" : "bg-black")}>
          <button type="button" onClick={() => setSelected(images[0])} aria-label={"Увеличить: " + images[0].alt} className="block w-full focus-visible:outline focus-visible:outline-white">
            <img src={images[0].url} alt={images[0].alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
              className={"w-full " + (plan.kind === "tutorial" ? "max-h-[280px] object-contain" : "aspect-[3/4] object-cover")}
              onError={() => failed(images[0].url)} />
          </button>
          <figcaption className="bg-black px-1.5 py-1 text-xs leading-4 text-zinc-400">
            <a href={safeSourceUrl(images[0].sourceUrl) || images[0].url} target="_blank" rel="noopener noreferrer" className="block truncate underline-offset-2 hover:underline" title={[images[0].credit, images[0].license].filter(Boolean).join(" · ")}>{images[0].credit || "Источник фото"}</a>
          </figcaption>
        </figure> : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {images?.length && plan.kind === "tutorial" ? <p className="mt-2 text-xs leading-5 text-zinc-400">Пример экрана из источника. Вид меню зависит от версии приложения.</p> : null}
      {!images?.length && active ? status : null}
      {selected ? <ReferenceLightbox image={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
  return (
    <div ref={container} className="min-w-0" data-malik-reference-topic={plan.topic}>
      {children}
      {images?.length ? <>
        <MalikVisualGallery title={plan.kind === "tutorial" ? "Примеры экранов · " + plan.topic : plan.topic} images={plan.kind === "tutorial" ? images.slice(0, 2) : images} portrait={plan.layout === "portrait"} onFailure={failed} />
        {plan.kind === "tutorial" ? <p className="mb-4 text-xs leading-5 text-zinc-400">Иллюстрации из открытых источников. Названия пунктов и вид меню могут отличаться в вашей версии приложения.</p> : null}
      </>
        : active || plan.explicit ? status : null}
    </div>
  )
}
