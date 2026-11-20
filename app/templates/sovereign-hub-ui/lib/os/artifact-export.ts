import { z } from "zod"
import { normalizeDeck } from "@/lib/presentations/deck"
import { documentAssets } from "@/lib/work/documents/assets"
import { exportDocument, documentFilename } from "@/lib/work/documents/export"
import { artifactFormats, type DocumentFormat } from "@/lib/work/documents/formats"
import { buildZip } from "@/lib/work/documents/zip"
import type { ArtifactDraft } from "./store"

type ExportSource = Pick<ArtifactDraft, "kind" | "title" | "content" | "metadata">

export class ArtifactExportError extends Error {
  constructor(message: string, readonly status = 422) { super(message) }
}

const projectSchema = z.object({
  truncated: z.boolean().optional(),
  files: z.array(z.object({
    path: z.string().min(1).max(240).refine(path => !path.startsWith("/") && !/[\\:\p{Cc}]/u.test(path) &&
      path.split("/").every(part => part && part !== "." && part !== "..")),
    content: z.string().max(400_000),
  })).min(1).max(200),
})

/** The Work verifier and the download route render from the same saved source. */
export async function renderArtifactExport(artifact: ExportSource, format: DocumentFormat) {
  const content = artifact.content || ""
  if (Buffer.byteLength(content) > 400 * 1024) throw new ArtifactExportError("Результат слишком большой для экспорта.", 413)
  if (!artifactFormats(artifact.kind, content).includes(format)) throw new ArtifactExportError("Этот формат недоступен для результата.", 400)
  const file = (bytes: Uint8Array, mime: string, title = artifact.title) => ({ bytes, mime, filename: documentFilename(title, format) })
  if (artifact.kind === "code") {
    const project = projectSchema.safeParse(JSON.parse(content))
    if (!project.success) throw new ArtifactExportError("Не удалось прочитать файлы проекта.")
    const { files, truncated } = project.data
    if (truncated || Number(artifact.metadata?.fileCount) > files.length) throw new ArtifactExportError("Сохранилась только часть исходников. Полный ZIP этого результата недоступен.")
    if (new Set(files.map(item => item.path.normalize("NFC").toLowerCase())).size !== files.length) throw new ArtifactExportError("В архиве есть совпадающие пути.")
    return file(buildZip(files.map(item => ({ name: item.path, data: item.content }))), "application/zip")
  }
  if (artifact.kind === "website") return file(new TextEncoder().encode(content), "text/html; charset=utf-8")
  if (artifact.kind === "presentation") {
    if (format === "json") return file(new TextEncoder().encode(content), "application/json")
    const deck = normalizeDeck(JSON.parse(content))
    if (!deck) throw new ArtifactExportError("Презентация не содержит слайдов.")
    const hasRemoteImages = deck.slides.some(slide => "imageUrl" in slide && slide.imageUrl)
    // No remote fetch from untrusted URLs. Label the omission only when it exists.
    if (hasRemoteImages) deck.slides = deck.slides.map(slide => ({
      ...slide, subtitle: ["subtitle" in slide ? slide.subtitle : "", "без изображений"].filter(Boolean).join(" · "),
    }))
    const { buildPptx } = await import("@/lib/presentations/pptx")
    return file(await buildPptx(deck), "application/vnd.openxmlformats-officedocument.presentationml.presentation", hasRemoteImages ? `${artifact.title} без изображений` : artifact.title)
  }
  return exportDocument({
    format, title: artifact.title, markdown: content,
    csv: artifact.kind === "dataset" ? content : undefined,
    allowFormulas: artifact.metadata?.safeFormulas === true,
    charts: format === "xlsx" && artifact.metadata?.charts === true,
    assets: documentAssets(artifact.metadata?.documentAssets),
  })
}
