// Source-level UI freeze. Browser component fixtures remain a separate check.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

const base = process.env.MALIK_WORK_UI_BASE || "a1ada98317662b3d7de39ffb08d15ac6a05ed54c"
assert.match(base, /^[a-f\d]{40}$/i, "Use the inspected base commit SHA")
const git = args => execFileSync("git", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }).trim()
const root = git(["rev-parse", "--show-toplevel"])
const diff = git(["-C", root, "diff", "--name-only", base, "--"]).split(/\r?\n/)
const added = git(["-C", root, "ls-files", "--others", "--exclude-standard"]).split(/\r?\n/)
const changed = [...new Set([...diff, ...added].filter(Boolean))]
const visual = file => /\.(?:tsx|jsx|css|scss|sass|svg|png|webp|jpg|jpeg|gif|ico)$/i.test(file)
  || /(?:^|\/)(?:public|assets|components)\//.test(file)
assert.deepEqual(changed.filter(visual), [], "Existing UI, CSS, navigation and assets must not change")
assert.deepEqual(changed.filter(file => /(?:^|\/)(?:render\.yaml|next\.config\.[cm]?[jt]s)$/.test(file)), [], "Hosting/build configuration must not change")
console.log(`PASS UI freeze: no visual source/assets or hosting-config changes against ${base}; ${changed.length} backend/test/docs files inspected. Browser and physical-device checks are separate.`)
