import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { assessBusinessLaunch } from "../lib/business/launch-readiness.ts"

const input = (override = {}) => ({
  completedAgents: 0, hasStandaloneHtml: false, projectFiles: 0,
  qaPassed: false, syntaxChecked: false, deploymentUrl: "", deploymentState: "", ...override,
})
assert.equal(assessBusinessLaunch(input()).score, 0)
assert.equal(assessBusinessLaunch(input({ completedAgents: 8 })).score, 20)
assert.equal(assessBusinessLaunch(input({ completedAgents: 8, hasStandaloneHtml: true })).score, 45)
const prepared = input({ completedAgents: 8, hasStandaloneHtml: true, projectFiles: 9, qaPassed: true, syntaxChecked: true })
assert.equal(assessBusinessLaunch(prepared).score, 70)
assert.equal(assessBusinessLaunch(input({ ...prepared, deploymentUrl: "https://demo.vercel.app", deploymentState: "BUILDING" })).score, 70)
const failed = assessBusinessLaunch(input({ ...prepared, deploymentUrl: "https://demo.vercel.app", deploymentState: "ERROR" }))
assert.equal(failed.score, 70)
assert.equal(failed.milestones[3].blocked, true)
assert.equal(assessBusinessLaunch(input({ ...prepared, syntaxChecked: false })).score, 45)
assert.equal(assessBusinessLaunch(input({ ...prepared, deploymentState: "READY" })).score, 70)
const ready = assessBusinessLaunch(input({ ...prepared, deploymentUrl: "https://demo.vercel.app", deploymentState: "READY" }))
assert.equal(ready.score, 100)
assert.equal(ready.technicallyDelivered, true)
assert.equal(ready.requiresManualBusinessVerification, true)
assert.ok(ready.externalChecks.length >= 4)
const ui = readFileSync(new URL("../components/sovereign/business/CompanyLaunchPad.tsx", import.meta.url), "utf8")
assert.match(ui, /assessBusinessLaunch/)
assert.match(ui, /Паспорт запуска/)
assert.match(ui, /sandbox="allow-scripts allow-forms"/)
assert.doesNotMatch(ui, /URL\.createObjectURL\(new Blob\(\[html\]/)
assert.doesNotMatch(ui, /saveToSites\(/)
assert.match(ui, /launch-readiness\.md/)
console.log("Business Readiness OS: all milestone and UI security checks PASS")
