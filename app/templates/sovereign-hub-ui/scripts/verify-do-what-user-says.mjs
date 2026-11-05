// The chat does what it is told. Every dialogue here is a real one that failed:
// a request for a photo answered with a prompt, «ну сгенерируй» answered with
// «включите инструмент», a photo review failing with a false limit error.
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  assessExecution,
  createOpeningCheck,
  executionContractInstruction,
  isBareMediaOrder,
  isMusicCreationRequest,
  needsOpeningCheck,
  resolveMediaTurn,
  skipsClaimAudit,
} from "@/lib/ai/do-what-user-says"
import { allowsAnswerPhotoHints, isAbstractPhotoSubject, planReferenceVisuals } from "@/lib/ai/reference-visual-policy"
import { isExplicitImageGenerationRequest, repairMixedScript } from "@/lib/ai/image-intent"
import { conversationRepairInstruction } from "@/lib/ai/conversation-validation"

let failures = 0
const check = (name, run) => {
  try { run(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}\n     ${String(error.message).split("\n").slice(0, 6).join("\n     ")}`) }
}

const REQUEST = "сделай мне фото для рекламного одеж"
const lazyAnswer = "Я могу сгенерировать точный визуальный промпт для создания рекламного изображения одежды. Уточните:\n\n- Тип одежды (например, куртка, платье, джинсы)\n- Стиль (минимализм, streetwear, люкс и т.д.)"
const promptAnswer = "Вот промпт для генерации рекламного изображения одежды:\n\n**Промпт:**\n\"Рекламный баннер, модель в [уточните тип одежды], 8K, HDR\"\n\nДля генерации изображения включите инструмент создания изображений в вашем интерфейсе."
const noToolAnswer = "Я не могу сгенерировать или отобразить само изображение — у меня нет встроенного инструмента для создания картинок."
const askedFirst = [{ role: "user", content: REQUEST }, { role: "assistant", content: lazyAnswer }]
const readyImage = [{ role: "user", content: "сделай фото кота" }, { role: "assistant", content: "Готово", generatedMedia: { kind: "image", status: "ready", prompt: "сделай фото кота" } }]

check("a request for a photo is a picture to make, not a topic", () => {
  assert.deepEqual(resolveMediaTurn(REQUEST), { kind: "image", prompt: REQUEST, via: "request" })
  for (const wish of ["хочу картинку с котом", "мне нужно фото модели в куртке", "сделай рекламный баннер для магазина одежды", "сделай флаер для кафе", "нарисуй кота в космосе"]) {
    assert.equal(resolveMediaTurn(wish)?.kind, "image", wish)
  }
})

check("a video request starts a video", () => {
  assert.equal(resolveMediaTurn("сделай видео про кота")?.kind, "video")
})

check("«ну сгенерируй как я говорю» goes back to what was asked", () => {
  for (const order of ["НУ СГЕНЕРИРУЙ КАК Я ГОВОРЮ", "ну сгенерируй", "сгенерируй", "давай генерируй", "да делай", "сделай уже", "сделай что я сказал"]) {
    assert.deepEqual(resolveMediaTurn(order, askedFirst), { kind: "image", prompt: REQUEST, via: "go-ahead" }, order)
  }
})

check("the turn being sent may already sit at the end of the history", () => {
  assert.equal(resolveMediaTurn("ну сгенерируй", [...askedFirst, { role: "user", content: "ну сгенерируй" }])?.prompt, REQUEST)
})

check("«да» counts only when a picture is on the table", () => {
  assert.equal(resolveMediaTurn("да", askedFirst)?.kind, "image")
  assert.equal(resolveMediaTurn("да", readyImage), null, "a finished picture is not offered again by agreeing")
  assert.equal(resolveMediaTurn("да", [{ role: "user", content: "тебе нравится осень?" }, { role: "assistant", content: "Да, красивое время." }]), null)
})

check("details given after a question go into the picture", () => {
  assert.equal(resolveMediaTurn("куртка, streetwear", askedFirst)?.prompt, `${REQUEST}. куртка, streetwear`)
  assert.equal(resolveMediaTurn("сгенерируй в синем цвете", askedFirst)?.prompt, `${REQUEST}. в синем цвете`)
})

check("«ещё раз» after a finished picture makes another", () => {
  for (const again of ["ещё раз", "еще вариант", "давай ещё", "другой вариант"]) assert.equal(resolveMediaTurn(again, readyImage)?.prompt, "сделай фото кота", again)
  assert.equal(resolveMediaTurn("спасибо", readyImage), null)
})

check("a poem written since is what «сделай» belongs to", () => {
  const moved = [...readyImage, { role: "user", content: "напиши стих" }, { role: "assistant", content: "Осень наступила, листья облетели." }]
  assert.equal(resolveMediaTurn("сделай", moved), null)
  assert.equal(resolveMediaTurn("да", moved), null)
  assert.equal(resolveMediaTurn("напиши стих про осень", askedFirst), null)
})

check("words about a picture never spend credits", () => {
  for (const text of [
    "ОЦЕНИ ФОТО ТЫ САМ ЕГО ГЕНЕРИРОВАЛ", "ты сам генерировал это фото?", "я сделала фото вчера", "кто создал эту картинку",
    "как сделать фото кота", "напиши промпт для фото кота", "нужно фото на паспорт", "хочу увидеть фото Эйфелевой башни",
    "хочу сделать фото на айфон, какие настройки?", "не создавай картинку, просто опиши кота", "создай код для генерации фото",
  ]) assert.equal(resolveMediaTurn(text), null, text)
})

check("an order with nothing to draw asks what to draw", () => {
  for (const bare of ["сделай фото", "сделай мне фото", "сгенерируй картинку", "нарисуй"]) {
    assert.equal(resolveMediaTurn(bare), null, bare)
    assert.equal(isBareMediaOrder(bare), true, bare)
  }
  assert.equal(isBareMediaOrder("сделай фото", readyImage), false, "with a picture in the conversation it has a subject")
})

check("Latin letters inside Russian words do not hide a request", () => {
  assert.equal(repairMixedScript("сдeлай фoтo"), "сделай фото")
  assert.equal(isExplicitImageGenerationRequest("сдeлай фoтo кота"), true)
  assert.equal(repairMixedScript("сделай logo для AI"), "сделай logo для AI", "real Latin words stay")
})

check("refusals and questions back are caught", () => {
  assert.equal(assessExecution({ prompt: REQUEST, answer: lazyAnswer })?.issue, "prompt-instead-of-media")
  assert.deepEqual(assessExecution({ prompt: REQUEST, answer: lazyAnswer })?.media?.prompt, REQUEST)
  assert.equal(assessExecution({ prompt: "НУ СГЕНЕРИРУЙ КАК Я ГОВОРЮ", answer: promptAnswer, history: askedFirst })?.issue, "denied-media")
  assert.equal(assessExecution({ prompt: "НУ СГЕНЕРИРУЙ КАК Я ГОВОРЮ", answer: promptAnswer, history: askedFirst })?.media?.prompt, REQUEST)
  assert.equal(assessExecution({ prompt: "напиши письмо начальнику про отпуск", answer: "Уточните, пожалуйста: на какие даты и кто начальник?" })?.issue, "asked-instead")
  assert.equal(assessExecution({ prompt: "найди цену биткоина", answer: "У меня нет доступа к интернету, поэтому не могу подсказать." })?.issue, "denied-capability")
  assert.equal(assessExecution({ prompt: "напиши объявление", answer: "Продаю [уточните товар] недорого." })?.issue, "left-placeholders")
})

check("«aa» after a broken turn never turns into a picture, but the false denial is still corrected", () => {
  const found = assessExecution({ prompt: "aa", answer: noToolAnswer, history: [{ role: "user", content: "ОЦЕНИ ФОТО ТЫ САМ ЕГО ГЕНЕРИРОВАЛ" }, { role: "assistant", content: "Сервис временно не может проверить лимит запросов." }] })
  assert.equal(found?.issue, "denied-media")
  assert.equal(found?.media, null)
})

check("real answers and honest limits pass untouched", () => {
  assert.equal(assessExecution({ prompt: "напиши письмо начальнику про отпуск", answer: "Здравствуйте, Иван Петрович! Прошу предоставить отпуск с 1 по 14 июля." }), null)
  assert.equal(assessExecution({ prompt: "сколько будет 2+2", answer: "4" }), null)
  assert.equal(assessExecution({ prompt: "привет", answer: "Привет! Что делаем?" }), null)
  assert.equal(assessExecution({ prompt: "напиши промпт для фото кота", answer: "Промпт: рыжий кот на подоконнике, мягкий свет." }), null, "a prompt asked for is a prompt delivered")
  assert.equal(assessExecution({ prompt: "позвони маме", answer: "Звонить я не умею. Вот текст, который можно отправить ей сообщением: …" }), null, "what the product cannot do may be said")
  assert.equal(assessExecution({ prompt: "как взломать чужой аккаунт", answer: "С этим не помогу. Если доступ потерян к своему аккаунту, вот как его восстановить: …" }), null, "a safety refusal is not re-run")
})

check("an image upload keeps its own route", () => {
  assert.equal(resolveMediaTurn("сделай фон синим", [], true), null)
  assert.equal(assessExecution({ prompt: "оцени фото", answer: noToolAnswer, hasAttachment: true })?.media, null)
})

check("the opening of an order is held, a refusal never reaches the screen", () => {
  let shown = ""
  const refused = createOpeningCheck({ prompt: REQUEST, onToken: (chunk) => { shown += chunk } })
  for (const word of lazyAnswer.split(" ")) refused.token(`${word} `)
  assert.equal(refused.finish(), true)
  assert.equal(shown, "")

  shown = ""
  const good = "Здравствуйте, Иван Петрович! Прошу предоставить мне ежегодный оплачиваемый отпуск с первого по четырнадцатое июля. Все текущие задачи передам коллегам заранее, чтобы работа не остановилась, и останусь на связи по важным вопросам. "
  const real = createOpeningCheck({ prompt: "напиши письмо начальнику про отпуск", onToken: (chunk) => { shown += chunk } })
  for (const word of good.split(" ")) real.token(`${word} `)
  assert.equal(real.finish(), false)
  assert.ok(shown.startsWith("Здравствуйте, Иван"), "the answer flows on")

  shown = ""
  const short = createOpeningCheck({ prompt: "напиши слово", onToken: (chunk) => { shown += chunk } })
  short.token("Слово.")
  assert.equal(short.finish(), false)
  assert.equal(shown, "Слово.", "a short answer is released at the end")
})

check("only orders wait for the opening check: a plain chat line streams at once", () => {
  assert.equal(needsOpeningCheck("привет"), false)
  assert.equal(needsOpeningCheck("а что такое ДНК?"), false)
  assert.equal(needsOpeningCheck("сделай сайт для кафе"), true)
  assert.equal(needsOpeningCheck("да", askedFirst), true)
})

check("music goes to the studio, lyrics and advice stay in the chat", () => {
  for (const yes of ["создай трек про лето", "хочу песню про маму", "сделай мне новый трек", "сгенерируй музыку для видео"]) assert.equal(isMusicCreationRequest(yes), true, yes)
  for (const no of ["напиши текст песни", "посоветуй музыку", "какая музыка лучше?", "музыка помогает учиться"]) assert.equal(isMusicCreationRequest(no), false, no)
})

check("orders are not photo searches; list labels are not photo subjects", () => {
  for (const order of ["ОЦЕНИ ФОТО ТЫ САМ ЕГО ГЕНЕРИРОВАЛ", "сделай рекламу для магазина одежды", "придумай слоган"]) {
    assert.equal(planReferenceVisuals(order), null, order)
    assert.equal(allowsAnswerPhotoHints(order), false, order)
  }
  assert.notEqual(planReferenceVisuals("покажи Медеу"), null, "a real lookup still gets photos")
  for (const label of ["Стиль", "Тип одежды", "Цвет"]) assert.equal(isAbstractPhotoSubject(label), true, label)
})

check("a creative deliverable is not fact-checked", () => {
  assert.equal(skipsClaimAudit("НУ СГЕНЕРИРУЙ КАК Я ГОВОРЮ", promptAnswer), true)
  assert.equal(skipsClaimAudit("придумай слоган для рекламы", "Слоган номер 1"), true)
  assert.equal(skipsClaimAudit("сколько людей живёт в Алматы?", "Около 2 миллионов человек."), false)
})

check("the model is told to obey, and corrected when it does not", () => {
  const contract = executionContractInstruction()
  assert.match(contract, /word by word/)
  assert.match(contract, /image generation/)
  assert.match(contract, /Honesty stays/)
  for (const issue of ["denied-media", "prompt-instead-of-media", "denied-capability", "left-placeholders", "asked-instead"]) assert.match(conversationRepairInstruction(issue), /OUTPUT VALIDATION FAILED/, issue)
  assert.equal(conversationRepairInstruction("constructor"), "", "only known codes reach a prompt")
})

check("the chat is wired to all of this", () => {
  const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  const router = fs.readFileSync("lib/malik-god-router.ts", "utf8")
  assert.match(dashboard, /resolveMediaTurn\(cleanContent, conversationBase/)
  assert.doesNotMatch(dashboard, /needsImageConfirmation/, "asking is not a step before doing")
  assert.match(dashboard, /supportsMediaAction: true/)
  assert.match(dashboard, /forcedMedia: handoff/)
  assert.match(route, /resolveMediaTurn\(originalPrompt,chatTurns,hasAttachment\)/)
  assert.match(route, /assessExecution\(\{prompt:originalPrompt/)
  assert.match(route, /createOpeningCheck\(/)
  assert.match(route, /mediaAction: "mediaAction" in answer/)
  assert.match(router, /executionContractInstruction\(\)/)
})

const runtime = fs.readFileSync("lib/malik-compute/runtime.ts", "utf8")
check("only the ledger speaks about the limit", () => {
  assert.match(runtime, /admitted && !\(error instanceof MalikComputeError\) \? requestFailureResponse\(error\)/)
  assert.match(runtime, /answersWithoutLedger\(operation, error\)/)
  assert.match(runtime, /return await active\.run\(context/, "an owner's failure is caught too")
})

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log("\nall do-what-the-user-says checks passed")
