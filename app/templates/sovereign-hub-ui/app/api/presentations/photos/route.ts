import { findPhoto, photoProviders, type FoundPhoto, type PhotoKind } from "@/lib/server/presentation-photos"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Photographs for the slides of a deck being written.
 *
 * POST { items: [{ key, query, kind }], exclude?: [url] }
 *   → { ok, photos: { [key]: { url, credit, link, source } | null } }
 *
 * Free: searching photo libraries costs no credits. Signed-in accounts only,
 * and at most a deck's worth of searches per minute, so the endpoint cannot
 * be used as a free image search for anything else.
 */

const MAX_BODY_BYTES = 32 * 1024
const MAX_ITEMS = 12
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 40

type RateGlobal = typeof globalThis & { __malikPhotoRate?: Map<string, number[]> }

function allow(userId: string, count: number) {
  const scope = globalThis as RateGlobal
  if (!scope.__malikPhotoRate) scope.__malikPhotoRate = new Map()
  const now = Date.now()
  const recent = (scope.__malikPhotoRate.get(userId) || []).filter((at) => now - at < WINDOW_MS)
  if (recent.length + count > MAX_PER_WINDOW) return false
  scope.__malikPhotoRate.set(userId, [...recent, ...Array.from({ length: count }, () => now)])
  return true
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } })
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return json({ ok: false, error: "Войдите, чтобы подбирать фото." }, 401)

  let body: Record<string, unknown>
  try {
    body = await readJsonBodyLimited<Record<string, unknown>>(request, MAX_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestSafetyError) return json({ ok: false, error: error.message }, error.status)
    return json({ ok: false, error: "Не удалось прочитать запрос." }, 400)
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
      const key = String(raw.key || "").slice(0, 80)
      const query = String(raw.query || "").replace(/\s+/g, " ").trim().slice(0, 90)
      const kind: PhotoKind = raw.kind === "subject" ? "subject" : "mood"
      return key && query.length >= 2 ? { key, query, kind } : null
    })
    .filter((item): item is { key: string; query: string; kind: PhotoKind } => Boolean(item))

  if (!items.length) return json({ ok: true, photos: {} })
  if (!allow(entitlement.userId, items.length)) {
    return json({ ok: false, code: "PHOTOS_RATE_LIMIT", error: "Слишком много запросов фото — подождите минуту." }, 429)
  }

  const exclude = new Set(
    (Array.isArray(body.exclude) ? body.exclude : []).filter((url): url is string => typeof url === "string").slice(0, 60),
  )

  // Three searches at a time. A photo another slide already took is searched
  // again without it, so two slides never show the same photograph.
  const photos: Record<string, FoundPhoto | null> = {}
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift() as (typeof items)[number]
      let photo = await findPhoto({ query: item.query, kind: item.kind, exclude })
      if (photo && exclude.has(photo.url)) photo = await findPhoto({ query: item.query, kind: item.kind, exclude })
      photos[item.key] = photo && !exclude.has(photo.url) ? photo : null
      if (photo) exclude.add(photo.url)
    }
  }))

  return json({ ok: true, photos, providers: { subject: photoProviders("subject"), mood: photoProviders("mood") } })
}
