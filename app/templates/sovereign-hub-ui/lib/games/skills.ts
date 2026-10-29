import type { GameEngine, GamePlan } from "./types"

/**
 * Malik Game Studio's skills. Each one is executable know-how the pipeline
 * really uses, not a label: the runtime implements the capability (physics,
 * controller, weapons, bots, zone, HUD, audio, quality) and the skill's guide
 * tells the programmer model how to use it well. A game gets the skills its
 * design needs (engine and systems); QA and Repair are the studio's own
 * check → run → fix loop, with their guides in the author and repair prompts.
 */

export type GameSkill = {
  id: string
  title: string
  /** Engines it applies to. */
  engines: GameEngine[]
  /** Applies when the plan lists one of these systems; absent means always. */
  systems?: string[]
  /** Where it acts: designing, writing the logic, checking or repairing. */
  stage: "design" | "author" | "qa" | "repair"
  guide: string
}

export const GAME_SKILLS: GameSkill[] = [
  { id: "game-architect", title: "Game Architect", engines: ["2d", "3d"], stage: "design", guide: "Pick the engine, camera and systems the genre needs (lib/games/engine.ts), then a vertical slice that is complete: core loop, rising difficulty, win and lose, every system really used. Never add combat where the genre has none." },
  { id: "game-2d", title: "2D Game Developer", engines: ["2d"], stage: "author", guide: "2D canvas runtime: the loop, menus, HUD, pause, touch and sound exist; write rules in update() and draw everything procedurally in draw()." },
  { id: "game-3d", title: "3D Game Developer", engines: ["3d"], stage: "author", guide: "three.js runtime: build the level in start(api, level) with the world helpers; never create a renderer, a loop or DOM — the runtime renders, steps physics and drives the hero and bots. Use THREE directly only for custom meshes (api.three)." },
  { id: "physics", title: "Game Physics Engineer", engines: ["2d", "3d"], systems: ["physics", "controller", "racing", "vehicles"], stage: "author", guide: "3D: api.body(obj, {radius, height, gravity}) gives gravity, ground and solid collisions with step-up; set body.vel for motion; mark static geometry solid:true. Jump with vel.y = 7–9 only when onGround. 2D: integrate with dt, resolve overlaps, clamp speeds." },
  { id: "controller", title: "Character Controller", engines: ["3d"], systems: ["controller"], stage: "author", guide: "api.player({mode:'first'|'third', weapon, speed, jump}) handles WASD relative to the camera, mouse/drag/touch look, sprint, crouch, jump, collisions and the camera rig with obstacle pull-in. Use api.follow(target, {offset}) for chase cameras (runners, cars)." },
  { id: "combat", title: "Combat Systems", engines: ["3d", "2d"], systems: ["combat"], stage: "author", guide: "3D: give the hero a weapon in api.player (damage, rate, mag, ammo, reload, spread); firing, reload (R), ammo HUD, tracers, hit sparks and damage are automatic. api.target(obj, {hp, team}) makes anything damageable; api.damage(t, n) for melee, explosions and hazards; scatter ammo and health pickups that refill weapon.ammo and target.hp." },
  { id: "npc", title: "NPC Intelligence", engines: ["3d", "2d"], systems: ["npc"], stage: "author", guide: "3D: api.bot({x, z, weapon, behavior:'hunter'|'patrol'|'wander'|'chaser', team:'ffa'|name, accuracy, sight}) — bots perceive with field of view and line of sight, chase, strafe, shoot, flee when weak, steer around obstacles and move into the zone. Scale bot count, accuracy and speed with the level; give each bot a role." },
  { id: "world", title: "World Builder", engines: ["3d"], systems: ["world", "building"], stage: "author", guide: "api.sky(preset), api.ground(size, {texture}), api.building, api.road, api.tree, api.rock, api.scatter(count, fn, {radius, avoid}), api.instances for many identical blocks. Lay the map out around landmarks with paths, cover and sight lines; keep the play area bounded with walls or the zone." },
  { id: "animation", title: "Animation Engineer", engines: ["3d", "2d"], systems: ["animation", "controller", "npc"], stage: "author", guide: "3D: api.character({color, gun, hat}) walks, aims and falls by itself when attached to the player or a bot; api.tween(obj, {x, y, z, ry, s}, seconds, {ease}) for doors, pickups and pops; api.spin and api.bob for collectibles. 2D: tweens, squash and stretch, api.anim frames." },
  { id: "game-ui", title: "Game UI/UX", engines: ["2d", "3d"], stage: "author", guide: "Menus, pause, quality settings, game over, best score, health, ammo, alive count, zone timer, minimap, kill feed and crosshair are drawn by the runtime. Feed it: api.setStatus('Волна 3/10'), api.feed('Вы устранили Бот-4'), api.addScore(n, pos) for floating numbers." },
  { id: "game-audio", title: "Game Audio", engines: ["2d", "3d"], stage: "author", guide: "api.sfx(name, pos?) on every event — 3D sounds fade with distance from the camera. Names: shoot, laser, hit, explode, coin, pickup, jump, power, hurt, reload, step, engine, win, lose, click. Music follows the plan's mood." },
  { id: "performance", title: "Performance Optimizer", engines: ["3d", "2d"], stage: "author", guide: "Reuse vectors and objects in update(); never create meshes every frame; api.instances for repeated geometry; at most ~16 bots and ~300 meshes; remove what leaves the play area. The page lowers quality by itself when frames slow down." },
  { id: "game-qa", title: "Game QA Engineer", engines: ["2d", "3d"], stage: "qa", guide: "Every game is checked before it is shown: syntax, a safety policy and a contract, then 600 frames in an isolated sandbox twice — idle and with scripted play (WASD, look, fire, jump). It must not crash, must build a visible world, keep positions finite and react to the controls." },
  { id: "game-repair", title: "Game Repair Agent", engines: ["2d", "3d"], stage: "repair", guide: "Fix exactly the reported problems with the smallest change that makes the run pass; keep every working mechanic; never stub a system out to silence an error." },
]

/** The skills this design uses, in pipeline order. */
export function skillsFor(plan: Pick<GamePlan, "engine" | "systems">): GameSkill[] {
  const engine = plan.engine === "3d" ? "3d" : "2d"
  const systems = new Set(plan.systems || [])
  return GAME_SKILLS.filter((skill) => skill.engines.includes(engine) && (!skill.systems || skill.systems.some((system) => systems.has(system))))
}

/** The guides the programmer model reads for this game. */
export function skillGuides(plan: Pick<GamePlan, "engine" | "systems">, stage: GameSkill["stage"] = "author"): string {
  return skillsFor(plan).filter((skill) => skill.stage === stage || (stage === "author" && skill.stage === "qa"))
    .map((skill) => `- ${skill.title}: ${skill.guide}`).join("\n")
}
