import { findImageTemplate, IMAGE_TEMPLATES } from "@/lib/media/image-templates"
import { sourceBytes } from "@/lib/media/image-postprocess"
import { routeImageGeneration } from "@/lib/media/image-router"
import { isCloudStorageConfigured, putSharedObject, readSharedJson, writeSharedJson } from "@/lib/storage/cloud-upload"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Covers of the image studio's templates, painted by Malik AI itself.
 *
 * GET  → { ok, covers: { [templateId]: url }, canPaint }
 *        Anyone can read the covers. canPaint is true only for the owner
 *        account when cloud storage is set up.
 * POST { id, force? } → { ok, id, url }
 *        Owner only. Paints one template's cover with the premium model
 *        (MalikImage 1.0 Premium · FLUX.2 Dev), stores it once in the media
 *        bucket under shared/, and every visitor sees it from then on.
 *        No account's image credits are spent.
 *
 * Until a template has its own cover, the studio shows the bundled one.
 */

const MANIFEST_KEY = "shared/image-templates/covers.json"
const CACHE_MS = 30_000
const MAX_PAINTING = 2

type CoverManifest = { version: 1; covers: Record<string, { url: string; at: string; model: string }> }

type CoverGlobal = typeof globalThis & {
  __malikCoverCache?: { at: number; manifest: CoverManifest }
  __malikCoverPainting?: Set<string>
  __malikCoverWrite?: Promise<unknown>
}

const scope = globalThis as CoverGlobal

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } })
}

function emptyManifest(): CoverManifest {
  return { version: 1, covers: {} }
}

async function readManifest(fresh = false): Promise<CoverManifest> {
  const cached = scope.__malikCoverCache
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.manifest
  const stored = await readSharedJson<CoverManifest>(MANIFEST_KEY)
  const manifest = stored && typeof stored === "object" && stored.covers && typeof stored.covers === "object"
    ? { version: 1 as const, covers: stored.covers }
    : emptyManifest()
  scope.__malikCoverCache = { at: Date.now(), manifest }
  return manifest
}

/** Manifest writes run one after another, so two covers finishing together both land. */
function recordCover(id: string, url: string, model: string) {
  const previous = scope.__malikCoverWrite || Promise.resolve()
  const next = previous.catch(() => undefined).then(async () => {
    const manifest = await readManifest(true)
    manifest.covers[id] = { url, at: new Date().toISOString(), model }
    const saved = await writeSharedJson(MANIFEST_KEY, manifest)
    scope.__malikCoverCache = { at: Date.now(), manifest }
    return saved
  })
  scope.__malikCoverWrite = next
  return next
}

function publicCovers(manifest: CoverManifest) {
  const known = new Set(IMAGE_TEMPLATES.map((template) => template.id))
  return Object.fromEntries(
    Object.entries(manifest.covers)
      .filter(([id, cover]) => known.has(id) && typeof cover?.url === "string" && /^https:\/\//.test(cover.url))
      .map(([id, cover]) => [id, cover.url]),
  )
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const storage = isCloudStorageConfigured()
  const manifest = storage ? await readManifest() : emptyManifest()
  return json({
    ok: true,
    covers: publicCovers(manifest),
    canPaint: storage && entitlement.authenticated && entitlement.plan === "owner",
  })
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || entitlement.plan !== "owner") {
    return json({ ok: false, error: "Обложки шаблонов рисует только владелец." }, 403)
  }
  if (!isCloudStorageConfigured()) {
    return json({ ok: false, error: "Хранилище медиа не настроено — обложку некуда сохранить." }, 503)
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonBodyLimited<Record<string, unknown>>(request, 4 * 1024)
  } catch (error) {
    if (error instanceof RequestSafetyError) return json({ ok: false, error: error.message }, error.status)
    return json({ ok: false, error: "Не удалось прочитать запрос." }, 400)
  }

  const template = findImageTemplate(String(body.id || ""))
  if (!template) return json({ ok: false, error: "Такого шаблона нет." }, 404)

  const manifest = await readManifest(true)
  const existing = manifest.covers[template.id]
  if (existing?.url && body.force !== true) return json({ ok: true, id: template.id, url: existing.url, cached: true })

  if (!scope.__malikCoverPainting) scope.__malikCoverPainting = new Set()
  const painting = scope.__malikCoverPainting
  if (painting.has(template.id) || painting.size >= MAX_PAINTING) {
    return json({ ok: false, busy: true, error: "Обложка уже рисуется." }, 409)
  }
  painting.add(template.id)

  try {
    const result = await routeImageGeneration({
      prompt: template.coverPrompt,
      understood: template.coverPrompt,
      aspectRatio: "4:3",
      mode: "cinematic",
      modelId: "malik-image-1-premium",
      quality: "quality",
      userId: entitlement.userId,
      plan: "owner",
    })
    if (!result.ok || !result.imageUrl) {
      return json({ ok: false, error: "Модель не смогла нарисовать обложку. Попробуйте позже." }, 502)
    }

    const source = await sourceBytes(result.imageUrl)
    if (!source) return json({ ok: false, error: "Не удалось получить нарисованную обложку." }, 502)

    const sharp = (await import("sharp")).default
    const buffer = await sharp(source.buffer, { failOn: "none" })
      .rotate()
      .resize(1200, 900, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer()

    const stored = await putSharedObject({
      key: `shared/image-templates/covers/${template.id}-${Date.now()}.webp`,
      buffer,
      mime: "image/webp",
    })
    if (!stored.stored) return json({ ok: false, error: "Не удалось сохранить обложку." }, 502)

    const model = result.providerModel || result.modelId || "malik-image-1-premium"
    await recordCover(template.id, stored.publicUrl, model)
    return json({ ok: true, id: template.id, url: stored.publicUrl, model })
  } catch (error) {
    console.warn("[image-templates] cover failed", template.id, error instanceof Error ? error.message.slice(0, 200) : error)
    return json({ ok: false, error: "Не удалось нарисовать обложку." }, 500)
  } finally {
    painting.delete(template.id)
  }
}
