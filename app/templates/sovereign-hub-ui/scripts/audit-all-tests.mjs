// Runs every leaf test:* script of the app on its own, with a time limit, and
// records pass/fail, so one broken test never hides the others. Live
// (network / model), browser and composite scripts are skipped.
//   node scripts/audit-all-tests.mjs
//   MALIK_AUDIT_OUT   folder for tests.json (default: audit-results)
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = path.resolve(app, process.env.MALIK_AUDIT_OUT || "audit-results")
fs.mkdirSync(out, { recursive: true })
const scripts = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8")).scripts
const skip = /live|browser|-ui$|:ui|playwright|full-system|release-core|reliability$|^test:os$|^test:voice$|models:live|youtube/i
const names = Object.keys(scripts).filter((name) => name.startsWith("test:") && !skip.test(name) && !/^npm run|&& npm run/.test(scripts[name]))

const run = (name) => new Promise((resolve) => {
  const started = Date.now()
  const child = spawn("npm", ["run", "-s", name], { cwd: app, shell: true, env: process.env })
  let tail = ""
  const keep = (chunk) => { tail = (tail + chunk).slice(-4000) }
  child.stdout.on("data", keep)
  child.stderr.on("data", keep)
  const timer = setTimeout(() => { child.kill("SIGKILL"); tail += "\n[timeout after 240 s]" }, 240_000)
  child.on("close", (code) => { clearTimeout(timer); resolve({ name, code, ms: Date.now() - started, tail: tail.slice(-1500) }) })
})

const results = []
for (const name of names) {
  const result = await run(name)
  results.push(result)
  console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${name} (${Math.round(result.ms / 1000)} s)`)
  fs.writeFileSync(path.join(out, "tests.json"), JSON.stringify(results, null, 1))
}
const failed = results.filter((result) => result.code !== 0)
console.log(`\n${failed.length} failed of ${results.length}`)
process.exit(failed.length ? 1 : 0)
