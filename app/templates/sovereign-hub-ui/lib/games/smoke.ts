import "server-only"
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process"
import { GAME_RUNTIME_JS } from "./runtime-script"
import { SIMULATE_JS, combineRuns, smokePrelude, type SmokeOutcome, type SmokeRun } from "./smoke-harness"
import type { GamePlan } from "./types"

/**
 * Runs a generated game for ten seconds of game time — twice, once without
 * input and once with scripted play — and reports crashes (with game.js
 * line numbers), freezes, frames that draw nothing, NaN coordinates and
 * controls that change nothing.
 *
 * The code is the model's, so it is treated as hostile. It never runs in the
 * web process. It runs in a child Node process that has:
 *   - no environment (no keys, no secrets),
 *   - the permission model on: no file system, no child processes, no workers,
 *   - code generation from strings disabled (eval / new Function / the
 *     constructor-chain escape all fail), in the process and in the sandbox,
 *   - a vm context with a null-prototype global and no host objects in it,
 *   - a memory cap, a vm timeout and a hard kill after a few seconds,
 *   - its output read up to a fixed size.
 * One run at a time; a second request waits briefly or is reported as not run.
 * MALIK_GAME_SMOKE=off turns it off.
 */

const CHILD = String.raw`"use strict";
const vm = require("node:vm");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; if (input.length > 4000000) process.exit(3); });
process.stdin.on("end", () => {
  const out = (value) => { try { process.stdout.write(JSON.stringify(value).slice(0, 60000)); } catch (e) { process.stdout.write('{"ok":false,"stage":"output"}'); } };
  const message = (e) => { try { return { error: String(e && e.message || e).slice(0, 400), stack: String(e && e.stack || "").slice(0, 1200) }; } catch (x) { return { error: "error" }; } };
  let data;
  try { data = JSON.parse(input); } catch (e) { out({ ok: false, stage: "input" }); return; }
  const runs = {};
  for (const mode of ["idle", "active"]) {
    // A fresh sandbox per run: nothing the game kept from the first run leaks into the second.
    const context = vm.createContext(Object.create(null), { name: "malik-game-smoke-" + mode, codeGeneration: { strings: false, wasm: false } });
    const run = (code, filename, timeout) => new vm.Script(code, { filename }).runInContext(context, { timeout, breakOnSigint: false });
    try { run(data.preludes[mode], "prelude.js", 800); run(data.runtime, "runtime.js", 1500); }
    catch (e) { out(Object.assign({ ok: false, stage: "runtime" }, message(e))); return; }
    try { run(data.logic, "game.js", 1500); }
    catch (e) { out(Object.assign({ ok: false, stage: "load" }, message(e))); return; }
    let result;
    try { result = JSON.parse(String(run(data.simulate, "simulate.js", data.budgetMs))); }
    catch (e) { out(Object.assign({ ok: false, stage: "simulate" }, message(e))); return; }
    if (result.ok === false) { out(result); return; }
    runs[mode] = result;
    if (result.run.error) break;
  }
  out({ ok: true, partial: true, baseline: runs.idle.baseline, idle: runs.idle.run, active: runs.active ? runs.active.run : null });
});
`

/** The child gets no environment at all: no keys, no tokens, no paths. */
const NO_ENV = {} as NodeJS.ProcessEnv

let permissionFlag: string | null | undefined
function permissionFlagFor() {
  if (permissionFlag !== undefined) return permissionFlag
  permissionFlag = null
  for (const flag of ["--permission", "--experimental-permission"]) {
    try {
      const probe = spawnSync(process.execPath, [flag, "-e", "0"], { env: NO_ENV, timeout: 8000, windowsHide: true, stdio: "ignore" })
      if (probe.status === 0) { permissionFlag = flag; break }
    } catch { /* try the next spelling */ }
  }
  if (!permissionFlag) console.warn("[MALIK_GAME_SMOKE] this Node has no permission model; the run keeps its other limits")
  return permissionFlag
}

let busy: Promise<unknown> | null = null

export function smokeEnabled() {
  return !/^(?:0|off|false|no)$/iu.test(String(process.env.MALIK_GAME_SMOKE || ""))
}

export async function smokeRunGame(plan: GamePlan, logic: string, options: { budgetMs?: number; signal?: AbortSignal } = {}): Promise<SmokeOutcome> {
  if (!smokeEnabled()) return { ok: false, stage: "disabled", notRun: true }
  // One run at a time on a small server; a queued request waits a little, then is reported as not run.
  for (let waited = 0; busy; waited += 250) {
    if (waited >= 6000) return { ok: false, stage: "busy", notRun: true }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const job = runChild(plan, logic, Math.max(500, Math.min(options.budgetMs || 3500, 6000)), options.signal)
  busy = job
  try { return await job } finally { busy = null }
}

function runChild(plan: GamePlan, logic: string, budgetMs: number, signal?: AbortSignal): Promise<SmokeOutcome> {
  return new Promise((resolve) => {
    const flags = [permissionFlagFor(), "--disallow-code-generation-from-strings", "--max-old-space-size=128", "--max-semi-space-size=16"].filter(Boolean) as string[]
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(process.execPath, [...flags, "-e", CHILD], { env: NO_ENV, stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    } catch {
      resolve({ ok: false, stage: "spawn", notRun: true })
      return
    }
    let stdout = ""
    let settled = false
    const finish = (value: SmokeOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      try { child.kill("SIGKILL") } catch { /* already gone */ }
      resolve(value)
    }
    const abort = () => finish({ ok: false, stage: "cancelled", notRun: true })
    const timer = setTimeout(() => finish({ ok: false, stage: "timeout", error: "the game did not finish its test run in time (an endless loop or very heavy frames)" }), budgetMs * 2 + 5000)
    signal?.addEventListener("abort", abort, { once: true })
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => { stdout += chunk; if (stdout.length > 64_000) finish({ ok: false, stage: "output", error: "test output too large" }) })
    child.stderr.on("data", () => { /* the child's own warnings are not the game's result */ })
    child.on("error", () => finish({ ok: false, stage: "spawn", notRun: true }))
    child.on("close", (code: number | null) => {
      if (settled) return
      try {
        const parsed = JSON.parse(stdout) as SmokeOutcome & { partial?: boolean; baseline?: number; idle?: SmokeRun; active?: SmokeRun | null }
        finish(parsed.partial && parsed.idle ? combineRuns(parsed.baseline || 0, parsed.idle, parsed.active || null) : parsed)
      }
      catch { finish({ ok: false, stage: "crash", error: code === 134 || code === null ? "the game ran out of memory in the test run" : `the test process stopped (${code})` }) }
    })
    child.stdin.on("error", () => { /* the child may exit before reading everything */ })
    child.stdin.end(JSON.stringify({ preludes: { idle: smokePrelude(plan, "idle"), active: smokePrelude(plan, "active") }, runtime: GAME_RUNTIME_JS, logic, simulate: SIMULATE_JS, budgetMs }))
  })
}
