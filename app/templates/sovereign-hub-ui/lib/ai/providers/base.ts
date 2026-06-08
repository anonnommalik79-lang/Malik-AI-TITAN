import type { AIProviderHealth, AIProviderId, AITaskType } from "../types"

export function hasEnv(name: string) {
  try {
    return Boolean(process.env[name]?.trim())
  } catch {
    return false
  }
}

export async function providerFetch(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS || 30_000),
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Provider timeout after ${timeoutMs}ms`)), timeoutMs)
  const parentSignal = init.signal
  const abortFromParent = () => controller.abort(parentSignal?.reason)

  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true })

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener("abort", abortFromParent)
  }
}

export function health(
  provider: AIProviderId,
  configured: boolean,
  supports: AITaskType[],
  models: string[],
  message = configured ? "configured" : "missing api key",
): AIProviderHealth {
  return { provider, configured, supports, models, message }
}

export function responseType(task?: AITaskType): "chat" | "code" | "image" | "video" | "file" {
  if (task === "image") return "image"
  if (task === "video") return "video"
  if (task === "file_analysis") return "file"
  if (task === "code" || task === "debug" || task === "project") return "code"
  return "chat"
}

