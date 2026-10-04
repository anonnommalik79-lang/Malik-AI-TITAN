/**
 * Text typed with the wrong keyboard layout, read the way it was meant.
 *
 * «chfdyb ;tcnrjv ehjdyt xfnugn b rkjl» is «сравни жёстком уровне чатгпт и
 * клод» typed on an English layout. People do this constantly - on a phone
 * that switched layouts, on a laptop with a stuck shortcut - and a model that
 * answers the gibberish literally looks stupid. ChatGPT reads it; so does
 * Malik AI now.
 *
 * The decision is made word by word with letter-pair statistics: a word is
 * converted only when its Cyrillic reading looks like Russian far more than
 * its Latin reading looks like English. Real English («kubernetes deployment
 * rollback», «iphone 17 pro max», «python») is left alone, and a message is
 * converted only when most of its words agree.
 */

const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?"
const RU = "ёйцукенгшщзхъфывапролджэячсмитьбю.ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,"

const TO_RU = new Map<string, string>()
for (let index = 0; index < EN.length; index += 1) TO_RU.set(EN[index], RU[index])

/** The most frequent letter pairs of each language (from common corpora). */
const RU_PAIRS = new Set((
  "ст но то на ен ов ни ра во ко ро пр ре ос ан ол ер по ал ли ть та ль ел ет он не ва ит ка ор ла ле ат ог ин ом ри ди де ам ны од ве ой ск ки ес ти ми тв ак об " +
  "ем ст ем ия ие ую ая ый ий ое ых их ом ам ем им ет ют ат ят ул ус ук уж ум уд уч ут ур уп ую ну ну ду бу ру му ту ку пу ву лу жу чу шу зу " +
  "ав ад аз ай ак ам ап ар ас аю ба бе би бо бы бл бр вл вн вы вс га ги го гр да дв ди до др ду ды ед еж ез ей ек ел ем ен ер ес ет ех жа же жи " +
  "за зв зд зн зо ив иг ид из ик ил им ин ир ис ит их иц ич ко кр кт ку ла лд ле лж ли лк ло лу лы ль лю ля ма ме ми мн мо му мы мя на нг нд не " +
  "ни нк но нн нс нт ну ны нь ня об ов ог од ож оз ой ок ол ом он оп ор ос от ох оч ош па пе пи пл по пр пу ра ре ри ро ру ры рь ря са св се си " +
  "ск сл см сн со сп ср ст су сх сь ся та тв те ти тн то тр ту ты ть тя уг уж ул ум ун ур ус ут фо ха хо це ци ча че чи чн чт ша ше щи эт юб ющ яв " +
  "яз ят ям ящ гп пт тг тгп ло од"
).split(/\s+/).filter(Boolean))

const EN_PAIRS = new Set((
  "th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce li ch ll be ma si om ur ca " +
  "el ta la ns ge ly ei os no pe do su pa ec ac ot di ol tr sh ad ag ai am ap ay bl bo br bu ck cr ct cu da di do dr ds ee em ep et ex fe fi fo fr ft " +
  "gh gi go gr ho ia ic id ie if il im io ip ir iv ke ki la ld lo lu ly mo mp mu na ni nc nk ns oc od oi ok ol oo op os ow oy pl po pr pt qu rd rk " +
  "rm rn rs rt ru ry sa sc so sp ss su sy tw ty ua ub ud ue ug ul um un up us ut va vi wa we wh wi wo ws ya yo ys ze"
).split(/\s+/).filter(Boolean))

const RU_VOWELS = /[аеёиоуыэюя]/u
const EN_VOWELS = /[aeiouy]/i

/** A short list of Latin-letter words people write in a Russian sentence. */
const KEEP_LATIN = /^(?:ai|api|ui|ux|ok|id|ios|android|iphone|ipad|mac|macbook|python|java|javascript|typescript|js|ts|css|html|react|next|node|sql|github|git|google|gemini|gpt|chatgpt|claude|openai|anthropic|telegram|whatsapp|instagram|tiktok|youtube|kaspi|pro|max|plus|mini|ultra|wifi|usb|pdf|seo|crm|vs|it|ok|www|com|kz|ru|en)$/iu

function convertWord(word: string) {
  let out = ""
  for (const char of word) out += TO_RU.get(char) ?? char
  return out
}

function pairScore(word: string, pairs: Set<string>) {
  const letters = word.toLowerCase().replace(/[^a-zа-яё]/giu, "")
  if (letters.length < 2) return 0
  let hits = 0
  for (let index = 0; index < letters.length - 1; index += 1) {
    if (pairs.has(letters.slice(index, index + 2))) hits += 1
  }
  return hits / (letters.length - 1)
}

/** Orthography Russian never produces: a word starting with ь/ъ/ы, «жы/шы», and so on. */
function impossibleRussian(word: string) {
  const lower = word.toLowerCase()
  return /^[ьъы]|[жшчщ]ы|[ьъ]{2}|[аеёиоуыэюя][ьъ]|й[ьъы]|[бвгджзклмнпрстфхцчшщ]{5}/u.test(lower)
}

type Token = { text: string; word: boolean }

function tokenize(text: string): Token[] {
  // Layout keys that turn into Russian letters (; ' [ ] , . `) belong to the word.
  return (text.match(/[A-Za-z;'\[\]{}:"<>,.`~]+|[^A-Za-z;'\[\]{}:"<>,.`~]+/g) || []).map((part) => ({
    text: part,
    word: /[A-Za-z]/.test(part),
  }))
}

export type LayoutFix = { text: string; converted: number; words: number }

/**
 * Returns the Russian reading when the text was clearly typed on an English
 * layout, otherwise null. Never touches text that already contains Cyrillic.
 */
export function fixWrongKeyboardLayout(input: string): LayoutFix | null {
  const text = String(input || "")
  if (!text.trim() || /[а-яёәіңғүұқөһ]/iu.test(text) || text.length > 2_000) return null
  if (/https?:\/\/|www\.|@|```/iu.test(text)) return null
  const tokens = tokenize(text)
  const words = tokens.filter((token) => token.word)
  const letters = words.reduce((sum, token) => sum + token.text.replace(/[^A-Za-z]/g, "").length, 0)
  if (!words.length || letters < 5) return null

  let russian = 0
  let english = 0
  const decisions = new Map<Token, boolean>()
  for (const token of words) {
    const raw = token.text
    // Trailing sentence punctuation stays punctuation.
    const core = raw.replace(/[.,]+$/u, "")
    if (core.length < 2) continue
    if (KEEP_LATIN.test(core)) { english += 1; decisions.set(token, false); continue }
    const cyr = convertWord(core)
    const layoutKeys = /[;'\[\]{}:"<>`~]|[A-Za-z][,.][A-Za-z]/.test(core)
    const ru = pairScore(cyr, RU_PAIRS) + (RU_VOWELS.test(cyr) ? 0.1 : -0.4) - (impossibleRussian(cyr) ? 0.6 : 0)
    const en = pairScore(core, EN_PAIRS) + (EN_VOWELS.test(core) ? 0.05 : -0.4) - (layoutKeys ? 0.5 : 0)
    const toRussian = ru - en >= 0.15 && ru >= 0.35
    decisions.set(token, toRussian)
    if (toRussian) russian += 1
    else english += 1
  }

  const judged = russian + english
  if (!russian || !judged || russian / judged < 0.6) return null

  let converted = 0
  const out = tokens.map((token) => {
    if (!token.word) return token.text
    const decided = decisions.get(token)
    const core = token.text.replace(/[.,]+$/u, "")
    const tail = token.text.slice(core.length)
    // Short words («b», «d», «z») follow the sentence: in a Russian sentence
    // they are и, в, я.
    if (decided === true || (decided === undefined && core.length <= 1 && !/^[ai]$/iu.test(core))) {
      converted += 1
      return convertWord(core) + tail
    }
    return token.text
  })
  return { text: out.join(""), converted, words: words.length }
}

/**
 * The chat request with the prompt replaced by its Russian reading wherever
 * it appears (the direct fields, the composed question, the last user turn),
 * or null when nothing needs fixing. `layoutCorrectedFrom` keeps the original.
 */
export function layoutFixedChatBody(body: any, prompt: string): any | null {
  if (!body || typeof body !== "object" || !prompt) return null
  const fix = fixWrongKeyboardLayout(prompt)
  if (!fix) return null
  const next = { ...body, layoutCorrectedFrom: prompt }
  for (const key of ["originalQuestion", "prompt", "message", "input", "text", "content"]) {
    if (typeof next[key] === "string" && next[key].trim() === prompt) next[key] = fix.text
  }
  if (typeof next.question === "string") {
    next.question = next.question.includes(prompt) ? next.question.replace(prompt, fix.text) : `${fix.text}\n\n${next.question}`
  }
  if (Array.isArray(next.messages)) {
    const messages = [...next.messages]
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user" && typeof messages[index]?.content === "string" && messages[index].content.trim() === prompt) {
        messages[index] = { ...messages[index], content: fix.text }
        break
      }
    }
    next.messages = messages
  }
  return next
}
