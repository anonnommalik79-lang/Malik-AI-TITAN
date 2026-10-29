import type { GameCamera, GameControl, GameEngine, GameLocale, GamePalette, GamePlan } from "./types"

/**
 * Game Architect, first decision: which engine, camera and game systems a
 * request needs. Explicit words win («2D», «3D», «three.js»); otherwise the
 * genre decides: shooters, battle royale, open worlds, block worlds, 3D
 * runners, racing simulators, first-person horror and football go to the
 * three.js runtime; platformers, arcade, puzzle and pixel games stay on the
 * 2D canvas runtime, which runs them best.
 */

export type GameProfile = { engine: GameEngine; camera?: GameCamera; genre: string; systems: string[] }

const EXPLICIT_2D = /(?<![\p{L}\p{N}])(?:2d|2д|двухмер\p{L}*|пиксел\p{L}*|pixel|8[- ]?бит\p{L}*|8[- ]?bit)(?![\p{L}\p{N}])/iu
const EXPLICIT_3D = /(?<![\p{L}\p{N}])(?:3d|3д|тр[её]хмер\p{L}*|three\.?js|webgl|babylon\p{L}*)(?![\p{L}\p{N}])/iu

type Genre3d = { id: string; match: RegExp; camera: GameCamera; systems: string[] }
const GENRES_3D: Genre3d[] = [
  { id: "battle-royale", match: /battle\s*royale|королевск\p{L}*\s+битв\p{L}*|pubg|пабг|fortnite|фортнайт|apex|варзон|warzone/iu, camera: "third", systems: ["controller", "combat", "npc", "world", "zone", "animation"] },
  // A plain «космический шутер» stays a 2D arcade game; these are the first-person ones.
  { id: "shooter", match: /от\s+первого\s+лица|first[- ]person|(?<![\p{L}])fps(?![\p{L}])|counter[- ]?strike|cs\s*:?\s*go|кс\s*го|valorant|валорант|call\s+of\s+duty|тактическ\p{L}*\s+шутер/iu, camera: "first", systems: ["controller", "combat", "npc", "world", "animation"] },
  { id: "open-world", match: /gta|гта|открыт\p{L}*\s+мир\p{L}*|open[- ]world|песочниц\p{L}*\s+город|city\s+sandbox/iu, camera: "third", systems: ["controller", "npc", "world", "combat", "animation"] },
  { id: "voxel", match: /minecraft|майнкрафт|блок\p{L}*\s+и\s+строит\p{L}*|voxel|воксел\p{L}*|кубическ\p{L}*\s+мир/iu, camera: "first", systems: ["controller", "world", "building"] },
  { id: "runner", match: /subway\s*surfers?|сабвей|temple\s*run|бесконечн\p{L}*\s+раннер\p{L}*|endless\s+runner/iu, camera: "chase", systems: ["physics", "world", "animation"] },
  { id: "racing", match: /гоночн\p{L}*|гонк\p{L}*|racing|race\b|симулятор\s+вожден\p{L}*|driving\s+sim\p{L}*|дрифт|drift/iu, camera: "chase", systems: ["physics", "world", "npc"] },
  { id: "horror", match: /хоррор|horror|ужас\p{L}*|монстр\p{L}*\s+преслед\p{L}*|преслед\p{L}*\s+монстр\p{L}*|slender/iu, camera: "first", systems: ["controller", "npc", "world", "lighting"] },
  { id: "football", match: /футбол\p{L}*|football|soccer|fifa|фифа/iu, camera: "top", systems: ["physics", "npc", "world"] },
]
const ADVENTURE_3D: Genre3d = { id: "adventure", match: /$^/u, camera: "third", systems: ["controller", "world", "animation"] }
const TWO_D_GENRES = /платформер\p{L}*|platformer|аркад\p{L}*|тетрис|змейк\p{L}*|snake|арканоид|пакман|pac-?man|flappy|три\s+в\s+ряд|match[- ]?3|tower\s*defen[cs]e|пазл|puzzle|раннер\p{L}*|runner/iu

export function gameProfile(prompt: string): GameProfile {
  const text = String(prompt || "")
  const explicit3d = EXPLICIT_3D.test(text)
  const explicit2d = EXPLICIT_2D.test(text) && !explicit3d
  const genre = GENRES_3D.find((item) => item.match.test(text))
  if (explicit2d || (!explicit3d && (!genre || (TWO_D_GENRES.test(text) && genre.id !== "runner")))) {
    return { engine: "2d", genre: genre?.id || "arcade", systems: ["physics", "animation"] }
  }
  const chosen = genre || ADVENTURE_3D
  const camera: GameCamera = /от\s+третьего\s+лица|third[- ]person/iu.test(text) ? "third" : /от\s+первого\s+лица|first[- ]person/iu.test(text) ? "first" : chosen.camera
  return { engine: "3d", camera, genre: chosen.id, systems: [...chosen.systems] }
}

type Word = Record<GameLocale, string>
const w = (ru: string, kk: string, en: string): Word => ({ ru, kk, en })
const P = (bg: string, bg2: string, fg: string, muted: string, accent: string, accent2: string, danger: string, good: string): GamePalette => ({ bg, bg2, fg, muted, accent, accent2, danger, good })

type Fallback3d = { label: Word; title: Word; goal: Word; lives: number; levels: number; mood: GamePlan["theme"]["mood"]; palette: GamePalette; controls: Array<[string, Word]>; buttons: Array<["action" | "action2", Word]>; mechanics: string[]; entities: string[]; levelPlan: string[]; art: string }

const MOVE = w("движение", "қозғалыс", "move"), LOOK = w("обзор", "қарау", "look"), FIRE = w("огонь", "ату", "fire"), JUMP = w("прыжок", "секіру", "jump"), SPRINT = w("бег", "жүгіру", "sprint"), RELOAD = w("перезарядка", "қайта оқтау", "reload")
const SHOOTER_CONTROLS: Array<[string, Word]> = [["WASD", MOVE], ["Мышь", LOOK], ["ЛКМ", FIRE], ["R", RELOAD], ["Пробел", JUMP], ["Shift", SPRINT]]
const DARK = P("#0b0f17", "#1a2233", "#eef2ff", "#93a0bd", "#ffc94d", "#4fd1c5", "#ff4d5e", "#56d364")

const FALLBACK_3D: Record<string, Fallback3d> = {
  "battle-royale": {
    label: w("3D королевская битва", "3D корольдік шайқас", "3D battle royale"), title: w("Последний рубеж", "Соңғы шеп", "Last Stand"),
    goal: w("Останьтесь последним выжившим: зона сужается, боты охотятся.", "Соңғы тірі қалған болыңыз: аймақ тарылады.", "Be the last one standing while the zone closes in."),
    lives: 1, levels: 1, mood: "tense", palette: DARK, controls: SHOOTER_CONTROLS, buttons: [["action", FIRE], ["action2", JUMP]],
    mechanics: ["third-person hero with rifle: WASD, mouse look, hold to fire, R reload, Space jump, Shift sprint", "shrinking zone that hurts anyone outside", "12-16 free-for-all bots that loot, hunt, fight each other and flee when weak", "ammo and health pickups scattered across the map", "win when the hero is the last one alive"],
    entities: ["hero with rifle", "bots with rifles (hunter behaviour, varied accuracy)", "health packs", "ammo crates", "buildings, trees and rocks as cover"],
    levelPlan: ["one large map: town in the centre, forest ring, roads between landmarks"], art: "Realistic-stylised: day sky, textured grass, concrete buildings with lit windows, rocks and pines; soft shadows.",
  },
  shooter: {
    label: w("3D шутер от первого лица", "3D бірінші тұлғадан атыс", "3D first-person shooter"), title: w("Ударная группа", "Соққы тобы", "Strike Team"),
    goal: w("Зачистите каждую зону от противников.", "Әр аймақты жаудан тазартыңыз.", "Clear every area of enemies."),
    lives: 3, levels: 5, mood: "tense", palette: DARK, controls: SHOOTER_CONTROLS, buttons: [["action", FIRE], ["action2", JUMP]],
    mechanics: ["first-person movement with mouse look, sprint, crouch, jump", "rifle with recoil feel, ammo and reload", "enemy squads that take cover lines and flank", "each level a new arena with more enemies and a heavy enemy"],
    entities: ["player", "soldiers", "heavy gunner", "ammo and medkits"], levelPlan: ["warehouse", "streets", "rooftops", "tunnels", "final base with the commander"], art: "Military dusk palette, concrete and metal, muzzle flashes and tracers.",
  },
  "open-world": {
    label: w("3D открытый мир", "3D ашық әлем", "3D open world"), title: w("Город возможностей", "Мүмкіндіктер қаласы", "City of Chances"),
    goal: w("Выполняйте задания по городу и копите репутацию.", "Қала бойынша тапсырмалар орындаңыз.", "Run missions around the city and build your reputation."),
    lives: 3, levels: 4, mood: "upbeat", palette: P("#0d1117", "#1d2733", "#f1f5ff", "#9aa6bd", "#ffb020", "#3fb3ff", "#ff5468", "#3ddc84"), controls: SHOOTER_CONTROLS, buttons: [["action", FIRE], ["action2", JUMP]],
    mechanics: ["third-person hero in a city grid of streets and blocks", "missions marked by glowing beacons: deliver, chase, defend", "pedestrians wander, gang bots attack when provoked", "money and reputation score"],
    entities: ["hero", "pedestrians", "gang members", "mission beacons", "cash pickups"], levelPlan: ["downtown", "docks", "suburbs", "gang hideout"], art: "Sunset city with lit windows, roads with markings, street trees.",
  },
  voxel: {
    label: w("3D мир из блоков", "3D блоктар әлемі", "3D block world"), title: w("Кубоземье", "Текшелер жері", "Blockland"),
    goal: w("Исследуйте, ломайте и стройте блоки, соберите все кристаллы.", "Блоктарды бұзып, салыңыз.", "Explore, break and place blocks, collect every crystal."),
    lives: 3, levels: 3, mood: "calm", palette: P("#0e1a10", "#20331f", "#f2fff0", "#a6c4a0", "#ffd84d", "#59c3ff", "#ff5a5a", "#6be06b"), controls: [["WASD", MOVE], ["Мышь", LOOK], ["ЛКМ", w("сломать", "бұзу", "break")], ["Q", w("поставить", "қою", "place")], ["Пробел", JUMP]], buttons: [["action", w("сломать", "бұзу", "break")], ["action2", w("поставить", "қою", "place")]],
    mechanics: ["first-person in a block terrain built with api.instances", "break the block you look at (api.raycast) and place a block on the face", "hidden crystals to collect, night falls on later levels"],
    entities: ["grass, dirt, stone, wood, leaves blocks", "crystals"], levelPlan: ["meadow", "forest hills", "night caves"], art: "Bright blocky terrain, flat-shaded trees, clear sky.",
  },
  runner: {
    label: w("3D бесконечный раннер", "3D шексіз жүгіріс", "3D endless runner"), title: w("Рельсовый рывок", "Рельс серпілісі", "Rail Rush"),
    goal: w("Бегите как можно дальше, собирайте монеты и уворачивайтесь.", "Мүмкіндігінше алысқа жүгіріңіз.", "Run as far as you can, grab coins and dodge."),
    lives: 1, levels: 0, mood: "upbeat", palette: P("#0b1020", "#1c2550", "#f4f6ff", "#98a2d4", "#ffd23f", "#3bceac", "#ee4266", "#3bceac"), controls: [["← → / A D", w("сменить дорожку", "жолақ ауыстыру", "change lane")], ["↑ / W / Пробел", JUMP], ["↓ / S", w("подкат", "сырғанау", "slide")]], buttons: [["action", JUMP], ["action2", w("подкат", "сырғанау", "slide")]],
    mechanics: ["three lanes, the hero runs forward automatically, speed rises over time", "barriers to jump, gates to slide under, trains to change lanes around", "coins in lines and arcs, magnet and shield power-ups", "score = distance + coins"],
    entities: ["runner", "barriers", "trains", "coins", "magnet", "shield"], levelPlan: ["endless, speed and density rise every 20 seconds"], art: "Sunny city track, coloured trains, gold spinning coins.",
  },
  racing: {
    label: w("3D гонки", "3D жарыс", "3D racing"), title: w("Ночной трек", "Түнгі трек", "Night Track"),
    goal: w("Финишируйте первым в каждой гонке.", "Әр жарыста бірінші келіңіз.", "Finish first in every race."),
    lives: 3, levels: 4, mood: "epic", palette: P("#07070d", "#18183a", "#f5f5ff", "#9a9ac4", "#ff3df2", "#33e1ff", "#ff4757", "#2ed573"), controls: [["W / ↑", w("газ", "газ", "throttle")], ["S / ↓", w("тормоз", "тежегіш", "brake")], ["A D / ← →", w("руль", "рөл", "steer")], ["Пробел", w("нитро", "нитро", "nitro")]], buttons: [["action", w("нитро", "нитро", "nitro")]],
    mechanics: ["car with acceleration, braking, steering and drift", "track loop with checkpoints and laps", "3-5 rival cars following the racing line", "nitro meter"],
    entities: ["player car", "rival cars", "checkpoints", "barriers"], levelPlan: ["city loop", "canyon", "harbour", "night highway"], art: "Neon night track, glowing barriers, chase camera.",
  },
  horror: {
    label: w("3D хоррор", "3D қорқынышты ойын", "3D horror"), title: w("Тёмный коридор", "Қараңғы дәліз", "Dark Hall"),
    goal: w("Найдите ключи и выберитесь, пока монстр вас не догнал.", "Кілттерді тауып, шығыңыз.", "Find the keys and escape before the monster catches you."),
    lives: 1, levels: 3, mood: "tense", palette: P("#050608", "#11131a", "#e9ecf2", "#7d8596", "#ffcf5a", "#7fb7ff", "#ff2f45", "#4ade80"), controls: [["WASD", MOVE], ["Мышь", LOOK], ["Shift", SPRINT], ["E", w("взять", "алу", "pick up")]], buttons: [["action", w("взять", "алу", "pick up")]],
    mechanics: ["first-person in a dark building lit by a flashlight (api.light following the camera)", "a monster that chases by sound and sight and speeds up", "keys hidden in rooms, exit door opens with all keys", "stamina for sprinting"],
    entities: ["player", "monster (chaser)", "keys", "exit door"], levelPlan: ["house", "hospital", "basement"], art: "Night sky preset, fog close in, warm flashlight pool, red eyes of the monster.",
  },
  football: {
    label: w("3D футбол", "3D футбол", "3D football"), title: w("Финал кубка", "Кубок финалы", "Cup Final"),
    goal: w("Забейте больше голов, чем соперник, за матч.", "Қарсыласқа қарағанда көп гол соғыңыз.", "Score more goals than the rival team."),
    lives: 1, levels: 3, mood: "epic", palette: P("#0a160d", "#16331f", "#f4fff6", "#a3c9ad", "#ffd23f", "#4fc3f7", "#ff5252", "#69f0ae"), controls: [["WASD", MOVE], ["Пробел", w("удар", "соғу", "shoot")], ["Shift", SPRINT]], buttons: [["action", w("удар", "соғу", "shoot")]],
    mechanics: ["5v5 on a pitch with goals, ball physics with bounce and friction", "player controls the teammate nearest the ball", "bots pass, dribble and shoot", "timed match with score"],
    entities: ["players", "ball", "goalkeepers", "goals"], levelPlan: ["group match", "semi-final", "final"], art: "Stadium pitch with stripes, white lines, crowd stands as coloured blocks.",
  },
  adventure: {
    label: w("3D приключение", "3D шытырман", "3D adventure"), title: w("Затерянный остров", "Жоғалған арал", "Lost Island"),
    goal: w("Исследуйте мир и соберите все реликвии.", "Әлемді зерттеп, жәдігерлерді жинаңыз.", "Explore the world and collect every relic."),
    lives: 3, levels: 3, mood: "calm", palette: P("#0c1418", "#1d3138", "#f2fbff", "#9cb8c2", "#ffcc4d", "#4dd0e1", "#ff5c5c", "#66e08a"), controls: [["WASD", MOVE], ["Мышь", LOOK], ["Пробел", JUMP], ["Shift", SPRINT]], buttons: [["action2", JUMP]],
    mechanics: ["third-person exploration with jumping between platforms", "relics hidden on landmarks", "guardians that chase when you come close"],
    entities: ["hero", "guardians", "relics"], levelPlan: ["beach", "jungle", "ruins"], art: "Sunny island, palms (api.tree), rocks, ruins of boxes and cylinders.",
  },
}

/** A coherent 3D plan without the model. */
export function fallback3dPlan(prompt: string, locale: GameLocale, profile: GameProfile, title?: string): GamePlan {
  const spec = FALLBACK_3D[profile.genre] || FALLBACK_3D.adventure
  const keys = (k: string) => locale === "en" ? k.replace("Мышь", "Mouse").replace("ЛКМ", "LMB").replace("Пробел", "Space") : locale === "kk" ? k.replace("Мышь", "Тінтуір").replace("Пробел", "Бос орын") : k
  const controls: GameControl[] = spec.controls.map(([k, word]) => ({ keys: keys(k), action: word[locale] }))
  controls.push({ keys: "P / Esc", action: locale === "en" ? "pause" : locale === "kk" ? "үзіліс" : "пауза" }, { keys: "M", action: locale === "en" ? "sound" : locale === "kk" ? "дыбыс" : "звук" })
  return {
    version: 1, engine: "3d", camera: profile.camera, systems: [...profile.systems],
    title: title || spec.title[locale], tagline: spec.goal[locale], locale, genre: spec.label[locale], input: "both", width: 1280, height: 720,
    lives: spec.lives, levels: spec.levels, goal: spec.goal[locale],
    lose: locale === "en" ? "The run ends when you fall." : locale === "kk" ? "Құлағанда ойын аяқталады." : "Игра заканчивается, когда вы погибаете.",
    controls, touch: { joystick: true, buttons: spec.buttons.map(([id, word]) => ({ id, label: word[locale].slice(0, 16) })) },
    theme: { palette: { ...spec.palette }, backdrop: "plain", font: "tech", mood: spec.mood },
    mechanics: [...spec.mechanics], entities: [...spec.entities], levelPlan: [...spec.levelPlan], art: spec.art,
  }
}
