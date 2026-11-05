import "server-only"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import type { MalikModelId } from "@/lib/ai/malik-models"
import { generateProjectWithBrain } from "@/lib/ai/project-builder"
import { buildSelfProject } from "@/lib/selfbuild/studio"
import { selfBuildIntent } from "@/lib/selfbuild/intent"
import { executeNodeTests } from "@/lib/selfbuild/executor"
import { sourceHash, projectFiles } from "@/lib/website/engine/workspace"
import { putProjectArtifact } from "@/lib/server/project-artifact-store"
import { searchWeb } from "@/lib/malik-research/search"
import { fetchPublicPage } from "@/lib/malik-research/public-page-fetch"
import { stripHtml } from "@/lib/malik-research/utils"
import { safeEvidenceUrl, sanitizeEvidenceText } from "@/lib/live-intelligence/evidence"
import { SkillError, type SkillRuntime } from "./types"

export function skillRuntime(input: { ownerId: string; modelId: MalikModelId; allowCatalog?: boolean }): SkillRuntime {
  return {
    async model(request) {
      try {
        const result = await runStrictMalikModel({ ...request, modelId: input.modelId, allowCatalog: input.allowCatalog, temperature: 0.12 }, { allowFallback: true })
        return result.content
      } catch (error) {
        const status = Number((error as { status?: number })?.status)
        throw new SkillError(status === 429 ? "MODEL_RATE_LIMIT" : status === 401 || status === 403 ? "MODEL_NOT_CONFIGURED" : "MODEL_UNAVAILABLE", status || 503, ![400, 401, 403].includes(status))
      }
    },
    async search(query, signal) {
      signal.throwIfAborted()
      const results = await searchWeb(query, 8)
      signal.throwIfAborted()
      return results.map(s => ({ title: s.title || s.url, url: s.url, snippet: sanitizeEvidenceText(s.snippet || "", 3500), publishedAt: s.publishedAt, read: false }))
    },
    async read(source, signal) {
      const url = safeEvidenceUrl(source.url)
      if (!url) throw new SkillError("UNSAFE_SOURCE_URL")
      const response = await fetchPublicPage(url, AbortSignal.any([signal, AbortSignal.timeout(10_000)]), 512 * 1024)
      if (!response.ok) return null
      const mime = response.headers.get("content-type") || ""
      if (!/text\/|application\/(?:json|xhtml\+xml)/iu.test(mime)) return null
      const raw = await response.text()
      const snippet = sanitizeEvidenceText(/html/iu.test(mime) ? stripHtml(raw) : raw, 7000)
      if (snippet.length < 80) return null
      return { ...source, snippet, read: true, readAt: new Date().toISOString() }
    },
    async build(prompt, model, signal) {
      if (selfBuildIntent(prompt)) return buildSelfProject({ prompt, modelId: input.modelId, signal }, {
        model: request => model({ ...request, maxTokens: 6500, signal }),
        runner: async files => ({ sourceHash: sourceHash(projectFiles(files)), status: "not_run", details: ["Runtime проверяется отдельным шагом Skills Engine"] }),
      })
      return generateProjectWithBrain({ prompt, userId: input.ownerId, modelId: input.modelId, signal }, { model: async request => ({
        content: await model({ ...request, maxTokens: Math.min(6500, request.maxTokens), signal }),
        provider: "malik-selected-model", model: input.modelId, latencyMs: 0,
      }) })
    },
    async test(project, signal) {
      const hash = sourceHash(projectFiles(project.files))
      // The configured runner implements Node built-ins only. Never pass a
      // Next/React install/build to it or run generated code in the web host.
      let nodeOnly = false
      try {
        const pkg = JSON.parse(project.files.find(f => f.path === "package.json")?.content || "null")
        nodeOnly = pkg?.type === "module" && !Object.keys(pkg.dependencies || {}).length && !Object.keys(pkg.devDependencies || {}).length
          && project.files.some(f => /\.test\.mjs$/u.test(f.path))
      } catch { /* A malformed manifest is handled by static inspection. */ }
      return nodeOnly ? executeNodeTests(project.files, signal) : { sourceHash: hash, status: "not_run", details: ["Исполнитель npm install/build/browser не настроен; код на сервере приложения не запускался"] }
    },
    async publish(project) {
      const saved = await putProjectArtifact(project, input.ownerId)
      return { id: saved.id, filename: saved.filename, expiresAt: saved.expiresAt, downloadUrl: `/api/ai/project/artifacts/${saved.id}/download` }
    },
  }
}
