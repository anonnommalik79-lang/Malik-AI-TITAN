"use client"

import { buildPptxBlob } from "@/lib/presentations/pptx"
import { IMAGE_LAYOUTS, type Deck } from "@/lib/presentations/types"

const MAX_BROWSER_IMAGES = 40
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_EDGE = 720
const JPEG_QUALITY = 0.62

function imageJobs(deck: Pick<Deck, "slides">) {
  return deck.slides.flatMap((slide): Array<[string, string]> => {
    if (slide.layout === "gallery") {
      return slide.items.flatMap((item, index): Array<[string, string]> =>
        item.image?.url ? [[`${slide.id}#${index}`, item.image.url]] : [],
      )
    }
    return IMAGE_LAYOUTS.has(slide.layout) && slide.imageUrl ? [[slide.id, slide.imageUrl]] : []
  }).slice(0, MAX_BROWSER_IMAGES)
}

function externalHttps(value: string) {
  try {
    const url = new URL(value, window.location.href)
    if (url.protocol !== "https:") return null
    // Relative/same-origin images would make the browser download their bytes
    // from Render. The zero-bandwidth exporter intentionally leaves those out.
    if (url.origin === window.location.origin) return null
    return url.toString()
  } catch {
    return null
  }
}

function canvasDataUrl(bitmap: ImageBitmap) {
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { alpha: false })
  if (!context) return null
  context.fillStyle = "#000"
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY)
}

async function compactExternalImage(value: string) {
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) {
    const response = await fetch(value)
    const blob = await response.blob()
    if (!blob.size || blob.size > MAX_SOURCE_IMAGE_BYTES) return null
    const bitmap = await createImageBitmap(blob)
    try { return canvasDataUrl(bitmap) } finally { bitmap.close() }
  }

  const direct = externalHttps(value)
  if (!direct) return null
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(direct, {
      mode: "cors",
      cache: "force-cache",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    })
    if (!response.ok) return null
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared > MAX_SOURCE_IMAGE_BYTES) return null
    const blob = await response.blob()
    if (!blob.size || blob.size > MAX_SOURCE_IMAGE_BYTES || !blob.type.startsWith("image/")) return null
    const bitmap = await createImageBitmap(blob)
    try { return canvasDataUrl(bitmap) } finally { bitmap.close() }
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

export async function buildPresentationPptxInBrowser(deck: Pick<Deck, "title" | "theme" | "slides">) {
  const jobs = imageJobs(deck)
  const images = new Map<string, string>()
  let cursor = 0

  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= jobs.length) return
      const [key, url] = jobs[index]
      const data = await compactExternalImage(url)
      if (data) images.set(key, data)
    }
  }))

  // If the deck depends on pictures and the provider disallows browser CORS,
  // fall back to the server's strictly sub-1MB exporter instead of silently
  // stripping every visual.
  if (jobs.length && images.size === 0) {
    throw new Error("PPTX_BROWSER_IMAGES_UNAVAILABLE")
  }

  const blob = await buildPptxBlob(deck, images)
  return {
    blob,
    requestedImages: jobs.length,
    embeddedImages: images.size,
    deliveryMode: "browser-local-zero-render-binary" as const,
  }
}
