// Keep every existing regression check; a failed group must not hide later results.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
const output = process.env.MALIK_QA_OUTPUT
if (!output) throw Error("Set MALIK_QA_OUTPUT to an isolated QA directory")
fs.mkdirSync(output, { recursive: true })
const cases = [
  ...pkg.scripts["test:release-core"].split(" && ").map(command => ({ command })),
  ...["os", "mobile-send", "chat-v7", "work-mode", "brain"].map(name => ({ command: `npm run test:${name}` })),
  ...["background-ownership", "work-export", "work-orchestrator", "work-journal", "work-skills", "work-github", "work-math-plan"].map(name => ({ file: `scripts/verify-${name}.mjs` })),
]
const results = []
for (const item of cases) {
  const name = item.command || item.file
  const started = Date.now()
  const run = item.command
    ? spawnSync(item.command, { shell: true, encoding: "utf8", timeout: 180000, env: process.env })
    : spawnSync(process.execPath, [item.file], { encoding: "utf8", timeout: 180000, env: process.env })
  const text = (run.stdout || "") + (run.stderr || "") + (run.error ? `\n${run.error.message}` : "")
  const filename = name.replace(/[^a-zA-Z0-9_-]/g, "_") + ".log"
  fs.writeFileSync(path.join(output, filename), text)
  const result = { name, exit: run.status, signal: run.signal, durationMs: Date.now() - started, log: filename, passed: run.status === 0, summaries: text.split(/\r?\n/).filter(line => /\d+\/\d+|\bpassed\b|\bfailed\b|\bverified\b|\bVerified\b|AssertionError|Error:/.test(line)).slice(-8) }
  results.push(result)
  console.log(`${result.passed ? "PASS" : "FAIL"} ${name}: ${result.summaries.join(" | ") || `exit ${run.status}`}`)
  fs.writeFileSync(path.join(output, "release-results.json"), JSON.stringify(results, null, 2))
}
console.log(`${results.filter(r => r.passed).length}/${results.length} regression commands passed; detailed logs in ${output}`)
process.exitCode = results.every(r => r.passed) ? 0 : 1
