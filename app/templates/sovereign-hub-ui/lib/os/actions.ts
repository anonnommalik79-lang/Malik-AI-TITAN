import { parseCsv, tableToCsv, toTable } from "./data/table"
import { readXlsx } from "./data/xlsx"
import { startFlow } from "./executor"
import { OsToolError } from "./failures"
import { taskId } from "./planner"
import { artifactIndex, createProject, findFlowByRequest, getArtifact, getProject, putArtifact, updateProject } from "./store"
import type { OwnerContext, ToolDeps } from "./tools/contract"
import { restoredVersion } from "./tools/edit-tool"
import type { Artifact, OsTask, ToolName } from "./types"

/**
 * Cross-tool continuation and editing: a result becomes the input of the
 * next tool ("make a deck from this plan", "fix the site", "restore the
 * previous version"), inside the same project, with the project's brief,
 * brand and research carried along.
 */

export const CONTINUE_TARGETS: Record<string, { tool: ToolName; label: string }> = {
  presentation: { tool: "presentation.generate", label: "Готовлю презентацию" },
  website: { tool: "site.generate", label: "Собираю сайт" },
  "business-plan": { tool: "business.plan", label: "Пишу бизнес-план" },
  "video-script": { tool: "video.script", label: "Пишу сценарий видео" },
  document: { tool: "document.write", label: "Пишу документ" },
  research: { tool: "research.web", label: "Исследую рынок" },
  logo: { tool: "image.generate", label: "Рисую логотип" },
  code: { tool: "code.project", label: "Пишу код проекта" },
}

function singleTask(flowId: string, tool: ToolName, label: string, input: Record<string, unknown>): OsTask[] {
  return [{
    id: taskId(flowId, "main"),
    type: tool,
    label,
    status: "planned",
    progress: 0,
    dependencies: [],
    input,
    artifactIds: [],
    retry: { attempts: 0, maxAttempts: tool === "image.generate" ? 2 : 3 },
    idempotencyKey: `${flowId}:main`,
  }]
}

/** The latest brief, brand, research, plan and logo of a project. */
async function projectContextIds(ownerId: string, projectId: string) {
  const index = await artifactIndex(ownerId)
  const inProject = index.filter((entry) => entry.projectId === projectId && !entry.fallback)
  const pick = (test: (entry: (typeof inProject)[number]) => boolean) => inProject.find(test)?.id
  const ids = [
    pick((entry) => entry.sourceTool === "goal.understand"),
    pick((entry) => entry.sourceTool === "brand.create"),
    pick((entry) => entry.kind === "analysis" && entry.sourceTool === "research.web"),
    pick((entry) => entry.kind === "business-plan"),
    pick((entry) => entry.kind === "image" && /логотип/i.test(entry.title)),
  ]
  return ids.filter((id): id is string => Boolean(id))
}

async function ownedArtifact(ownerId: string, artifactId: string): Promise<Artifact> {
  const artifact = await getArtifact(ownerId, artifactId)
  if (!artifact) throw new OsToolError("NOT_FOUND", "Результат не найден.", { retryable: false })
  return artifact
}

export async function continueFromArtifact(input: {
  owner: OwnerContext
  artifactId: string
  target: string
  instruction?: string
  clientRequestId: string
  deps: ToolDeps
}) {
  const target = CONTINUE_TARGETS[input.target]
  if (!target) throw new OsToolError("INVALID_REQUEST", "Неизвестный тип продолжения.", { retryable: false })
  const source = await ownedArtifact(input.owner.userId, input.artifactId)
  const context = await projectContextIds(input.owner.userId, source.projectId)
  const instruction = String(input.instruction || "").trim().slice(0, 2_000)
  const goal = instruction || `${target.label.replace(/^Готовлю |^Собираю |^Пишу |^Исследую |^Рисую /, "")} на основе «${source.title}»`
  return startFlow({
    owner: input.owner,
    goal,
    clientRequestId: input.clientRequestId,
    projectId: source.projectId,
    deps: input.deps,
    capabilities: [],
    tasks: (flowId) => singleTask(flowId, target.tool, target.label, {
      goal,
      instruction,
      sourceArtifactIds: [...new Set([source.id, ...context])],
      purpose: target.tool === "image.generate" ? "logo" : undefined,
      audience: /инвестор|investor|pitch|питч/i.test(`${instruction} ${source.title}`) ? "investors" : "general",
    }),
  })
}

export async function editArtifact(input: {
  owner: OwnerContext
  artifactId: string
  instruction?: string
  errors?: string[]
  clientRequestId: string
  deps: ToolDeps
}) {
  const source = await ownedArtifact(input.owner.userId, input.artifactId)
  const context = await projectContextIds(input.owner.userId, source.projectId)
  const instruction = String(input.instruction || "").trim().slice(0, 2_000)
  const errors = (input.errors || []).map((error) => String(error).slice(0, 400)).filter(Boolean).slice(0, 8)
  if (!instruction && !errors.length) throw new OsToolError("INVALID_REQUEST", "Опишите, что изменить.", { retryable: false })
  const goal = instruction || `Исправить ошибки в «${source.title}»`
  return startFlow({
    owner: input.owner,
    goal,
    clientRequestId: input.clientRequestId,
    projectId: source.projectId,
    deps: input.deps,
    capabilities: [],
    tasks: (flowId) => singleTask(flowId, "artifact.edit", errors.length && !instruction ? "Исправляю ошибки" : "Вношу правки", {
      instruction,
      errors,
      sourceArtifactIds: [...new Set([source.id, ...context])],
    }),
  })
}

export async function restoreArtifactVersion(ownerId: string, currentId: string, olderId: string, now = Date.now()) {
  const current = await ownedArtifact(ownerId, currentId)
  const older = await ownedArtifact(ownerId, olderId)
  if (older.projectId !== current.projectId || older.kind !== current.kind) {
    throw new OsToolError("INVALID_REQUEST", "Эта версия относится к другому результату.", { retryable: false })
  }
  const restored = await putArtifact(ownerId, restoredVersion(current, older), now)
  await updateProject(ownerId, current.projectId, (project) => {
    project.artifactIds.push(restored.id)
  }, now)
  return restored
}

export const DATASET_LIMIT_BYTES = 5 * 1024 * 1024

/** A CSV or XLSX upload becomes a dataset artifact, then a data analysis flow. */
export async function analyzeDataset(input: {
  owner: OwnerContext
  fileName: string
  bytes: Buffer
  question?: string
  projectId?: string
  clientRequestId: string
  deps: ToolDeps
}) {
  // The same upload sent twice: the first flow and its dataset, nothing new.
  const existing = await findFlowByRequest(input.owner.userId, input.clientRequestId)
  if (existing) {
    const datasetId = (existing.tasks[0]?.input.sourceArtifactIds as string[] | undefined)?.[0]
    const dataset = datasetId ? await getArtifact(input.owner.userId, datasetId) : null
    if (dataset) return { flow: existing, created: false, dataset }
  }
  if (input.bytes.length > DATASET_LIMIT_BYTES) throw new OsToolError("INVALID_REQUEST", "Файл больше 5 МБ. Сократите таблицу или разбейте её на части.", { retryable: false })
  const name = String(input.fileName || "data").replace(/[^\p{L}\p{N}._ -]+/gu, "").slice(0, 120) || "data"
  const isXlsx = /\.xlsx$/i.test(name) || input.bytes.subarray(0, 2).toString("latin1") === "PK"
  let rows: string[][]
  try {
    rows = isXlsx ? readXlsx(input.bytes) : parseCsv(input.bytes.toString("utf8"))
  } catch {
    throw new OsToolError("INVALID_REQUEST", isXlsx ? "Не удалось прочитать XLSX. Сохраните файл как CSV и попробуйте снова." : "Не удалось прочитать CSV.", { retryable: false })
  }
  const table = toTable(rows)
  if (!table.rows.length) throw new OsToolError("INVALID_REQUEST", "В файле нет строк с данными.", { retryable: false })
  const { csv, includedRows } = tableToCsv(table)
  const question = String(input.question || "").trim().slice(0, 1_500)
  const goal = question || `Проанализируй данные из файла ${name}`

  const project = (input.projectId && await getProject(input.owner.userId, input.projectId))
    || await createProject(input.owner.userId, { title: `Данные: ${name}`, goal })
  const dataset = await putArtifact(input.owner.userId, {
    projectId: project.id,
    kind: "dataset",
    title: name,
    sourceTool: "user",
    content: csv,
    mime: "text/csv",
    summary: `${table.rows.length} строк · ${table.header.length} столбцов`,
    metadata: { role: "dataset", rows: table.rows.length, storedRows: includedRows, columns: table.header, format: isXlsx ? "xlsx" : "csv", truncated: includedRows < table.rows.length || table.truncated },
  })
  await updateProject(input.owner.userId, project.id, (target) => {
    target.artifactIds.push(dataset.id)
  })
  const started = await startFlow({
    owner: input.owner,
    goal,
    clientRequestId: input.clientRequestId,
    projectId: project.id,
    deps: input.deps,
    capabilities: ["data"],
    tasks: (flowId) => singleTask(flowId, "data.analyze", "Анализирую данные", { question, sourceArtifactIds: [dataset.id] }),
  })
  return { ...started, dataset }
}
