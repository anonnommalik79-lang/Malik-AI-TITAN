import { LOGIC_END, LOGIC_START } from "./author"
import type { GameIssue } from "./recipe"
import { skillGuides } from "./skills"
import type { GamePlan } from "./types"

/** The 3D runtime's API in the words the model reads. Every name exists in runtime-3d.ts. */
export const GAME_API_3D_REFERENCE = `
MALIK 3D GAME RUNTIME (three.js r160, global THREE) — the renderer, loop, physics, camera, hero controller, weapons, bots, zone, HUD (health, ammo, alive, zone, minimap, kill feed, crosshair), menus, pause, quality settings, touch controls and sound already exist.
You write ONLY the game: one call

MalikGame.define({
  setup(api) {},           // once: constant data
  start(api, level) {},    // build this level's world (the scene is cleared before every level)
  update(dt, api) {},      // dt in seconds; game rules, spawning, win and lose. No draw(): three.js renders the scene.
})

WORLD: api.sky("day"|"sunset"|"night"|"overcast"|"neon"|"desert", {fogNear, fogFar, shadowRange}) — sky, sun with soft shadows, fog · api.ground(size, {texture:"grass"|"sand"|"snow"|"dirt"|"asphalt"|"concrete"|"tiles"|"grid", color, tile}) ·
  api.box(w,h,d,color,{x,y,z,ry,solid,material:{rough,metal,glow,opacity,flat},parent}) (sits on the ground unless y is given) · api.sphere(r,color,opt) · api.cylinder(rTop,rBottom,h,color,opt) · api.cone(r,h,color,opt) · api.group(opt) ·
  api.building(x,z,w,d,h,{color,windows,roof,ry}) (solid, lit windows) · api.road(x1,z1,x2,z2,width) · api.tree(x,z,{kind:"pine"|"oak",scale}) · api.rock(x,z,size) · api.scatter(count,(x,z,i)=>{…},{radius,x,z,avoid:[{x,z,r}]}) · api.instances(w,h,d,color,[{x,y,z}],{solid}) for hundreds of blocks · api.light(x,y,z,color,intensity,distance) · api.mat(color,opt) · api.canvasTexture(w,h,(ctx,w,h)=>{…},repeat) · api.add(object3D,opt) · api.remove(obj).
PHYSICS: api.body(obj,{radius,height,gravity,bounce,collide}) → {vel, onGround, pos}: gravity, ground, solid boxes with step-up · api.solid(mesh) · api.gravity · api.raycast(origin:Vector3, dir:Vector3, maxDist) → {point,distance,object,target}|null · api.canSee(a,b) · api.collide(a,b,radius?) · api.heightAt = (x,z)=>y (optional terrain).
HERO: api.player({mode:"third"|"first", x, z, speed, sprint, jump, hp, weapon:{name,damage,rate,mag,ammo,reload,spread,range,auto,pellets} | true, color}) → p {obj, body, target, pos, yaw, pitch, weapon}. WASD moves relative to the camera, mouse/drag/touch looks, Space jumps, Shift sprints, C crouches, hold LMB/F fires, R reloads — all automatic. api.me is the hero.
  Chase camera without a hero: api.follow(object, {offset:{x,y,z}, look:{x,y,z}, lerp}).
COMBAT: api.target(obj,{hp,team,onHit,onDeath,remove}) · api.damage(target,amount,source) · api.weapon(opt) · api.fire(weapon, origin, dir, ownerTarget) · api.reload(weapon) · api.stats {shots,hits,kills}.
BOTS: api.bot({x,z,color,hp,speed,weapon:true|{…},behavior:"hunter"|"patrol"|"wander"|"chaser",team:"ffa"|"red",accuracy 0..1,sight,fov,path:[{x,z}],arena,onDeath,model}) → bot {obj, target, state}. Bots see (field of view + line of sight), chase, strafe, shoot, bite (no weapon), flee when weak, avoid obstacles and run into the zone · api.bots() alive bots · api.alive() alive fighters incl. the hero.
ZONE: api.zone({x,z,radius,minRadius,wait,shrink,damage}) shrinking ring that hurts anyone outside · api.zoneInfo().
CHARACTERS & MOTION: api.character({color,skin,pants,hat,gun,height,x,z}) — a jointed figure that walks, aims and falls by itself on the hero or a bot · api.animate(character, speed, airborne) for one your code moves · api.tween(obj,{x,y,z,rx,ry,rz,s},seconds,{ease:"outBack"|"outCubic"|"outQuad"|"inOutQuad"|"linear",delay,onDone}) · api.spin(obj,speed) · api.bob(obj,amount,speed) · api.after(seconds, fn).
FEEL & UI: api.burst(pos,{color|[colors],count,speed,life,up,gravity}) · api.shake(power,seconds) (0.05–0.6) · api.flash(color,seconds) · api.sfx(name,pos?) — shoot,laser,hit,explode,coin,pickup,jump,power,hurt,reload,step,engine,win,lose,click · api.floatText(text,pos,color) · api.feed(text) kill feed · api.setStatus(text) · api.hud.minimap / api.hud.crosshair (true/false).
FLOW: api.addScore(n,pos?) · api.setScore(n) · api.loseLife() · api.setLives(n) · api.nextLevel() · api.win(msg) · api.gameOver(msg). The hero dying costs a life and respawns at its start point, or ends the run on the last life.
INPUT (for custom rules): api.key(name) / api.pressed(name) — "up","down","left","right","jump","sprint","crouch","action","action2","reload","interact" · api.axis() → {x,y} (y=-1 forward) · api.look {dx,dy} this frame · api.rawKey/api.rawPressed("KeyE").
MATH: api.vec(x,y,z) · api.forward(yaw) · api.yawTo(from,to) · api.dist(a,b) · api.dist2d(a,b) · api.rand · api.randi · api.pick · api.chance · api.clamp · api.lerp. STATE: api.time, api.level, api.levels, api.score, api.lives, api.data {}, api.colors {bg,bg2,fg,muted,accent,accent2,danger,good}, api.scene, api.camera, api.three.
Axes: y is up, the ground is y = 0, the hero at yaw 0 looks toward -z.
`.trim()

const EXAMPLE_3D = `
${LOGIC_START}
const S = { pickups: [] };

MalikGame.define({
  start(api, level) {
    api.sky("day"); api.ground(240, { texture: "grass" });
    for (let i = 0; i < 6; i++) api.building(-40 + i * 16, -30, 10, 10, 10 + i * 3);
    api.scatter(30, (x, z) => api.tree(x, z), { radius: 100, avoid: [{ x: 0, z: -30, r: 50 }] });
    api.zone({ radius: 110, minRadius: 10, wait: 25, shrink: 90 });
    api.player({ mode: "third", x: 0, z: 30, weapon: { damage: 26, rate: 9, mag: 30, ammo: 150 } });
    for (let i = 0; i < 10 + level * 2; i++) api.bot({ x: api.rand(-90, 90), z: api.rand(-90, 90), weapon: true, behavior: "hunter", accuracy: 0.45 + level * 0.05 });
    S.pickups = [];
  },
  update(dt, api) {
    if (!api.me.target.dead && api.alive() === 1) api.win("Победа!");
  },
});
${LOGIC_END}`.trim()

export const GAME_AUTHOR_SYSTEM_3D = [
  "You are the senior gameplay programmer of Malik Game Studio. Write the complete, polished, PLAYABLE 3D game logic for the design you are given, for the Malik 3D runtime described below.",
  "",
  GAME_API_3D_REFERENCE,
  "",
  "HARD RULES:",
  `- Reply with exactly one file: a line ${LOGIC_START}, then the JavaScript, then a line ${LOGIC_END}. No Markdown fences, no prose before or after.`,
  "- Plain modern JavaScript (ES2020). No import/export, no require, no external files, models, textures, fonts or URLs: build everything from the runtime's helpers and THREE geometry.",
  "- Never use fetch, XMLHttpRequest, WebSocket, eval, new Function, setTimeout, setInterval, requestAnimationFrame, localStorage, document, window, parent, top, globalThis, constructor, __proto__, Proxy or Reflect, and never create a WebGLRenderer or a loop: timers count with dt or api.after; the runtime renders.",
  "- Build each level's world in start(api, level); keep mutable state in one top-level object (const S = {...}) rebuilt in start. Do not reset api.score or api.lives yourself.",
  "- Every function you call must exist. No TODO, no placeholders. Finish the whole file — 400 to 900 lines; the reply is continued automatically if it is cut.",
  "- Bound every array, remove what leaves the play area, never create meshes every frame, reuse vectors. Use dt for all motion.",
  "",
  "QUALITY BAR:",
  "- The genre's real systems, all working: a hero that moves and acts on the controls, enemies or rivals that make decisions, real rules, a win and a lose condition. No decorative bots, fake shooting or dead buttons; no combat where the genre has none.",
  "- A world worth looking at: sky preset, textured ground, landmarks, cover, paths, varied colours and sizes, lights on night maps.",
  "- Feel: api.burst on impacts and pickups, api.shake on damage and explosions, api.sfx on every event, api.feed for kills and events, api.floatText for points, api.tween for doors and pickups.",
  "- If the request names an existing game, reproduce its core mechanics and genre structure with an original name, design and content.",
  "",
  "FORMAT EXAMPLE (shape only — your game is far richer):",
  EXAMPLE_3D,
].join("\n")

const DEPTH: Record<string, string> = {
  "battle-royale": "a large map (radius 90–130) with a town of buildings, forest and roads; 12–16 free-for-all bots with weapons and varied accuracy; a zone that waits, then shrinks; health and ammo pickups that respawn; kill feed and score per kill; win when api.alive() === 1 with the hero alive; slow-motion-like celebration (api.shake, burst) at the end.",
  shooter: "5+ arenas, each with cover layout, enemy squads (hunter + patrol), a heavy enemy with more hp, ammo and medkits, level ends when all enemies fall.",
  "open-world": "a city grid of roads and buildings with pedestrians (wander bots, team 'civil') and gang bots (team 'gang'); mission beacons that spawn tasks; money score; each level a new district.",
  voxel: "a block terrain from api.instances (hills, trees, water level), breaking the block under the crosshair with api.raycast and placing blocks on its face, a hotbar choice with digits, crystals to collect; nights with api.sky('night') and api.light.",
  runner: "three lanes (x = -3, 0, 3) on an endless track that recycles segments ahead of the hero; obstacles to jump, slide under or dodge; coin lines and arcs; magnet and shield power-ups; speed rising every 20 s; chase camera with api.follow; game over on a hit without shield.",
  racing: "a closed track of road segments with barriers, checkpoints and laps; a car body with acceleration, braking, steering and drift; 3–5 rival cars following waypoints; position and lap HUD via api.setStatus; nitro.",
  horror: "a dark map (api.sky('night', {fogNear: 4, fogFar: 40})) of rooms and corridors from boxes; a flashlight api.light that follows the camera each frame; a chaser monster bot whose speed grows; keys to find and an exit; heartbeat sfx when the monster is near.",
  football: "a pitch with lines and goals, a ball with api.body bounce and friction, two teams of bots that pass and shoot toward goals, the hero controls the nearest teammate, a timed match with score in api.setStatus.",
  adventure: "islands or ruins with platforms to jump between, relics on landmarks, guardians that chase when close, 3 distinct levels.",
}

export function game3dRecipeText(plan: GamePlan): string {
  const genre = Object.keys(DEPTH).find((id) => (plan.systems || []).includes(id)) || inferGenre(plan)
  return [
    `CAMERA: ${plan.camera || "third"}-person${plan.camera === "chase" ? " (api.follow)" : plan.camera === "top" ? " (high chase camera with api.follow)" : " (api.player mode)"}.`,
    `DEPTH for this genre: ${DEPTH[genre] || DEPTH.adventure}`,
    `LEVELS: ${plan.levels === 0 ? "endless, escalating" : `${plan.levels} distinct levels`}; each level changes layout, enemy count, behaviour or speed.`,
    "LENGTH: 400–900 lines of real content.",
  ].join("\n")
}

function inferGenre(plan: GamePlan) {
  const text = `${plan.genre} ${(plan.mechanics || []).join(" ")}`.toLowerCase()
  if (/royale|корол|zone|зон/.test(text)) return "battle-royale"
  if (/runner|раннер|lane|дорожк/.test(text)) return "runner"
  if (/race|гонк|car|машин/.test(text)) return "racing"
  if (/horror|хоррор|monster|монстр/.test(text)) return "horror"
  if (/block|блок|voxel/.test(text)) return "voxel"
  if (/football|футбол|ball|мяч/.test(text)) return "football"
  if (/city|город|open/.test(text)) return "open-world"
  if (/first-person|shooter|шутер/.test(text)) return "shooter"
  return "adventure"
}

const language = (plan: GamePlan) => plan.locale === "ru" ? "Russian" : plan.locale === "kk" ? "Kazakh" : "English"

export function game3dAuthorPrompt(request: string, plan: GamePlan) {
  return [
    `USER REQUEST:\n${String(request || "").slice(0, 6000)}`,
    "",
    `GAME DESIGN (JSON):\n${JSON.stringify({ title: plan.title, genre: plan.genre, camera: plan.camera, systems: plan.systems, lives: plan.lives, levels: plan.levels, goal: plan.goal, lose: plan.lose, controls: plan.controls, mechanics: plan.mechanics, entities: plan.entities, levelPlan: plan.levelPlan, art: plan.art, palette: plan.theme.palette, mood: plan.theme.mood }, null, 1)}`,
    "",
    `GAME RECIPE:\n${game3dRecipeText(plan)}`,
    "",
    `SKILLS FOR THIS GAME:\n${skillGuides(plan)}`,
    "",
    `In-game text (status, feed, floating labels) in ${language(plan)}. Write the complete game.js now.`,
  ].join("\n")
}

export function game3dPolishPrompt(request: string, plan: GamePlan, logic: string, issues: string[]) {
  return [
    `USER REQUEST:\n${String(request || "").slice(0, 3000)}`,
    "",
    `GAME DESIGN: ${plan.genre}, "${plan.title}", ${plan.camera} camera, systems ${(plan.systems || []).join(", ")}, levels ${plan.levels}.`,
    "",
    `GAME RECIPE:\n${game3dRecipeText(plan)}`,
    "",
    "The game runs, but a review against the recipe found it thin. Raise it — keep every mechanic, control and level that works, and add what is missing:",
    ...issues.slice(0, 10).map((issue) => `- ${issue}`),
    "",
    "CURRENT game.js:",
    LOGIC_START,
    logic.slice(0, 60_000),
    LOGIC_END,
    "",
    "Return the complete improved game.js in the same file format — longer and richer, never shorter.",
  ].join("\n")
}

/** A 3D game that runs but is thin: the systems its design needs are not really in the code. */
export function audit3dLogic(logic: string, plan: GamePlan): GameIssue[] {
  const code = String(logic || "")
  const issues: GameIssue[] = []
  const add = (code: string, detail: string) => issues.push({ code, detail })
  const systems = new Set(plan.systems || [])
  const lines = code.split("\n").filter((line) => line.trim()).length
  if (lines < 220) add("SHORT", `only ${lines} lines — a complete 3D game needs 400–900`)
  const world = ["sky", "ground", "building", "road", "tree", "rock", "scatter", "instances", "box"].filter((name) => new RegExp(`api\\.${name}\\s*\\(`).test(code))
  if (world.length < 4) add("THIN_WORLD", `the world uses only ${world.join(", ") || "nothing"} — add sky, textured ground, landmarks and cover`)
  if (systems.has("combat") && !/weapon\s*:|api\.fire\s*\(|api\.weapon\s*\(/.test(code)) add("NO_COMBAT", "the design needs combat but nothing shoots: give the hero a weapon in api.player")
  if (systems.has("npc") && !/api\.bot\s*\(/.test(code)) add("NO_BOTS", "the design needs enemies that think: create them with api.bot")
  if (systems.has("zone") && !/api\.zone\s*\(/.test(code)) add("NO_ZONE", "a battle royale needs its shrinking zone: api.zone")
  if (systems.has("controller") && !/api\.player\s*\(/.test(code)) add("NO_HERO", "the design needs a controllable hero: api.player")
  const feel = ["burst", "shake", "sfx", "feed", "floatText", "tween", "flash", "addScore"].filter((name) => new RegExp(`api\\.${name}\\s*\\(`).test(code))
  if (feel.length < 4) add("FLAT_FEEL", `uses only ${feel.join(", ") || "none"} of the feel tools — add bursts, shakes, sounds, feed messages and floating points`)
  if (!/api\.(?:win|gameOver|nextLevel|loseLife)\s*\(/.test(code)) add("NO_GOAL", "nothing ever wins or loses: add the win and lose rules")
  return issues
}
