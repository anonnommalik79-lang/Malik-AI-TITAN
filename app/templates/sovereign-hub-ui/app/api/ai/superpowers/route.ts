import {
  detectMalikSuperpowers,
  getPublicMalikSuperpowers,
  superpowerOutputBudget,
} from "@/lib/ai/superpowers"
import type { AIFileAttachment } from "@/lib/ai/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SuperpowerRequest = {
  prompt?: string
  message?: string
  input?: string
  attachments?: AIFileAttachment[]
  superpowerId?: string
}

function promptOf(body: SuperpowerRequest) {
  return String(body.prompt || body.message || body.input || "").trim()
}

export async function GET() {
  const powers = getPublicMalikSuperpowers()
  return Response.json({
    ok: true,
    version: "superpower-os-v1",
    count: powers.length,
    excluded: ["coding-agent"],
    powers,
  }, {
    headers: { "cache-control": "no-store" },
  })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SuperpowerRequest
  const prompt = promptOf(body)
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 12) : []
  const metadata = body.superpowerId ? { superpowerId: body.superpowerId } : undefined
  const active = detectMalikSuperpowers(prompt, attachments, metadata)

  return Response.json({
    ok: true,
    version: "superpower-os-v1",
    prompt,
    active: active.map((power) => ({
      id: power.id,
      title: power.title,
      category: power.category,
      summary: power.summary,
      abilities: power.abilities,
      execution: power.execution,
      taskHint: power.taskHint,
      requires: power.requires || [],
    })),
    primary: active[0]?.id || "chat-core",
    outputBudget: superpowerOutputBudget(active),
    note: "The main Malik chat router activates these contracts automatically. External actions still require their real studio, connector, browser or scheduler runtime.",
  }, {
    headers: { "cache-control": "no-store" },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
