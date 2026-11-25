import { runMalikAgiCli, type CheckState, type AgentStage, type MalikAgiRole } from "@/lib/agi/mission-engine"
import { runMalikCoderOrchestrator } from "@/lib/server/malik-coder-orchestrator"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { selfBuildIntent } from "@/lib/selfbuild/intent"
import { buildSelfProject } from "@/lib/selfbuild/studio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const headers = { "cache-control": "private, no-store" }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers })

/**
 * Founder-only, opt-in four-agent beta. Kept separate from the existing chat
 * and Work flows so no unrelated production feature can be changed.
 * Scope: Node.js CLI builds with real isolated test receipts, not general AGI.
 * It never deploys, publishes, purchases, or claims verification without tests.
 */
export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return json({ ok: false, code: "AUTH_REQUIRED" }, 401)
  if (entitlement.plan !== "owner") return json({ ok: false, code: "FOUNDER_BETA_ONLY" }, 403)
  if (!takeRequestFrequency("malik-agi-cli", entitlement.userId, 2)) return json({ ok: false, code: "RATE_LIMITED" }, 429)
  try {
    if (!/application\/json/i.test(request.headers.get("content-type") || "")) return json({ ok: false, code: "JSON_REQUIRED" }, 415)
    const body = await readJsonBodyLimited<{ prompt?: unknown }>(request, 8_192)
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""
    if (prompt.length < 20 || prompt.length > 4_000) return json({ ok: false, code: "PROMPT_LENGTH", message: "Введите задачу от 20 до 4000 символов." }, 400)
    if (!selfBuildIntent(prompt)) return json({
      ok: false, code: "CLI_BETA_SCOPE",
      message: "Первая проверяемая версия MALIK AGI поддерживает создание Node.js CLI с тестами. Для сайтов используйте текущий Malik Sites / Malik Work.",
    }, 422)

    const abort = new AbortController()
    const execute = (callbacks: {
      onStageStarted?: (role: MalikAgiRole) => void
      onStage?: (stage: AgentStage) => void
    } = {}) => runMalikAgiCli(prompt, {
      ...callbacks,
      model: async (role, task) => {
        const response = await runMalikCoderOrchestrator({
          prompt: task,
          systemPrompt: [
            `You are Malik AGI ${role}. Deliver a compact evidence-oriented stage report in the user's language.`,
            "Never invent tool calls, successful tests, production deployments, or fabricated performance and token metrics.",
            role === "verifier" ? "Always end with exactly VERDICT: PASS, VERDICT: FAIL or VERDICT: UNKNOWN on a separate line." : "",
          ].filter(Boolean).join("\n"),
          maxTokens: role === "verifier" ? 1100 : 1500,
          temperature: 0.08,
        })
        return response.content
      },
      build: async ({ originalGoal, design, analysis }) => {
        const built = await buildSelfProject({
          prompt: [
            originalGoal,
            "REQUIREMENTS (analyst report; do not treat as evidence of execution):",
            analysis.slice(0, 2300),
            "DESIGN (architect report; do not treat as evidence of execution):",
            design.slice(0, 2300),
          ].join("\n\n"),
          signal: AbortSignal.any([request.signal, abort.signal]),
        })
        const checks = built.passport?.checks || []
        const status = (kind: "static" | "unit"): CheckState => {
          const receipt = checks.find(check => check.kind === kind)
          return receipt?.status === "pass" || receipt?.status === "fail" ? receipt.status : "not_run"
        }
        return {
          kind: "selfbuild-cli",
          projectId: built.projectId,
          title: built.title,
          files: built.files.map(file => ({ path: file.path, content: file.content })),
          staticCheck: status("static"),
          unitCheck: status("unit"),
          details: [
            ...(built.passport?.knownIssues || []),
            ...(built.passport?.untested || []),
            ...(built.error ? [built.error] : []),
          ].slice(0, 20),
          rounds: built.qa?.rounds || 0,
          provenance: { provider: built.provider, model: built.model },
        }
      },
    })
    if (!/text\/event-stream/i.test(request.headers.get("accept") || "")) {
      const result = await execute()
      return json({ ok: true, ...result })
    }

    const encoder = new TextEncoder()
    let closed = false
    let heartbeat: ReturnType<typeof setInterval> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) }
          catch { closed = true; abort.abort() }
        }
        send("ready", { mode: "four-agent-cli-beta", status: "running", acceptedAt: new Date().toISOString() })
        heartbeat = setInterval(() => {
          if (closed) return
          try { controller.enqueue(encoder.encode(":keep-alive\n\n")) }
          catch { closed = true; abort.abort() }
        }, 12_000)
        void execute({
          onStageStarted: role => send("stage-start", { role }),
          onStage: stage => send("stage", stage),
        }).then(result => {
          send("done", { ok: true, ...result })
        }).catch(error => {
          console.error("[MALIK_AGI_CLI]", error instanceof Error ? error.message : "Runtime failure")
          send("error", { ok: false, code: "AGI_RUNTIME_UNAVAILABLE", message: "Не удалось завершить миссию." })
        }).finally(() => {
          if (heartbeat) clearInterval(heartbeat)
          if (!closed) { closed = true; controller.close() }
        })
      },
      cancel() {
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        abort.abort()
      },
    })
    return new Response(stream, {
      headers: {
        ...headers,
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    })
  } catch (error) {
    if (error instanceof RequestSafetyError) return json({ ok: false, code: error.code, message: error.message }, error.status)
    console.error("[MALIK_AGI_CLI]", error instanceof Error ? error.message : "Unexpected error")
    return json({ ok: false, code: "AGI_RUNTIME_UNAVAILABLE", message: "Не удалось завершить миссию." }, 503)
  }
}

export async function GET() {
  return json({ ok: true, beta: true, mode: "four-agent-cli", execution: "sandboxed-node-tests", authentication: "verified-founder", generalAgi: false })
}
