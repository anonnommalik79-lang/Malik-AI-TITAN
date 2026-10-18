import "server-only"
import type { RequestEntitlement } from "./request-entitlement"
import type { ConversationIntent } from "@/lib/ai/conversation-intent"
import type { ExecutionReporter } from "@/lib/ai/chat-execution"
import { executionContract } from "@/lib/ai/execution-contract"
import { fetchPublicPage } from "@/lib/malik-research/public-page-fetch"
import type { DocumentAsset } from "@/lib/work/documents/assets"

/** Runs only the explicit dependency of a native deck; no image is ever the
 * final replacement for PPTX. Paid image work is invoked once, before repair. */
export async function prepareDocumentAssets(input: { owner?: RequestEntitlement; intent: ConversationIntent; markdown: string; signal?: AbortSignal; activity?: ExecutionReporter }): Promise<DocumentAsset[]> {
  const { owner, intent, markdown, signal, activity } = input
  if (intent.requirements.format !== "pptx") return []
  const contract = executionContract(intent)
  const generate = contract.steps.some(step => step.tool === "image.generate")
  const photos = /(?<!\p{L})(?:фото(?:графи\p{L}*)?|изображени\p{L}*|иллюстраци\p{L}*|photos?|pictures?|images?)(?!\p{L})/iu.test(intent.original) && !/(?:без|no|without)\s+(?:фото|изображени|photos?|images?)/iu.test(intent.original)
  if (!generate && !photos) return []
  if (!owner?.authenticated) throw new Error("SIGN_IN_REQUIRED")
  signal?.throwIfAborted()
  let url: string, credit: string
  const step = activity?.start(generate ? "Создаю иллюстрацию для презентации" : "Подбираю фото для презентации", "media", generate ? "image.generate" : "research.photos")
  try {
    const query = markdown.match(/<!--\s*photo-query:\s*([^\n<>]{3,160})\s*-->/iu)?.[1] || markdown.match(/^#{1,2}\s+(.+)$/m)?.[1] || intent.original.slice(0, 180)
    if (generate) {
      const { serverToolDeps } = await import("@/lib/os/runtime")
      const deps = serverToolDeps(), available = await deps.image.check(owner)
      if (!available.ok) throw new Error("IMAGE_CREDITS_UNAVAILABLE")
      const image = await deps.image.generate({ prompt: intent.original.slice(0, 4000), mode: "design", aspectRatio: "16:9", owner, signal })
      await deps.image.record(owner)
      url = image.url; credit = `Generated illustration · ${image.provider}`
    } else {
      const { findPhoto } = await import("@/lib/server/presentation-photos")
      const photo = await findPhoto({ query, kind: "subject" })
      if (!photo) throw new Error("DOCUMENT_PHOTO_UNAVAILABLE")
      url = photo.url; credit = `${photo.credit}${photo.link ? ` · ${photo.link}` : ""}`
    }
    const timeout = AbortSignal.timeout(10_000)
    const stop = signal ? AbortSignal.any([signal, timeout]) : timeout
    const response = await fetchPublicPage(url, stop, 2 * 1024 * 1024, { media: "image" })
    if (!response.ok || !response.body || !/^image\/(?:jpeg|png|webp)(?:;|$)/iu.test(response.headers.get("content-type") || "")) throw new Error("DOCUMENT_IMAGE_UNAVAILABLE")
    const { default: sharp } = await import("sharp")
    const raster = await sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 12_000_000, sequentialRead: true }).rotate().resize({ width: 1400, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
    if (!raster.length || raster.length > 1024 * 1024) throw new Error("DOCUMENT_IMAGE_SIZE_LIMIT")
    signal?.throwIfAborted()
    activity?.finish(step, { bytes: raster.length, embedded: true })
    return [{ slideIndex: 0, dataUrl: `data:image/jpeg;base64,${raster.toString("base64")}`, credit }]
  } catch (error) {
    activity?.finish(step, undefined, "failed", "DOCUMENT_IMAGE_UNAVAILABLE")
    throw error
  }
}
