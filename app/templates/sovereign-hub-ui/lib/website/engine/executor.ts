import "server-only"
import type { WebsiteJob } from "./types"
import { sourceHash } from "./workspace"

/** Transport contract only. A configured URL is NOT evidence that an isolated
 * executor is deployed; only a matching result with check receipts is used. */
export type ExecutionReceipt = {
  id: string; sourceHash: string; status: "queued" | "running" | "completed" | "failed"
  isolation: "microvm" | "container-unprivileged"
  dependencies: { passed: boolean; details: string[] }
  build: { passed: boolean; details: string[] }
  browser: { passed: boolean; details: string[] }
  previewUrl?: string
}
function configuration() {
  const raw = process.env.WEBSITE_EXECUTOR_URL
  const token = process.env.WEBSITE_EXECUTOR_TOKEN
  if (!raw || !token || token.length < 32) return null
  const url = new URL(raw)
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("UNSAFE_EXECUTOR_CONFIGURATION")
  return { url: url.href.replace(/\/$/, ""), token }
}
export const executorConfigured = () => Boolean(configuration())
export async function executeProject(job: WebsiteJob, signal: AbortSignal): Promise<ExecutionReceipt | null> {
  const config = configuration()
  if (!config) return null
  const hash = sourceHash(job.files)
  const idempotencyKey = `${job.id}:${hash}`
  const response = await fetch(`${config.url}/v1/jobs${job.execution ? `/${encodeURIComponent(job.execution.id)}` : ""}`, {
    method: job.execution ? "GET" : "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    ...(job.execution ? {} : { body: JSON.stringify({ projectId: job.id, sourceHash: hash, workspaceRoot: job.workspaceRoot, files: job.files,
      operations: ["dependencies", "typecheck", "build", "browser"], policy: { cpu: 2, memoryMb: 1024, wallTimeMs: 60_000, maxOutputBytes: 32_000, installScripts: false, network: ["registry.npmjs.org"], secrets: false, privileged: false } }) }),
    redirect: "error", signal, cache: "no-store",
  })
  if (!response.ok) throw new Error("EXECUTOR_UNAVAILABLE")
  // Read a bounded stream; executor output must not exhaust the web host.
  const reader = response.body?.getReader()
  if (!reader) throw new Error("INVALID_EXECUTOR_RECEIPT")
  const chunks: Uint8Array[] = []; let bytes = 0
  try {
    for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 64_000) { await reader.cancel(); throw new Error("EXECUTOR_OUTPUT_LIMIT") }; chunks.push(item.value) }
  } finally { reader.releaseLock() }
  const receipt = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ExecutionReceipt
  if (!receipt || receipt.sourceHash !== hash || !/^[\w-]{1,100}$/.test(receipt.id) || !["microvm", "container-unprivileged"].includes(receipt.isolation) || !["queued", "running", "completed", "failed"].includes(receipt.status)) throw new Error("INVALID_EXECUTOR_RECEIPT")
  for (const key of ["dependencies", "build", "browser"] as const) {
    const check = receipt[key]
    if (receipt.status === "completed" || receipt.status === "failed") {
      if (!check || typeof check.passed !== "boolean" || !Array.isArray(check.details)) throw new Error("INVALID_EXECUTOR_CHECK")
      check.details = check.details.slice(0, 20).map(d => String(d).slice(0, 600).replace(/(?:sk-[\w-]{20,}|Bearer\s+\S+|postgres(?:ql)?:\/\/\S+)/gi, "[redacted]"))
    }
  }
  if (receipt.previewUrl) {
    const url = new URL(receipt.previewUrl)
    const origin = process.env.WEBSITE_PREVIEW_ORIGIN
    const appOrigins = ["https://malikaiworld.world", "https://www.malikaiworld.world", process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL].filter(Boolean).map(value => { try { return new URL(value!).origin } catch { return "" } })
    if (!origin || url.protocol !== "https:" || url.origin !== new URL(origin).origin || appOrigins.includes(url.origin) || url.username || url.password) throw new Error("UNSAFE_EXECUTOR_PREVIEW")
  }
  return receipt
}
