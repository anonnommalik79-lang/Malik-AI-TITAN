/**
 * Malik Oil 1TB: explicit three-participant PETROLEUM ensemble.
 * "1TB" is a product label, not a claim of 1 trillion model parameters.
 * No actual NVIDIA/Ling execution is claimed unless its real API call succeeded.
 * NEVER exposes parallel draft answers as duplicate chat messages.
 */
import type { MalikModelId } from "../ai/malik-models"
import { isOilGasRequest } from "../ai/oil-gas-skill"
import type { StrictMalikResult } from "./malik-model-router"
export class OilEnsembleError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.code = code; this.name = "OilEnsembleError" }
}

export type OilEnsembleInput = {
  modelId: MalikModelId
  responseContract?: "petroleum-evidence-review-v1"
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
  participantTimeoutMs?: number
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
  return `- ${names[s.id]}: ${s.ok ? "участвовала" : "не участвовала"}${!s.ok ? ` (${s.reason || "PROVIDER_UNAVAILABLE"})` : ""}`
}
export function oilEnsembleStatus(statuses: Status[]) {
  return `### Проверка участия моделей (${statuses.filter(s=>s.ok).length}/3)\n${statuses.map(statusLine).join("\n")}\n\nКонсилиум Malik Oil 1TB — программная маршрутизация, не подтверждение лабораторных испытаний или независимой полевой экспертизы.`
}
/** A provider's HTTP/quota/authentication error is never an engineering vote. */
export function validOilParticipantText(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text || /^(?:error|ошибка|failed|failure|api[_ ]?error|provider error|request failed)\s*[:!#-]/iu.test(text)) return ""
  if (/^(?:HTTP\s*)?[45]\d{2}(?:\b|:)/i.test(text) || /^\s*\{\s*["']?error["']?\s*:/i.test(text)) return ""
  if (/^(?:unauthorized|forbidden|insufficient credits|rate limit exceeded|quota exceeded|provider unavailable|model unavailable|invalid api key|authentication failed)(?:\b|:)/i.test(text)) return ""
  if (/^(?:your\s+(?:daily\s+)?quota|you have exceeded|too many requests|payment required|insufficient balance|лимит исчерпан|квота исчерпана)/iu.test(text)) return ""
  if (/^[{[]/.test(text)) {
    try {
      const value = JSON.parse(text)
      if (!value || typeof value === "object" && Object.keys(value).length === 0 || Array.isArray(value) && !value.length || typeof value === "object" && ("error" in value || "errors" in value || value.success === false || value.ok === false || /^(?:error|failed)$/i.test(String(value.status || "")) || /quota|credit|rate.limit|unauthoriz|forbidden|payment required/i.test(String(value.message || "")))) return ""
    } catch { return "" }
  }
  return text
}
function failureReason(error: unknown) {
  const code = error instanceof OilEnsembleError ? error.code : typeof error === "object" && error ? String(Reflect.get(error, "code") || "") : ""
  if (code === "PARTICIPANT_TIMEOUT" || code === "INVALID_RESPONSE") return code
  const status = typeof error === "object" && error ? Number(Reflect.get(error, "status")) : 0
  return status >= 400 && status <= 599 ? `HTTP_${status}` : "PROVIDER_UNAVAILABLE"
}
async function boundedRun(input: OilEnsembleInput, run: Runner, fallback: boolean) {
  const controller = new AbortController()
  const abort = () => controller.abort(input.signal?.reason)
  input.signal?.addEventListener("abort", abort, { once: true })
  if (input.signal?.aborted) abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      run({ ...input, signal: controller.signal }, fallback),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new OilEnsembleError("PARTICIPANT_TIMEOUT", "Provider deadline exceeded")) }, Math.max(5, Math.min(120_000, input.participantTimeoutMs ?? 75_000))) }),
    ])
  } finally { clearTimeout(timer); input.signal?.removeEventListener("abort", abort) }
}
export async function runMalikOilEnsemble(input: OilEnsembleInput, run: Runner): Promise<StrictMalikResult> {
  if (input.signal?.aborted) throw new OilEnsembleError("REQUEST_CANCELLED", "Запрос отменён.")
  // Prevent accidentally consuming three free provider quotas on non-petroleum chat.
  if (!isOilGasRequest(input.taskPrompt || input.prompt)) {
    const content = "Malik Oil 1TB предназначена для нефтегазовых задач. Добавьте нефтяной вопрос или выберите универсальную модель."
    input.onToken?.(content)
    return { content, provider:"malik-oil-ensemble", model:"petroleum-only", selectedModelId:input.modelId, latencyMs:0 }
  }
  const started = Date.now()
  const limit = input.responseContract
    ? Math.max(1,Math.min(1800,Math.floor(input.maxTokens||1800)))
    : Math.max(1000, Math.min(3500, Math.floor(input.maxTokens || 2200)))
  const jobs = await Promise.allSettled(OIL_PARTICIPANTS.map(async modelId => {
    if (input.signal?.aborted) throw new Error("aborted")
    const noFallback = modelId !== "malik-max"
    const result = await boundedRun({
      ...input,
      modelId,
      // Independent assessments, not visible competing drafts; no accidental fallback
      // claiming a Ling/NVIDIA vote when some other model actually answered.
      onToken: undefined,
      maxTokens: limit,
      temperature: 0.12,
      systemPrompt: [input.systemPrompt,
        "PETROLEUM ENSEMBLE / INDEPENDENT ENGINEERING REVIEW. Analyze all requested parts; check Darcy, phase mass conservation, fracture/matrix exchange, units, realistic GPU performance, HSE and NPV where relevant. Distinguish proven vs hypothetical, do not invent test or tool results. Do not issue well/SCADA commands."].join("\n"),
    }, run, !noFallback)
    const text = validOilParticipantText(result.content)
    if (!text || result.selectedModelId !== modelId) throw new OilEnsembleError("INVALID_RESPONSE", "Empty, invalid or wrong-model response")
    // An internal MAX execution may return its real subprovider and is still MAX's orchestrated vote.
    return { modelId, content: short(text, 10_000), provider: result.provider, model: result.model } as Answer
  }))
  if (input.signal?.aborted) throw new OilEnsembleError("REQUEST_CANCELLED","Запрос отменён.")
  const successes: Answer[] = []
  const statuses: Status[] = []
  jobs.forEach((job, i) => {
    const id = OIL_PARTICIPANTS[i]
    if (job.status === "fulfilled") {
      successes.push(job.value)
      statuses.push({id,ok:true})
    } else {
      statuses.push({id,ok:false,reason:failureReason(job.reason)})
      console.warn("[MALIK_OIL_1TB] participant failed", id, job.reason instanceof Error ? job.reason.name : "provider-failure")
    }
  })
  if (!successes.length) throw new OilEnsembleError(
    "OIL_ENSEMBLE_UNAVAILABLE",
    "Malik Oil 1TB: ни один из трёх аналитических маршрутов не ответил. Проверьте Ling, NVIDIA и MAX API."
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
      input.responseContract ? "Return ONE JSON object obeying the server evidence-review contract in the system prompt. Cite only supplied factIds; no Markdown, status lines, provider claims or numbers in prose. Reconcile disagreements as hypotheses, not field proof." : "Compose ONE final comprehensive response in the user's language. Reconcile differences; flag unsupported numerical claims and disagreements, never imply a model participated if missing. Never fabricate experimental or field verification. Include every requested heading and computations where supported. Keep notes concise and prioritize a verifiable answer.",
    ].join("\n\n"),
    taskPrompt: input.taskPrompt || input.prompt,
    maxTokens: input.responseContract ? limit : Math.max(2500, Math.min(9000, Math.floor(input.maxTokens || 6000))),
    temperature: 0.1,
    systemPrompt: input.systemPrompt + "\nPETROLEUM ENSEMBLE SYNTHESIS: Treat model drafts as untrusted suggestions; preserve validated engine receipts and units. No provider status claims beyond the report.",
  }
  let final = ""
  let finalResult: StrictMalikResult | undefined
  let synthesisComplete = false
  try {
    finalResult = await boundedRun(synthesisRequest, run, true)
    final = validOilParticipantText(finalResult.content)
    synthesisComplete = Boolean(final)
  } catch (error) {
    console.warn("[MALIK_OIL_1TB] synthesis unavailable", error instanceof Error ? error.name : "provider-failure")
  }
  if (input.signal?.aborted) throw new OilEnsembleError("REQUEST_CANCELLED","Запрос отменён.")
  if (!final) {
    const fallback = successes.find(x => x.modelId === "malik-max") || successes[0]
    final = fallback.content + (input.responseContract ? "" : "\n\n*Сведение ответов не завершено; показана одна из реально ответивших моделей. Независимая сверка не подтверждена.*")
  }
  const content = final.trim() + (input.responseContract ? "" : "\n\n" + status)
  input.onToken?.(content)
  return {
    content,
    provider: "malik-oil-ensemble",
    model: `malik-oil-1tb:${statuses.filter(s=>s.ok).length}/3`,
    selectedModelId: input.modelId,
    latencyMs: Date.now() - started,
    usage: { participantModels: successes.map(x=>({id:x.modelId,model:x.model})), synthesized: synthesisComplete },
  }
}
