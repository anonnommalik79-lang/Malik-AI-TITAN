// Pass the existing auth fixture without POSIX-only shell environment syntax.
import { spawnSync } from "node:child_process"
const result = spawnSync(process.execPath, ["--experimental-transform-types", "--no-warnings", "--import", "./scripts/ts-resolve.mjs", "scripts/verify-malik-max.mjs"], {
  stdio: "inherit",
  env: { ...process.env, TS_RESOLVE_STUBS: JSON.stringify({ "@/lib/server/request-entitlement": "./scripts/stubs/request-entitlement.mjs" }) },
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
