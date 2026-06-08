import { generateProjectWithBrain } from "@/lib/ai/project-builder"
import { validatePrompt } from "@/lib/ai/safety"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const promptCheck = validatePrompt(body?.prompt || body?.message || "")
  if (!promptCheck.ok) {
    return Response.json({ ok: false, error: promptCheck.error }, { status: 400 })
  }

  const project = await generateProjectWithBrain({
    prompt: promptCheck.value,
    userId: typeof body?.userId === "string" ? body.userId : undefined,
    userEmail: typeof body?.userEmail === "string" ? body.userEmail : undefined,
    framework: body?.framework,
    language: body?.language,
    style: body?.style,
  })

  return Response.json({
    ok: project.status !== "failed",
    project,
    provider: project.provider,
    model: project.model,
    error: project.error,
  })
}
