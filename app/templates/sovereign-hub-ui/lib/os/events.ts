import type { OsEvent } from "./types"

/**
 * Operational events of running flows, in this process: task started, task
 * progress, artifact ready, flow done. Carries statuses only — never model
 * reasoning, never artifact content.
 */

type Listener = (event: OsEvent) => void

type EventsGlobal = typeof globalThis & { __malikOsListeners?: Map<string, Set<Listener>> }

function listeners() {
  const scope = globalThis as EventsGlobal
  if (!scope.__malikOsListeners) scope.__malikOsListeners = new Map()
  return scope.__malikOsListeners
}

export function publish(flowId: string, event: OsEvent) {
  const set = listeners().get(flowId)
  if (!set) return
  for (const listener of [...set]) {
    try {
      listener(event)
    } catch {
      /* One broken subscriber must not stop the others. */
    }
  }
}

export function subscribe(flowId: string, listener: Listener) {
  const all = listeners()
  let set = all.get(flowId)
  if (!set) {
    set = new Set()
    all.set(flowId, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set && !set.size) all.delete(flowId)
  }
}

export function subscriberCount(flowId: string) {
  return listeners().get(flowId)?.size || 0
}
