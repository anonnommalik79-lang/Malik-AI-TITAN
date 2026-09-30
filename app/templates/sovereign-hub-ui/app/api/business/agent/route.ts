import {
  AUTONOMOUS_AGENTS,
  STRESS_TEST,
  SUMMARY_STAGE,
  companyAgentPrompt,
  companySummaryPrompt,
  companySummarySystem,
  companySystemPrompt,
  stressTestInput,
  type AgentId,
  type CompanyBrief,
  type PriorStep,
} from "@/lib/business/autonomous"
import { buildBusinessPrompt, getBusinessMode } from "@/lib/business/modes"
import {
  augmentBusinessInput,
  businessOutputQuality,
  businessRetryPrompt,
  ensureAutonomousCompanyState,
} from "@/lib/business/orchestration"
import {
  GeminiEngineError,
  configuredGeminiModels,
  describeTrail,
  geminiKeys,
  geminiLabel,
  runGemini,
  type GeminiEvent,
  type GeminiResult,
} from "@/lib/business/gemini-engine"
import { incrementUsage } from "@/lib/ai/usage"
import { checkPromptLength, checkUsageLimit } from "@/lib/limits/rate-limit"
import { resolveUserTier } from "@/lib/limits/user-plan"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * One Autonomous Company stage, answered by Gemini and streamed.
 *
 * POST { kind: "agent" | "summary" | "stress", agentId?, brief, instruction?,
 *        market?, country?, budget?, requirements?, previous?, model? }
 *
 * Server-sent events:
 *   ready    { stage, label }
 *   model    { model, label }            each time a model starts answering
 *   thought  { text }                    Gemini's thought summaries, live
 *   delta    { text }                    the answer, as it is written
 *   reset    { reason }                  the answer so far is discarded
 *   sources  { items: [{ title, uri }] } Google Search results it used
 *   done     { content, model, label, ms, usage, sources, searched }
 *   error    { code, message, retryAfterMs? }
 *
 * The person's own text (idea, instruction, requirements) is held to the
 * plan's prompt limit, as everywhere else. What earlier agents wrote is not
 * the person's text; it is bounded here instead, so a long company does not
 * hit a limit that exists to stop long pastes.
 */

type Kind = "agent" | "summary" | "stress"

type Body = {
  kind?: Kind
  agentId?: string
  brief?: string
  instruction?: string
  market?: string
  country?: string
  budget?: string
  requirements?: string
  previous?: Array<{ agentId?: string; content?: string }>
  model?: string
  language?: "ru" | "kk" | "en"
}

const clean = (value: unknown, max: number) => String(value || "").replace(/\u0000/g, "").trim().slice(0, max)

const MODEL_ID = /^[a-z0-9][a-z0-9.\-]{2,80}$/

function priorFrom(list: Body["previous"]): PriorStep[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: PriorStep[] = []
  for (const item of list.slice(0, AUTONOMOUS_AGENTS.length)) {
    const agent = AUTONOMOUS_AGENTS.find((candidate) => candidate.id === item?.agentId)
    const content = clean(item?.content, 20_000)
    if (!agent || !content || seen.has(agent.id)) continue
    seen.add(agent.id)
    out.push({ agent, content })
  }
  // Always in pipeline order, whatever order the client sent.
  return out.sort((a, b) => AUTONOMOUS_AGENTS.indexOf(a.agent) - AUTONOMOUS_AGENTS.indexOf(b.agent))
}

function budgetFor(kind: Kind, agentId: AgentId | undefined, owner: boolean) {
  // Thinking tokens are counted inside maxOutputTokens, so the budget is the
  // answer plus the thinking behind it.
  if (kind === "summary") return owner ? 10_000 : 8_000
  if (kind === "stress") return owner ? 12_000 : 9_000
  if (agentId === "analyst" || agentId === "research") return owner ? 16_000 : 12_000
  return owner ? 14_000 : 10_000
}

function ownerMessage(error: GeminiEngineError, keys: string[]) {
  if (error.code === "NO_KEY") {
    return "На Render нет ключа Gemini. Добавь GEMINI_API_KEY (или GOOGLE_AI_POOL_API_KEY) в Environment и перезапусти сервис."
  }
  if (error.code === "KEY_REJECTED") {
    return `${error.message} Проверенные ключи: ${keys.join(", ") || "—"}. Открой aistudio.google.com → API keys и проверь, что ключ активен.`
  }
  if (error.code === "MODEL_MISSING") {
    return `${error.message} Задай список моделей в BUSINESS_GEMINI_MODELS (например, gemini-flash-latest).`
  }
  return error.message
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body
  const kind: Kind = body.kind === "summary" || body.kind === "stress" ? body.kind : "agent"
  const agent = AUTONOMOUS_AGENTS.find((item) => item.id === body.agentId)
  if (kind === "agent" && !agent) {
    return Response.json({ ok: false, code: "UNKNOWN_AGENT", message: "Неизвестный агент." }, { status: 400 })
  }

  const company: CompanyBrief = {
    brief: clean(body.brief, 8_000),
    instruction: clean(body.instruction, 8_000),
    market: clean(body.market, 200),
    country: clean(body.country, 200),
    budget: clean(body.budget, 200),
    requirements: clean(body.requirements, 1_600),
  }
  if (!company.brief) {
    return Response.json({ ok: false, code: "IDEA_REQUIRED", message: "Опиши бизнес, который нужно запустить." }, { status: 400 })
  }

  const entitlement = await resolveRequestEntitlement(request)
  const owner = entitlement.plan === "owner"
  const tier = resolveUserTier(entitlement.userId, entitlement.plan)
  const authored = [company.brief, company.instruction, company.requirements].join("\n")
  const length = checkPromptLength(authored, tier)
  if (!length.ok) {
    return Response.json({
      ok: false,
      code: length.code,
      message: `Описание и инструкция слишком длинные: ${authored.length} из ${length.max} символов на твоём тарифе. Сократи инструкцию.`,
    }, { status: 400 })
  }

  const limit = await checkUsageLimit({ userId: entitlement.userId, plan: entitlement.plan, task: "chat" })
  if (!limit.ok) {
    const resetAt = Date.parse(String(limit.resetAt || ""))
    return Response.json({
      ok: false,
      code: limit.code,
      message: limit.code === "RATE_LIMIT_REACHED"
        ? "Слишком много запросов за минуту. Продолжу, как только лимит обновится."
        : "Дневной лимит запросов исчерпан. Он обновится завтра.",
      ...(limit.code === "RATE_LIMIT_REACHED" && Number.isFinite(resetAt) ? { retryAfterMs: Math.max(1_000, resetAt - Date.now() + 500) } : {}),
    }, { status: 429 })
  }

  const previous = priorFrom(body.previous)
  if ((kind === "summary" || kind === "stress") && !previous.length) {
    return Response.json({ ok: false, code: "NOTHING_TO_READ", message: "Сначала агенты должны что-то сделать." }, { status: 400 })
  }

  const preferred = typeof body.model === "string" && MODEL_ID.test(body.model) && body.model !== "auto" ? body.model : undefined
  const language = body.language === "en" || body.language === "kk" ? body.language : "ru"

  // The request as Gemini will see it.
  let system: string
  let prompt: string
  let modeId: Parameters<typeof businessOutputQuality>[0] | null = null
  if (kind === "agent" && agent) {
    const mode = getBusinessMode(agent.mode)
    modeId = agent.mode
    system = companySystemPrompt(agent, { search: agent.id === "research", language })
    prompt = augmentBusinessInput(agent.mode, companyAgentPrompt(agent, company, previous))
    if (mode) prompt = `Роль: ${mode.expertRole}. Режим: ${mode.titleRu}.\n\n${prompt}`
  } else if (kind === "summary") {
    system = companySummarySystem(language)
    prompt = companySummaryPrompt(company, previous)
  } else {
    const mode = getBusinessMode(STRESS_TEST.mode)
    modeId = STRESS_TEST.mode
    system = [
      "Ты — инвестор, который уже терял деньги на таком же плане. Тебе нужны не обещания, а то, что можно проверить.",
      "Пиши по-русски. Markdown, таблицы. Без вступлений.",
    ].join("\n\n")
    prompt = mode
      ? buildBusinessPrompt(mode, stressTestInput(company.brief, previous, 40_000), { language: "ru", industry: company.market || undefined })
      : stressTestInput(company.brief, previous, 40_000)
  }

  const stageLabel = kind === "agent" && agent ? `${agent.name} · ${agent.role}` : kind === "summary" ? SUMMARY_STAGE.title : STRESS_TEST.title
  const encoder = new TextEncoder()
  const keys = geminiKeys()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { closed = true }
      }
      // Gemini can think for a while before the first word; proxies that see
      // no bytes for a minute close the connection.
      const heartbeat = setInterval(() => {
        if (closed) return
        try { controller.enqueue(encoder.encode(": keep-alive\n\n")) } catch { closed = true }
      }, 15_000)

      const forward = (event: GeminiEvent) => {
        if (event.type === "attempt") send("model", { model: event.model, label: geminiLabel(event.model) })
        else if (event.type === "thought") send("thought", { text: event.text.slice(0, 2_000) })
        else if (event.type === "delta") send("delta", { text: event.text })
        else if (event.type === "reset") send("reset", { reason: event.reason })
        else if (event.type === "sources") send("sources", { items: event.items })
      }

      send("ready", { stage: kind === "agent" ? agent?.id : kind, label: stageLabel, models: configuredGeminiModels().slice(0, 3) })

      const started = Date.now()
      try {
        const budget = budgetFor(kind, agent?.id, owner)
        const ask = (text: string) => runGemini({
          system,
          prompt: text,
          maxOutputTokens: budget,
          search: kind === "agent" && agent?.id === "research",
          preferredModel: preferred,
          signal: request.signal,
          onEvent: forward,
        })

        let result: GeminiResult = await ask(prompt)

        // Cut off by the length limit: ask for the rest, and show it arriving
        // under what is already on screen.
        if (result.finishReason === "MAX_TOKENS") {
          const tail = result.content.slice(-1_500)
          try {
            const rest = await ask([
              prompt,
              "ТВОЙ ОТВЕТ ОБОРВАЛСЯ НА ПОЛУСЛОВЕ. Вот его конец:",
              tail,
              "Продолжи ровно с этого места. Не повторяй уже написанное и не начинай заново.",
            ].join("\n\n"))
            result = { ...rest, content: `${result.content}${rest.content.startsWith("\n") ? "" : "\n"}${rest.content}`, attempts: result.attempts + rest.attempts }
          } catch {
            // The part that exists is still worth keeping.
          }
        }

        let content = modeId ? ensureAutonomousCompanyState(modeId, result.content) : result.content
        let quality = modeId ? businessOutputQuality(modeId, content) : { ok: content.length > 200 }

        if (!quality.ok) {
          send("reset", { reason: "quality" })
          result = await ask(businessRetryPrompt(prompt, "reason" in quality ? quality.reason : undefined))
          content = modeId ? ensureAutonomousCompanyState(modeId, result.content) : result.content
          quality = modeId ? businessOutputQuality(modeId, content) : { ok: content.length > 200 }
          if (!quality.ok) {
            throw new GeminiEngineError("EMPTY", "Gemini ответил слишком коротко даже со второй попытки. Нажми «Продолжить».")
          }
        }

        incrementUsage(entitlement.userId, entitlement.plan, "chat", Number(result.usage?.totalTokens || 0))
        send("done", {
          content,
          model: result.model,
          label: geminiLabel(result.model),
          modelVersion: result.modelVersion,
          ms: Date.now() - started,
          usage: result.usage,
          sources: result.sources,
          searched: result.searched,
          thinkingLevel: result.thinkingLevel || "default",
          ...(owner ? { key: result.keySource, attempts: result.attempts, timing: result.timing } : {}),
        })
      } catch (error) {
        const failure = error instanceof GeminiEngineError
          ? error
          : new GeminiEngineError("UNAVAILABLE", "Gemini сейчас недоступен. Нажми «Продолжить» через минуту.")
        if (failure.code !== "ABORTED") {
          send("error", {
            code: failure.code,
            message: owner ? ownerMessage(failure, keys.map((key) => key.source)) : failure.message,
            retryAfterMs: failure.retryAfterMs,
            ...(owner ? { trail: describeTrail(failure.trail) } : {}),
          })
        }
      } finally {
        clearInterval(heartbeat)
        closed = true
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  })
}
