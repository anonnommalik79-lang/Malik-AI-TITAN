"use client"

import { useEffect, useState } from "react"
import { CONNECTORS, CONNECTOR_PENDING_KEY, readConnectorReturn, type ConnectorId, type ConnectorInfo, type ConnectorState } from "./model"

/**
 * Live state of the GitHub and Gmail connections, read from
 * /api/plugins/status when the menu opens. One request serves every composer
 * on the page for a minute; nothing is guessed while it is in flight.
 */

type Snapshot = Record<ConnectorId, ConnectorInfo>
const STALE_MS = 60_000
const LOADING: Snapshot = { github: { state: "loading" }, gmail: { state: "loading" } }
const KNOWN = new Set<ConnectorState>(["connected", "available", "reauthorize", "sign_in", "unavailable"])

let cached: { at: number; value: Snapshot } | null = null
let inflight: Promise<Snapshot> | null = null
const listeners = new Set<(value: Snapshot) => void>()

async function load(): Promise<Snapshot> {
  try {
    const response = await fetch("/api/plugins/status", { cache: "no-store", credentials: "same-origin" })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok || !Array.isArray(data.plugins)) throw new Error("status")
    const value = { ...LOADING }
    for (const id of CONNECTORS) {
      const entry = data.plugins.find((plugin: { id?: string }) => plugin?.id === id)
      const state = KNOWN.has(entry?.state) ? entry.state as ConnectorState : "unavailable"
      value[id] = { state, account: typeof entry?.accountName === "string" ? entry.accountName : null }
    }
    return value
  } catch {
    return { github: { state: "error" }, gmail: { state: "error" } }
  }
}

export function refreshConnectorStatus(force = false) {
  if (!force && cached && Date.now() - cached.at < STALE_MS) return Promise.resolve(cached.value)
  if (!inflight) {
    inflight = load().then((value) => {
      cached = { at: Date.now(), value }
      inflight = null
      listeners.forEach((listener) => listener(value))
      return value
    })
  }
  return inflight
}

/** Reads (and refreshes, when stale) while `active` - normally while the menu is open. */
export function useConnectorStatus(active: boolean): Snapshot {
  const [value, setValue] = useState<Snapshot>(() => cached?.value || LOADING)
  useEffect(() => {
    listeners.add(setValue)
    return () => { listeners.delete(setValue) }
  }, [])
  useEffect(() => {
    if (active) void refreshConnectorStatus()
  }, [active])
  return value
}

/** Remember which connection this tab is sending the person to connect. */
export function rememberPendingConnector(id: ConnectorId) {
  try { window.sessionStorage.setItem(CONNECTOR_PENDING_KEY, id) } catch {}
}

/**
 * Once, on mount: the connection this tab asked for, if the provider has just
 * sent the person back. A successful return switches its mode on.
 */
export function useConnectorReturn(onReturn: (connector: ConnectorId, ok: boolean) => void) {
  useEffect(() => {
    let pending: string | null = null
    try { pending = window.sessionStorage.getItem(CONNECTOR_PENDING_KEY) } catch {}
    const result = readConnectorReturn(window.location.href, pending)
    if (!result) return
    try { window.sessionStorage.removeItem(CONNECTOR_PENDING_KEY) } catch {}
    void refreshConnectorStatus(true)
    onReturn(result.connector, result.ok)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
