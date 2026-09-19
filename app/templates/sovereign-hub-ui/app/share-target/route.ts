import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { saveShareTarget, type SharedTargetFile } from "@/lib/server/share-target-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FILES = 8
const MAX_BYTES = 10 * 1024 * 1024

async function toSharedFile(value: FormDataEntryValue): Promise<SharedTargetFile | null> {
  if (!(value instanceof File) || value.size <= 0) return null
  const mime = String(value.type || "application/octet-stream").toLowerCase()
  if (!mime.startsWith("image/") && !mime.startsWith("video/") && mime !== "application/pdf") return null
  if (value.size > MAX_BYTES) return null
  const buffer = Buffer.from(await value.arrayBuffer())
  return {
    name: String(value.name || "shared-media").slice(0, 180),
    mime,
    size: buffer.byteLength,
    base64: buffer.toString("base64"),
  }
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") {
    return Response.redirect(new URL("/sign-in", request.url), 303)
  }

  const form = await request.formData().catch(() => null)
  if (!form) return Response.redirect(new URL("/dashboard", request.url), 303)

  const files: SharedTargetFile[] = []
  for (const value of form.getAll("files").slice(0, MAX_FILES)) {
    const file = await toSharedFile(value)
    if (file) files.push(file)
  }

  const token = saveShareTarget({
    userId: entitlement.userId,
    title: String(form.get("title") || "").slice(0, 500) || undefined,
    text: String(form.get("text") || "").slice(0, 4000) || undefined,
    url: String(form.get("url") || "").slice(0, 4096) || undefined,
    files,
  })

  const target = new URL("/dashboard", request.url)
  target.searchParams.set("shareTarget", token)
  return Response.redirect(target, 303)
}
