/** Optional SEPARATE queue driver. Does not execute generated source and does
 * not deploy anything. Run only after provisioning an isolated executor.
 * Authorization expires after 15 minutes without an authenticated refresh.
 * Browser checkpoint mode works without this process. */
import { setTimeout as sleep } from "node:timers/promises"

const base = new URL(process.env.WEBSITE_APP_ORIGIN || "https://malikaiworld.world")
const token = process.env.WEBSITE_WORKER_TOKEN
if (base.protocol !== "https:" || base.username || base.password || !token || token.length < 32) throw new Error("Worker requires HTTPS origin and a >=32 character token (not command-line arguments).")
let stopping = false
const drain = new AbortController()
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; drain.abort() })
let failures = 0
while (!stopping) {
  try {
    const response = await fetch(new URL("/api/internal/website-worker", base), { method: "POST", headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(65_000) })
    if ([401, 403].includes(response.status)) throw new Error("WORKER_AUTH_REJECTED")
    const data = await response.json()
    if (data.code === "UNATTENDED_NOT_ENABLED") throw new Error("UNATTENDED_NOT_ENABLED")
    failures = response.ok && data.ok ? 0 : failures + 1
    if (failures >= 5) throw new Error("WORKER_CIRCUIT_OPEN")
    if (!data.processed || failures) await sleep(Math.min(30_000, 2000 * 2 ** failures), undefined, { signal: drain.signal }).catch(() => {})
  } catch (error) {
    if (stopping) break
    // No secrets, response source, or provider output in stdout.
    console.error("Website worker stopped:", /AUTH_REJECTED|NOT_ENABLED|CIRCUIT_OPEN/.exec(String(error.message))?.[0] || "NETWORK_FAILURE")
    process.exitCode = 1; break
  }
}
