import type { UnbreakableGeneration } from "./types"
import { UNBREAKABLE_STORAGE_KEYS, UNBREAKABLE_LIMITS } from "./constants"
import { ubGetJson, ubSetJson } from "./safe-storage"
import { unbreakableId } from "./ids"
import { isoNow } from "./time"

export function listGenerations(): UnbreakableGeneration[] {
  return ubGetJson<UnbreakableGeneration[]>(UNBREAKABLE_STORAGE_KEYS.generations, [])
}

export function saveGeneration(input: Partial<UnbreakableGeneration> & { prompt: string }) {
  const now = isoNow()
  const item: UnbreakableGeneration = {
    id: input.id || unbreakableId("gen"),
    kind: input.kind || "chat",
    prompt: input.prompt,
    status: input.status || "healthy",
    provider: input.provider,
    resultUrl: input.resultUrl,
    codeFiles: input.codeFiles,
    error: input.error,
    attempts: input.attempts ?? 1,
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
  ubSetJson(UNBREAKABLE_STORAGE_KEYS.generations, [item, ...listGenerations().filter((x) => x.id !== item.id)].slice(0, UNBREAKABLE_LIMITS.maxHistoryItems))
  return item
}

