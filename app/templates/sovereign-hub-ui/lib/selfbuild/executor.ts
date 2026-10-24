import "server-only"
import { executorConfiguration } from "@/lib/website/engine/executor"
import { projectFiles, sourceHash } from "@/lib/website/engine/workspace"
import type { ProjectFile } from "@/lib/work/code/files"

export type NodeTestReceipt = {
  sourceHash: string; status: "pass" | "fail" | "not_run"; command?: string
  tests?: number; failures?: number; durationMs?: number; details: string[]
}
const COMMAND = "node --test --test-reporter=tap"
const clean = (value: unknown) => String(value ?? "").slice(0, 700).replace(/(?:sk-[\w-]{20,}|Bearer\s+\S+|postgres(?:ql)?:\/\/\S+)/gi, "[redacted]")

/** Protocol adapter, NOT a local sandbox. No generated code runs in Next.js.
 * The administrator must operate an authenticated isolated worker supporting
 * malik-node-test/1. A URL or a queued job is not proof of execution. */
export async function executeNodeTests(files: ProjectFile[], signal?: AbortSignal): Promise<NodeTestReceipt> {
  const checked = projectFiles(files)
  const hash = sourceHash(checked)
  const missing = (detail: string): NodeTestReceipt => ({ sourceHash: hash, status: "not_run", details: [detail] })
  signal?.throwIfAborted()
  const config = executorConfiguration()
  if (!config) return missing("Изолированный исполнитель node --test не настроен; код не запускался")
  const deadline = AbortSignal.timeout(65_000)
  const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline
  try {
    const response = await fetch(`${config.url}/v1/jobs`, {
      method: "POST", redirect: "error", cache: "no-store", signal: bounded,
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "Idempotency-Key": `selfbuild:${hash}` },
      body: JSON.stringify({ protocol: "malik-node-test/1", sourceHash: hash, files: checked,
        operations: ["node-test"], command: { executable: "node", args: ["--test", "--test-reporter=tap"] },
        policy: { isolationRequired: true, network: [], secrets: false, privileged: false, memoryMb: 128, wallTimeMs: 15_000, maxOutputBytes: 32_000, installScripts: false, dependencies: false, cleanup: true } }),
    })
    if (!response.ok) return missing(`Изолированный исполнитель недоступен (HTTP ${response.status})`)
    const reader = response.body?.getReader()
    if (!reader) return missing("Исполнитель не вернул квитанцию запуска")
    const chunks: Uint8Array[] = []; let size = 0
    try {
      for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength
        if (size > 40_000) { await reader.cancel(); throw new Error("EXECUTOR_OUTPUT_LIMIT") }; chunks.push(item.value) }
    } finally { reader.releaseLock() }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (data.protocol !== "malik-node-test/1" || data.sourceHash !== hash || data.status !== "completed"
      || !["microvm", "container-unprivileged"].includes(data.isolation) || data.network !== "deny-all"
      || data.command !== COMMAND || !Number.isInteger(data.exitCode)
      || !Number.isInteger(data.tests) || data.tests < 1 || data.tests > 10_000
      || !Number.isInteger(data.failures) || data.failures < 0 || data.failures > data.tests
      || !Number.isFinite(data.durationMs) || data.durationMs < 0 || data.durationMs > 60_000
      || !Array.isArray(data.details)) return missing("Нет завершённой квитанции нужного кода/команды/изоляции; запуск не подтверждён")
    return { sourceHash: hash, status: data.exitCode === 0 && data.failures === 0 && !data.skipped && !data.cancelled ? "pass" : "fail",
      command: COMMAND, tests: data.tests, failures: data.failures, durationMs: data.durationMs,
      details: data.details.slice(0, 12).map(clean) }
  } catch (error) {
    signal?.throwIfAborted()
    return missing(error instanceof Error && error.message === "EXECUTOR_OUTPUT_LIMIT" ? "Превышен лимит квитанции исполнителя" : "Исполнитель не подтвердил запуск (сбой/таймаут/неверный ответ)")
  }
}
