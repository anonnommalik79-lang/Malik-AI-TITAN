import type { UnbreakableIncident } from "./types"
import { UNBREAKABLE_STORAGE_KEYS, UNBREAKABLE_LIMITS } from "./constants"
import { ubGetJson, ubSetJson } from "./safe-storage"
import { unbreakableId } from "./ids"
import { isoNow } from "./time"

export function listIncidents(): UnbreakableIncident[] {
  return ubGetJson<UnbreakableIncident[]>(UNBREAKABLE_STORAGE_KEYS.incidents, [])
}

export function reportIncident(input: Omit<Partial<UnbreakableIncident>, "id"> & { title: string; message: string }) {
  const incident: UnbreakableIncident = {
    id: unbreakableId("incident"),
    layer: input.layer || "ui",
    title: input.title,
    message: input.message,
    severity: input.severity || "medium",
    createdAt: isoNow(),
    recoveryAction: input.recoveryAction,
  }
  ubSetJson(UNBREAKABLE_STORAGE_KEYS.incidents, [incident, ...listIncidents()].slice(0, UNBREAKABLE_LIMITS.maxIncidents))
  return incident
}

export function resolveIncident(id: string) {
  const next = listIncidents().map((item) => item.id === id ? { ...item, resolvedAt: isoNow() } : item)
  ubSetJson(UNBREAKABLE_STORAGE_KEYS.incidents, next)
}

