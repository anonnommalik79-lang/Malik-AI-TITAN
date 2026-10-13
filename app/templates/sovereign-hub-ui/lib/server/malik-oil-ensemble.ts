/**
 * Malik Oil 1TB: explicit three-participant PETROLEUM ensemble.
 * "1TB" is a product label, not a claim of 1 trillion model parameters.
 * No actual NVIDIA/Ling execution is claimed unless its real API call succeeded.
 * NEVER exposes parallel draft answers as duplicate chat messages.
 */
import type { MalikModelId } from "../ai/malik-models"
import { isOilGasRequest } from "../ai/oil-gas-skill"
import { MalikModelRouteError, type StrictMalikResult } from "./malik-model-router"

export type OilEnsembleInput = {
  modelId: MalikModelId
  prompt: string
  taskPrompt?: string
  systemPrompt: string
  history?: Array<{role:"user"|"assistant"; content:string}>
  attachments?: Array<any>
  maxTokens?: number
  temperature?: number
  reasoningEffort?: "low" | "medium" | "high"
  allowCatalog?: boolean
  onToken?: (chunk: string) => void
  signal?: AbortSignal
}
export type OilParticipantId = "ling-3.1-flash" | "nvidia-nemotron-ultra-550b" | "malik-max"
export const OIL_PARTICIPANTS: readonly OilParticipantId[] = ["ling-3.1-flash", "nvidia-nemotron-ultra-550b", "malik-max"] as const
type Runner = (request: OilEnsembleInput, allowFallback: boolean) => Promise<StrictMalikResult>
type Answer = { modelId: OilParticipantId; content: string; provider: string; model: string }
type Status = { id: OilParticipantId; ok: boolean; reason?: string }
const short = (value: string, n: number) => value.length > n ? value.slice(0,n)+"\n[TRUNCATED]" : value
function statusLine(s: Status) {
  const names: Record<OilParticipantId,string> = {
    "ling-3.1-flash": "Ling 3.1 Flash 560B",
    "nvidia-nemotron-ultra-550b": "NVIDIA Nemotron 3 Ultra 550B",
    "malik-max": "MalikLLM MAX",
  }
  return `- ${names[s.id]}: ${s.ok ? "участвовала" : "не участвовала"}${!s.ok ? " (API недоступен или ответ не получен)" : ""}`
}
export function oilEnsembleStatus(statuses: Status[]) {
  return `### Проверка участия моделей (${statuses.filter(s=>s.ok).length}/3)\n${statuses.map(statusLine).join("\n")}\n\nКонсилиум Malik Oil 1TB — программная маршрутизация, не подтверждение лабораторных испытаний или независимой полевой экспертизы.`
}
function validText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  return text && !/^\s*(?:error|ошибка|failed|undefined)\s*[:!]$/i.test(text) ? text : ""
}
export async function runMalikOilEnsemble(input: OilEnsembleInput, run: Runner): Promise<StrictMalikResult> {
  if (input.signal?.aborted) throw new MalikModelRouteError("REQUEST_CANCELLED", "Запрос отменён.", 499, input.modelId)
  // Prevent accidentally consuming three free provider quotas on non-petroleum chat.
  if (!isOilGasRequest(input.taskPrompt || input.prompt)) {
    const content = "Malik Oil 1TB предназначена для нефтегазовых задач. Добавьте нефтяной вопрос или выберите универсальную модель."
    input.onToken?.(content)
    return { content, provider:"malik-oil-ensemble", model:"petroleum-only", selectedModelId:input.modelId, latencyMs:0 }
  }
  const started = Date.now()
  const limit = Math.max(1000, Math.min(3500, Math.floor(input.maxTokens || 2200)))
  const jobs = await Promise.allSettled(OIL_PARTICIPANTS.map(async modelId => {
    if (input.signal?.aborted) throw new Error("aborted")
    const noFallback = modelId !== "malik-max"
    const result = await run({
      ...input,
      modelId,
      // Independent assessments, not visible competing drafts; no accidental fallback
      // claiming a Ling/NVIDIA vote when some other model actually answered.
      onToken: undefined,
      maxTokens: limit,
      temperature: 0.12,
      systemPrompt: [input.systemPrompt,
        "PETROLEUM ENSEMBLE / INDEPENDENT ENGINEERING REVIEW. Analyze all requested parts; check Darcy, phase mass conservation, fracture/matrix exchange, units, realistic GPU performance, HSE and NPV where relevant. Distinguish proven vs hypothetical, do not invent test or tool results. Do not issue well/SCADA commands."].join("\n"),
    }, !noFallback)
    const text = validText(result.content)
    if (!text) throw new Error("empty result")
    // An internal MAX execution may return its real subprovider and is still MAX's orchestrated vote.
    return { modelId, content: short(text, 10_000), provider: result.provider, model: result.model } as Answer
  }))
  if (input.signal?.aborted) throw new MalikModelRouteError("REQUEST_CANCELLED","Запрос отменён.",499,input.modelId)
  const successes: Answer[] = []
  const statuses: Status[] = []
  jobs.forEach((job, i) => {
    const id = OIL_PARTICIPANTS[i]
    if (job.status === "fulfilled") {
      successes.push(job.value)
      statuses.push({id,ok:true})
    } else {
      statuses.push({id,ok:false})
      console.warn("[MALIK_OIL_1TB] participant failed", id, job.reason instanceof Error ? job.reason.name : "provider-failure")
    }
  })
  if (!successes.length) throw new MalikModelRouteError(
    "OIL_ENSEMBLE_UNAVAILABLE",
    "Malik Oil 1TB: ни один из трёх аналитических маршрутов не ответил. Проверьте Ling, NVIDIA и MAX API.",
    503, input.modelId
  )
  const reviewText = successes.map(a => `[ACTUAL RESPONSE — ${a.modelId}]\n${a.content}`).join("\n\n----\n\n")
  const status = oilEnsembleStatus(statuses)
  const synthesisRequest = {
    ...input, modelId: "malik-max", onToken: undefined,
    prompt: [
      "ORIGINAL PETROLEUM TASK (this is the source of requirements):",
      short(input.prompt, 40_000),
      "INDEPENDENT PARTICIPANT RESPONSES (unverified proposals, NOT physical proof):",
      short(reviewText, 27_000),
      "Compose ONE final comprehensive response in the user's language. Reconcile differences; flag unsupported numerical claims and disagreements, never imply a model participated if missing. Never fabricate experimental or field verification. Include every requested heading and computations where supported. Keep notes concise and prioritize a verifiable answer.",
    ].join("\n\n"),
    taskPrompt: input.taskPrompt || input.prompt,
    maxTokens: Math.max(2500, Math.min(9000, Math.floor(input.maxTokens || 6000))),
    temperature: 0.1,
    systemPrompt: input.systemPrompt + "\nPETROLEUM ENSEMBLE SYNTHESIS: Treat model drafts as untrusted suggestions; preserve validated engine receipts and units. No provider status claims beyond the report.",
  }
  let final = ""
  let finalResult: StrictMalikResult | undefined
  try {
    finalResult = await run(synthesisRequest, true)
    final = validText(finalResult.content)
  } catch (error) {
    console.warn("[MALIK_OIL_1TB] synthesis unavailable", error instanceof Error ? error.name : "provider-failure")
  }
  if (input.signal?.aborted) throw new MalikModelRouteError("REQUEST_CANCELLED","Запрос отменён.",499,input.modelId)
  if (!final) {
    const fallback = successes.find(x => x.modelId === "malik-max") || successes[0]
    final = fallback.content + "\n\n*Сведение ответов не завершено; показана одна из реально ответивших моделей. Независимая сверка не подтверждена.*"
  }
  const content = final.trim() + "\n\n" + status
  input.onToken?.(content)
  return {
    content,
    provider: "malik-oil-ensemble",
    model: `malik-oil-1tb:${statuses.filter(s=>s.ok).length}/3`,
    selectedModelId: input.modelId,
    latencyMs: Date.now() - started,
    usage: { participantModels: successes.map(x=>({id:x.modelId,model:x.model})), synthesized: Boolean(finalResult) },
  }
}
