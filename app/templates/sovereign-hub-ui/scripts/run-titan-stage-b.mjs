// Runs scripts/verify-titan-stage-b.mjs with the stand-ins it needs, without
// POSIX-only environment syntax (works the same on Windows).
import { spawnSync } from "node:child_process"

const stubs = {
  "server-only": "./scripts/stubs/server-only.mjs",
  "next/server": "./scripts/stubs/next-server.mjs",
  "../route": "./scripts/stubs/fake-stream-post.mjs",
  "@/lib/server/request-entitlement": "./scripts/stubs/switchable-entitlement.mjs",
  "./private-json-store": "./scripts/stubs/memory-private-json-store.mjs",
}
const result = spawnSync(process.execPath, ["--experimental-transform-types", "--no-warnings", "--import", "./scripts/ts-resolve.mjs", "scripts/verify-titan-stage-b.mjs"], {
  stdio: "inherit",
  env: { ...process.env, TS_RESOLVE_STUBS: JSON.stringify(stubs) },
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
