import "server-only"

import type { ImageRequest, ImageResult, OwnerContext, ToolDeps, WebSource } from "./tools/contract"

/**
 * The real implementations behind the tool contract. Each one reuses the
 * part of Malik AI that already does the job — MalikLLM MAX for text, the
 * research pipeline for the web, the site skill engine, the presentation
 * engine and its credits, the image pools and image credits, the project
 * builder — so a flow gets exactly what the separate studios give, and the
 * same limits and bandwidth rules apply.
 */

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new Error("aborted"))
    }, { once: true })
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([promise, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms) })]).finally(() => clearTimeout(timer))
}

async function search(queries: string[], options: { signal?: AbortSignal; maxPages?: number; onStatus?: (text: string) => void }): Promise<WebSource[]> {
  const [{ searchWeb }, { dedupeSearchResults, rankSources }, { fetchPageText }] = await Promise.all([
    import("@/lib/malik-research/search"),
    import("@/lib/malik-research/rank"),
    import("@/lib/malik-research/fetch-page"),
  ])
  const settled = await withTimeout(Promise.allSettled(queries.map((query) => searchWeb(query, 8))), 15_000, [])
  const results = dedupeSearchResults(settled.flatMap((item) => (item.status === "fulfilled" ? item.value : [])), 18)
  if (options.signal?.aborted) throw new Error("aborted")
  options.onStatus?.(`Нашёл ${results.length} ссылок, читаю лучшие`)
  const pages = results.slice(0, options.maxPages || 6)
  const read = await withTimeout(Promise.allSettled(pages.map((result) => withTimeout(fetchPageText(result), 7_000, null))), 16_000, [])
  const fetched = read.flatMap((item) => (item.status === "fulfilled" && item.value ? [item.value] : []))
  // Pages that would not open still count by their search snippet.
  for (const result of pages) {
    if (fetched.some((source) => source.url === result.url)) continue
    if ((result.snippet || "").length > 60) fetched.push({ title: result.title, url: result.url, domain: result.domain, text: result.snippet || "", snippet: result.snippet, publishedAt: result.publishedAt, provider: result.provider })
  }
  return rankSources(queries.join(" "), fetched, 8).map((source) => ({
    title: source.title,
    url: source.url,
    domain: source.domain,
    snippet: source.snippet,
    text: source.text,
    publishedAt: source.publishedAt,
    provider: source.provider,
  }))
}

function directImageDelivery() {
  return /^(?:1|true|yes|on)$/i.test(String(process.env.MALIK_IMAGE_EPHEMERAL_DIRECT || "").trim())
}

async function generateImage(request: ImageRequest): Promise<ImageResult> {
  const [{ agnesImageConfigured, generateWithAgnesImage }, { pollinationsDirectUrl }, { routeImageGeneration }, { buildVisualPrompt }, { enhanceImagePrompt }] = await Promise.all([
    import("@/lib/media/providers/agnes-image"),
    import("@/lib/media/providers/pollinations"),
    import("@/lib/media/image-router"),
    import("@/lib/media/visual-prompt"),
    import("@/lib/media/image-prompt-enhancer"),
  ])
  const visual = await buildVisualPrompt(request.prompt, request.mode).catch(() => null)
  const prompt = enhanceImagePrompt(visual?.prompt || request.prompt, { mode: request.mode, quality: "balanced" })

  // Same order as the image studio: the primary provider, then the
  // provider-direct link (no bytes through Render), then the pools.
  if (agnesImageConfigured()) {
    try {
      const agnes = await generateWithAgnesImage({ prompt, negativePrompt: visual?.negativePrompt, size: "1K", aspectRatio: request.aspectRatio })
      if (/^https:\/\//i.test(agnes.imageUrl)) return { url: agnes.imageUrl, provider: "agnes", providerModel: agnes.providerModel, ephemeral: true, durable: false }
    } catch (error) {
      console.warn("[MALIK_OS] image primary unavailable", error instanceof Error ? error.message.slice(0, 160) : String(error))
    }
  }
  if (directImageDelivery()) {
    return { url: pollinationsDirectUrl({ prompt, negativePrompt: visual?.negativePrompt, aspectRatio: request.aspectRatio }), provider: "pollinations", ephemeral: true, durable: false }
  }
  const result = await routeImageGeneration({
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    mode: request.mode,
    quality: "balanced",
    userId: request.owner.userId,
    plan: request.owner.plan,
  }, { signal: request.signal })
  if (!result.ok || !result.imageUrl) {
    const error = new Error(String(result.error || "IMAGE_GENERATION_FAILED"))
    ;(error as Error & { status?: number }).status = /429|busy|rate|quota|overload|temporar|timeout|503|502/i.test(String(result.error || "")) ? 503 : 502
    throw error
  }
  if (/^https:\/\//i.test(result.imageUrl)) return { url: result.imageUrl, provider: result.provider, providerModel: result.providerModel, ephemeral: true, durable: false }

  // Bytes (a data URL) go to object storage; the flow only keeps the URL.
  const [{ isCloudStorageConfigured, uploadMediaAsset }, { sourceBytes }] = await Promise.all([
    import("@/lib/storage/cloud-upload"),
    import("@/lib/media/image-postprocess"),
  ])
  if (!isCloudStorageConfigured()) return { url: "", provider: result.provider, ephemeral: false, durable: false }
  const bytes = await sourceBytes(result.imageUrl)
  if (!bytes) throw new Error("IMAGE_BYTES_UNREADABLE")
  const mime = bytes.mime || "image/png"
  const uploaded = await uploadMediaAsset({ userId: request.owner.userId, fileName: `superflow-${Date.now()}.${mime.split("/")[1] || "png"}`, mime, buffer: bytes.buffer, kind: "image" })
  if (!uploaded.stored) throw new Error(uploaded.reason || "IMAGE_UPLOAD_FAILED")
  return { url: uploaded.publicUrl, provider: result.provider, providerModel: result.providerModel, ephemeral: false, durable: true }
}

export function serverToolDeps(): ToolDeps {
  return {
    async text(request) {
      const { runStrictMalikModel } = await import("@/lib/server/malik-model-router")
      const result = await runStrictMalikModel({
        modelId: "malik-max",
        systemPrompt: request.system,
        prompt: request.prompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        reasoningEffort: request.reasoningEffort,
        allowCatalog: request.allowCatalog,
        signal: request.signal,
      })
      return { content: result.content, provider: result.provider, model: result.model }
    },
    search,
    image: {
      async check(owner: OwnerContext) {
        const { checkImageCreditLimit } = await import("@/lib/media/limits")
        const credit = await checkImageCreditLimit({ userId: owner.userId, plan: owner.plan as never, size: "1K" })
        return credit.ok ? { ok: true as const } : { ok: false as const, code: credit.code, message: credit.error }
      },
      generate: generateImage,
      async record(owner: OwnerContext) {
        const { recordImageCreditUsage } = await import("@/lib/media/limits")
        await recordImageCreditUsage(owner.userId, "1K")
      },
    },
    async site(request) {
      const [{ buildPlannerPrompt, fallbackWebsitePlan, renderWebsiteFromPlan }, { selectSiteSkills }, { planWebsite, scoreWebsitePlan }] = await Promise.all([
        import("@/lib/sites/skill-engine"),
        import("@/lib/sites/skill-registry"),
        import("@/lib/sites/site-planner"),
      ])
      const template = "adaptive"
      const skills = selectSiteSkills(request.prompt, template)
      const outcome = await planWebsite({
        prompt: request.prompt,
        template,
        plannerPrompt: buildPlannerPrompt(request.prompt, template, skills),
        userId: request.userId,
        signal: request.signal,
        skillIds: skills.map((skill) => skill.id),
      })
      const plan = outcome.plan || fallbackWebsitePlan(request.prompt, template)
      const quality = scoreWebsitePlan(plan, request.prompt)
      return {
        html: renderWebsiteFromPlan(plan, skills),
        plan: plan as never,
        provider: outcome.provider || "local",
        model: outcome.model || "Malik Skill Renderer",
        plannerUsed: Boolean(outcome.plan),
        quality: { score: quality.score, issues: quality.reasons },
      }
    },
    presentation: {
      async reserve(owner, cost) {
        const { reservePresentationCredits } = await import("@/lib/server/presentation-quota")
        const result = await reservePresentationCredits(owner.userId, owner.plan, owner.authenticated, cost)
        return result.ok ? { ok: true as const } : { ok: false as const, code: result.code, message: result.error }
      },
      async refund(owner, cost) {
        const { refundPresentationCredits } = await import("@/lib/server/presentation-quota")
        await refundPresentationCredits(owner.userId, owner.plan, owner.authenticated, cost)
      },
      async maxSlides(owner) {
        const { getPresentationQuota } = await import("@/lib/server/presentation-quota")
        const quota = await getPresentationQuota(owner.userId, owner.plan, owner.authenticated)
        return Number(quota.maxSlides) || 10
      },
      async outline(input) {
        const { generateOutline } = await import("@/lib/server/presentation-engine")
        const outline = await generateOutline({ topic: input.topic, count: input.count, language: input.language, tone: "confident" })
        return outline as never
      },
      async slides(input) {
        const { generateSlides } = await import("@/lib/server/presentation-engine")
        const result = await generateSlides({ topic: input.topic, outline: input.outline as never, startIndex: input.startIndex, count: input.count, language: input.language, tone: "confident" })
        return result as never
      },
    },
    async code(request) {
      const [{ generateProjectWithBrain }, { putProjectArtifact }] = await Promise.all([
        import("@/lib/ai/project-builder"),
        import("@/lib/server/project-artifact-store"),
      ])
      const project = await generateProjectWithBrain({ prompt: request.prompt, userId: request.userId, modelId: "malik-max" })
      const passed = project.status === "completed" && Boolean(project.qa?.passed) && project.files.length > 0
      let downloadUrl: string | undefined
      let artifactId: string | undefined
      if (passed) {
        const stored = await putProjectArtifact(project, request.userId)
        artifactId = stored.id
        downloadUrl = `/api/ai/project/artifacts/${stored.id}/download`
      }
      return {
        title: project.title,
        files: project.files.map((file) => ({ path: file.path, content: file.content })),
        provider: project.provider || "malik",
        model: project.model || "malik-max",
        qaPassed: passed,
        downloadUrl,
        artifactId,
        error: project.error,
      }
    },
    now: () => Date.now(),
    sleep,
    random: Math.random,
  }
}
