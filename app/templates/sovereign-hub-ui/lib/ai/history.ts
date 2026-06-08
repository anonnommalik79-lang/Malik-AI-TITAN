import { publicEngineForProvider, publicErrorMessage } from "@/lib/brand-provider-map"
import type { AIJob } from "./jobs"

export type GenerationHistoryItem = {
  id: string
  type: AIJob["type"]
  status: AIJob["status"]
  prompt: string
  engine?: string
  resultUrl?: string
  error?: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = "malik_generation_history_v2"

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage)
}

export function jobToHistoryItem(job: AIJob): GenerationHistoryItem {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    prompt: job.input.prompt,
    engine: publicEngineForProvider(job.provider || job.output?.provider, job.type).title,
    resultUrl: job.output?.resultUrl,
    error: job.error ? publicErrorMessage(job.error) : undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

export function readGenerationHistory(): GenerationHistoryItem[] {
  try {
    if (!canUseStorage()) return []
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(0, 80) : []
  } catch {
    return []
  }
}

export function saveGenerationHistory(items: GenerationHistoryItem[]) {
  try {
    if (canUseStorage()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 80)))
  } catch {}
}

export function upsertGenerationHistory(item: GenerationHistoryItem) {
  const current = readGenerationHistory()
  const next = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 80)
  saveGenerationHistory(next)
  return next
}

export function clearGenerationHistory() {
  try {
    if (canUseStorage()) window.localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
