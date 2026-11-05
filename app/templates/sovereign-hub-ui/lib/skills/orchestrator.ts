import "server-only"
import { randomUUID } from "node:crypto"
import type { MalikModelId } from "@/lib/ai/malik-models"
import type { ExecutionReporter } from "@/lib/ai/chat-execution"
import { skillDefinition } from "./registry"
import { checkSkillRecord, skillHash, skillOwnerKey, validSkillRunId } from "./store"
import { SKILL_TOOLS } from "./tools"
import { SkillError, type SkillRun, type SkillRuntime, type SkillStore, type SkillVerification } from "./types"

const LEASE_MS = 120_000, WALL_MS = 240_000
type Input = { ownerId: string; skill?: string; prompt?: string; target?: string; modelId: MalikModelId; requestId?: string; resumeId?: string; maxTokens?: number; signal?: AbortSignal; activity?: ExecutionReporter }
type Active = { fingerprint: string; promise: Promise<SkillRun>; owner: string }
const scope = globalThis as typeof globalThis & { __malikActiveSkills?: Map<string, Active> }
const active = () => scope.__malikActiveSkills ||= new Map()
const toolKind = (tool: string) => tool === "search" ? "search" as const : tool === "read" ? "read" as const : ["build", "inspect", "test", "implementer", "verify"].includes(tool) ? "code" as const : tool === "publish" ? "file" as const : "model" as const
const classify = (error: unknown) => error instanceof SkillError ? error : new SkillError("TOOL_UNAVAILABLE", 503, true)

export async function getSkillRun(store: SkillStore, ownerId: string, id: string) {
  if (!validSkillRunId(id)) throw new SkillError("INVALID_RUN_ID", 400)
  const { value } = await store.read(skillOwnerKey(ownerId), id)
  if (!value) throw new SkillError("SKILL_RUN_NOT_FOUND", 404)
  if (value.expiresAt <= Date.now()) throw new SkillError("SKILL_RUN_EXPIRED", 410)
  return value
}
/** The graph, permissions and dependencies are server-defined. Models supply
 * deliverables only. CAS leases prevent a duplicate request/worker replay. */
export async function runSkill(input: Input, deps: { store: SkillStore; runtime: SkillRuntime }): Promise<SkillRun> {
  if (!input.ownerId) throw new SkillError("SIGN_IN_REQUIRED", 401)
  const owner = skillOwnerKey(input.ownerId)
  if (input.resumeId && !validSkillRunId(input.resumeId)) throw new SkillError("INVALID_RUN_ID", 400)
  if (!input.resumeId && (!skillDefinition(input.skill) || !input.prompt?.trim() || input.prompt.length > 24_000 || (input.target?.length || 0) > 40_000)) throw new SkillError("INVALID_SKILL_REQUEST", 400)
  if (input.requestId && !/^[a-zA-Z0-9_-]{8,100}$/u.test(input.requestId)) throw new SkillError("INVALID_REQUEST_ID", 400)
  const fingerprint = skillHash([input.skill, input.prompt?.trim(), input.target, input.modelId])
  const id = input.resumeId || `skill_${skillHash([owner, input.requestId || randomUUID()]).slice(0, 32)}`
  const localKey = `${owner}:${id}`, pending = active().get(localKey)
  if (pending) {
    if (!input.resumeId && pending.fingerprint !== fingerprint) throw new SkillError("REQUEST_ID_REUSED", 409)
    return pending.promise
  }
  if ([...active().values()].filter(a => a.owner === owner).length >= 2) throw new SkillError("SKILL_CAPACITY", 429, true)
  const promise = execute().finally(() => active().delete(localKey))
  active().set(localKey, { fingerprint, promise, owner })
  return promise

  async function execute(): Promise<SkillRun> {
    let { value: run, revision } = await deps.store.read(owner, id)
    if (run) {
      checkSkillRecord(run, owner, id)
      if (!input.resumeId && run.fingerprint !== fingerprint) throw new SkillError("REQUEST_ID_REUSED", 409)
      if (run.expiresAt <= Date.now()) throw new SkillError("SKILL_RUN_EXPIRED", 410)
      if (run.status === "completed" || run.status === "partial" && run.result) return run
      if (!input.resumeId && run.status !== "running") return run
      if (run.lease && run.lease.until > Date.now()) throw new SkillError("SKILL_RUN_BUSY", 409, true)
      if (run.modelId !== input.modelId) throw new SkillError("RESUME_MODEL_MISMATCH", 409)
    } else {
      if (input.resumeId) throw new SkillError("SKILL_RUN_NOT_FOUND", 404)
      const definition = skillDefinition(input.skill)!
      const now = Date.now()
      run = { version: "malik-skills/1", id, owner, skill: definition.id, fingerprint, prompt: input.prompt!.trim(), target: input.target,
        modelId: input.modelId, status: "running", steps: definition.steps.map(s => ({ ...s, dependencies: [...s.dependencies], status: "pending", attempts: 0 })), createdAt: now, updatedAt: now, expiresAt: now + 7 * 86400_000,
        durable: deps.store.durable, budget: { calls: 0, tokens: 0, limit: Math.max(1, Math.min(24_000, Math.floor(input.maxTokens || 16_000))) } }
    }
    const current = run
    const definition = skillDefinition(current.skill)
    if (!definition || current.steps.length !== definition.steps.length || current.steps.some((s, i) => {
      const spec = definition.steps[i]
      return s.id !== spec.id || s.tool !== spec.tool || s.timeoutMs !== spec.timeoutMs || JSON.stringify(s.dependencies) !== JSON.stringify(spec.dependencies)
    })) throw new SkillError("SKILL_VERSION_MISMATCH", 409)
    if (input.maxTokens !== undefined) current.budget.limit = Math.min(current.budget.limit, current.budget.tokens + Math.max(0, input.maxTokens))
    current.status = "running"; current.error = undefined; current.result = undefined
    current.lease = { token: randomUUID(), until: Date.now() + LEASE_MS }
    const lease = current.lease.token
    async function persist() {
      current.updatedAt = Date.now()
      if (current.lease) current.lease.until = current.updatedAt + LEASE_MS
      if (!await deps.store.write(owner, id, current, revision)) throw new SkillError("SKILL_RUN_BUSY", 409, true)
      const loaded = await deps.store.read(owner, id)
      if (!loaded.value || current.lease && loaded.value.lease?.token !== lease) throw new SkillError("SKILL_RUN_BUSY", 409, true)
      revision = loaded.revision
    }
    // Acquire the lease atomically before any billable or external operation.
    await persist()
    const wall = AbortSignal.timeout(WALL_MS)
    const signal = input.signal ? AbortSignal.any([input.signal, wall]) : wall
    try {
      for (const step of current.steps) {
        if (step.status === "completed") continue
        signal.throwIfAborted()
        if (!definition.tools.includes(step.tool) || !Object.hasOwn(SKILL_TOOLS, step.tool) || step.dependencies.some(id => current.steps.find(s => s.id === id)?.status !== "completed")) throw new SkillError("INVALID_TOOL_DEPENDENCY")
        let passed = false
        const remainingAttempts = Math.min(2, 3 - step.attempts)
        for (let n = 0; n < remainingAttempts; n++) {
          signal.throwIfAborted()
          step.status = "running"; step.attempts++; step.startedAt = Date.now(); step.error = undefined
          await persist()
          const operation = new AbortController(), stepSignal = AbortSignal.any([signal, operation.signal])
          const receipt = input.activity?.start(step.label, toolKind(step.tool), `skills.${current.skill}.${step.tool}`, { runId: id, attempt: step.attempts })
          let timer: ReturnType<typeof setTimeout> | undefined
          let abort: () => void = () => {}
          const stopped = new Promise<never>((_, reject) => {
            abort = () => reject(new SkillError(input.signal?.aborted ? "SKILL_CANCELLED" : "TOOL_TIMEOUT", 503, !input.signal?.aborted))
            stepSignal.addEventListener("abort", abort, { once: true })
            timer = setTimeout(() => operation.abort(), step.timeoutMs)
            if (stepSignal.aborted) abort()
          })
          try {
            const result = await Promise.race([SKILL_TOOLS[step.tool]({ run: current, step, signal: stepSignal, runtime: deps.runtime,
              async model(request) {
                stepSignal.throwIfAborted()
                const tokens = Math.min(request.maxTokens, current.budget.limit - current.budget.tokens)
                if (tokens < 128 || current.budget.calls >= 12) throw new SkillError("SKILL_BUDGET_EXHAUSTED", 429)
                current.budget.calls++; current.budget.tokens += tokens
                await persist()
                const result = await deps.runtime.model({ ...request, maxTokens: tokens, signal: stepSignal })
                stepSignal.throwIfAborted()
                if (typeof result !== "string" || !result.trim() || result.length > 160_000) throw new SkillError("INVALID_MODEL_RESULT", 502, true)
                return result
              },
            }), stopped])
            stepSignal.throwIfAborted()
            step.output = result; step.outputHash = skillHash(result); step.status = "completed"; step.finishedAt = Date.now()
            await persist()
            input.activity?.finish(receipt, { runId: id, outputHash: step.outputHash, sources: result.sources?.length, files: result.project?.files.length, runtime: result.execution?.status, verification: result.verification?.status })
            passed = true; break
          } catch (error) {
            // Storage failure is not a tool failure to retry: its commit may
            // have succeeded. A later read/CAS resolves it without blind replay.
            if (error instanceof SkillError && ["SKILL_STORAGE_UNAVAILABLE", "SKILL_RUN_BUSY", "CHECKPOINT_TOO_LARGE"].includes(error.code)) throw error
            const failure = classify(error)
            step.status = "failed"; step.error = failure.code; step.finishedAt = Date.now()
            await persist()
            input.activity?.finish(receipt, undefined, input.signal?.aborted ? "cancelled" : "failed", failure.code)
            if (!failure.retryable || signal.aborted || n + 1 >= remainingAttempts) throw failure
          } finally { clearTimeout(timer); stepSignal.removeEventListener("abort", abort); operation.abort() }
        }
        if (!passed) throw new SkillError(step.error || "SKILL_ATTEMPTS_EXHAUSTED")
      }
      const checked = current.steps.find(s => s.tool === "verify")?.output
      if (!checked?.verification || !checked.content) throw new SkillError("VERIFICATION_MISSING")
      current.status = checked.verification.status === "fail" ? "failed" : checked.verification.status === "partial" ? "partial" : "completed"
      current.result = { content: checked.verification.status === "fail" ? "Результат не прошёл проверку и не выдаётся как подтверждённый ответ." : checked.content, sources: checked.sources || [], verification: checked.verification, artifact: checked.artifact }
      if (current.status === "failed") current.error = "RESULT_VERIFICATION_FAILED"
    } catch (error) {
      if (error instanceof SkillError && ["SKILL_STORAGE_UNAVAILABLE", "SKILL_RUN_BUSY", "CHECKPOINT_TOO_LARGE"].includes(error.code)) throw error
      current.status = input.signal?.aborted ? "cancelled" : "failed"
      current.error = input.signal?.aborted ? "SKILL_CANCELLED" : classify(error).code
    }
    current.lease = undefined
    await persist()
    return JSON.parse(JSON.stringify(current)) as SkillRun
  }
}

/** Safe owner-scoped API view. No prompts, private role drafts, files, leases
 * or raw provider errors are included in polling responses. */
export function skillRunView(run: SkillRun) {
  return { id: run.id, skill: run.skill, status: run.status, modelId: run.modelId, durable: run.durable, createdAt: run.createdAt, updatedAt: run.updatedAt, error: run.error,
    steps: run.steps.map(s => ({ id: s.id, tool: s.tool, label: s.label, status: s.status, attempts: s.attempts, outputHash: s.outputHash, error: s.error })),
    budget: run.budget, result: run.result }
}
export function skillResultMarkdown(run: SkillRun) {
  const russian = /[а-яё]/iu.test(run.prompt), kazakh = /[әіңғүұқөһ]/iu.test(run.prompt)
  const text = (ru: string, en: string, kk: string) => kazakh ? kk : russian ? ru : en
  const sources = run.result?.sources || []
  const verification: SkillVerification | undefined = run.result?.verification
  const lines = [run.result?.content || text(`Задача не завершена: ${run.error || run.status}. Подтверждённые шаги сохранены.`, `Task did not complete: ${run.error || run.status}. Confirmed steps were checkpointed.`, `Тапсырма аяқталмады: ${run.error || run.status}. Расталған қадамдар сақталды.`)]
  if (run.result?.artifact) lines.push(`[${text("Скачать исходники", "Download source", "Бастапқы кодты жүктеу")}](${run.result.artifact.downloadUrl})`)
  if (sources.length) lines.push(text("Источники:", "Sources:", "Дереккөздер:"), ...sources.map((s, i) => `${i + 1}. [${s.title.replaceAll("[", "").replaceAll("]", "").replace(/[<>]/gu, "")}](${s.url})${s.publishedAt ? ` · ${s.publishedAt.slice(0, 10)}` : ""}`))
  if (verification) lines.push(`${text("Проверка", "Verification", "Тексеру")}: **${verification.status.toUpperCase()}**`, ...verification.checks.filter(c => c.status !== "pass").map(c => `- ${c.scope}: ${c.status}${c.details.length ? ` — ${c.details.slice(0, 2).join("; ")}` : ""}`))
  lines.push(`${text("Задача", "Task", "Тапсырма")}: \`${run.id}\``)
  if (run.status === "failed" || run.status === "cancelled") lines.push(text(`Продолжить: «Продолжи задачу ${run.id}».`, `Resume: “Resume task ${run.id}”.`, `Жалғастыру: «Тапсырманы жалғастыр ${run.id}».`))
  if (!run.durable) lines.push(text("Временное хранение: после перезапуска сервера восстановление недоступно.", "Temporary storage: recovery is unavailable after a server restart.", "Уақытша сақтау: сервер қайта іске қосылғаннан кейін қалпына келтіру мүмкін емес."))
  return lines.join("\n\n")
}
