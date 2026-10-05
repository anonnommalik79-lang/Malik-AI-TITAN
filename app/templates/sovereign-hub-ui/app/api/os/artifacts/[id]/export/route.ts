import { z } from "zod"
import { osOwner } from "@/lib/os/http"
import { getArtifact } from "@/lib/os/store"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { normalizeDeck } from "@/lib/presentations/deck"
import { buildPptx } from "@/lib/presentations/pptx"
import { exportDocument, documentFilename } from "@/lib/work/documents/export"
import { artifactFormats, DOCUMENT_FORMATS } from "@/lib/work/documents/formats"
import { documentResponse } from "@/lib/work/documents/http"
import { buildZip } from "@/lib/work/documents/zip"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const querySchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/), format: z.enum([...DOCUMENT_FORMATS, "pptx"]) })
const projectSchema = z.object({ files: z.array(z.object({ path: z.string().min(1).max(240).refine((value) => !value.startsWith("/") && !value.includes("\\") && !value.includes(":") && !value.split("/").some((part) => part === ".." || part === ".")), content: z.string().max(400000) })).min(1).max(200) })
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "cache-control": "private, no-store" }
  try {
    const owner = await osOwner(request)
    const parsed = querySchema.safeParse({ ...(await context.params), format: new URL(request.url).searchParams.get("format") })
    if (!parsed.success) return Response.json({ error: "Неверный формат экспорта." }, { status: 400, headers })
    const artifact = owner.authenticated ? await getArtifact(owner.userId, parsed.data.id) : null
    if (!artifact) return Response.json({ error: "Результат не найден." }, { status: 404, headers })
    if (!takeRequestFrequency("artifact-export", owner.userId, 12)) return Response.json({ error: "Слишком много скачиваний. Попробуйте через минуту." }, { status: 429, headers: { ...headers, "retry-after": "60" } })
    const { format } = parsed.data
    if (!artifactFormats(artifact.kind, artifact.content).includes(format)) return Response.json({ error: "Этот формат недоступен для результата." }, { status: 400, headers })
    const content = artifact.content || ""
    if (Buffer.byteLength(content) > 400 * 1024) return Response.json({ error: "Результат слишком большой для экспорта." }, { status: 413, headers })
    if (artifact.kind === "code") {
      const project = projectSchema.safeParse(JSON.parse(content))
      if (!project.success || new Set(project.data.files.map((file) => file.path)).size !== project.data.files.length) return Response.json({ error: "Не удалось прочитать файлы проекта." }, { status: 422, headers })
      return documentResponse({ bytes: buildZip(project.data.files.map((file) => ({ name: file.path, data: file.content }))), mime: "application/zip", filename: documentFilename(artifact.title, "zip") })
    }
    if (artifact.kind === "website") return documentResponse({ bytes: new TextEncoder().encode(content), mime: "text/html; charset=utf-8", filename: documentFilename(artifact.title, "html") })
    if (artifact.kind === "presentation") {
      if (format === "json") return documentResponse({ bytes: new TextEncoder().encode(content), mime: "application/json", filename: documentFilename(artifact.title, "json") })
      const deck = normalizeDeck(JSON.parse(content))
      if (!deck) return Response.json({ error: "Презентация не содержит слайдов." }, { status: 422, headers })
      // No remote fetch: image URLs are untrusted. The caption states the omission.
      deck.slides = deck.slides.map((slide) => ({ ...slide, subtitle: ["subtitle" in slide ? slide.subtitle : "", "без изображений"].filter(Boolean).join(" · ") }))
      return documentResponse({ bytes: await buildPptx(deck), mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", filename: documentFilename(`${artifact.title} без изображений`, "pptx") })
    }
    if (format === "pptx") return Response.json({ error: "Этот результат не является презентацией." }, { status: 400, headers })
    return documentResponse(await exportDocument({ format, title: artifact.title, markdown: content, csv: artifact.kind === "dataset" ? content : undefined }))
  } catch {
    return Response.json({ error: "Не удалось экспортировать результат. Проверьте содержимое и повторите." }, { status: 422, headers })
  }
}
