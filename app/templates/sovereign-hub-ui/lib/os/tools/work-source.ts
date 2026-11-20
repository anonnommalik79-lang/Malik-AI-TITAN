import { z } from "zod"
import { routingScope } from "@/lib/ai/prompt-shape"
import { analyzeProject } from "@/lib/work/code/diagnostics"
import { IGNORED_DIRECTORIES, normalizeProjectFiles } from "@/lib/work/code/files"
import { OsToolError } from "../failures"
import { MAX_INLINE_ARTIFACT_CHARS } from "../types"
import type { ToolContext, ToolResult } from "./contract"
import { clip, feedbackNote, researchOf } from "./shared"

const sourceProject = z.object({
  title: z.string().trim().min(1).max(160),
  files: z.array(z.object({ path: z.string().min(1).max(240), content: z.string().max(MAX_INLINE_ARTIFACT_CHARS) })).min(1).max(80),
})
const sourceFile = /\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|php|c|cpp|h|cs|sh|ps1|sql|html?|vue|svelte|astro)$/iu
const windowsReserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu
const protectedDirectories = new Set([...IGNORED_DIRECTORIES, ".ssh", ".aws", ".azure", ".gcloud", ".docker"].map(name => name.toLowerCase()))
const requiredSources = [
  { name: "Python", mention: "python|питоне?", file: /\.py$/iu },
  { name: "TypeScript", mention: "typescript", file: /\.(?:[cm]?ts|tsx)$/iu },
  { name: "JavaScript", mention: "javascript", file: /\.(?:[cm]?js|jsx)$/iu },
  { name: "Go", mention: "go|golang", file: /\.go$/iu },
  { name: "Rust", mention: "rust", file: /\.rs$/iu },
  { name: "Java", mention: "java", file: /\.java$/iu },
]

export async function buildWorkSource(context: ToolContext): Promise<ToolResult> {
  context.activity("Готовлю исходные файлы проекта", 0.2)
  const correction = context.feedback ? feedbackNote(context) : context.attempt > 1 && context.task.error
    ? `\n\nИсправь проблему прошлой версии: ${context.task.error.message}` : ""
  const research = researchOf(context)
  const model = await context.deps.text({
    system: [
      "Собери полные исходники по задаче пользователя на запрошенном языке программирования и стеке.",
      'Ответ одним JSON-объектом {"title":"название","files":[{"path":"README.md","content":"..."},{"path":"src/...","content":"..."}]}.',
      "Соблюдай регистр путей. Все файлы текстовые. README объясняет установку, запуск и тестирование.",
      "Включай манифесты зависимостей при необходимости. Не подменяй реализацию заглушками, не добавляй ключи и не утверждай, что код уже запускался.",
    ].join(" "),
    prompt: `${context.task.input.goal || context.flow.goal}${research ? `\n\nСведения из исследования:\n${clip(research.text, 2_400)}` : ""}${correction}`,
    maxTokens: 12_000,
    temperature: 0.2,
    reasoningEffort: "medium",
    signal: context.signal,
  })
  context.signal.throwIfAborted()
  const fail = (message: string): never => {
    throw new OsToolError("SOURCE_CHECK_FAILED", message, { retryable: true })
  }
  const raw = model.content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")
  let value: unknown
  try { value = JSON.parse(raw) } catch { fail("Ответ с исходниками должен быть полным JSON-объектом.") }
  const project = sourceProject.safeParse(value)
  if (!project.success) return fail("У проекта должно быть название и от 1 до 80 полных текстовых файлов.")
  const { files, rejected } = normalizeProjectFiles(project.data.files, { stripRoot: false })
  const keys = new Set<string>()
  for (const { path } of files) {
    const key = path.normalize("NFC").toLowerCase()
    const parts = path.split("/")
    if (keys.has(key) || /[<>:"|?*]/u.test(path) || parts.some(part => windowsReserved.test(part) || /[. ]$/.test(part)) ||
        parts.slice(0, -1).some(part => protectedDirectories.has(part.toLowerCase()))) {
      fail("Пути файлов должны быть уникальными и безопасными для распаковки на Windows и macOS.")
    }
    keys.add(key)
  }
  if (rejected.length) fail(`Нужно исправить имена, формат или размер файлов (${[...new Set(rejected.map(file => file.code))].slice(0, 3).join(", ")}).`)
  if (!files.some(file => /^readme\.md$/iu.test(file.path) && file.content.trim()) ||
      !files.some(file => sourceFile.test(file.path) && file.content.trim())) fail("Нужны README.md с инструкцией и хотя бы один полный файл исходного кода.")
  const goal = routingScope(context.flow.goal)
  for (const language of requiredSources) {
    const name = `(?:${language.mention})`
    const phrased = new RegExp(`(?:^|\\s)(?:(?:in|using|written in|на)\\s+${name}(?![\\p{L}\\p{N}])|${name}[- ](?:cli|app|project|script|проект|скрипт|бот|утилит))`, "iu")
    if (phrased.test(goal) && !files.some(file => language.file.test(file.path) && file.content.trim())) fail(`В проекте нет запрошенных исходников на ${language.name}.`)
  }
  const content = JSON.stringify({ files })
  if (content.length > MAX_INLINE_ARTIFACT_CHARS || Buffer.byteLength(content) > 400 * 1024) {
    fail("Исходники превышают лимит одного проекта. Сократи объём, сохранив все файлы, необходимые для запуска.")
  }
  context.activity("Проверяю исходники проекта", 0.7)
  const analysis = analyzeProject(files)
  if (/(?:^|\s)(?:(?:на|in|using|with)\s+next(?:\.js)?(?![\p{L}\p{N}])|next\.js[- ](?:app|project|сайт|проект))/iu.test(goal) &&
      !["next-app", "next-pages"].includes(analysis.stack)) fail("В исходниках отсутствует запрошенное приложение Next.js.")
  const errors = analysis.diagnostics.filter(issue => issue.severity === "error")
  if (errors.length) fail(`Исправь ошибки в исходниках. ${errors.slice(0, 3).map(issue => clip(`${issue.file}:${issue.line} ${issue.message}`, 170)).join(" ")}`)
  return {
    provider: `${model.provider}/${model.model}`,
    artifacts: [{
      projectId: context.project.id, kind: "code", title: project.data.title,
      sourceTool: "code.project", sourceTask: context.task.id, content,
      mime: "application/vnd.malik.files+json",
      summary: `${files.length} файлов · проверена структура · сборка и тесты не запускались`,
      metadata: {
        role: "work-source", fileCount: files.length, stack: analysis.stack,
        structureVerified: true, checks: analysis.checks, buildExecuted: false, testsExecuted: false,
      },
    }],
  }
}
