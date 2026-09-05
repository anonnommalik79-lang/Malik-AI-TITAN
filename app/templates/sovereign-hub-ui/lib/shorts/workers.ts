import "server-only"

import { timingSafeEqual } from "node:crypto"

function configuredToken() {
  return String(process.env.MALIK_SHORTS_WORKER_TOKEN || "").trim()
}

export function shortsWorkerConfigured() {
  return configuredToken().length >= 32
}

export function isAuthorizedShortsWorker(request: Request) {
  const expected = configuredToken()
  if (expected.length < 32) return false
  const auth = String(request.headers.get("authorization") || "")
  const supplied = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : String(request.headers.get("x-malik-shorts-worker-token") || "").trim()
  if (!supplied || supplied.length !== expected.length) return false
  try { return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) } catch { return false }
}

export function workerName(request: Request) {
  return String(request.headers.get("x-worker-id") || "shorts-worker").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 120) || "shorts-worker"
}
