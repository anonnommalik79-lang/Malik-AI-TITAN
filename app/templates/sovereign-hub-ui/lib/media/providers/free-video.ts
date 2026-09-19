import type { VideoGenerateInput } from "../types"

export type FreeVideoProviderId = "novai" | "magichour" | "pixazo" | "cliptaps"

type RemoteVideoStatus = {
  status: "succeed" | "failed" | "processing" | "waiting"
  videoUrl?: string
  error?: string
}

type CreatedFreeVideoJob = {
  taskId: string
  model: string
  statusUrl?: string
}

const DEFAULT_BASES: Record<FreeVideoProviderId, string> = {
  novai: "https://aiapi-pro.com",
  magichour: "https://api.magichour.ai",
  pixazo: "https://gateway.pixazo.ai",
  cliptaps: "https://cliptaps.com",
}

function env(name: string) {
  return String(process.env[name] || "").trim()
}

function baseUrl(provider: FreeVideoProviderId) {
  const override = env({
    novai: "NOVAI_BASE_URL",
    magichour: "MAGIC_HOUR_BASE_URL",
    pixazo: "PIXAZO_BASE_URL",
    cliptaps: "CLIPTAPS_BASE_URL",
  }[provider])
  return (override || DEFAULT_BASES[provider]).replace(/\/+$/, "")
}

function apiKey(provider: FreeVideoProviderId) {
  return env({
    novai: "NOVAI_API_KEY",
    magichour: "MAGIC_HOUR_API_KEY",
    pixazo: "PIXAZO_API_KEY",
    cliptaps: "CLIPTAPS_API_KEY",
  }[provider])
}

function detailFrom(payload: any, fallback: string) {
  return String(
    payload?.detail?.message ||
      payload?.detail ||
      payload?.error?.message ||
      payload?.error ||
      payload?.message ||
      fallback,
  )
}

async function requestJson(url: string, init: RequestInit, label: string) {
  const response = await fetch(url, { ...init, cache: "no-store" })
  const raw = await response.text()
  let payload: any = {}
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = { message: raw.slice(0, 1200) }
    }
  }
  if (!response.ok) {
    throw new Error(`${label}: ${detailFrom(payload, `HTTP ${response.status}`)}`)
  }
  return payload
}

function jsonHeaders(extra: Record<string, string> = {}) {
  return { "Content-Type": "application/json", Accept: "application/json", ...extra }
}

function absoluteUrl(value: unknown, provider: FreeVideoProviderId) {
  const url = String(value || "").trim()
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  try {
    return new URL(url, baseUrl(provider)).toString()
  } catch {
    return undefined
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function sceneRows(payload: any): any[] {
  const candidates = [
    payload?.scenes,
    payload?.data?.scenes,
    payload?.project?.scenes,
    payload?.storyboard?.scenes,
    payload?.result?.scenes,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function sceneIdsFrom(payload: any): string[] {
  if (Array.isArray(payload?.sceneIds)) {
    return payload.sceneIds.map((value: any) => String(value || "").trim()).filter(Boolean)
  }
  return sceneRows(payload)
    .map((scene: any) => firstString(scene?.id, scene?.sceneId, scene?.scene_id))
    .filter(Boolean)
}

function clipTapsVideoUrl(payload: any) {
  const scenes = sceneRows(payload)
  const ready = scenes.find((scene: any) => firstString(scene?.videoUrl, scene?.video_url, scene?.outputUrl, scene?.output_url))
  return absoluteUrl(
    ready?.videoUrl ||
      ready?.video_url ||
      ready?.outputUrl ||
      ready?.output_url ||
      payload?.videoUrl ||
      payload?.video_url ||
      payload?.url,
    "cliptaps",
  )
}

function clipTapsStatus(payload: any): RemoteVideoStatus {
  const scenes = sceneRows(payload)
  const statuses = scenes.map((scene: any) => firstString(scene?.status, scene?.generationStatus, scene?.generation_status).toUpperCase())
  const top = firstString(payload?.status, payload?.generationStatus, payload?.generation_status).toUpperCase()
  const videoUrl = clipTapsVideoUrl(payload)

  if (videoUrl && (!statuses.length || statuses.every((status) => ["COMPLETED", "COMPLETE", "SUCCESS", "SUCCEEDED", "READY"].includes(status)))) {
    return { status: "succeed", videoUrl }
  }
  if (statuses.some((status) => ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status)) || ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(top)) {
    return { status: "failed", error: detailFrom(payload, "ClipTaps generation failed") }
  }
  if (statuses.some((status) => ["GENERATING", "PROCESSING", "RENDERING", "RUNNING"].includes(status)) || ["GENERATING", "PROCESSING", "RENDERING", "RUNNING"].includes(top)) {
    return { status: "processing" }
  }
  if (["COMPLETED", "COMPLETE", "SUCCESS", "SUCCEEDED", "READY"].includes(top) && videoUrl) {
    return { status: "succeed", videoUrl }
  }
  return { status: "waiting" }
}

export function isFreeVideoProvider(value: unknown): value is FreeVideoProviderId {
  return value === "novai" || value === "magichour" || value === "pixazo" || value === "cliptaps"
}

export function freeVideoProviderConfigured(provider: FreeVideoProviderId) {
  return Boolean(apiKey(provider))
}

export function freeVideoModel(provider: FreeVideoProviderId) {
  if (provider === "novai") return "cogvideox-flash"
  if (provider === "magichour") return "ltx-2.5"
  if (provider === "pixazo") return "ltx-video"
  return "cliptaps-free"
}

export async function createFreeVideoJob(provider: FreeVideoProviderId, input: VideoGenerateInput): Promise<CreatedFreeVideoJob> {
  const key = apiKey(provider)
  if (!key) throw new Error(`${provider.toUpperCase()} API key is not configured`)

  if (provider === "novai") {
    const root = baseUrl(provider)
    const payload = await requestJson(
      `${root}/v1/video/generations`,
      {
        method: "POST",
        headers: jsonHeaders({ Authorization: `Bearer ${key}` }),
        body: JSON.stringify({ model: "cogvideox-flash", prompt: input.prompt }),
      },
      "NovAI submit",
    )
    const taskId = firstString(payload?.id, payload?.request_id, payload?.task_id)
    if (!taskId) throw new Error("NovAI submit: missing task id")
    return {
      taskId,
      model: "cogvideox-flash",
      statusUrl: `${root}/v1/video/generations/${encodeURIComponent(taskId)}?model=cogvideox-flash`,
    }
  }

  if (provider === "magichour") {
    const root = baseUrl(provider)
    const duration = input.length === 10 ? 10 : 5
    const headers = jsonHeaders({ Authorization: `Bearer ${key}` })

    const endpoint = input.sourceVideoUrl
      ? `${root}/v1/ai-video-editor`
      : input.imageUrl
        ? `${root}/v1/image-to-video`
        : `${root}/v1/text-to-video`

    const body = input.sourceVideoUrl
      ? {
          name: "Malik AI Video Edit",
          start_seconds: 0,
          end_seconds: Math.min(5, Math.max(3, Number(input.sourceDurationSeconds || 5))),
          assets: { video_file_path: input.sourceVideoUrl },
          style: {
            prompt: [
              "Edit the uploaded video according to the user's instruction.",
              "You may remove, replace, add, recolor, restyle or enhance objects, people, backgrounds and scene details when explicitly requested.",
              "Preserve the original subject identity, timing, camera motion, composition and all unmentioned details as closely as possible.",
              "Keep edits temporally consistent across frames and physically realistic unless the user asks for a stylized result.",
              input.prompt,
            ].join(" "),
          },
        }
      : input.imageUrl
        ? {
            name: "Malik AI Image to Video",
            end_seconds: duration,
            model: "ltx-2.5",
            resolution: "480p",
            audio: input.generateAudio !== false,
            assets: { image_file_path: input.imageUrl },
            style: {
              prompt: [
                "Use the uploaded image as the exact first frame and preserve its subject identity, proportions, colors and composition.",
                "Add physically realistic motion, depth and details only as requested.",
                input.prompt,
              ].join(" "),
            },
          }
        : {
            name: "Malik AI Video",
            end_seconds: duration,
            model: "ltx-2.5",
            resolution: "480p",
            aspect_ratio: input.ratio || "16:9",
            audio: input.generateAudio !== false,
            style: { prompt: input.prompt },
          }

    const payload = await requestJson(
      endpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      input.sourceVideoUrl ? "Magic Hour video edit submit" : input.imageUrl ? "Magic Hour image-to-video submit" : "Magic Hour submit",
    )
    const taskId = firstString(payload?.id, payload?.project_id, payload?.task_id)
    if (!taskId) throw new Error("Magic Hour submit: missing project id")
    return {
      taskId,
      model: input.sourceVideoUrl ? "google-omni-video-editor" : "ltx-2.5",
      statusUrl: `${root}/v1/video-projects/${encodeURIComponent(taskId)}`,
    }
  }

  if (provider === "pixazo") {
    const root = baseUrl(provider)
    const payload = await requestJson(
      `${root}/ltx-video/v1/text-to-video`,
      {
        method: "POST",
        headers: jsonHeaders({ "Ocp-Apim-Subscription-Key": key }),
        body: JSON.stringify({ prompt: input.prompt }),
      },
      "Pixazo submit",
    )
    const taskId = firstString(payload?.request_id, payload?.id, payload?.task_id)
    if (!taskId) throw new Error("Pixazo submit: missing request_id")
    return {
      taskId,
      model: "ltx-video",
      statusUrl: firstString(payload?.polling_url) || `${root}/v2/requests/status/${encodeURIComponent(taskId)}`,
    }
  }

  const root = baseUrl(provider)
  const headers = jsonHeaders({ Authorization: `Bearer ${key}` })
  const project = await requestJson(
    `${root}/api/projects`,
    { method: "POST", headers, body: JSON.stringify({}) },
    "ClipTaps create project",
  )
  const projectId = firstString(project?.projectId, project?.id, project?.project?.id)
  if (!projectId) throw new Error("ClipTaps create project: missing projectId")

  await requestJson(
    `${root}/api/projects/${encodeURIComponent(projectId)}/source-data/text`,
    { method: "POST", headers, body: JSON.stringify({ text_prompt: input.prompt }) },
    "ClipTaps source text",
  )

  const storyboard = await requestJson(
    `${root}/api/projects/${encodeURIComponent(projectId)}/storyboard/script`,
    { method: "POST", headers, body: JSON.stringify({}) },
    "ClipTaps storyboard",
  )
  const sceneIds = sceneIdsFrom(storyboard)
  if (!sceneIds.length) throw new Error("ClipTaps storyboard: no scene ids returned")

  await requestJson(
    `${root}/api/generate/video-start`,
    { method: "POST", headers, body: JSON.stringify({ sceneIds }) },
    "ClipTaps start",
  )

  return {
    taskId: projectId,
    model: "cliptaps-free",
    statusUrl: `${root}/api/generate/video-status/${encodeURIComponent(projectId)}`,
  }
}

export async function fetchFreeVideoStatus(
  provider: FreeVideoProviderId,
  taskId: string,
  options: { statusUrl?: string } = {},
): Promise<RemoteVideoStatus> {
  const key = apiKey(provider)
  if (!key) return { status: "failed", error: `${provider.toUpperCase()} API key is not configured` }

  if (provider === "novai") {
    const url = options.statusUrl || `${baseUrl(provider)}/v1/video/generations/${encodeURIComponent(taskId)}?model=cogvideox-flash`
    const payload = await requestJson(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }, "NovAI status")
    const status = firstString(payload?.task_status, payload?.status, payload?.state).toUpperCase()
    const videoUrl = firstString(
      payload?.video_result?.[0]?.url,
      payload?.content?.video_url,
      payload?.content?.url,
      payload?.result?.video_url,
      payload?.video_url,
      payload?.url,
    )
    if (videoUrl || ["SUCCESS", "SUCCEEDED", "COMPLETED", "COMPLETE"].includes(status)) {
      return videoUrl ? { status: "succeed", videoUrl } : { status: "processing" }
    }
    if (["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status)) return { status: "failed", error: detailFrom(payload, "NovAI generation failed") }
    if (["PROCESSING", "RUNNING", "GENERATING"].includes(status)) return { status: "processing" }
    return { status: "waiting" }
  }

  if (provider === "magichour") {
    const url = options.statusUrl || `${baseUrl(provider)}/v1/video-projects/${encodeURIComponent(taskId)}`
    const payload = await requestJson(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }, "Magic Hour status")
    const status = firstString(payload?.status, payload?.state).toLowerCase()
    const videoUrl = firstString(payload?.downloads?.[0]?.url, payload?.download?.url, payload?.video_url, payload?.url)
    if (status === "complete" && videoUrl) return { status: "succeed", videoUrl }
    if (status === "error" || status === "failed" || status === "canceled" || status === "cancelled") {
      return { status: "failed", error: detailFrom(payload, "Magic Hour generation failed") }
    }
    return { status: status === "queued" || status === "draft" ? "waiting" : "processing" }
  }

  if (provider === "pixazo") {
    const url = options.statusUrl || `${baseUrl(provider)}/v2/requests/status/${encodeURIComponent(taskId)}`
    const payload = await requestJson(url, { headers: { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" } }, "Pixazo status")
    const status = firstString(payload?.status).toUpperCase()
    const media = payload?.output?.media_url
    const videoUrl = Array.isArray(media) ? firstString(media[0]) : firstString(media, payload?.video_url, payload?.url)
    if (status === "COMPLETED" && videoUrl) return { status: "succeed", videoUrl }
    if (status === "FAILED" || status === "ERROR") return { status: "failed", error: detailFrom(payload, "Pixazo generation failed") }
    return { status: status === "QUEUED" ? "waiting" : "processing" }
  }

  const url = options.statusUrl || `${baseUrl(provider)}/api/generate/video-status/${encodeURIComponent(taskId)}`
  const payload = await requestJson(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }, "ClipTaps status")
  return clipTapsStatus(payload)
}
