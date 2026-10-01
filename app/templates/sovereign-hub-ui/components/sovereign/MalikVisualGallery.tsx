"use client"

import { useEffect, useState } from "react"
import { ExternalLink, ImageOff } from "lucide-react"
import { isExplicitImageGenerationRequest } from "@/lib/ai/image-intent"

/** Actual reference images, not media-generation jobs or invented image links. */
export type MalikVisualImage = {
  url: string
  alt: string
  sourceUrl?: string
  credit?: string
  license?: string
}

// Model-authored Markdown must not load arbitrary tracking endpoints or data URLs.
const IMAGE_HOSTS = new Set([
  "upload.wikimedia.org",
  "images.unsplash.com",
  "images.pexels.com",
  "cdn.pixabay.com",
  "i.imgur.com",
])

export function isSafeVisualUrl(value: string): boolean {
  try {
    if (!value || value.length > 2048) return false
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && IMAGE_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function safeSourceUrl(value?: string): string {
  if (!value) return ""
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : ""
  } catch {
    return ""
  }
}

function ReferenceCard({ image }: { image: MalikVisualImage }) {
  const [failed, setFailed] = useState(false)
  const source = safeSourceUrl(image.sourceUrl) || image.url
  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border border-white/20 bg-black">
      <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={"Открыть изображение: " + image.alt} className="block aspect-[3/4] w-full overflow-hidden bg-black">
        {failed ? (
          <span className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-xs text-zinc-500">
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
      </a>
      <figcaption className="min-w-0 border-t border-white/10 px-2.5 py-2">
        <span className="block truncate text-xs font-medium text-zinc-100" title={image.alt}>{image.alt || "Изображение"}</span>
        <a href={source} target="_blank" rel="noopener noreferrer" className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-zinc-400 hover:text-white" aria-label={"Источник изображения: " + (image.credit || image.alt)}>
          <span className="truncate">{[image.credit, image.license].filter(Boolean).join(" · ") || "Источник фото"}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  )
}

export function MalikVisualGallery({ images, title }: { images: MalikVisualImage[]; title?: string }) {
  const visible = images.filter((image) => isSafeVisualUrl(image.url)).slice(0, 4)
  if (!visible.length) return null
  return (
    <section className="my-4 w-full min-w-0 max-w-[760px]" aria-label={title || "Изображения в ответе"}>
      {title ? <h3 className="mb-2.5 text-sm font-semibold text-white">{title}</h3> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((image, index) => <ReferenceCard key={image.url + index} image={image} />)}
      </div>
    </section>
  )
}

/** Lookup only for explicit requests to SEE photos, never for media generation. */
export function wantsReferenceImages(question: string): boolean {
  const text = String(question || "").trim()
  if (!text || text.length > 2500 || isExplicitImageGenerationRequest(text)) return false
  if (/^\s*\/(?:image|img|photo|video|veo)\b/i.test(text)) return false
  const visual = /(?:фото|фотк|картин|изображен|иллюстрац|референс|визуальн|сурет|photograph|photos?|pictures?|images?|visuals?|references?)/iu.test(text)
  const request = /(?:покаж|найд|подбер|подборк|с\s+(?:фото|картин|изображен|иллюстрац)|қөрсет|көрсет|суреттер|show|find|with\s+(?:images|photos|pictures)|visual\s+reference)/iu.test(text)
  return (visual && request) || /(?:как\s+выглядит|what\s+does.+look\s+like|қандай\s+көрінеді)/iu.test(text)
}

/** Searches public photo catalogues; no base64 and no generation credits. */
export function MalikReferenceImages({ question }: { question: string }) {
  const [images, setImages] = useState<MalikVisualImage[]>([])
  useEffect(() => {
    if (!wantsReferenceImages(question)) {
      setImages([])
      return
    }
    const controller = new AbortController()
    setImages([])
    void fetch("/api/chat/reference-images?q=" + encodeURIComponent(question.slice(0, 240)), {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data: unknown) => {
        if (controller.signal.aborted) return
        const records = data && typeof data === "object" && "images" in data ? (data as { images?: unknown }).images : null
        setImages(Array.isArray(records)
          ? records.filter((item): item is MalikVisualImage => Boolean(item && typeof item.url === "string" && typeof item.alt === "string" && isSafeVisualUrl(item.url))).slice(0, 3)
          : [])
      })
      .catch(() => { if (!controller.signal.aborted) setImages([]) })
    return () => controller.abort()
  }, [question])
  return images.length ? <MalikVisualGallery title="Визуальные референсы" images={images} /> : null
}
