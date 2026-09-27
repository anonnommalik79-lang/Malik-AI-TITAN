import { calculateUnitEconomics, economicsMarkdown, parseEconomicsInputs } from "@/lib/business/unit-economics"
import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { getArtifact, getArtifacts, getProject, putArtifact, updateProject } from "@/lib/os/store"
import { summarizeArtifact } from "@/lib/os/types"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** A business plan may be continued with user-supplied, auditable numbers. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const { id } = await context.params
    const source = await getArtifact(owner.userId, id)
    if (!source || source.kind !== "business-plan") throw new OsToolError("NOT_FOUND", "Бизнес-план не найден.", { retryable: false })
    const project = await getProject(owner.userId, source.projectId)
    if (!project) throw new OsToolError("NOT_FOUND", "Проект не найден.", { retryable: false })
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 8 * 1024)
    let inputs
    try {
      inputs = parseEconomicsInputs(body)
    } catch {
      throw new OsToolError("INVALID_INPUT", "Проверьте числа и трёхбуквенный код валюты.", { retryable: false })
    }
    const calculation = calculateUnitEconomics(inputs)
    const previous = await getArtifacts(owner.userId, project.artifactIds.slice(-80))
    const match = previous.find((artifact) => artifact.kind === "analysis" && artifact.metadata?.role === "unit-economics" && artifact.metadata?.sourceId === source.id && JSON.stringify(artifact.metadata?.inputs) === JSON.stringify(inputs))
    if (match) return osJson({ ok: true, created: false, artifact: summarizeArtifact(match), calculation })
    const artifact = await putArtifact(owner.userId, {
      projectId: project.id,
      kind: "analysis",
      title: `Юнит-экономика · ${source.title}`,
      sourceTool: "user",
      content: economicsMarkdown(calculation),
      mime: "text/markdown",
      summary: `Расчёт по введённым данным · ${calculation.missing.length ? `не хватает ${calculation.missing.length} показателей` : "все показатели введены"}`,
      links: [{ relation: "derived-from", artifactId: source.id }],
      metadata: { role: "unit-economics", sourceId: source.id, inputs, calculation, factClass: "user-supplied", generatedAt: Date.now() },
    })
    await updateProject(owner.userId, project.id, (current) => { current.artifactIds.push(artifact.id) })
    return osJson({ ok: true, created: true, artifact: summarizeArtifact(artifact), calculation }, 201)
  } catch (error) {
    return osError(error)
  }
}
