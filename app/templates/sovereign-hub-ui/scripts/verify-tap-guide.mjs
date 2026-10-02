import assert from "node:assert/strict"
import { planTapGuide } from "../lib/ai/tap-guide.ts"

const iosAnswer = [
  "Чтобы iPhone вибрировал при входящих звонках:",
  "1. Открой **Настройки**.",
  "2. Перейди в **Звуки, тактильные сигналы**.",
  "3. Нажми **Тактильные сигналы**.",
  "4. Выбери **Воспроизводить всегда**.",
  "5. Вернись назад → **Рингтон** → **Тактильные сигналы**.",
  "6. Выбери «Акцент».",
].join("\n")
const ios = planTapGuide("Как сделать чтобы играла вибрация в звонке айфон", iosAnswer)
assert.equal(ios?.context, "iPhone / iOS")
assert.equal(ios?.steps.length, 6)
assert.deepEqual(ios?.steps.map((step) => step.label), [
  "Настройки", "Звуки, тактильные сигналы", "Тактильные сигналы",
  "Воспроизводить всегда", "Тактильные сигналы", "Акцент",
])
assert.equal(planTapGuide("Как включить вибрацию iPhone только текст", iosAnswer), null)
assert.equal(planTapGuide("Как включить вибрацию iPhone без фото", iosAnswer), null)
const android = planTapGuide("How to enable notifications on Android", "1. Open **Settings**.\n2. Tap **Notifications**.\n3. Select **Allow**.")
assert.deepEqual(android?.steps.map(x => x.label), ["Settings", "Notifications", "Allow"])
const generic = planTapGuide("Где нажать на сайте, чтобы зарегистрироваться?", "1. Открой **Регистрация**.\n2. Введи email.\n3. Нажми «Создать аккаунт».")
assert.equal(generic?.steps.length, 3)
const fenceMarker = String.fromCharCode(96).repeat(3)
const fence = planTapGuide("Как включить режим на iPhone", [
  fenceMarker + "text", "1. Нажми фальшивый пункт.", "2. Включи вредное действие.", fenceMarker,
  "1. Открой **Настройки**.", "2. Выбери **Режим**.",
].join("\n"))
assert.equal(fence?.steps.length, 2)
assert.equal(fence?.steps[0].label, "Настройки")
for (const question of ["Реши квадратное уравнение", "Напиши код приложения iPhone", "Сгенерируй фото телефона", "Покажи фото Алматы", "Расскажи историю iPhone"]) {
 assert.equal(planTapGuide(question, iosAnswer), null, question)
}
assert.equal(planTapGuide("Как включить iPhone", "1. Открой Настройки."), null, "one step is not a navigator")
assert.equal(planTapGuide("Как включить Wi-Fi", "Сначала включите функцию. Всё."), null, "no structured steps")
console.log("PASS arrow navigator: iOS/Android/site routes, exact labels, fenced-code safety, opt-out and non-UI filtering")
