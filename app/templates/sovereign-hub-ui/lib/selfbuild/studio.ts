import "server-only"
import { createHash } from "node:crypto"
import type { MalikModelId } from "@/lib/ai/malik-models"
import type { ProjectBuilderResult } from "@/lib/ai/project-builder"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import { projectFiles, sourceHash } from "@/lib/website/engine/workspace"
import { analyzeProject } from "@/lib/work/code/diagnostics"
import { buildPassport } from "@/lib/proof/passport"
import type { ExecutionReporter } from "@/lib/ai/chat-execution"
import { executeNodeTests, type NodeTestReceipt } from "./executor"

type File = { path: string; content: string }
type Model = (input: { systemPrompt: string; prompt: string; signal?: AbortSignal }) => Promise<string>
type Runner = (files: File[], signal?: AbortSignal) => Promise<NodeTestReceipt>
const SYSTEM = [
  "You are Malik Self-Build. Implement the user's CLI as complete Node.js ESM files with node:test tests, built-in modules only.",
  "Return ONLY <<<FILE:relative/path>>> ... <<<END_FILE>>> blocks. Include package.json (type=module), README.md, CLI, implementation modules, *.test.mjs, and PLAN.json.",
  'PLAN.json: {"title":"...","requirements":["..."],"steps":["..."]}. Requirements are the actual user request, not a generic template.',
  "Every file must be complete. No credentials, dependency installs, lifecycle scripts, network APIs, eval, TODO or fake test results. The server executes no code itself.",
  "Tests must exercise normal, invalid and boundary cases. Never weaken assertions just to pass. Commands and results are reported only by the executor.",
].join("\n")

export function parseSelfBuild(raw: string) {
  if (raw.length > 400_000) throw new Error("SELFBUILD_SIZE_LIMIT")
  const blocks = [...raw.matchAll(/<<<FILE:([^>\n]{1,240})>>>\r?\n?([\s\S]*?)<<<END_FILE>>>/g)]
  if (!blocks.length || blocks.length > 24 || (raw.match(/<<<FILE:/g) || []).length !== blocks.length) throw new Error("SELFBUILD_INCOMPLETE_FILES")
  const files = projectFiles(blocks.map(match => ({ path: match[1].trim(), content: match[2].trimEnd() })))
  if (files.some(file => file.path.toUpperCase() === "PROOF_PASSPORT.JSON")) throw new Error("RESERVED_PASSPORT_PATH")
  const plan = JSON.parse(files.find(file => file.path === "PLAN.json")?.content || "null")
  if (!plan || typeof plan.title !== "string" || !Array.isArray(plan.requirements) || !Array.isArray(plan.steps)
    || !plan.requirements.length || !plan.steps.length || [...plan.requirements, ...plan.steps].some(value => typeof value !== "string" || value.length > 1000)) throw new Error("SELFBUILD_PLAN_REQUIRED")
  return { files, title: plan.title.slice(0, 100), plan: plan.steps.slice(0, 20) as string[], requirements: plan.requirements.slice(0, 30) as string[] }
}

function inspect(files: File[]) {
  const analysis = analyzeProject(files)
  const issues = analysis.diagnostics.filter(item => item.severity === "error").map(item => `${item.file}:${item.line} ${item.code}: ${item.message}`)
  const pkg = files.find(file => file.path === "package.json")
  try {
    const data = JSON.parse(pkg?.content || "null")
    if (!data || data.type !== "module") issues.push("package.json must declare type=module")
    if (Object.keys(data?.dependencies || {}).length || Object.keys(data?.devDependencies || {}).length) issues.push("External dependencies are not supported in this runner")
    if (Object.keys(data?.scripts || {}).some(key => /^(?:pre|post|install|prepare)/.test(key))) issues.push("Lifecycle/install scripts are not permitted")
  } catch { issues.push("Invalid package.json") }
  if (!files.some(file => /\.test\.mjs$/.test(file.path))) issues.push("No *.test.mjs file")
  if (!files.some(file => file.path === "README.md")) issues.push("README.md required")
  return { issues, checks: analysis.checks }
}

export async function buildSelfProject(input: { prompt: string; modelId?: MalikModelId; signal?: AbortSignal; activity?: ExecutionReporter }, deps: { model?: Model; runner?: Runner } = {}): Promise<ProjectBuilderResult> {
  const id = `selfbuild_${crypto.randomUUID()}`
  let provenance: { provider?: string; model?: string } = {}
  const model: Model = deps.model || (async request => {
    const result = await runStrictMalikModel({ ...request, modelId: input.modelId || "malik-max", maxTokens: 16000, temperature: 0.08, activity: input.activity })
    provenance = {provider:result.provider,model:result.model}
    return result.content
  })
  const runner = deps.runner || executeNodeTests
  let feedback = "", rounds = 0
  let best: { files: File[]; title: string; plan: string[]; issues: string[]; checks: string[]; run: NodeTestReceipt; score: number } | null = null
  for (let round = 0; round < 3; round++) {
    input.signal?.throwIfAborted()
    const generation = input.activity?.start(round ? "Исправляю Self-Build по результатам проверок" : "Планирую и пишу CLI с тестами", "code", "selfbuild.author")
    let parsed: ReturnType<typeof parseSelfBuild>
    try {
      const raw = await model({ systemPrompt: SYSTEM, prompt: `${input.prompt.slice(0, 14000)}${feedback ? `\n\nCHECK FINDINGS:\n${feedback}` : ""}`, signal: input.signal })
      rounds++
      parsed = parseSelfBuild(raw)
      input.activity?.finish(generation, { files: parsed.files.length })
    } catch (error) {
      input.signal?.throwIfAborted()
      input.activity?.finish(generation, undefined, "failed", "Не получен полный набор файлов")
      feedback = error instanceof Error ? error.message : "Invalid file response"
      if (best || round > 0) break
      continue
    }
    const staticCall = input.activity?.start("Проверяю структуру, синтаксис и импорты CLI", "code", "selfbuild.static")
    const qa = inspect(parsed.files)
    input.activity?.finish(staticCall, { errors: qa.issues.length }, qa.issues.length ? "failed" : "completed")
    let run: NodeTestReceipt = { status: "not_run", sourceHash: sourceHash(parsed.files), details: ["Статическая проверка ещё не пройдена"] }
    if (!qa.issues.length) {
      const call = input.activity?.start("Запрашиваю изолированный node --test", "code", "selfbuild.test")
      run = await runner(parsed.files, input.signal)
      if (run.sourceHash !== sourceHash(parsed.files)) run = { status: "not_run", sourceHash: sourceHash(parsed.files), details: ["Квитанция относится к другому коду"] }
      input.activity?.finish(call, { status: run.status, tests: run.tests }, run.status === "pass" ? "completed" : run.status === "fail" ? "failed" : "interrupted", run.status === "not_run" ? run.details[0] : undefined)
    }
    const score = qa.issues.length + (run.status === "fail" ? Math.max(1, run.failures || 1) : 0)
    const previousScore = best?.score
    if (!best || score < best.score) best = { ...parsed, ...qa, run, score }
    if (!score || (previousScore !== undefined && score >= previousScore)) break
    feedback = [...qa.issues, ...(run.status === "fail" ? run.details : [])].join("\n").slice(0, 7000)
      + "\n\nCURRENT FILES:\n" + parsed.files.map(file => `<<<FILE:${file.path}>>>\n${file.content}\n<<<END_FILE>>>`).join("\n").slice(0, 30000)
  }
  input.signal?.throwIfAborted()
  const files = best?.files || [], issues = best?.issues || [feedback || "No complete project"]
  const title = best?.title || "Self-Build"
  const run = best?.run
  const passport = buildPassport({ projectId: id, kind: "selfbuild", title,
    sourceHash: sourceHash(files),
    checks: [
      { id: "static", kind: "static", label: "Синтаксис, структура и импорты CLI", required: true, status: best ? issues.length ? "fail" : "pass" : "not_run", command: "analyzeProject + Self-Build contract", details: issues.length ? issues : best?.checks || [] },
      { id: "unit", kind: "unit", label: "Реальный node --test в изолированном исполнителе", required: true, status: run?.status || "not_run", command: run?.command, durationMs: run?.durationMs, details: run?.details || ["Запуск не выполнялся"] },
    ], knownIssues: [...issues, ...(run?.status === "fail" ? run.details : [])],
    blindSpots: ["Ревью безопасности человеком; полнота покрытия и соответствие всем требованиям не доказаны"],
    artifacts: files.slice(0, 20).map(file => ({name:file.path,bytes:Buffer.byteLength(file.content),sha256:createHash("sha256").update(file.content).digest("hex")})),
  })
  const passed = Boolean(best && !issues.length && run?.status !== "fail")
  return { projectId: id, title, description: "Self-Build source and execution receipts", status: passed ? "completed" : "failed",
    ...provenance,
    files: files.map(file => ({ ...file, language: /\.mjs$/.test(file.path) ? "javascript" : "text" })),
    structure: files.map(file=>file.path), plan: best?.plan || [], commands: ["node --test"], passport,
    qa: {passed,checks:best?.checks || [],issues,staticIssues:issues,reviewStatus:"not_run",rounds},
    ...(!passed ? {error:issues.join("; ") || "Node tests failed"} : {}), createdAt:new Date().toISOString() }
}
