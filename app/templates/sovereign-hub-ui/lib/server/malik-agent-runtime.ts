import { randomUUID } from "node:crypto"
import { runMalikCoderOrchestrator } from "@/lib/server/malik-coder-orchestrator"

type AgentMissionKind = "analysis" | "research" | "code" | "website" | "project" | "verification"
type AgentMission = { id: string; kind: AgentMissionKind; title: string; detail: string }
type AgentReport = AgentMission & { ok: boolean; content: string; latencyMs: number }

export type MalikAgentRuntimeResult = {
  runId: string
  subagentCount: number
  reports: AgentReport[]
  augmentedBody: any
}

const CONTRACT_MARKER = "[MALIK_ACTION_OS_EXECUTION_CONTRACT]"
const REPORT_MARKER = "[MALIK_AGENT_RUNTIME_REPORTS]"
const MAX_REPORT_CHARS = 5000

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] || fallback)
  return Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.floor(raw))) : fallback
}

function clean(value: unknown, max = 12000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max)
}

function originalPrompt(body: any) {
  for (const key of ["originalQuestion", "prompt", "message", "question", "input", "text", "content"]) {
    const value = clean(body?.[key], 18000)
    if (value) return value
  }
  return ""
}

function executionContract(body: any) {
  const question = String(body?.question || "")
  const index = question.indexOf(CONTRACT_MARKER)
  return index >= 0 ? question.slice(index, index + 16000) : ""
}

function classifyMission(title: string, detail: string): AgentMissionKind {
  const text = `${title} ${detail}`.toLowerCase()
  if (/(код|typescript|javascript|python|react|next\.?js|api|debug|refactor|code)/iu.test(text)) return "code"
  if (/(сайт|лендинг|интерфейс|website|landing|dashboard|ui)/iu.test(text)) return "website"
  if (/(исслед|факт|источник|поиск|актуальн|research|search|compare)/iu.test(text)) return "research"
  if (/(проект|организ|структур|project|workspace)/iu.test(text)) return "project"
  return "analysis"
}

function isExternalStep(title: string, detail: string) {
  const text = `${title} ${detail}`.toLowerCase()
  return /(такси|заказ|оплат|покуп|отправ|сообщен|публикац|загруз|удал|изображ|фото|видео|booking|purchase|send|publish|upload|delete)/iu.test(text)
}

function parseMissions(contract: string) {
  const missions: AgentMission[] = []
  for (const rawLine of contract.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*\d+\.\s+([^:]{2,160}):\s*(.{2,800})\s*$/u)
    if (!match) continue
    const title = clean(match[1], 160)
    const detail = clean(match[2], 800)
    if (!title || !detail || isExternalStep(title, detail)) continue
    if (/(выдать проверяемый результат|deliver|финальн.*результ)/iu.test(title)) continue
    missions.push({ id: randomUUID(), kind: classifyMission(title, detail), title, detail })
  }
  return missions
}

function fallbackMissions(prompt: string): AgentMission[] {
  const missions: AgentMission[] = [{
    id: randomUUID(),
    kind: "analysis",
    title: "Разобрать цель и критерии готовности",
    detail: "Выделить обязательные требования, ограничения, зависимости и признаки завершённой работы.",
  }]
  if (/(код|api|typescript|javascript|python|react|next\.?js|debug|github|репозитор)/iu.test(prompt)) {
    missions.push({ id: randomUUID(), kind: "code", title: "Проверить техническую реализацию", detail: "Предложить архитектуру, файлы, проверки и риски интеграции." })
  } else if (/(найд|сравн|актуальн|исслед|рынок|цена|research|search|compare|latest)/iu.test(prompt)) {
    missions.push({ id: randomUUID(), kind: "research", title: "Подготовить исследовательский контур", detail: "Определить факты для проверки, приоритетные источники и возможные расхождения." })
  } else {
    missions.push({ id: randomUUID(), kind: "project", title: "Разложить работу на исполнимые части", detail: "Сформировать последовательность артефактов и зависимостей без выдуманных внешних действий." })
  }
  return missions
}

function verifierMission(): AgentMission {
  return { id: randomUUID(), kind: "verification", title: "Независимо проверить итог", detail: "Найти пропуски, противоречия, недоказанные утверждения и критерии, которые финальный ответ обязан закрыть." }
}

function subagentSystem(kind: AgentMissionKind) {
  return [
    "You are a read-only subagent inside Malik Agent Runtime.",
    `Specialization: ${kind}.`,
    "Work independently and return a compact evidence-oriented report for the parent agent.",
    "Do not expose chain-of-thought. Return conclusions, checks, risks, concrete implementation notes, and missing evidence only.",
    "Never claim that you sent, purchased, booked, uploaded, published, deleted, deployed, or changed an external system.",
    "Do not ask the user questions. Make the best bounded assessment from the supplied task.",
    "Do not mention internal routing or hidden runtime details.",
    "Use the user's language where practical.",
  ].join("\n")
}

async function runMission(prompt: string, mission: AgentMission): Promise<AgentReport> {
  const startedAt = Date.now()
  try {
    const result = await runMalikCoderOrchestrator({
      prompt: [`ORIGINAL TASK:\n${prompt}`, "", `YOUR ASSIGNED MISSION:\n${mission.title}`, mission.detail, "", "Return only the report the parent agent needs."].join("\n"),
      systemPrompt: subagentSystem(mission.kind),
      maxTokens: envInt("MALIK_AGENT_SUBAGENT_MAX_TOKENS", 1100, 384, 2400),
      temperature: 0.2,
    })
    return { ...mission, ok: true, content: clean(result.content, MAX_REPORT_CHARS), latencyMs: Date.now() - startedAt }
  } catch (error) {
    return { ...mission, ok: false, content: clean(error instanceof Error ? error.message : error, 700) || "Subagent unavailable", latencyMs: Date.now() - startedAt }
  }
}

function formatReports(runId: string, reports: AgentReport[]) {
  const successful = reports.filter((report) => report.ok && report.content)
  if (!successful.length) return ""
  return [
    REPORT_MARKER,
    `run_id: ${runId}`,
    `successful_subagents: ${successful.length}/${reports.length}`,
    "Independent read-only reports follow. Reconcile conflicts and do not blindly repeat them.",
    ...successful.map((report, index) => ["", `SUBAGENT ${index + 1} · ${report.kind.toUpperCase()} · ${report.title}`, report.content].join("\n")),
    "",
    "PARENT REQUIREMENT: synthesize one complete final result, verify gaps, and preserve confirmation requirements for external actions.",
  ].join("\n").slice(0, 18000)
}

export function isMalikAgentRuntimeRequest(body: any) {
  return Boolean(executionContract(body))
}

export async function prepareMalikAgentRuntime(body: any): Promise<MalikAgentRuntimeResult | null> {
  const contract = executionContract(body)
  if (!contract) return null
  const prompt = clean(body?.originalQuestion || originalPrompt(body), 18000)
  if (!prompt) return null

  const maxSubagents = envInt("MALIK_AGENT_MAX_SUBAGENTS", 3, 2, 4)
  const parsed = parseMissions(contract)
  const candidates = parsed.length ? parsed : fallbackMissions(prompt)
  const selected = candidates.slice(0, Math.max(1, maxSubagents - 1))
  selected.push(verifierMission())

  const reports = await Promise.all(selected.slice(0, maxSubagents).map((mission) => runMission(prompt, mission)))
  const runId = randomUUID()
  const reportContext = formatReports(runId, reports)
  if (!reportContext) return null

  return {
    runId,
    subagentCount: reports.length,
    reports,
    augmentedBody: {
      ...body,
      originalQuestion: `${prompt}\n\n${reportContext}`,
      question: `${String(body?.question || prompt)}\n\n${reportContext}`,
      malikAgentRuntime: { runId, subagentCount: reports.length, successfulSubagents: reports.filter((report) => report.ok).length },
    },
  }
}
