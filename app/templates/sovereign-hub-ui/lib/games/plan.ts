import {
  GAME_BACKDROPS, GAME_FONTS, GAME_MOODS,
  type GameBackdrop, type GameControl, type GameFont, type GameInput, type GameLocale, type GameMood, type GamePalette, type GamePlan, type TouchButton,
} from "./types"

/**
 * The game's design: what the model is asked for, the defaults that stand in
 * when it does not answer, and the checks every value passes before it
 * reaches the page. A plan is data — it never carries code.
 */

export function gameLocale(prompt: string): GameLocale {
  const text = String(prompt || "")
  if (/[әіңғүұқөһ]/iu.test(text) || /(?<!\p{L})(?:ойын\p{L}*|жаса\p{L}*|құрастыр\p{L}*)/iu.test(text)) return "kk"
  return /[а-яё]/iu.test(text) ? "ru" : "en"
}

type Word = Record<GameLocale, string>
const WORDS = {
  move: { ru: "движение", kk: "қозғалыс", en: "move" },
  jump: { ru: "прыжок", kk: "секіру", en: "jump" },
  fire: { ru: "огонь", kk: "ату", en: "fire" },
  dash: { ru: "рывок", kk: "серпіліс", en: "dash" },
  steer: { ru: "руль", kk: "рөл", en: "steer" },
  gas: { ru: "газ / тормоз", kk: "газ / тежегіш", en: "throttle / brake" },
  boost: { ru: "ускорение", kk: "үдеу", en: "boost" },
  rotate: { ru: "повернуть фигуру", kk: "бұру", en: "rotate" },
  drop: { ru: "сбросить вниз", kk: "төмен түсіру", en: "hard drop" },
  tap: { ru: "клик / касание", kk: "басу", en: "click / tap" },
  flap: { ru: "взмах", kk: "қанат қағу", en: "flap" },
  build: { ru: "поставить башню", kk: "мұнара қою", en: "place a tower" },
  pick: { ru: "выбрать", kk: "таңдау", en: "choose" },
  aim: { ru: "прицел и выстрел", kk: "көздеу және ату", en: "aim and shoot" },
  act: { ru: "действие", kk: "әрекет", en: "action" },
  dig: { ru: "копать / строить", kk: "қазу / салу", en: "dig / build" },
  swap: { ru: "поменять местами", kk: "орын ауыстыру", en: "swap" },
  pause: { ru: "пауза", kk: "үзіліс", en: "pause" },
  sound: { ru: "звук", kk: "дыбыс", en: "sound" },
} satisfies Record<string, Word>
type WordKey = keyof typeof WORDS

const ARROWS = "← → ↑ ↓ / WASD"

type Genre = {
  id: string
  match: RegExp
  label: Word
  title: Word
  input: GameInput
  portrait?: boolean
  backdrop: GameBackdrop
  font: GameFont
  mood: GameMood
  palette: GamePalette
  controls: Array<[string, WordKey]>
  buttons: Array<[TouchButton["id"], WordKey]>
  joystick: boolean
  lives: number
  levels: number
  goal: Word
  mechanics: string[]
}

const P = (bg: string, bg2: string, fg: string, muted: string, accent: string, accent2: string, danger: string, good: string): GamePalette => ({ bg, bg2, fg, muted, accent, accent2, danger, good })

/**
 * Starting points by genre. The model's own plan replaces all of this when it
 * answers; these keep a game coherent when it does not, and give the Auto
 * look (palette, backdrop, font) a sensible default for the subject.
 */
const GENRES: Genre[] = [
  {
    id: "space-shooter", match: /(?:косм|звёзд|звезд|корабл|галакт|астероид|пришел|инопланет|space|ship|galax|asteroid|alien|invader|ғарыш)/iu,
    label: { ru: "космический шутер", kk: "ғарыштық атыс", en: "space shooter" }, title: { ru: "Звёздный патруль", kk: "Жұлдыз патрулі", en: "Star Patrol" },
    input: "keyboard", backdrop: "space", font: "tech", mood: "tense",
    palette: P("#05060f", "#141a3a", "#eef2ff", "#8b93c7", "#38e8ff", "#ff4fd8", "#ff4d5e", "#5cff9d"),
    controls: [[ARROWS, "move"], ["Пробел / J", "fire"], ["Shift / K", "dash"]], buttons: [["action", "fire"], ["action2", "dash"]], joystick: true, lives: 3, levels: 5,
    goal: { ru: "Пройдите все волны и победите флагман врага.", kk: "Барлық толқыннан өтіп, жау флагманын жеңіңіз.", en: "Survive every wave and defeat the enemy flagship." },
    mechanics: ["player ship moves in 2D, fires bullets with a cooldown", "enemy waves with 3+ enemy types (zig-zag, diver, shooter)", "enemy bullets, collisions cost a life with brief invulnerability", "power-ups: spread shot, shield", "boss at the last level with a health bar"],
  },
  {
    id: "platformer", match: /(?:платформ|марио|прыга|прыжк|уровн\p{L}*\s+с\s+препятств|platform|mario|jump)/iu,
    label: { ru: "платформер", kk: "платформер", en: "platformer" }, title: { ru: "Прыжок героя", kk: "Батыр секірісі", en: "Hero Leap" },
    input: "keyboard", backdrop: "sky", font: "display", mood: "upbeat",
    palette: P("#7ec8ff", "#d8f1ff", "#14213d", "#4a5a7a", "#ffb703", "#fb5607", "#e63946", "#2a9d8f"),
    controls: [["← → / A D", "move"], ["Пробел / ↑ / W", "jump"]], buttons: [["action", "jump"]], joystick: true, lives: 3, levels: 5,
    goal: { ru: "Соберите монеты и дойдите до флага на каждом уровне.", kk: "Тиындарды жинап, әр деңгейде туға жетіңіз.", en: "Collect coins and reach the flag on every level." },
    mechanics: ["side view with gravity, coyote time and variable jump height", "tile platforms built from level strings, scrolling camera", "patrolling enemies, stomp to defeat them", "coins, spikes, moving platforms on later levels", "flag at the end of each level"],
  },
  {
    id: "racing", match: /(?:гонк|гоноч|машин|авто|трасс|дрифт|racing|race|car|drift|kart|көлік)/iu,
    label: { ru: "гонки", kk: "жарыс", en: "racing" }, title: { ru: "Ночная трасса", kk: "Түнгі трасса", en: "Night Highway" },
    input: "keyboard", backdrop: "neon", font: "tech", mood: "upbeat",
    palette: P("#0c0420", "#2a0b4d", "#fdf6ff", "#a48fc7", "#ff2bd6", "#22e4ff", "#ff4757", "#2ef2a0"),
    controls: [["← → / A D", "steer"], ["↑ ↓ / W S", "gas"], ["Пробел", "boost"]], buttons: [["action", "boost"]], joystick: true, lives: 3, levels: 4,
    goal: { ru: "Обгоняйте соперников и доберитесь до финиша каждого этапа.", kk: "Қарсыластарды басып озып, әр кезеңнің мәресіне жетіңіз.", en: "Overtake rivals and reach the finish of every stage." },
    mechanics: ["pseudo-3D road with curves using api.project", "speed, steering inertia, off-road slowdown", "traffic and rival cars to avoid, crash costs a life", "nitro boost meter", "stage timer and distance to finish"],
  },
  {
    id: "snake", match: /(?:змейк|змея|snake)/iu,
    label: { ru: "змейка", kk: "жылан", en: "snake" }, title: { ru: "Неоновая змейка", kk: "Неон жылан", en: "Neon Snake" },
    input: "keyboard", backdrop: "grid", font: "pixel", mood: "upbeat",
    palette: P("#061a12", "#0d2b20", "#e8fff3", "#7fb59a", "#39ff88", "#ffd23f", "#ff4f6d", "#39ff88"),
    controls: [[ARROWS, "move"]], buttons: [], joystick: true, lives: 1, levels: 0,
    goal: { ru: "Растите как можно длиннее и не врезайтесь в себя.", kk: "Мүмкіндігінше ұзарып, өзіңізге соқтықпаңыз.", en: "Grow as long as you can without biting yourself." },
    mechanics: ["grid movement with buffered turns", "food spawns on free cells; golden food bonus", "speed rises every few foods", "walls or wrap per level", "game over on self collision"],
  },
  {
    id: "breakout", match: /(?:арканоид|breakout|кирпич|блок\p{L}*\s+шар|arkanoid|brick)/iu,
    label: { ru: "арканоид", kk: "арканоид", en: "breakout" }, title: { ru: "Кирпичный шторм", kk: "Кірпіш дауылы", en: "Brick Storm" },
    input: "both", backdrop: "neon", font: "display", mood: "upbeat",
    palette: P("#0b0c1f", "#1d1f4a", "#f5f7ff", "#9aa0d4", "#5ee7ff", "#ffcf4a", "#ff5c7a", "#7dff9a"),
    controls: [["← → / мышь", "move"], ["Пробел / клик", "act"]], buttons: [["action", "act"]], joystick: true, lives: 3, levels: 5,
    goal: { ru: "Разбейте все кирпичи на каждом уровне.", kk: "Әр деңгейде барлық кірпішті сындырыңыз.", en: "Break every brick on every level." },
    mechanics: ["paddle follows keys or pointer", "ball physics with angle from paddle hit point", "brick layouts per level, tougher bricks need 2-3 hits", "power-ups: wide paddle, multi-ball", "lose a life when the ball falls"],
  },
  {
    id: "falling-blocks", match: /(?:тетрис|tetris|падающ\p{L}*\s+(?:блок|фигур))/iu,
    label: { ru: "головоломка с падающими фигурами", kk: "құлайтын фигуралар", en: "falling blocks puzzle" }, title: { ru: "Блокопад", kk: "Блоктар", en: "Blockfall" },
    input: "keyboard", portrait: true, backdrop: "grid", font: "pixel", mood: "calm",
    palette: P("#0d0f1a", "#1a1e33", "#f0f3ff", "#8890b5", "#4cc9f0", "#f72585", "#ff595e", "#8ac926"),
    controls: [["← →", "move"], ["↑ / X", "rotate"], ["Пробел", "drop"]], buttons: [["action", "rotate"], ["action2", "drop"]], joystick: true, lives: 1, levels: 0,
    goal: { ru: "Собирайте полные линии, пока поле не заполнилось.", kk: "Алаң толғанша толық сызықтар жинаңыз.", en: "Clear full lines before the stack reaches the top." },
    mechanics: ["10x20 well with 7 tetromino shapes and wall kicks", "soft drop, hard drop, ghost piece, next preview", "line clears score 100/300/500/800 times level", "speed rises every 10 lines", "game over when a new piece cannot spawn"],
  },
  {
    id: "flappy", match: /(?:флапп|flappy|птичк\p{L}*\s+(?:летит|между\s+труб))/iu,
    label: { ru: "аркада", kk: "аркада", en: "arcade" }, title: { ru: "Крылья", kk: "Қанаттар", en: "Wings" },
    input: "both", portrait: true, backdrop: "sky", font: "round", mood: "upbeat",
    palette: P("#70c5ff", "#e0f6ff", "#102a43", "#486581", "#ffcb47", "#ff7a59", "#e63946", "#43aa8b"),
    controls: [["Пробел / клик", "flap"]], buttons: [], joystick: false, lives: 1, levels: 0,
    goal: { ru: "Пролетите как можно дальше между препятствиями.", kk: "Кедергілер арасынан мүмкіндігінше алыс ұшыңыз.", en: "Fly as far as you can between the obstacles." },
    mechanics: ["one-button flap against gravity", "gaps between pipes, gap narrows with score", "score per passed gate", "game over on contact"],
  },
  {
    id: "tower-defense", match: /(?:tower\s*defen|башн\p{L}*\s+(?:защит|оборон)|защит\p{L}*\s+(?:башн|замк|крепост)|td\b)/iu,
    label: { ru: "защита башнями", kk: "мұнаралық қорғаныс", en: "tower defense" }, title: { ru: "Последний рубеж", kk: "Соңғы шеп", en: "Last Bastion" },
    input: "pointer", backdrop: "forest", font: "display", mood: "epic",
    palette: P("#14301d", "#2c5a33", "#f4f1de", "#a9b89a", "#f2c14e", "#4ea8de", "#e4572e", "#76c893"),
    controls: [["клик / касание", "build"], ["1 2 3", "pick"]], buttons: [], joystick: false, lives: 10, levels: 8,
    goal: { ru: "Не дайте врагам дойти до замка за все волны.", kk: "Жауды барлық толқында қамалға жеткізбеңіз.", en: "Keep every wave from reaching the castle." },
    mechanics: ["enemies follow a path of waypoints", "3 tower types with range, rate, damage and cost; upgrade on click", "gold from kills; waves grow in count and HP", "lives lost when enemies reach the end", "wave start button and next-wave preview"],
  },
  {
    id: "maze", match: /(?:лабиринт|пакман|pac-?man|maze|dungeon|подземел)/iu,
    label: { ru: "лабиринт", kk: "лабиринт", en: "maze" }, title: { ru: "Тёмный лабиринт", kk: "Қараңғы лабиринт", en: "Dark Maze" },
    input: "keyboard", backdrop: "dungeon", font: "pixel", mood: "tense",
    palette: P("#0b0b12", "#1c1b2b", "#f2efe6", "#8a8698", "#ffd166", "#06d6a0", "#ef476f", "#06d6a0"),
    controls: [[ARROWS, "move"]], buttons: [], joystick: true, lives: 3, levels: 5,
    goal: { ru: "Соберите все кристаллы и найдите выход, избегая стражей.", kk: "Барлық кристалды жинап, күзетшілерден қашып, шығатын жерді табыңыз.", en: "Collect every crystal and find the exit while avoiding guards." },
    mechanics: ["grid maze generated per level", "guards chase or patrol; contact costs a life", "collectibles and an exit door that opens when all are collected", "fog of war or light radius"],
  },
  {
    id: "runner", match: /(?:раннер|бегун|бесконечн\p{L}*\s+бег|runner|endless\s+run|subway)/iu,
    label: { ru: "раннер", kk: "жүгіру ойыны", en: "runner" }, title: { ru: "Бег без конца", kk: "Шексіз жүгіру", en: "Endless Dash" },
    input: "both", backdrop: "night", font: "display", mood: "upbeat",
    palette: P("#0f1028", "#2b2d6e", "#fafaff", "#a3a6d8", "#ffd60a", "#00f5d4", "#ff477e", "#00f5d4"),
    controls: [["Пробел / ↑ / клик", "jump"], ["↓", "dash"]], buttons: [["action", "jump"], ["action2", "dash"]], joystick: false, lives: 1, levels: 0,
    goal: { ru: "Бегите как можно дальше, перепрыгивая препятствия.", kk: "Кедергілерден секіріп, мүмкіндігінше алыс жүгіріңіз.", en: "Run as far as you can, jumping over obstacles." },
    mechanics: ["auto-run with rising speed", "jump and slide, double jump", "obstacles and coins in patterns", "parallax layers"],
  },
  {
    id: "match3", match: /(?:три\s+в\s+ряд|match[- ]?3|кристалл\p{L}*\s+в\s+ряд|candy\s+crush)/iu,
    label: { ru: "три в ряд", kk: "үшеу қатар", en: "match-3" }, title: { ru: "Самоцветы", kk: "Асыл тастар", en: "Gem Rush" },
    input: "pointer", portrait: true, backdrop: "candy", font: "round", mood: "calm",
    palette: P("#2b1b4d", "#5a3d8a", "#fff8ff", "#c7b5e8", "#ff7eb6", "#7afcff", "#ff4f79", "#9cff8a"),
    controls: [["клик по двум соседним", "swap"]], buttons: [], joystick: false, lives: 1, levels: 6,
    goal: { ru: "Наберите нужные очки за ограниченное число ходов.", kk: "Шектеулі жүрісте қажетті ұпай жинаңыз.", en: "Reach the target score within the move limit." },
    mechanics: ["8x8 grid of 6 gem types", "swap adjacent gems, only matching swaps stay", "cascades with gravity and refill", "special gem for 4 and 5 matches", "level target score and move counter"],
  },
  {
    id: "sandbox", match: /(?:майнкрафт|minecraft|песочниц|копать|строить\s+блок|sandbox|voxel|terraria|террари)/iu,
    label: { ru: "песочница", kk: "құмсалғыш", en: "sandbox" }, title: { ru: "Мир блоков", kk: "Блоктар әлемі", en: "Block World" },
    input: "both", backdrop: "sky", font: "pixel", mood: "calm",
    palette: P("#87ceeb", "#dff3ff", "#1b1b1b", "#5a5a5a", "#7cb342", "#8d6e63", "#e53935", "#7cb342"),
    controls: [["← → / A D", "move"], ["Пробел / W", "jump"], ["клик", "dig"], ["1–5", "pick"]], buttons: [["action", "jump"]], joystick: true, lives: 3, levels: 0,
    goal: { ru: "Копайте, стройте и выживайте ночью.", kk: "Қазып, салып, түнде аман қалыңыз.", en: "Dig, build and survive the night." },
    mechanics: ["procedural 2D tile world (grass, dirt, stone, ore, wood) with scrolling camera", "mine blocks with the pointer within reach; place the selected block", "hotbar inventory with counts", "day-night cycle; night spawns simple monsters", "gravity, jumping and collision with tiles"],
  },
  {
    id: "rpg", match: /(?:rpg|рпг|квест|приключен|рыцар|меч|магия|adventure|quest|knight|dungeon\s+crawl)/iu,
    label: { ru: "приключение", kk: "шытырман", en: "adventure" }, title: { ru: "Сага о клинке", kk: "Семсер дастаны", en: "Blade Saga" },
    input: "keyboard", backdrop: "forest", font: "serif", mood: "epic",
    palette: P("#16201a", "#2d3f2f", "#f6f1e3", "#b3ad99", "#f4a259", "#5b8e7d", "#bc4b51", "#8cb369"),
    controls: [[ARROWS, "move"], ["Пробел / J", "fire"], ["Shift / K", "dash"]], buttons: [["action", "fire"], ["action2", "dash"]], joystick: true, lives: 5, levels: 4,
    goal: { ru: "Очистите каждую область от монстров и победите стража.", kk: "Әр аймақты құбыжықтардан тазартып, күзетшіні жеңіңіз.", en: "Clear each area of monsters and defeat its guardian." },
    mechanics: ["top-down hero with sword swing arc and dodge", "monsters with simple chase AI and knockback", "health potions and XP with level-ups", "area gate opens when monsters are cleared", "guardian boss with attack patterns"],
  },
  {
    id: "quiz", match: /(?:викторин|квиз|обучающ\p{L}*\s+игр|математик|таблиц\p{L}*\s+умнож|quiz|trivia|educational|math\s+game)/iu,
    label: { ru: "обучающая игра", kk: "оқу ойыны", en: "learning game" }, title: { ru: "Умный старт", kk: "Ақылды бастау", en: "Brain Sprint" },
    input: "pointer", backdrop: "candy", font: "round", mood: "calm",
    palette: P("#1f2a6b", "#3f51b5", "#ffffff", "#c5cae9", "#ffd54f", "#4dd0e1", "#ef5350", "#66bb6a"),
    controls: [["клик / касание", "pick"], ["1–4", "pick"]], buttons: [], joystick: false, lives: 3, levels: 5,
    goal: { ru: "Отвечайте правильно и быстро, чтобы пройти все раунды.", kk: "Барлық раундтан өту үшін дұрыс әрі жылдам жауап беріңіз.", en: "Answer correctly and quickly to clear every round." },
    mechanics: ["questions drawn on canvas with 4 answer cards", "timer per question, streak bonus", "wrong answer costs a life with explanation", "rounds get harder"],
  },
  {
    id: "physics", match: /(?:физик|катапульт|angry\s*birds|рогатк|баллист|physics|slingshot)/iu,
    label: { ru: "физическая головоломка", kk: "физикалық басқатырғыш", en: "physics puzzle" }, title: { ru: "Катапульта", kk: "Катапульта", en: "Catapult" },
    input: "pointer", backdrop: "sky", font: "display", mood: "upbeat",
    palette: P("#8fd3ff", "#e8f7ff", "#1d3557", "#457b9d", "#e76f51", "#f4a261", "#d62828", "#2a9d8f"),
    controls: [["потянуть и отпустить", "aim"]], buttons: [], joystick: false, lives: 3, levels: 5,
    goal: { ru: "Сбейте все цели за ограниченное число выстрелов.", kk: "Шектеулі атыспен барлық нысананы құлатыңыз.", en: "Knock down every target with limited shots." },
    mechanics: ["drag to aim with a trajectory preview, release to launch", "projectile gravity and bounces", "stacked boxes with simple rigid-body stacking", "targets to topple; shots per level"],
  },
  {
    id: "shooter", match: /(?:шутер|стрелял|зомби|top[- ]?down|shooter|zombie|fps|стрельб)/iu,
    label: { ru: "шутер", kk: "атыс ойыны", en: "shooter" }, title: { ru: "Последний выживший", kk: "Соңғы тірі қалған", en: "Last Survivor" },
    input: "both", backdrop: "night", font: "tech", mood: "tense",
    palette: P("#0d1117", "#1f2933", "#e6edf3", "#8b949e", "#f0b429", "#58a6ff", "#f85149", "#56d364"),
    controls: [[ARROWS, "move"], ["мышь / клик", "aim"], ["Пробел", "fire"]], buttons: [["action", "fire"]], joystick: true, lives: 3, levels: 6,
    goal: { ru: "Продержитесь все волны врагов.", kk: "Жаудың барлық толқынына төтеп беріңіз.", en: "Hold out against every wave." },
    mechanics: ["top-down movement, aim toward pointer, auto-fire while held", "enemy hordes from screen edges with different speeds", "ammo crates and medkits", "wave counter and short breaks between waves"],
  },
]

const GENERIC: Genre = {
  id: "arcade", match: /$^/u,
  label: { ru: "аркада", kk: "аркада", en: "arcade game" }, title: { ru: "Аркада", kk: "Аркада", en: "Arcade" },
  input: "both", backdrop: "neon", font: "display", mood: "upbeat",
  palette: P("#0b1020", "#1c2550", "#f4f6ff", "#98a2d4", "#ffd23f", "#3bceac", "#ee4266", "#3bceac"),
  controls: [[ARROWS, "move"], ["Пробел / клик", "act"]], buttons: [["action", "act"]], joystick: true, lives: 3, levels: 5,
  goal: { ru: "Набирайте очки и проходите уровни.", kk: "Ұпай жинап, деңгейлерден өтіңіз.", en: "Score points and clear the levels." },
  mechanics: ["clear core loop with rising difficulty", "obstacles or enemies, collectibles", "lives and level progression"],
}

export function pickGenre(prompt: string) {
  return GENRES.find((genre) => genre.match.test(String(prompt || ""))) || GENERIC
}

/** A name the person gave the game («игра "Стальной рой"»), if any. */
export function titleFromPrompt(prompt: string) {
  const quoted = String(prompt || "").match(/[«"“]([^»"”\n]{2,48})[»"”]/u)
  return quoted ? quoted[1].trim() : ""
}

/** A coherent playable plan without the model: the floor every game stands on. */
export function fallbackGamePlan(prompt: string, locale: GameLocale = gameLocale(prompt)): GamePlan {
  const genre = pickGenre(prompt)
  const word = (key: WordKey) => WORDS[key][locale]
  const keysLabel = (keys: string) => locale === "en" ? keys.replace("Пробел", "Space").replace("мышь", "mouse").replace("клик", "click").replace("касание", "tap").replace("потянуть и отпустить", "drag and release").replace("клик по двум соседним", "click two neighbours") : locale === "kk" ? keys.replace("Пробел", "Бос орын").replace("мышь", "тінтуір").replace("клик", "басу").replace("касание", "түрту") : keys
  const controls: GameControl[] = genre.controls.map(([keys, action]) => ({ keys: keysLabel(keys), action: word(action) }))
  controls.push({ keys: "P / Esc", action: word("pause") }, { keys: "M", action: word("sound") })
  return {
    version: 1,
    title: titleFromPrompt(prompt) || genre.title[locale],
    tagline: genre.goal[locale],
    locale,
    genre: genre.label[locale],
    input: genre.input,
    width: genre.portrait ? 540 : 960,
    height: genre.portrait ? 960 : 540,
    lives: genre.lives,
    levels: genre.levels,
    goal: genre.goal[locale],
    lose: locale === "en" ? "The run ends when you lose your last life." : locale === "kk" ? "Соңғы өміріңіз біткенде ойын аяқталады." : "Игра заканчивается, когда кончаются жизни.",
    controls,
    touch: { joystick: genre.joystick, buttons: genre.buttons.map(([id, key]) => ({ id, label: word(key) })) },
    theme: { palette: { ...genre.palette }, backdrop: genre.backdrop, font: genre.font, mood: genre.mood },
    mechanics: [...genre.mechanics],
    entities: [],
    levelPlan: [],
    art: "",
  }
}

/* ------------------------------------------------------------ validation */

const HEX = /^#[0-9a-f]{6}$/iu

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/[<>`]/gu, "").replace(/\s+/gu, " ").trim().slice(0, max)
}

function list(value: unknown, maxItems: number, maxLength: number) {
  return (Array.isArray(value) ? value : []).map((item) => clean(item, maxLength)).filter(Boolean).slice(0, maxItems)
}

function pickEnum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  const text = String(value || "").toLowerCase().trim()
  return (options as readonly string[]).includes(text) ? text as T : fallback
}

function whole(value: unknown, min: number, max: number, fallback: number) {
  const number = Math.round(Number(value))
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

/** The model's plan, checked field by field; anything missing or unsafe falls back to the base. */
export function mergeGamePlan(raw: unknown, base: GamePlan): GamePlan {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>
  const theme = (value.theme && typeof value.theme === "object" ? value.theme : {}) as Record<string, any>
  const palette = (theme.palette && typeof theme.palette === "object" ? theme.palette : {}) as Record<string, any>
  const mergedPalette = Object.fromEntries(Object.entries(base.theme.palette).map(([key, color]) => [key, HEX.test(String(palette[key] || "")) ? String(palette[key]).toLowerCase() : color])) as GamePalette
  const portrait = value.orientation === "portrait" || (Number(value.height) > Number(value.width))
  const width = value.orientation || value.width ? (portrait ? 540 : 960) : base.width
  const height = value.orientation || value.width ? (portrait ? 960 : 540) : base.height
  const controls = (Array.isArray(value.controls) ? value.controls : [])
    .map((item: any) => ({ keys: clean(item?.keys, 40), action: clean(item?.action, 48) }))
    .filter((item: GameControl) => item.keys && item.action)
    .slice(0, 8)
  const buttons = (Array.isArray(value.touch?.buttons) ? value.touch.buttons : [])
    .map((item: any, index: number) => ({ id: (item?.id === "action2" || index === 1 ? "action2" : "action") as TouchButton["id"], label: clean(item?.label, 16) }))
    .filter((item: TouchButton) => item.label)
    .slice(0, 2)
  const input = pickEnum<GameInput>(value.input, ["keyboard", "pointer", "both"], base.input)
  const levels = whole(value.levels, 0, 20, base.levels)
  return {
    version: 1,
    title: clean(value.title, 48) || base.title,
    tagline: clean(value.tagline, 140) || base.tagline,
    locale: base.locale,
    genre: clean(value.genre, 48) || base.genre,
    input,
    width,
    height,
    lives: whole(value.lives, 1, 9, base.lives),
    levels,
    goal: clean(value.goal, 200) || base.goal,
    lose: clean(value.lose, 160) || base.lose,
    controls: controls.length ? withSystemControls(controls, base) : base.controls,
    touch: {
      joystick: typeof value.touch?.joystick === "boolean" ? value.touch.joystick : input === "pointer" ? false : base.touch.joystick,
      buttons: Array.isArray(value.touch?.buttons) ? buttons : base.touch.buttons,
    },
    theme: {
      palette: mergedPalette,
      backdrop: pickEnum<GameBackdrop>(theme.backdrop, GAME_BACKDROPS, base.theme.backdrop),
      font: pickEnum<GameFont>(theme.font, GAME_FONTS, base.theme.font),
      mood: pickEnum<GameMood>(theme.mood, GAME_MOODS, base.theme.mood),
    },
    mechanics: list(value.mechanics, 12, 220).length ? list(value.mechanics, 12, 220) : base.mechanics,
    entities: list(value.entities, 12, 180),
    levelPlan: list(value.levelPlan, 20, 200),
    art: clean(value.art, 400),
  }
}

/** Pause and sound keys are the runtime's: every game lists them. */
function withSystemControls(controls: GameControl[], base: GamePlan) {
  const system = base.controls.filter((item) => /^(?:P \/ Esc|M)$/u.test(item.keys))
  return [...controls.filter((item) => !/^(?:P|M|Esc|P \/ Esc)$/iu.test(item.keys)).slice(0, 6), ...system]
}

/** The first JSON object in a model reply (inside a fence or not). */
export function parseJsonObject(text: string): unknown {
  const raw = String(text || "")
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1] ?? raw
  const start = fenced.indexOf("{")
  const end = fenced.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try { return JSON.parse(fenced.slice(start, end + 1)) } catch { return null }
}

/* ---------------------------------------------------------- the planner */

export const GAME_PLANNER_SYSTEM = [
  "You are the lead game designer of Malik Game Studio. Design ONE complete, deep browser game that matches the user's request exactly: its theme, setting, characters, genre and every mechanic they named. It must stand next to commercial indie games, not a tech demo.",
  "Reply with ONE JSON object and nothing else.",
  "Keys:",
  '{"title":"short catchy title in the user\'s language","tagline":"one sentence hook","genre":"genre in the user\'s language","input":"keyboard|pointer|both","orientation":"landscape|portrait","lives":1-9,"levels":0-20 (0 = endless with rising difficulty),',
  '"goal":"how to win, user\'s language","lose":"how you lose","controls":[{"keys":"← →","action":"движение"}],"touch":{"joystick":true,"buttons":[{"id":"action","label":"Огонь"}]},',
  '"theme":{"palette":{"bg":"#hex","bg2":"#hex","fg":"#hex","muted":"#hex","accent":"#hex","accent2":"#hex","danger":"#hex","good":"#hex"},"backdrop":"space|sky|night|forest|ocean|desert|dungeon|neon|grid|snow|lava|candy|plain","font":"display|pixel|round|tech|serif","mood":"upbeat|tense|calm|epic|none"},',
  '"mechanics":["concrete rules in English for the programmer"],"entities":["player, enemy types, items with their behaviour, in English"],"levelPlan":["what changes on each level, in English"],"art":"art direction in English: shapes, silhouettes, colours, effects"}',
  "Rules: everything is drawn procedurally on a 2D canvas (no images, no 3D engine); for 3D-feeling requests use pseudo-3D (perspective projection, raycasting, layered depth). Scope for one rich file: 4-8 core mechanics, 4-7 enemy or obstacle types introduced over time, 2 power-ups, a mini-boss and a final boss with phases, an upgrade or new ability between levels, 6-12 levels (or 0 = endless with escalating waves), a clear win and lose condition. levelPlan names what is new on each level. Palette: readable contrast between fg and bg, accent colours that pop. Controls must match the input mode; pointer games need no joystick.",
].join("\n")

export function gamePlannerPrompt(prompt: string, base: GamePlan) {
  return [
    `USER REQUEST:\n${String(prompt || "").slice(0, 6000)}`,
    "",
    `LANGUAGE for title, tagline, genre, goal, lose, controls and touch labels: ${base.locale === "ru" ? "Russian" : base.locale === "kk" ? "Kazakh" : "English"}.`,
    `A starting point you may change completely if the request asks for something else:\n${JSON.stringify({ genre: base.genre, input: base.input, orientation: base.height > base.width ? "portrait" : "landscape", lives: base.lives, levels: base.levels, controls: base.controls.slice(0, -2), theme: base.theme, mechanics: base.mechanics })}`,
  ].join("\n")
}
