import { generateProjectWithBrain } from "@/lib/ai/project-builder"
import { validatePrompt } from "@/lib/ai/safety"
import {
  MalikModelRouteError,
  malikModelErrorPayload,
  resolveStrictMalikSelection,
} from "@/lib/server/malik-model-router"
import { putProjectArtifact } from "@/lib/server/project-artifact-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const promptCheck = validatePrompt(body?.prompt || body?.message || "")
  if (!promptCheck.ok) {
    return Response.json({ ok: false, error: promptCheck.error }, { status: 400 })
  }

  try {
    const selection = await resolveStrictMalikSelection(request, body)
    const project = await generateProjectWithBrain({
      prompt: promptCheck.value,
      userId: typeof body?.userId === "string" ? body.userId : undefined,
      userEmail: typeof body?.userEmail === "string" ? body.userEmail : undefined,
      framework: body?.framework,
      language: body?.language,
      style: body?.style,
      modelId: selection?.modelId,
    })

    if (project.status !== "completed" || !project.qa?.passed) {
      return Response.json({
        ok: false,
        code: "PROJECT_QA_FAILED",
        project,
        qa: project.qa,
        error: project.error || "Project did not pass final QA.",
      }, { status: 502, headers: { "cache-control": "no-store" } })
    }

    const artifact = putProjectArtifact(project)
    return Response.json({
      ok: true,
      project,
      qa: project.qa,
      provider: project.provider,
      model: project.model,
      artifact: {
        id: artifact.id,
        filename: artifact.filename,
        downloadUrl: `/api/ai/project/artifacts/${artifact.id}/download`,
        expiresAt: new Date(artifact.expiresAt).toISOString(),
        fileCount: project.files.length,
      },
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const payload = malikModelErrorPayload(error)
    const status = error instanceof MalikModelRouteError ? error.status : 503
    return Response.json(payload, { status, headers: { "cache-control": "no-store" } })
  }
}
