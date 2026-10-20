import { readGamePage } from "./page"
import type { GameLocale, GamePlan, GameResult } from "./types"

/**
 * Malik Game Studio in the chat: which requests it takes, how its answer
 * reads, and how a finished game stays out of the model's context later.
 */

type Message = { role?: string; content?: unknown }

/** A game, named directly or by genre. «игрок», «игровой сайт» and «игрушка-антистресс» do not count. */
const GAME_NOUN = /(?<!\p{L})(?:игр(?:а|у|ы|е|ой|ушк\p{L}*)|мини[- ]?игр\p{L}*|видеоигр\p{L}*|game|games|minigame|videogame|ойын\p{L}*|аркад\p{L}*|платформер\p{L}*|шутер\p{L}*|раннер\p{L}*|тетрис\p{L}*|змейк\p{L}*|арканоид\p{L}*|пакман\p{L}*|рогалик\p{L}*|tower\s*defen[cs]e|flappy\s*bird|pac-?man|snake\s+game|tetris|breakout|platformer|shooter|roguelike|match[- ]?3|три\s+в\s+ряд)(?!\p{L})/iu
const CREATE = /(?<!\p{L})(?:созда\p{L}*|сдела\p{L}*|сгенерир\p{L}*|разработа\p{L}*|напиши|напишите|запрограммир\p{L}*|закод\p{L}*|накод\p{L}*|собери|собрать|построй|запили|нужн\p{L}*|хочу|make|build|create|generate|code|write|develop|need|want|жаса\p{L}*|құр\p{L}*)(?!\p{L})/iu
/** Engines and languages that are not a browser game: the coding model answers those itself. */
const OTHER_STACK = /(?<![\p{L}\p{N}])(?:unity|unreal|godot|roblox|lua|pygame|python|питон\p{L}*|c#|c\+\+|java(?!script)|kotlin|swift|android|ios|xcode|game\s*maker|rpg\s*maker|construct\s*3|defold|love2d|scratch|скретч\p{L}*|minecraft\s+(?:мод|mod|plugin|плагин)|мод\p{L}*\s+для|react|vue|next\.?js|typescript|phaser|three\.?js|zip|репозитор\p{L}*|backend|бэкенд)(?![\p{L}\p{N}])/iu
const SITE = /(?<!\p{L})(?:сайт\p{L}*|лендинг\p{L}*|портал\p{L}*|website|web\s*site|landing|homepage|магазин\p{L}*|store|shop)(?!\p{L})/iu
const QUESTION = /^\s*(?:как|сколько|почему|зачем|что такое|какой|какая|какие|где|можно ли|how|what|why|which|where|can you explain|қалай|қанша)(?!\p{L})/iu
const NOT_BUILD = /(?<!\p{L})(?:проанализируй|оцени|объясни|расскажи|review|explain|analy[sz]e|переведи|translate|сыграем|поиграем|сыграть\s+со\s+мной|поиграть\s+со\s+мной|play\s+with\s+me|let'?s\s+play)(?!\p{L})/iu
const EDIT = /(?<!\p{L})(?:добав\p{L}*|измени\p{L}*|поменя\p{L}*|замени\p{L}*|убер\p{L}*|убра\p{L}*|удали\p{L}*|исправ\p{L}*|почини\p{L}*|переделай|перепиши|сделай|ускорь|замедли|увелич\p{L}*|уменьш\p{L}*|усложни|упрости|быстрее|медленнее|сложнее|проще|больше|меньше|fix|change|add|remove|replace|make|faster|slower|harder|easier|bigger|smaller|өзгерт\p{L}*|қос\p{L}*|түзет\p{L}*)(?!\p{L})/iu
const NEW_GAME = /(?<!\p{L})(?:нов\p{L}*|друг\p{L}*|ещё\s+одн\p{L}*|еще\s+одн\p{L}*|another|new)(?!\p{L})/iu

export type GameTurn = { kind: "new" } | { kind: "edit"; plan: GamePlan; logic: string }

/** The last game this studio made in the chat, read from the full messages. */
export function lastGame(messages: unknown): { plan: GamePlan; logic: string } | null {
  const list = Array.isArray(messages) ? messages as Message[] : []
  for (let index = list.length - 1, seen = 0; index >= 0 && seen < 8; index -= 1, seen += 1) {
    const message = list[index]
    if (message?.role !== "assistant" || typeof message.content !== "string" || !message.content.includes('id="malik-game-logic"')) continue
    const game = readGamePage(message.content.replace(/\r(?!\n)/gu, "\n"))
    if (game) return game
  }
  return null
}

export function isGameCreationRequest(prompt: string) {
  const text = String(prompt || "").trim()
  if (!text || text.length > 6000) return false
  if (/```|https?:\/\//iu.test(text) || OTHER_STACK.test(text) || NOT_BUILD.test(text) || QUESTION.test(text)) return false
  if (SITE.test(text)) return false
  return GAME_NOUN.test(text) && CREATE.test(text)
}

/** Whether this chat turn belongs to the studio: a new game, a change to the last one, or neither. */
export function gameStudioTurn(prompt: string, input: { messages?: unknown; attachments?: unknown } = {}): GameTurn | null {
  const text = String(prompt || "").trim()
  if (!text || text.length > 6000) return null
  if (Array.isArray(input.attachments) && input.attachments.length) return null
  const creates = isGameCreationRequest(text)
  const previous = lastGame(input.messages)
  if (previous) {
    if (creates && (NEW_GAME.test(text) || !EDIT.test(text) || /(?<!\p{L})(?:игр(?:а|у)|game)(?!\p{L})/iu.test(text) && /(?<!\p{L})(?:про|about|на\s+тему)(?!\p{L})/iu.test(text))) return { kind: "new" }
    const wondering = /\?\s*$/u.test(text) && !/(?<!\p{L})(?:можешь|можете|could you|can you)(?!\p{L})/iu.test(text)
    if (EDIT.test(text) && !QUESTION.test(text) && !wondering && !/```|https?:\/\//iu.test(text) && !OTHER_STACK.test(text)) return { kind: "edit", plan: previous.plan, logic: previous.logic }
  }
  return creates ? { kind: "new" } : null
}

const COPY: Record<GameLocale, {
  ready: (title: string, genre: string, levels: string) => string; updated: (title: string) => string; levels: (n: number) => string; endless: string
  play: string; controls: string; touch: (buttons: string) => string; touchStick: string; goal: string; check: string
  passRun: (frames: number, ops: number) => string; reacts: string; passStatic: string; notRun: string; fixed: (n: number) => string
  failRun: string; failStatic: string; ask: string; browser: string; next: string; planFallback: string
}> = {
  ru: {
    ready: (t, g, l) => `**Игра «${t}» готова** — ${g}, ${l}.`, updated: (t) => `**Игра «${t}» обновлена.** Изменение внесено, остальное работает как раньше.`,
    levels: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "уровень" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "уровня" : "уровней"}`, endless: "бесконечный режим с ростом сложности",
    play: "Нажмите «Играть» в окне предпросмотра ниже — там же пауза (P), звук (M) и рекорд.", controls: "Управление", touch: (b) => `На телефоне — джойстик${b ? ` и кнопки ${b}` : ""}.`, touchStick: "На телефоне — касания по экрану.", goal: "Цель",
    check: "Проверка перед выдачей", passStatic: "код разобран без синтаксических ошибок, запрещённых вызовов (сеть, хранилище, eval) нет",
    passRun: (f, o) => `игра запущена на сервере в изолированной песочнице — ${f} кадров без сбоев, на экран выводится около ${o} элементов за кадр`, reacts: "управление действительно меняет ход игры",
    notRun: "прогон в песочнице сейчас не выполнялся — проверьте игру в окне предпросмотра", fixed: (n) => `ошибки, найденные при прогоне, исправлены автоматически (${n} ${n === 1 ? "раунд" : "раунда"})`,
    failRun: "⚠️ В тестовом прогоне осталась проблема", failStatic: "⚠️ Код не прошёл проверку", ask: "Напишите «исправь игру» — я исправлю по этому отчёту.",
    browser: "Графику, звук и ощущение от управления сервер не видит — их оцените сами в окне ниже.", next: "Можно попросить: «добавь босса», «сделай врагов быстрее», «добавь новый вид оружия», «сделай игру сложнее».",
    planFallback: "Дизайн игры собран по жанру: модель-дизайнер сейчас не ответила.",
  },
  kk: {
    ready: (t, g, l) => `**«${t}» ойыны дайын** — ${g}, ${l}.`, updated: (t) => `**«${t}» ойыны жаңартылды.** Өзгеріс енгізілді, қалғаны бұрынғыдай.`,
    levels: (n) => `${n} деңгей`, endless: "қиындығы өсетін шексіз режим",
    play: "Төмендегі алдын ала қарау терезесінде «Ойнау» батырмасын басыңыз — үзіліс (P), дыбыс (M) және рекорд сонда.", controls: "Басқару", touch: (b) => `Телефонда — джойстик${b ? ` және ${b} батырмалары` : ""}.`, touchStick: "Телефонда — экранды түрту.", goal: "Мақсат",
    check: "Берер алдындағы тексеру", passStatic: "код синтаксистік қатесіз, тыйым салынған шақырулар жоқ",
    passRun: (f, o) => `ойын серверде оқшауланған құмсалғышта іске қосылды — ${f} кадр қатесіз, әр кадрда шамамен ${o} элемент`, reacts: "басқару ойын барысын шынымен өзгертеді",
    notRun: "құмсалғышта іске қосу орындалмады — ойынды төмендегі терезеде тексеріңіз", fixed: (n) => `табылған қателер автоматты түрде түзетілді (${n} раунд)`,
    failRun: "⚠️ Сынақ кезінде мәселе қалды", failStatic: "⚠️ Код тексеруден өтпеді", ask: "«ойынды түзет» деп жазыңыз — осы есеп бойынша түзетемін.",
    browser: "Графиканы, дыбысты және басқару сезімін сервер көрмейді — оларды төмендегі терезеде өзіңіз бағалаңыз.", next: "Сұрауға болады: «босс қос», «жауларды жылдамдат», «ойынды қиындат».",
    planFallback: "Ойын дизайны жанр бойынша жиналды: дизайнер-модель қазір жауап бермеді.",
  },
  en: {
    ready: (t, g, l) => `**${t} is ready** — ${g}, ${l}.`, updated: (t) => `**${t} is updated.** The change is in; everything else works as before.`,
    levels: (n) => `${n} level${n === 1 ? "" : "s"}`, endless: "endless mode with rising difficulty",
    play: "Press «Play» in the preview below — pause (P), sound (M) and your best score are there too.", controls: "Controls", touch: (b) => `On a phone: a joystick${b ? ` and ${b} buttons` : ""}.`, touchStick: "On a phone: tap the screen.", goal: "Goal",
    check: "Checked before delivery", passStatic: "the code parses with no syntax errors and no forbidden calls (network, storage, eval)",
    passRun: (f, o) => `the game ran on the server in an isolated sandbox — ${f} frames without a crash, about ${o} shapes drawn per frame`, reacts: "the controls really change the game",
    notRun: "the sandbox run did not happen this time — check the game in the preview", fixed: (n) => `problems found in the run were fixed automatically (${n} round${n === 1 ? "" : "s"})`,
    failRun: "⚠️ A problem remained in the test run", failStatic: "⚠️ The code did not pass the checks", ask: "Write «fix the game» and I will fix it from this report.",
    browser: "The server cannot see graphics, sound or how the controls feel — judge those yourself in the preview.", next: "Try next: «add a boss», «make the enemies faster», «add a new weapon», «make it harder».",
    planFallback: "The design was put together by genre: the designer model did not answer just now.",
  },
}

/** The chat answer: what was made, how to play, what was checked — and the game itself. */
export function gameChatMessage(result: GameResult, mode: "new" | "edit") {
  const plan = result.plan
  const copy = COPY[plan.locale] || COPY.en
  const controls = plan.controls.map((control) => `\`${control.keys.replace(/`/gu, "")}\` — ${control.action}`).join(" · ")
  const buttons = plan.touch.buttons.map((button) => `«${button.label}»`).join(", ")
  const touchLine = plan.touch.joystick ? copy.touch(buttons) : plan.input !== "keyboard" ? copy.touchStick : ""
  const qa = result.qa
  const staticOk = qa.syntax.status === "pass" && qa.policy.status === "pass" && qa.contract.status === "pass"
  const checks: string[] = []
  if (staticOk) checks.push(copy.passStatic)
  if (qa.run.status === "pass") {
    checks.push(copy.passRun(qa.run.frames || 0, qa.run.drawOpsPerFrame || 0))
    if (qa.run.reactsToInput) checks.push(copy.reacts)
  } else if (qa.run.status === "not_run" && staticOk) checks.push(copy.notRun)
  if (result.calls.repairs > 0 && result.ok) checks.push(copy.fixed(result.calls.repairs))
  const problems = [...qa.syntax.details, ...qa.policy.details, ...qa.contract.details, ...(qa.run.status === "fail" ? qa.run.details : [])].slice(0, 4)
  return [
    mode === "edit" ? copy.updated(plan.title) : copy.ready(plan.title, plan.genre, plan.levels ? copy.levels(plan.levels) : copy.endless),
    "",
    copy.play,
    "",
    `**${copy.controls}:** ${controls}.${touchLine ? ` ${touchLine}` : ""}`,
    "",
    `**${copy.goal}:** ${plan.goal}`,
    "",
    "```html filename=index.html",
    result.html,
    "```",
    "",
    checks.length ? `**${copy.check}:** ${checks.join("; ")}.` : "",
    ...(problems.length ? ["", `${staticOk ? copy.failRun : copy.failStatic}:`, ...problems.map((problem) => `- ${problem}`), "", copy.ask] : ["", copy.browser]),
    ...(mode === "new" && !result.calls.plan ? ["", copy.planFallback] : []),
    "",
    copy.next,
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n")
}

/**
 * A finished game is 40–90 KB of HTML. The model never needs it in full again:
 * a change reads it from the full messages. In history it becomes one line.
 */
export function compactGameHistory<T extends Message>(messages: T[]): T[] {
  if (!Array.isArray(messages)) return messages
  return messages.map((message) => {
    if (message?.role !== "assistant" || typeof message.content !== "string" || !message.content.includes('id="malik-game-logic"')) return message
    const game = readGamePage(message.content.replace(/\r(?!\n)/gu, "\n"))
    const summary = game
      ? `[Malik Game Studio: игра «${game.plan.title}» (${game.plan.genre}, ${game.plan.levels || "∞"} ур.) показана пользователю целиком и играется в предпросмотре; правки вносятся в её код.]`
      : "[Malik Game Studio: игра показана пользователю целиком.]"
    const headline = message.content.split("\n").find((line) => line.trim() && !line.startsWith("```")) || ""
    return { ...message, content: `${headline.slice(0, 300)}\n\n${summary}` }
  })
}
