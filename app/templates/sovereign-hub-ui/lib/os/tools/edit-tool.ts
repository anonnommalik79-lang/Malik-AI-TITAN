import { OsToolError } from "../failures"
import type { Artifact } from "../types"
import type { ToolDefinition } from "./contract"
import { LANGUAGE_NAME, NO_INVENTION, askJson, askText, clip, extractJson, languageOf, projectContext } from "./shared"

/**
 * Cross-tool editing and "Fix with AI": a new version of an artifact, made
 * from the previous one and an instruction (or the runtime errors the
 * preview caught). The old version is never changed; the new one links back
 * to it, so any version can be compared with another and restored.
 */

type FileSet = Array<{ path: string; content: string }>

function readFiles(content: string): FileSet {
  const parsed = extractJson(content) as { files?: FileSet } | null
  return Array.isArray(parsed?.files) ? parsed!.files.filter((file) => typeof file?.path === "string" && typeof file?.content === "string") : []
}

function safePath(path: string) {
  const clean = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "")
  return clean && !clean.split("/").includes("..") && clean.length < 200 ? clean : ""
}

export const editTool: ToolDefinition = {
  name: "artifact.edit",
  label: "Вношу правки",
  sideEffect: "none",
  timeoutMs: 360_000,
  validate(input) {
    const ids = input.sourceArtifactIds
    if (!Array.isArray(ids) || !ids.length) return "Не указано, что изменить."
    if (!String(input.instruction || "").trim() && !Array.isArray(input.errors)) return "Опишите, что изменить."
    return null
  },
  async run(context) {
    const source = context.inputs.find((artifact) => artifact.id === (context.task.input.sourceArtifactIds as string[])[0])
    if (!source) throw new OsToolError("SOURCE_MISSING", "Исходный результат не найден.", { retryable: false })
    const errors = Array.isArray(context.task.input.errors) ? (context.task.input.errors as unknown[]).map((item) => clip(item, 400)).slice(0, 8) : []
    const instruction = clip(String(context.task.input.instruction || ""), 2_000)
      || `Исправь ошибки, которые появились при запуске:\n${errors.map((error) => `- ${error}`).join("\n")}`
    const language = languageOf(`${instruction} ${source.title}`)
    const base = {
      projectId: source.projectId,
      kind: source.kind,
      sourceTool: "artifact.edit" as const,
      sourceTask: context.task.id,
      mime: source.mime,
      version: (source.version || 1) + 1,
      links: [{ relation: "revision-of" as const, artifactId: source.id }],
    }
    context.activity("Читаю текущую версию", 0.1)

    if (source.kind === "image" || source.kind === "video" || source.kind === "audio") {
      throw new OsToolError("EDIT_UNSUPPORTED", "Изображения и видео меняются в своих студиях: откройте результат и нажмите «Изменить».", { retryable: false })
    }

    if (source.kind === "website" && source.metadata?.plan && typeof source.metadata.plan === "object") {
      // A site built by the skill engine is edited as its plan, then rendered
      // again: the design stays whole and the change is exactly what was asked.
      context.activity("Меняю структуру и тексты сайта", 0.35)
      const result = await askJson(context, {
        system: [
          "Ты — редактор сайтов Malik AI. Тебе дан план сайта (JSON WebsitePlan) и просьба пользователя.",
          "Верни ПОЛНЫЙ изменённый план в том же формате. Меняй только то, о чём просят; остальное оставь как было.",
          NO_INVENTION,
        ].join(" "),
        prompt: `ПРОСЬБА: ${instruction}\n\nПЛАН:\n${JSON.stringify(source.metadata.plan).slice(0, 60_000)}`,
        maxTokens: 9_000,
        normalize: (raw) => (raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections) ? raw as Record<string, unknown> : null),
      })
      if (!context.deps.renderSite) throw new OsToolError("EDIT_UNSUPPORTED", "Правка сайта сейчас недоступна.", { retryable: false })
      const html = await context.deps.renderSite(result.value, clip(context.flow.goal, 2_000))
      return { provider: result.provider, artifacts: [{ ...base, title: source.title, content: html.html, summary: clip(instruction, 240), metadata: { ...source.metadata, role: "website", plan: html.plan, edit: instruction } }] }
    }

    if (source.kind === "code") {
      const files = readFiles(source.content || "")
      if (!files.length) throw new OsToolError("SOURCE_MISSING", "В проекте нет файлов для правки.", { retryable: false })
      context.activity(`Правлю код: ${files.length} файлов`, 0.35)
      const listing = files.map((file) => `=== ${file.path} ===\n${file.content}`).join("\n\n").slice(0, 120_000)
      const result = await askJson(context, {
        system: [
          "Ты — старший инженер Malik AI. Внеси правку в проект.",
          'Верни JSON {"files":[{"path":"","content":""}],"deleted":["path"],"note":""}: только изменённые или новые файлы — каждый ЦЕЛИКОМ, без сокращений и без "...".',
          "Не трогай файлы, которые не нужно менять.",
        ].join(" "),
        prompt: `ПРАВКА: ${instruction}\n\nФАЙЛЫ ПРОЕКТА:\n${listing}`,
        maxTokens: 16_000,
        normalize: (raw) => {
          const value = raw as { files?: FileSet; deleted?: string[]; note?: string } | null
          if (!value || !Array.isArray(value.files)) return null
          const changed = value.files.filter((file) => safePath(file?.path) && typeof file.content === "string" && !/^\s*\.\.\.\s*$/.test(file.content))
          return changed.length || (Array.isArray(value.deleted) && value.deleted.length) ? { files: changed, deleted: (value.deleted || []).map(safePath).filter(Boolean), note: clip(value.note, 400) } : null
        },
      })
      const merged = new Map(files.map((file) => [file.path, file.content]))
      for (const path of result.value.deleted) merged.delete(path)
      for (const file of result.value.files) merged.set(safePath(file.path), file.content)
      const next = [...merged.entries()].map(([path, content]) => ({ path, content }))
      const content = JSON.stringify({ files: next })
      if (content.length > 400_000) throw new OsToolError("ARTIFACT_TOO_LARGE", "Проект стал слишком большим для хранения в библиотеке.", { retryable: false })
      return {
        provider: result.provider,
        artifacts: [{
          ...base,
          title: source.title,
          content,
          summary: result.value.note || clip(instruction, 240),
          // The zip of the first version is not this version: no stale download link.
          metadata: { role: "code", qaPassed: true, fileCount: next.length, changed: result.value.files.map((file) => safePath(file.path)), deleted: result.value.deleted, edit: instruction, fixedErrors: errors.length ? errors : undefined },
        }],
      }
    }

    if (source.kind === "presentation") {
      context.activity("Переписываю слайды", 0.35)
      const deck = extractJson(source.content || "") as { slides?: unknown[] } & Record<string, unknown> | null
      if (!deck || !Array.isArray(deck.slides)) throw new OsToolError("SOURCE_MISSING", "Презентация повреждена.", { retryable: false })
      const result = await askJson(context, {
        system: [
          "Ты — редактор презентаций Malik AI. Тебе дан JSON презентации и просьба.",
          'Верни {"slides":[…]} — ВСЕ слайды, в том же формате, с теми же id и layout, изменив только то, о чём просят.',
          NO_INVENTION,
        ].join(" "),
        prompt: `ПРОСЬБА: ${instruction}\n\nСЛАЙДЫ:\n${JSON.stringify(deck.slides).slice(0, 80_000)}`,
        maxTokens: 12_000,
        normalize: (raw) => {
          const slides = (raw as { slides?: unknown[] } | null)?.slides
          return Array.isArray(slides) && slides.length >= Math.min(3, deck.slides!.length) ? slides : null
        },
      })
      const content = JSON.stringify({ ...deck, slides: result.value, updatedAt: context.deps.now() })
      return { provider: result.provider, artifacts: [{ ...base, title: source.title, content, summary: clip(instruction, 240), metadata: { ...source.metadata, edit: instruction } }] }
    }

    // Text: brief, brand book, research, plan, script, document, analysis, raw HTML.
    const html = /^\s*</.test(source.content || "")
    context.activity("Переписываю текст", 0.35)
    const answer = await askText(context, {
      system: [
        html
          ? "Ты — фронтенд-инженер Malik AI. Тебе дан HTML-документ. Верни ПОЛНЫЙ исправленный HTML-документ, без пояснений и без markdown."
          : `Ты — редактор Malik AI. Верни ПОЛНУЮ новую версию документа в Markdown на ${LANGUAGE_NAME[language]} языке, изменив только то, о чём просят.`,
        "Сохрани всё, что не просили менять. Ссылки на источники [n] сохраняй.",
        NO_INVENTION,
      ].join(" "),
      prompt: `${projectContext(context)}\n\nПРОСЬБА: ${instruction}\n\nТЕКУЩАЯ ВЕРСИЯ «${source.title}»:\n${clip(source.content || "", 90_000)}`,
      maxTokens: Math.min(24_000, Math.max(3_000, Math.round((source.content || "").length / 2.5))),
      temperature: 0.3,
    })
    let content = answer.content
    if (html) content = content.replace(/^```html?\s*/i, "").replace(/```\s*$/, "").trim()
    return { provider: answer.provider, artifacts: [{ ...base, title: source.title, content, summary: clip(instruction, 240), metadata: { ...source.metadata, edit: instruction, fixedErrors: errors.length ? errors : undefined } }] }
  },
}

/** A copy of an older version as the newest one; nothing is deleted. */
export function restoredVersion(current: Artifact, older: Artifact) {
  return {
    projectId: current.projectId,
    kind: older.kind,
    title: current.title,
    sourceTool: "artifact.edit" as const,
    content: older.content,
    url: older.url,
    mime: older.mime,
    summary: `Возврат к версии ${older.version || 1}`,
    version: (current.version || 1) + 1,
    links: [
      { relation: "revision-of" as const, artifactId: current.id },
      { relation: "derived-from" as const, artifactId: older.id },
    ],
    metadata: { ...older.metadata, restoredFrom: older.id, restoredVersion: older.version || 1 },
  }
}
