import { primaryNonMediaArtifact } from "./artifact-intent"
import {
  isExplicitImageGenerationRequest,
  isExplicitVideoGenerationRequest,
  isTextOnlyMediaDiscussion,
  repairMixedScript,
} from "./image-intent"

/**
 * Reads what the person wrote together with the conversation and decides what
 * has to happen. Pure and shared: the browser uses it to start the work without
 * a model turn, the server uses it as a second line behind any client, and the
 * end of a text turn uses it to catch a model that refused or asked back
 * instead of doing what it was told.
 */

export type MediaTurn = { kind: "image" | "video"; prompt: string; via: "request" | "go-ahead" | "again" | "details" }

export type ChatTurn = {
  role?: unknown
  content?: unknown
  generatedMedia?: { kind?: unknown; status?: unknown; prompt?: unknown } | null
  imageConfirmation?: { prompt?: unknown } | null
}

export type ExecutionIssue = "denied-media" | "prompt-instead-of-media" | "denied-capability" | "left-placeholders" | "asked-instead"

const FILLER = String.raw`(?:(?:ну|да|так|давай|же|блин|ладно|хорошо|окей|ок|короче|пожалуйста|бро|брат|братан|эй|слушай|please|ok|okay|yes|well|come\s+on)[\s,!.…-]+)*`
const MAKE = String.raw`(?:сген(?:ер|ен)[\p{L}-]*|генерир[\p{L}-]*|генери|сделай(?:те)?|делай(?:те)?|создай(?:те)?|создавай(?:те)?|нарисуй(?:те)?|рисуй(?:те)?|запускай(?:те)?|запусти(?:те)?|жаса(?:шы)?|generate|create|make|draw|render|do)`
const ORDER_WORDS = String.raw`(?:[\s,]+(?:его|е[её]|это|этот|эту|вс[её]|их|уже|же|ну|сам|сама|сейчас|прямо\s+сейчас|наконец(?:-то)?|скорее|быстрее|быстро|пожалуйста|мне|please|now|it|already|(?:как|что|то\s+что|то,\s*что)\s+(?:я\s+)?(?:говорю|говорил[а]?|сказал[а]?|сказано|прошу|просил[а]?|написал[а]?|пишу|хочу|надо|нужно)|(?:what|as)\s+i\s+(?:said|asked|say)))*`
const MEDIA_WORD = String.raw`(?:[\s,]+(?:фото(?:графию)?|фотку|картинку|изображение|image|photo|picture))?`

/** An order with no subject of its own: «ну сгенерируй как я говорю». */
const GO_AHEAD = new RegExp(String.raw`^${FILLER}${MAKE}${ORDER_WORDS}${MEDIA_WORD}${ORDER_WORDS}[\s.!…)]*$`, "iu")
const CONFIRM = new RegExp(String.raw`^${FILLER}(?:да|ага|угу|давай|го|ок|окей|конечно|можно|хорошо|ладно|погнали|поехали|жми|иә|жарайды|yes|yep|yeah|ok|okay|sure|go(?:\s+ahead)?|do\s+it)[\s.!…)]*$`, "iu")
const AGAIN = new RegExp(String.raw`^${FILLER}(?:ещ[её](?:\s+(?:раз|один|одну|одно|вариант|варианты|такую|такое|такой|фото|картинку))?|повтори|заново|по-?новой|другой\s+вариант|другую|другое|another(?:\s+one)?|again|one\s+more|try\s+again)[\s.!…)]*$`, "iu")
const MAKE_WITH_DETAILS = new RegExp(String.raw`^${FILLER}(?:сген(?:ер|ен)[\p{L}-]*|генерир[\p{L}-]*|нарисуй(?:те)?|рисуй(?:те)?|generate|draw)[\s,:]+(.{2,240})$`, "iu")

/** The person gives an order: the answer has to be the thing, not a discussion of it. */
const DIRECTIVE = new RegExp(String.raw`^${FILLER}(?:сделай(?:те)?|создай(?:те)?|сгенерируй(?:те)?|напиши(?:те)?|составь(?:те)?|подготовь(?:те)?|придумай(?:те)?|нарисуй(?:те)?|переведи(?:те)?|посчитай(?:те)?|найди(?:те)?|дай(?:те)?|скинь(?:те)?|исправь(?:те)?|оформи(?:те)?|собери(?:те)?|оцени(?:те)?|проверь(?:те)?|жаса(?:шы)?|make|create|generate|write|build|draw|translate|find|give|fix|prepare)(?!\p{L})`, "iu")

const OFFER_SUBJECT = /(?:промпт|prompt|сгенерир|генерац|изображени|картин|(?<!\p{L})фото|image|picture)/iu
const OFFER_MOVE = /(?:уточн|могу|не\s+могу|хотите|включите|инструмент|can(?:'|no)t|cannot|would\s+you|specify|промпт|prompt)/iu
const ASKS_DETAILS = /(?:уточни|какой|какую|какие|какая|какое|что\s+именно|specify|which|what\s+(?:kind|type|style)|\?\s*$)/iu

const contentOf = (turn: ChatTurn) => typeof turn?.content === "string" ? turn.content.trim() : ""

function withoutThisTurn(history: readonly ChatTurn[], text: string) {
  const last = history.at(-1)
  return last?.role === "user" && repairMixedScript(contentOf(last)) === text ? history.slice(0, -1) : history
}

function isOrder(text: string) {
  return GO_AHEAD.test(text) || CONFIRM.test(text) || AGAIN.test(text)
}

type ImageContext = { subject: string; details: string[]; generated: boolean; pending: boolean; offered: boolean; askedDetails: boolean }

/**
 * What picture this conversation is talking about, if any. It walks back from
 * the newest turn and stops at anything else, so an old picture never answers
 * a «сделай» that belongs to a poem written since.
 */
function imageContext(history: readonly ChatTurn[]): ImageContext | null {
  const recent = history.slice(-10)
  const details: string[] = []
  let offered = false
  let askedDetails = false
  let seenAssistant = false
  for (let index = recent.length - 1; index >= 0; index--) {
    const turn = recent[index]
    const text = repairMixedScript(contentOf(turn))
    if (turn?.role === "assistant") {
      const media = turn.generatedMedia
      if (media?.kind === "image" && typeof media.prompt === "string" && media.prompt.trim()) {
        return { subject: media.prompt.trim(), details, generated: media.status === "ready" && !seenAssistant, pending: false, offered, askedDetails }
      }
      if (typeof turn.imageConfirmation?.prompt === "string" && turn.imageConfirmation.prompt.trim()) {
        return { subject: turn.imageConfirmation.prompt.trim(), details, generated: false, pending: true, offered, askedDetails }
      }
      if (OFFER_SUBJECT.test(text) && OFFER_MOVE.test(text)) {
        if (!seenAssistant) askedDetails = ASKS_DETAILS.test(text)
        offered = true
      } else if (!seenAssistant && !offered) return null
      seenAssistant = true
      continue
    }
    if (turn?.role !== "user") continue
    if (isExplicitImageGenerationRequest(text) && !GO_AHEAD.test(text)) {
      return { subject: text, details, generated: false, pending: false, offered, askedDetails }
    }
    if (isOrder(text)) continue
    if (offered && text.length <= 200 && !text.includes("?")) { details.unshift(text); continue }
    return null
  }
  return null
}

function isShortDetail(text: string) {
  return text.split(/\s+/u).length <= 20 && !text.includes("?") && /\p{L}{3,}/u.test(text)
    && !DIRECTIVE.test(text) && !isTextOnlyMediaDiscussion(text) && !primaryNonMediaArtifact(text)
}

/** «сделай фото» with nothing to draw and nothing earlier to draw from. */
export function isBareMediaOrder(input: string, history: readonly ChatTurn[] = []) {
  const text = repairMixedScript(String(input || "").trim())
  return GO_AHEAD.test(text) && !imageContext(withoutThisTurn(history, text))
}

/**
 * The picture or video this message asks for, understood from the conversation.
 * Uploaded pixels have their own edit and analysis routes, so `hasImage` leaves
 * those decisions where they are.
 */
export function resolveMediaTurn(input: string, history: readonly ChatTurn[] = [], hasImage = false): MediaTurn | null {
  const text = repairMixedScript(String(input || "").trim())
  if (!text || text.length > 4000 || text.startsWith("/") || hasImage) return null
  const context = imageContext(withoutThisTurn(history, text))
  if (context) {
    const prompt = [context.subject, ...context.details].join(". ")
    if (GO_AHEAD.test(text)) return { kind: "image", prompt, via: "go-ahead" }
    if (CONFIRM.test(text) && (context.offered || context.pending)) return { kind: "image", prompt, via: "go-ahead" }
    if (AGAIN.test(text) && (context.generated || context.offered)) return { kind: "image", prompt, via: "again" }
    if (!isExplicitImageGenerationRequest(text)) {
      const more = MAKE_WITH_DETAILS.exec(text)?.[1]?.trim()
      if (more) return { kind: "image", prompt: `${prompt}. ${more}`, via: "details" }
      if (context.offered && context.askedDetails && isShortDetail(text)) return { kind: "image", prompt: `${prompt}. ${text}`, via: "details" }
    }
  }
  if (GO_AHEAD.test(text)) return null
  if (isExplicitImageGenerationRequest(text)) return { kind: "image", prompt: text, via: "request" }
  if (isExplicitVideoGenerationRequest(text)) return { kind: "video", prompt: text, via: "request" }
  return null
}

/** «Создай трек про лето» belongs to the music studio; «напиши текст песни» stays in the chat. */
export function isMusicCreationRequest(input: string) {
  const text = repairMixedScript(String(input || "").trim())
  if (!text || text.length > 1500 || /[?]\s*$/u.test(text)) return false
  if (/(?:текст\p{L}*\s+(?:песн|трек)|слова\s+(?:песн|трек)|lyrics|код|code|плейлист|playlist)/iu.test(text)) return false
  return new RegExp(String.raw`^${FILLER}(?:(?:мне\s+)?(?:нужн[аоы]|нужен|хочу)\s+)?(?:сделай(?:те)?|создай(?:те)?|сгенерируй(?:те)?|запиши(?:те)?|жаса(?:шы)?|make|create|generate)?(?:\s+мне)?\s*(?:нов\p{L}*\s+|сво\p{L}*\s+)?(?:трек|песн[юяи]|музык[уа]|бит|мелоди[юя]|саундтрек|джингл|инструментал|song|track|music|beat|melody|jingle|әнді?|музыка)(?!\p{L})`, "iu").test(text)
    && !/^(?:трек|песн|музык|бит|мелоди|song|track|music|beat)/iu.test(text)
}

const MEDIA_DENIALS = [
  /(?:не\s+могу|не\s+умею|не\s+способ(?:ен|на)|не\s+получится|нет\s+возможности|невозможно)[^.!?\n]{0,80}(?:сгенерир|генерир|созда|сдела|нарис|отобраз|показать)[^.!?\n]{0,60}(?:изображен|картин|фото|иллюстрац|баннер|постер|видео)/iu,
  /нет\s+(?:встроенн\p{L}*\s+)?(?:инструмент\p{L}*|возможност\p{L}*|функци\p{L}*)[^.!?\n]{0,60}(?:изображен|картин|фото|генерац)/iu,
  /(?:включите|активируйте|используйте|воспользуйтесь|откройте)\s+[^.!?\n]{0,60}(?:инструмент|генератор|сервис)[^.!?\n]{0,60}(?:изображен|картин|фото|создани|генерац)/iu,
  /\bi\s+(?:can(?:no|')t|am\s+unable\s+to|do\s+not\s+have|don'?t\s+have)\b[^.!?\n]{0,80}(?:generat|creat|draw|produc|render|display)[^.!?\n]{0,60}(?:images?|pictures?|photos?|videos?)/iu,
]
const PROMPT_INSTEAD = [
  /(?:^|\n|[.!?]\s)\s*(?:вот\s+)?(?:\p{L}+\s+){0,2}промпт\p{L}*\s+(?:для|на)\s/iu,
  /могу\s+(?:сгенерировать|написать|составить|подготовить)\s+[^.!?\n]{0,40}промпт/iu,
  /^\s*[*_"«]*промпт[*_"»]*\s*:/imu,
  /here(?:'s|\s+is)\s+(?:a|the|your)\s+(?:\w+\s+){0,2}prompt/iu,
]
const CAPABILITY_DENIALS = [
  /(?:у\s+меня\s+нет|я\s+не\s+имею)\s+(?:прямого\s+)?доступа\s+к\s+(?:интернету|сети|браузеру|файл|вложен|сайт)/iu,
  /не\s+могу\s+(?:выходить\s+в\s+интернет|искать\s+в\s+интернете|открывать\s+(?:ссылки|сайты)|просматривать\s+(?:ссылки|сайты)|создавать\s+файлы|создать\s+файл|отправлять\s+файлы|прикрепить\s+файл)/iu,
  /я\s+(?:всего\s+лишь|только|просто)\s+(?:текстов\p{L}*\s+)(?:модель|ассистент|бот)/iu,
  /как\s+(?:языковая\s+модель|искусственный\s+интеллект)[^.!?\n]{0,40}не\s+могу/iu,
  /\bi(?:'m|\s+am)\s+(?:just|only)\s+a\s+text/iu,
  /\bi\s+(?:can(?:no|')t|cannot)\s+(?:browse|access)\s+the\s+(?:internet|web)/iu,
  /don'?t\s+have\s+(?:access\s+to\s+)?(?:the\s+)?(?:internet|browsing)/iu,
]
const PLACEHOLDER = /\[\s*(?:уточни|specify)[^\]\n]{0,80}\]/iu
const ASK_BACK = /(?:уточните|уточни(?!\p{L})|could\s+you\s+(?:please\s+)?(?:specify|clarify)|please\s+(?:specify|clarify)|какой\s+именно|что\s+именно)/iu

/**
 * An answer that did not do what it was told, or null. Moral refusals are not
 * looked for: only a denial of something this product can do, a model asking
 * back on a clear order, or a template left unfilled.
 */
export function assessExecution(input: { prompt: string; answer: string; history?: readonly ChatTurn[]; hasAttachment?: boolean }): { issue: ExecutionIssue; media: MediaTurn | null } | null {
  const answer = String(input.answer || "").trim()
  if (!answer) return null
  const ask = repairMixedScript(String(input.prompt || "").trim())
  const history = input.history || []
  const head = answer.slice(0, 1200)
  const context = input.hasAttachment ? null : imageContext(withoutThisTurn(history, ask))
  const wanted = input.hasAttachment ? null : resolveMediaTurn(ask, history)
    || (context && !DIRECTIVE.test(ask) ? { kind: "image" as const, prompt: [context.subject, ...context.details].join(". "), via: "go-ahead" as const } : null)
  if (MEDIA_DENIALS.some((pattern) => pattern.test(head))) return { issue: "denied-media", media: wanted }
  if (wanted && !/промпт|prompt/iu.test(ask) && PROMPT_INSTEAD.some((pattern) => pattern.test(head))) return { issue: "prompt-instead-of-media", media: wanted }
  if (CAPABILITY_DENIALS.some((pattern) => pattern.test(head))) return { issue: "denied-capability", media: null }
  if (PLACEHOLDER.test(answer)) return { issue: "left-placeholders", media: wanted }
  if (DIRECTIVE.test(ask) && ask.split(/\s+/u).length > 1 && !GO_AHEAD.test(ask) && answer.length < 700 && (ASK_BACK.test(head) || (answer.length < 300 && /\?\s*$/u.test(answer)))) {
    return { issue: "asked-instead", media: wanted }
  }
  return null
}

/** Orders are held back for their opening line, where a refusal shows itself. */
export function needsOpeningCheck(prompt: string, history: readonly ChatTurn[] = []) {
  const text = repairMixedScript(String(prompt || "").trim())
  if (!text || text.length > 4000) return false
  return DIRECTIVE.test(text) || isOrder(text) || Boolean(imageContext(withoutThisTurn(history, text)))
}

/**
 * Holds the first characters of an answer so that a refusal or a question back
 * never reaches the screen. Everything else passes through untouched as soon
 * as the opening is clean.
 */
export function createOpeningCheck(input: { prompt: string; history?: readonly ChatTurn[]; hasAttachment?: boolean; onToken: (chunk: string) => void; holdChars?: number }) {
  const hold = input.holdChars ?? 200
  let buffer = ""
  let open = false
  let refused = false
  const check = (whole: boolean) => {
    const found = assessExecution({ prompt: input.prompt, answer: buffer, history: input.history, hasAttachment: input.hasAttachment })
    if (!found) return false
    // Mid-answer, a question back counts only as the first sentence: further on it may belong to a real answer.
    return found.issue !== "asked-instead" || whole || ASK_BACK.test(buffer.split(/[.!?\n]/u, 1)[0])
  }
  return {
    token(chunk: string) {
      if (refused || !chunk) return
      if (open) { input.onToken(chunk); return }
      buffer += chunk
      if (buffer.length < hold) return
      if (check(false)) { refused = true; return }
      open = true
      input.onToken(buffer)
      buffer = ""
    },
    /** The run ended. Returns true when nothing of it should be shown. */
    finish() {
      if (refused) return true
      if (open || !buffer) return false
      if (check(true)) { refused = true; return true }
      open = true
      input.onToken(buffer)
      buffer = ""
      return false
    },
    refused: () => refused,
  }
}

export function mediaHandoffText(turn: MediaTurn) {
  return turn.kind === "video" ? "Запускаю генерацию видео…" : "Создаю изображение…"
}

const REPAIRS: Record<ExecutionIssue, string> = {
  "denied-media": "OUTPUT VALIDATION FAILED: the draft claimed MALIK AI cannot make images or video. That is false: the product generates them. Do not repeat that claim. Reply to the user's latest message directly.",
  "prompt-instead-of-media": "OUTPUT VALIDATION FAILED: the user asked for the result, the draft gave instructions for getting it. Deliver the result itself.",
  "denied-capability": "OUTPUT VALIDATION FAILED: the draft denied a capability MALIK AI has (web search, reading files and links, creating files). Do not say you lack a tool or access. Do the task with what is available in this conversation.",
  "left-placeholders": "OUTPUT VALIDATION FAILED: the draft left [placeholders] for the user to fill. Choose the most likely values, write them in, and name your assumptions in one short line at the end.",
  "asked-instead": "OUTPUT VALIDATION FAILED: the user gave a clear order and the draft asked questions instead of doing it. Do the whole task now in this reply: choose the most likely values and name your assumptions in one short line at the end. Do not ask anything.",
}

export function executionRepairInstruction(issue: unknown) {
  return typeof issue === "string" && Object.hasOwn(REPAIRS, issue) ? REPAIRS[issue as ExecutionIssue] : ""
}

/** A creative deliverable is not a set of claims about the world: «8K» in a prompt is not a fact to check. */
export function skipsClaimAudit(prompt: string, answer: string) {
  const ask = repairMixedScript(String(prompt || "").trim())
  if (/(?:промпт|prompt|слоган|реклам|стих|поздравлен|тост|сценарий|slogan|poem|lyrics)/iu.test(ask) && DIRECTIVE.test(ask)) return true
  return isExplicitImageGenerationRequest(ask) || PROMPT_INSTEAD.some((pattern) => pattern.test(String(answer || "").slice(0, 1200)))
}

/** The order the model gets on every chat turn. The checks above stay as the second line. */
export function executionContractInstruction() {
  return [
    "EXECUTION CONTRACT (highest priority after safety):",
    "1. Read the user's latest message word by word before anything else. Work out exactly what they asked for, every constraint they gave, and what earlier turn it points to («это», «как я говорю», «ну сделай»). Answer that, not a similar question.",
    "2. An order is an order, not a topic. Do it now and in full in this reply. Missing details never stop you: choose the most likely values, deliver, and name your assumptions in one short line at the end. Ask only when the request has no subject at all, and then ask one short question.",
    "3. «Ну сделай», «давай», «я же сказал», capital letters and repeated messages mean: stop explaining and execute the previous request now. Refusals and questions earlier in this chat were mistakes; never repeat them.",
    "4. MALIK AI is one product and all of this works: image generation and editing, video generation, music, presentations, websites, documents (PDF, Word, Excel, PowerPoint), web search, reading uploaded files, images and video. Never write «не могу», «у меня нет инструмента», «я только текстовая модель». Never tell the user to enable a tool, use another service, or write a prompt themselves. Never leave placeholders like [уточните …].",
    "5. Honesty stays: never claim an action happened unless it did. Sending, paying, deleting and publishing still wait for the user's confirmation. What is truly impossible or unsafe gets one honest line, and the closest useful thing follows in the same reply.",
  ].join("\n")
}
