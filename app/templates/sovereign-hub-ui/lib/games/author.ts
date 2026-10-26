import { createContinuationFilter } from "@/lib/ai/continuation-overlap"
import type { GamePlan } from "./types"

/**
 * What the programmer model is told, and how its reply becomes one file.
 *
 * The reply carries an explicit end marker. A reply cut by the provider's
 * length limit is therefore *known* to be cut — no guessing from code fences —
 * and is continued from its last lines until the marker arrives.
 */

export const LOGIC_START = "<<<FILE:game.js>>>"
export const LOGIC_END = "<<<END_FILE>>>"

/** The runtime's API in the words the model reads. Every name here exists in runtime-script.ts. */
export const GAME_API_REFERENCE = `
MALIK GAME RUNTIME — the page, loop, menus, HUD, pause, restart, sound, touch controls and scaling already exist.
You write ONLY the game: one call

MalikGame.define({
  setup(api) {},            // once, before the first run: build constant data (sprites, level maps)
  start(api, level) {},     // build the world for this level (1, 2, 3...). Score and lives are kept by the runtime.
  update(dt, api) {},       // dt in seconds (≤ 0.05). Move everything with dt.
  draw(ctx, api) {},        // CanvasRenderingContext2D in logical pixels api.W × api.H. The backdrop is already painted.
})

STATE: api.W, api.H, api.time (s since run start), api.frame, api.score, api.lives, api.level, api.levels (0 = endless), api.data {} (free).
FLOW: api.addScore(n, x?, y?) (floating "+n" when x,y given) · api.setScore(n) · api.loseLife() (sound, shake, ends the run at 0; returns lives left) · api.addLife() · api.setLives(n) · api.nextLevel() (calls start(api, level+1), or wins after the last level) · api.win(msg?) · api.gameOver(msg?) · api.setStatus("Волна 3/10") (HUD line).
INPUT: api.key(name) held · api.pressed(name) this frame only. Names: "left","right","up","down" (arrows/WASD/joystick), "action" (Space/J/Z/Enter/touch button 1), "action2" (Shift/K/X/touch button 2).
  api.axis() → {x,y} in -1..1 (keys + touch joystick). api.rawKey("Digit1") / api.rawPressed("KeyE") for other keys.
  api.pointer {x,y} screen-logical, {wx,wy} world (camera applied), .down, .pressed, .released (mouse and touch).
CAMERA: api.camera = {x, y, zoom} — set it each frame to scroll; draw() works in world coordinates. api.screen(ctx => …) draws in fixed screen space.
FEEL: api.sfx(name): "shoot","laser","hit","explode","coin","pickup","jump","power","hurt","win","lose","click","select","bounce","step","engine".
  api.particles(x, y, {count, color (string or array), speed, life, size, gravity, angle, spread, square}) · api.shake(power, seconds) · api.flash(color, seconds) · api.floatText(text, x, y, color?, size?).
DRAW HELPERS (use ctx directly too): api.draw.rect(x,y,w,h,color) · .roundRect(x,y,w,h,r,fill,stroke?,width?) · .circle(x,y,r,color) · .ring(x,y,r,color,width) · .line(x1,y1,x2,y2,color,width) · .poly([x0,y0,x1,y1,...] or [{x,y}], fill, stroke?, width?) · .text(str,x,y,{size,color,align,baseline,weight,shadow,stroke}) · .glow(color,blur) / .noGlow() · .gradient(x,y,w,h,c1,c2,horizontal?) · .radial(x,y,r,inner,outer?) · .pixels(["..##..",".#..#."], {"#":"#fff"}, x, y, scale, flip?) · .star(x,y,outer,inner,points,color) · .bar(x,y,w,h,0..1,color,back?).
MATH: api.rand(a,b) · api.randi(a,b) · api.pick(list) · api.chance(p) · api.clamp · api.lerp · api.approach(v,target,step) · api.dist(ax,ay,bx,by) · api.angle(ax,ay,bx,by) · api.wrap(v,a,b) · api.overlap(a,b) (boxes {x,y,w,h}, x,y = top-left) · api.circle(a,b) (circles {x,y,r}) · api.inside(px,py,box) · api.rgba(hex, alpha) · api.mix(hex1, hex2, t).
PSEUDO-3D: api.project(x, y, z, {x, y, z, fov, horizon}) → {x, y, scale} or null when behind the camera.
COLORS: api.colors = {bg,bg2,fg,muted,accent,accent2,danger,good} (the theme palette). api.font(size, weight) → canvas font string in the theme font.
`.trim()

const EXAMPLE = `
${LOGIC_START}
// Tiny example of the contract (your game must be far richer).
const S = { player: null, coins: [] };
MalikGame.define({
  start(api, level) {
    S.player = { x: api.W / 2, y: api.H - 60, r: 16, speed: 320 };
    S.coins = Array.from({ length: 4 + level * 2 }, () => ({ x: api.rand(30, api.W - 30), y: api.rand(-api.H, 0), r: 10, vy: api.rand(80, 140) + level * 20 }));
    api.setStatus("Монет: " + S.coins.length);
  },
  update(dt, api) {
    const p = S.player, ax = api.axis();
    p.x = api.clamp(p.x + ax.x * p.speed * dt, p.r, api.W - p.r);
    for (const c of S.coins) {
      c.y += c.vy * dt;
      if (api.circle(p, c)) { c.dead = true; api.addScore(10, c.x, c.y); api.sfx("coin"); api.particles(c.x, c.y, { color: api.colors.accent }); }
      else if (c.y > api.H + 20) { c.dead = true; api.loseLife(); }
    }
    S.coins = S.coins.filter((c) => !c.dead);
    api.setStatus("Монет: " + S.coins.length);
    if (!S.coins.length) api.nextLevel();
  },
  draw(ctx, api) {
    for (const c of S.coins) { api.draw.glow(api.colors.accent, 14); api.draw.circle(c.x, c.y, c.r, api.colors.accent); }
    api.draw.noGlow();
    api.draw.roundRect(S.player.x - 22, S.player.y - 12, 44, 24, 10, api.colors.accent2);
  },
});
${LOGIC_END}`.trim()

export const GAME_AUTHOR_SYSTEM = [
  "You are the senior gameplay programmer of Malik Game Studio. Write the complete, polished, PLAYABLE game logic for the design you are given, for the Malik runtime described below.",
  "",
  GAME_API_REFERENCE,
  "",
  "HARD RULES:",
  `- Reply with exactly one file: a line ${LOGIC_START}, then the JavaScript, then a line ${LOGIC_END}. No Markdown fences, no prose before or after.`,
  "- Plain modern JavaScript (ES2020). No import/export, no require, no external files, images, fonts or URLs. Draw everything procedurally on the canvas: gradients, shapes, glow, pixel sprites via api.draw.pixels.",
  "- Never use fetch, XMLHttpRequest, WebSocket, eval, new Function, setTimeout, setInterval, requestAnimationFrame, localStorage, document, window, parent, top, globalThis, constructor, __proto__, Proxy or Reflect. Timers: count with dt in update(). Persistence: the runtime keeps the best score.",
  "- Keep all mutable game state in one top-level object (e.g. const S = {...}) and rebuild it in start(api, level). Do not reset api.score or api.lives yourself.",
  "- Every function you call must exist. No TODO, no placeholders, no 'rest omitted'. Finish the whole file — at most about 650 lines, so it always fits.",
  "- Bound every array (remove dead or off-screen objects; cap counts). Use dt for all motion and timers. Guard against NaN.",
  "",
  "QUALITY BAR (this is what makes it feel like a real game):",
  "- The exact theme the user asked for: characters, setting, enemies and names must match it, not a generic stand-in.",
  "- A clear core loop with rising difficulty across levels (speed, counts, new enemy types, patterns); win after the last level (api.nextLevel handles it) or endless with escalating waves when levels is 0.",
  "- Juice: api.sfx on every meaningful event, particles on hits and pickups, api.shake on damage/explosions, floating score text, brief invulnerability blink after losing a life, smooth acceleration.",
  "- Variety: at least three distinct enemy or obstacle behaviours introduced across the levels, one pickup or power-up that changes how the player plays for a while, and a climax on the last level (a boss with a visible health bar, a final wave or a timed finale).",
  "- Feel: a combo or streak multiplier shown with api.floatText, api.flash on level transitions and big hits, and anticipation before danger (a telegraph flash or wind-up before an enemy attacks).",
  "- Art: distinctive silhouettes with layered shapes and highlights, the theme palette (api.colors) with glow for important objects, readable contrast, subtle animation (bobbing, rotation, trails). No plain single rectangles for the hero.",
  "- Controls exactly as in the design's controls list; for pointer games use api.pointer; touch players have api.axis() from the joystick and action buttons.",
  "- An in-world HUD only for game-specific info (boss health bar, ammo, timer) — score, lives and level are already shown by the runtime.",
  "",
  "FORMAT EXAMPLE (shape only):",
  EXAMPLE,
].join("\n")

export function gameAuthorPrompt(request: string, plan: GamePlan) {
  return [
    `USER REQUEST:\n${String(request || "").slice(0, 6000)}`,
    "",
    `GAME DESIGN (JSON):\n${JSON.stringify({ title: plan.title, genre: plan.genre, input: plan.input, size: `${plan.width}x${plan.height}`, lives: plan.lives, levels: plan.levels, goal: plan.goal, lose: plan.lose, controls: plan.controls, touch: plan.touch, theme: plan.theme, mechanics: plan.mechanics, entities: plan.entities, levelPlan: plan.levelPlan, art: plan.art }, null, 1)}`,
    "",
    `In-game text (status lines, labels) in ${plan.locale === "ru" ? "Russian" : plan.locale === "kk" ? "Kazakh" : "English"}. Write the complete game.js now.`,
  ].join("\n")
}

export function gameEditPrompt(request: string, plan: GamePlan, logic: string) {
  return [
    `CHANGE REQUESTED BY THE USER:\n${String(request || "").slice(0, 4000)}`,
    "",
    `GAME DESIGN (JSON):\n${JSON.stringify({ title: plan.title, genre: plan.genre, input: plan.input, lives: plan.lives, levels: plan.levels, controls: plan.controls, mechanics: plan.mechanics })}`,
    "",
    "CURRENT game.js:",
    LOGIC_START,
    logic.slice(0, 60_000),
    LOGIC_END,
    "",
    "Apply the change and keep everything else working exactly as before. Return the complete updated game.js in the same file format.",
  ].join("\n")
}

export function gameRepairPrompt(request: string, plan: GamePlan, logic: string, problems: string[]) {
  return [
    `USER REQUEST:\n${String(request || "").slice(0, 3000)}`,
    "",
    `GAME DESIGN: ${plan.genre}, "${plan.title}", input ${plan.input}, levels ${plan.levels}.`,
    "",
    "The game was checked by running it. Fix EVERY problem below (they are real: syntax errors, forbidden APIs, crashes with line numbers, or controls with no effect):",
    ...problems.slice(0, 12).map((problem) => `- ${problem}`),
    "",
    "CURRENT game.js:",
    LOGIC_START,
    logic.slice(0, 60_000),
    LOGIC_END,
    "",
    "Return the complete corrected game.js in the same file format. Keep the gameplay; change only what the fixes need.",
  ].join("\n")
}

export function gameContinuePrompt(logicSoFar: string) {
  const tail = logicSoFar.slice(-6000)
  return [
    "Your reply with game.js was cut off by the length limit. Continue the file EXACTLY from where it stopped.",
    "Do not repeat anything already written, do not restart the file, do not add the opening marker or any Markdown.",
    `Finish the remaining code, then end with a line ${LOGIC_END}.`,
    "",
    "THE FILE ENDS WITH:",
    tail,
  ].join("\n")
}

/** What the model wrote: the code between the markers, and whether the end marker arrived. */
export function extractLogic(reply: string): { code: string; complete: boolean } {
  let text = String(reply || "").replace(/\r\n?/gu, "\n")
  const start = text.indexOf(LOGIC_START)
  if (start >= 0) text = text.slice(start + LOGIC_START.length)
  else text = text.replace(/^[\s\S]*?```(?:javascript|js)?[ \t]*\n/u, (lead) => (/MalikGame\.define/u.test(lead) ? lead : ""))
  const end = text.indexOf(LOGIC_END)
  const complete = end >= 0
  let code = complete ? text.slice(0, end) : text
  // A model that wrapped the file in a fence anyway.
  code = code.replace(/^\s*```(?:javascript|js)?[ \t]*\n/u, "").replace(/\n```\s*$/u, "").replace(/^\n+/u, "")
  return { code: complete ? code.replace(/\s+$/u, "") : code, complete }
}

/**
 * A cut reply ends mid-line more often than not. The partial line is dropped,
 * so the continuation starts on a fresh line and nothing is glued together.
 */
export function wholeLines(code: string) {
  const text = String(code || "")
  const cut = text.lastIndexOf("\n")
  return cut >= 0 ? text.slice(0, cut + 1) : ""
}

/** A continuation joined to the code so far (which ends with a newline): markers and fences dropped, anything it re-sent removed. */
export function joinContinuation(code: string, reply: string): { code: string; complete: boolean } {
  let text = String(reply || "").replace(/\r\n?/gu, "\n")
  text = text.replace(new RegExp(`^\\s*${LOGIC_START.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*\\n?`, "u"), "")
  text = text.replace(/^\s*```(?:javascript|js)?[ \t]*\n/u, "")
  const end = text.indexOf(LOGIC_END)
  const complete = end >= 0
  if (complete) text = text.slice(0, end)
  text = text.replace(/\n```\s*$/u, "")
  let added = ""
  const filter = createContinuationFilter(code, (chunk) => { added += chunk }, { window: 200_000 })
  filter.push(text)
  filter.end()
  const glue = !code || code.endsWith("\n") || added.startsWith("\n") ? "" : "\n"
  const joined = code + glue + added.replace(/^\n/u, code.endsWith("\n") ? "" : "\n")
  return { code: complete ? joined.replace(/\s+$/u, "") : joined, complete }
}
