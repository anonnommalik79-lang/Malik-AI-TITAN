import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Reference = {
  url: string
  alt: string
  sourceUrl: string
  credit?: string
  license?: string
}
type CommonsPage = {
  title?: string
  imageinfo?: Array<{
    mime?: string
    thumburl?: string
    url?: string
    descriptionurl?: string
    extmetadata?: Record<string, { value?: string }>
  }>
}

function searchTopic(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^\s*(?:покажи(?:те)?|найди(?:те)?|подбери(?:те)?|show(?:\s+me)?|find(?:\s+me)?|көрсет(?:ші)?)(?:\s+мне)?\s*/iu, "")
    .replace(/^\s*(?:(?:три|несколько|\d+)\s+)?(?:фото(?:графии)?|фотки|картинки|изображения|визуальные\s+референсы|референсы|images?|photos?|pictures?)\s*/iu, "")
    .replace(/^\s*(?:как\s+выглядит|what\s+does)\s*/iu, "")
    .replace(/\b(?:с\s+(?:картинками|фотографиями|фото)|with\s+(?:images|photos|pictures))\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110)
}

function cleanLabel(value: string): string {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().slice(0, 115)
}

function approvedImageUrl(value?: string): string {
  if (!value) return ""
  try {
    const u = new URL(value)
    if (u.protocol !== "https:" || u.username || u.password) return ""
    return ["upload.wikimedia.org", "images.unsplash.com"].includes(u.hostname.toLowerCase()) ? u.href : ""
  } catch {
    return ""
  }
}

async function unsplash(topic: string): Promise<Reference[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) return []
  const params = new URLSearchParams({ query: topic, per_page: "3", content_filter: "high", orientation: "portrait" })
  const response = await fetch("https://api.unsplash.com/search/photos?" + params, {
    headers: { Authorization: "Client-ID " + key, Accept: "application/json" },
    signal: AbortSignal.timeout(5500),
    next: { revalidate: 3600 },
  })
  if (!response.ok) return []
  const data = await response.json() as {
    results?: Array<{
      urls?: { small?: string }
      links?: { html?: string }
      alt_description?: string | null
      description?: string | null
      user?: { name?: string }
    }>
  }
  return (data.results || []).flatMap((photo) => {
    const url = approvedImageUrl(photo.urls?.small)
    if (!url) return []
    const source = photo.links?.html || "https://unsplash.com/"
    if (!source.startsWith("https://unsplash.com/")) return []
    return [{ url, sourceUrl: source, alt: cleanLabel(photo.alt_description || photo.description || topic) || topic, credit: photo.user?.name ? "Unsplash · " + cleanLabel(photo.user.name) : "Unsplash", license: "Unsplash License" }]
  }).slice(0, 3)
}

async function commons(topic: string): Promise<Reference[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "search",
    gsrsearch: topic + " filetype:bitmap", gsrnamespace: "6", gsrlimit: "12",
    prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "680",
  })
  const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
    headers: { Accept: "application/json", "User-Agent": "MalikAI/1.0 (visual references; source attribution enabled)" },
    signal: AbortSignal.timeout(5500),
    next: { revalidate: 3600 },
  })
  if (!response.ok) return []
  const data = await response.json() as { query?: { pages?: CommonsPage[] } }
  const pages = data.query?.pages || []
  return pages.flatMap((page): Reference[] => {
    const media = page.imageinfo?.[0]
    if (!media || !/^image\/(?:jpeg|png|webp)$/i.test(media.mime || "")) return []
    const url = approvedImageUrl(media.thumburl || media.url)
    const source = media.descriptionurl || ""
    if (!url || !source.startsWith("https://commons.wikimedia.org/")) return []
    const alt = cleanLabel((page.title || topic).replace(/^File:/i, "").replace(/\.[a-z\d]+$/i, "").replace(/_/g, " "))
    const license = cleanLabel(media.extmetadata?.LicenseShortName?.value || "")
    const author = cleanLabel(media.extmetadata?.Artist?.value || "")
    return [{ url, alt: alt || topic, sourceUrl: source, credit: author || "Wikimedia Commons", license }]
  }).slice(0, 3)
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") || ""
  if (!raw.trim() || raw.length > 250 || /[\r\n]/.test(raw)) {
    return NextResponse.json({ images: [] }, { status: 400 })
  }
  const topic = searchTopic(raw)
  if (topic.length < 2) return NextResponse.json({ images: [] })
  let images: Reference[] = []
  try { images = await unsplash(topic) } catch { /* Optional provider unavailable. */ }
  if (!images.length) {
    try { images = await commons(topic) } catch { /* Leave a text-only answer rather than inventing a picture. */ }
  }
  return NextResponse.json({ images }, { headers: { "Cache-Control": "private, max-age=600" } })
}
