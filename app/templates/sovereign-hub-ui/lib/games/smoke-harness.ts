import type { GamePlan } from "./types"

/**
 * The scripts the isolated test run executes inside its sandbox (see
 * smoke.ts). Plain strings, no server imports: the tests run the very same
 * harness in-process on the fixtures.
 */

export type SmokeRun = {
  frames: number
  /** Canvas calls per frame, and the part of them the game itself made (the backdrop subtracted). */
  opsPerFrame: number
  gameOpsPerFrame: number
  nan: number
  lowFrames: number
  sig: number
  score: number
  level: number
  state: string
  ended?: string
  error?: { message: string; where?: string; line?: number } | null
}

export type SmokeOutcome = {
  ok: boolean
  stage?: string
  /** The run did not happen (turned off, busy, cancelled) — not a verdict on the game. */
  notRun?: boolean
  error?: string
  stack?: string
  baselineOps?: number
  idle?: SmokeRun
  active?: SmokeRun
  /** Scripted play changed what was drawn or scored compared with no input. */
  reacts?: boolean
}

export const SMOKE_FRAMES = 600

/**
 * Globals the runtime and the game expect, with a seeded Math.random so both
 * runs see the same world. Each run gets a fresh sandbox: state a game keeps
 * outside start() must not leak from the run without input into the one with.
 */
export function smokePrelude(plan: GamePlan, mode: "idle" | "active") {
  return [
    "var window = this; var self = this;",
    `var __MODE = ${JSON.stringify(mode)};`,
    `var MalikGame = { plan: ${JSON.stringify(plan).replace(/</gu, "\\u003c")} };`,
    "var console = { log: function () {}, info: function () {}, warn: function () {}, error: function () {}, debug: function () {} };",
    "var __seed = (function () { var s = 1; Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; return function (n) { s = (n >>> 0) || 1; }; })();",
  ].join("\n")
}

export const SIMULATE_JS = String.raw`(function () {
  var M = window.MalikGame;
  var game = M && M.definition;
  if (!game) return JSON.stringify({ ok: false, stage: "contract", error: "MalikGame.define(...) was not called (or game.js stopped before it)" });
  var FRAMES = ${SMOKE_FRAMES};
  var DRAW = { fillRect: 1, strokeRect: 1, clearRect: 1, fillText: 1, strokeText: 1, arc: 1, arcTo: 1, ellipse: 1, rect: 1, roundRect: 1, moveTo: 1, lineTo: 1, bezierCurveTo: 1, quadraticCurveTo: 1, beginPath: 1, closePath: 1, fill: 1, stroke: 1, clip: 1, save: 1, restore: 1, translate: 1, rotate: 1, scale: 1, setTransform: 1, transform: 1, resetTransform: 1, drawImage: 1, putImageData: 1, setLineDash: 1 };
  var gradient = { addColorStop: function () {} };
  var HELPERS = {
    createLinearGradient: function () { return gradient; },
    createRadialGradient: function () { return gradient; },
    createConicGradient: function () { return gradient; },
    createPattern: function () { return {}; },
    measureText: function (t) { var n = String(t).length * 10; return { width: n, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: n }; },
    getImageData: function (x, y, w, h) { var n = Math.max(4, Math.min(65536, Math.abs((w | 0) * (h | 0) * 4))); return { data: new Uint8ClampedArray(n), width: w, height: h }; },
    createImageData: function (w, h) { var n = Math.max(4, Math.min(65536, Math.abs((w | 0) * (h | 0) * 4))); return { data: new Uint8ClampedArray(n), width: w, height: h }; },
    isPointInPath: function () { return false; },
    isPointInStroke: function () { return false; },
    getTransform: function () { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    getLineDash: function () { return []; }
  };
  function recorder(stats, W, H) {
    var state = { canvas: { width: W, height: H }, globalAlpha: 1, lineWidth: 1 };
    function num(v) {
      if (typeof v === "number") { if (v !== v || v === Infinity || v === -Infinity) { stats.nan++; return 7; } return Math.round(v); }
      return typeof v === "string" ? v.length : 0;
    }
    return new Proxy(state, {
      get: function (target, key) {
        if (typeof key !== "string") return target[key];
        if (HELPERS[key]) return function () { stats.ops++; return HELPERS[key].apply(null, arguments); };
        if (DRAW[key]) return function () { stats.ops++; var h = stats.sig; h = (h * 31 + key.length) | 0; for (var i = 0; i < arguments.length; i++) h = (h * 31 + num(arguments[i])) | 0; stats.sig = h; };
        return target[key];
      },
      set: function (target, key, value) { target[key] = value; return true; }
    });
  }
  function play(i, core) {
    var phase = Math.floor(i / 30) % 6, W = core.W, H = core.H;
    core.input.key("left", phase === 0 || phase === 4);
    core.input.key("right", phase === 1 || phase === 5);
    core.input.key("up", phase === 2);
    core.input.key("down", phase === 3);
    core.input.key("action", i % 20 < 3);
    core.input.key("action2", i % 90 > 44 && i % 90 < 48);
    core.input.joystick(phase === 0 ? -1 : phase === 1 ? 1 : 0, phase === 2 ? -1 : phase === 3 ? 1 : 0);
    core.input.raw("Digit" + (1 + Math.floor(i / 120) % 3), i % 120 < 2);
    var px = W * (0.15 + 0.7 * ((i * 37) % 100) / 100), py = H * (0.2 + 0.6 * ((i * 53) % 100) / 100);
    core.input.pointer(px, py, i % 15 < 2);
  }
  function failure(core) {
    var e = core.error;
    if (!e) return null;
    var m = /game\.js:(\d+):(\d+)/.exec(e.stack || "");
    return { message: e.message, where: e.where, line: m ? Number(m[1]) : 0 };
  }
  var baseline = (function () {
    __seed(7);
    var stats = { ops: 0, sig: 0, nan: 0 };
    var core = M.createCore({ plan: M.plan, game: {} });
    core.render(recorder(stats, core.W, core.H));
    return stats.ops;
  })();
  function sim(active) {
    __seed(42);
    var stats = { ops: 0, sig: 0, nan: 0 };
    var core = M.createCore({ plan: M.plan, game: game, best: 0 });
    var ctx = recorder(stats, core.W, core.H);
    var run = { frames: 0, lowFrames: 0, nan: 0, sig: 0, opsPerFrame: 0, gameOpsPerFrame: 0, score: 0, level: 1, state: "", ended: undefined, error: null };
    core.setup();
    if (!core.error) core.play();
    for (var i = 0; i < FRAMES && !core.error; i++) {
      if (active) play(i, core);
      var before = stats.ops;
      core.step(1 / 60);
      if (core.error) break;
      core.render(ctx);
      if (core.error) break;
      run.frames++;
      if (stats.ops - before - baseline < 3) run.lowFrames++;
      var st = core.api.state;
      if (st === "over" || st === "won") { run.ended = st; break; }
    }
    run.error = failure(core);
    run.nan = stats.nan; run.sig = stats.sig;
    run.opsPerFrame = run.frames ? Math.round(stats.ops / run.frames) : 0;
    run.gameOpsPerFrame = Math.max(0, run.opsPerFrame - baseline);
    run.score = core.api.score; run.level = core.api.level; run.state = core.api.state;
    return run;
  }
  return JSON.stringify({ baseline: baseline, run: sim(__MODE === "active") });
})()`

/** The two runs (each from its own sandbox) put together into one verdict. */
export function combineRuns(baseline: number, idle: SmokeRun, active: SmokeRun | null): SmokeOutcome {
  return {
    ok: !idle.error && !(active && active.error),
    baselineOps: baseline,
    idle,
    active: active || undefined,
    reacts: !!active && (active.sig !== idle.sig || active.score !== idle.score || active.level !== idle.level),
  }
}

/** Problems worth sending back to the model, from a finished run. */
export function smokeProblems(outcome: SmokeOutcome): string[] {
  if (outcome.notRun) return []
  const problems: string[] = []
  if (!outcome.ok && outcome.stage && outcome.stage !== "simulate" && !outcome.idle) {
    const line = /game\.js:(\d+)/u.exec(outcome.stack || "")?.[1]
    if (outcome.stage === "load") problems.push(`game.js${line ? `:${line}` : ""} throws while loading: ${outcome.error}`)
    else if (outcome.stage === "contract") problems.push(String(outcome.error))
    else if (outcome.stage === "timeout" || /timed out/iu.test(outcome.error || "")) problems.push("the game froze in its test run: look for an endless while/for loop or work that grows every frame")
    else if (outcome.error) problems.push(`the test run failed: ${outcome.error}`)
    return problems
  }
  if (outcome.stage === "simulate" && /timed out/iu.test(outcome.error || "")) problems.push("the game froze or is far too slow in its test run: look for an endless loop or work that grows every frame")
  for (const [label, run] of [["without input", outcome.idle], ["while playing", outcome.active]] as const) {
    if (!run) continue
    if (run.error) problems.push(`game.js${run.error.line ? `:${run.error.line}` : ""} crashes in ${run.error.where || "the game"}() ${label} after ${run.frames} frames: ${run.error.message}`)
  }
  const idle = outcome.idle
  const active = outcome.active
  if (idle && !idle.error && active && !active.error) {
    if (!outcome.reacts) problems.push("the controls change nothing: with arrows/WASD, Space, Shift, digits and mouse/touch taps the game plays exactly as with no input — read api.key/api.pressed/api.axis/api.pointer in update()")
    const ran = Math.max(1, active.frames)
    if (active.gameOpsPerFrame < 3 && active.lowFrames > ran * 0.8) problems.push("draw() puts almost nothing on the screen — draw the world, the player and the objects every frame")
    if (active.nan > 20 || idle.nan > 20) problems.push(`drawing receives NaN coordinates (${Math.max(active.nan, idle.nan)} times) — some value is undefined in the math (check dt, sizes, positions)`)
    if (idle.ended && idle.frames < 30) problems.push(`the run ends by itself after ${idle.frames} frames without any input — give the player time to start`)
  }
  return problems
}
