import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(full) : [full]
})

const security = read("lib/god-mode/security.ts")
const projects = read("lib/god-mode/project-state.ts")
const status = read("app/api/god/status/route.ts")
assert.match(security, /\[REDACTED\]/)
assert.match(projects, /stored\.ownerId !== owner/)
assert.match(status, /entitlement\.plan !== "owner"/)
assert.match(status, /secretsExposed: false/)

const clientFiles = walk(path.join(root, "components"))
  .filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file))
for (const file of clientFiles) {
  const source = fs.readFileSync(file, "utf8")
  assert.doesNotMatch(source, /process\.env\.(?:[A-Z0-9_]*API_KEY|[A-Z0-9_]*SECRET|WORKOS_API_KEY)/, `server secret referenced in client source: ${path.relative(root, file)}`)
}

console.log("✓ GOD MODE secret/isolation checks passed")
