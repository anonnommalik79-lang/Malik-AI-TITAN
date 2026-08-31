import { buildMalikActionPlan } from "@/lib/ai/action-os"
import { isFeatureDisabled, readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_ACTION_BODY_BYTES = 512 * 1024

function extractPrompt(body: any) {
  for (const key of ["prompt", "originalQuestion", "question", "message", "input", "text", "content"]) {
    const value = typeof body?.[key] === "string" ? body[key].trim() : ""
    if (value) return value
  }
  return ""
}

export async function POST(request: Request) {
  if (isFeatureDisabled("chat")) {
    return Response.json({ ok: false, error: "ACTION_OS_TEMPORARILY_DISABLED" }, {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "60" },
    })
  }

  let body: any
  try {
    body = await readJsonBodyLimited<any>(request, MAX_ACTION_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestSafetyError) {
      return Response.json({ ok: false, error: error.code, message: error.message }, {
        status: error.status,
        headers: { "cache-control": "no-store" },
      })
    }
    return Response.json({ ok: false, error: "INVALID_REQUEST", message: "Invalid request body." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    })
  }

  const prompt = extractPrompt(body)
  if (!prompt) {
    return Response.json({ ok: false, error: "PROMPT_REQUIRED", message: "Prompt is required." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    })
  }

  const plan = buildMalikActionPlan(prompt, body)
  return Response.json({
    ok: true,
    planner: "malik-action-os-v1",
    plan,
  }, {
    headers: {
      "cache-control": "no-store",
      "x-malik-action-os": plan.shouldRender ? "active" : "passive",
    },
  })
}

export async function GET() {
  return Response.json({
    ok: true,
    planner: "malik-action-os-v1",
    contract: ["plan", "execute", "verify", "receipt", "remember", "resume"],
    confirmationPolicy: "external-or-irreversible-actions-require-confirmation",
    intents: ["research", "code", "build", "media", "travel", "taxi", "business", "workflow", "document"],
  }, {
    headers: { "cache-control": "no-store" },
  })
}
