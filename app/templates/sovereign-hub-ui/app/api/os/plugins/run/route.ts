import { getMalikPlugin } from "@/components/sovereign/features/plugin-registry"
import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { consumePluginPermission } from "@/lib/os/plugin-actions"
import { createProject, getProject, putArtifact, toSummary, updateProject } from "@/lib/os/store"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Runs a plugin as an action and keeps its result in the project library.
 * A connected plugin without permission answers 403 with what the
 * permission screen needs; nothing is read from the account.
 */
export async function POST(request: Request) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 16 * 1024)
    const pluginId = String(body.pluginId || "")
    const query = String(body.query || "").replace(/\s+/g, " ").trim().slice(0, 500)
    const plugin = getMalikPlugin(pluginId)
    if (!plugin) throw new OsToolError("NOT_FOUND", "Плагин не найден.", { retryable: false })
    const permission = await consumePluginPermission(owner.userId, plugin.id)
    if (!permission.ok) {
      return osJson({ ok: false, code: "PERMISSION_REQUIRED", error: `Разрешите ${plugin.name} читать данные для этой задачи.`, plugin: { id: plugin.id, name: plugin.name, runtime: plugin.runtime } }, 403)
    }
    const { runMalikPlugin } = await import("@/lib/server/plugin-runtime")
    const result = await runMalikPlugin(plugin.id, query)
    const failed = result.attempts.length > 0 && result.attempts.every((attempt) => !attempt.ok)
    if (result.connected === false || failed) {
      return osJson({ ok: false, code: result.connected === false ? "CONNECT_REQUIRED" : "PLUGIN_FAILED", error: result.connected === false ? `Подключите ${plugin.name} в разделе «Плагины».` : `${plugin.name} не ответил. Попробуйте позже.`, content: result.content }, result.connected === false ? 409 : 502)
    }
    const projectId = typeof body.projectId === "string" ? body.projectId : ""
    const project = (projectId && await getProject(owner.userId, projectId)) || await createProject(owner.userId, { title: `${plugin.name}: ${query || "данные"}`.slice(0, 100), goal: query || plugin.name })
    const artifact = await putArtifact(owner.userId, {
      projectId: project.id,
      kind: "text",
      title: `${plugin.name}${query ? ` · ${query.slice(0, 60)}` : ""}`,
      sourceTool: "import",
      content: result.content.slice(0, 200_000),
      summary: result.content.replace(/[#*]/g, "").slice(0, 280),
      metadata: { role: "plugin", pluginId: plugin.id, sources: result.sources.slice(0, 20) },
    })
    await updateProject(owner.userId, project.id, (target) => {
      target.artifactIds.push(artifact.id)
      target.sources.push(...result.sources.slice(0, 10).map((source) => ({ url: source.url, title: source.title, domain: source.domain, at: Date.now() })))
    })
    return osJson({ ok: true, artifact: toSummary(artifact), projectId: project.id })
  } catch (error) {
    return osError(error)
  }
}
