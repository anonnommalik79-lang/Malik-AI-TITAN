import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

/**
 * Guards the Malik Taxi contract:
 *  - a tapped search result must reach Uber without a second geocode or an LLM hop;
 *  - the page must never scroll, on phone or desktop;
 *  - nothing but a place logo may carry colour.
 */

async function loadModule(file) {
  const source = fs.readFileSync(file, "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript,${encodeURIComponent(outputText)}`)
}

const { detectPlaceKind, placeIconUrl, distanceKm, formatDistance } = await loadModule("lib/taxi/place-kind.ts")

// Every result must earn a meaningful glyph, in Russian, Kazakh or English.
const KINDS = [
  ["Международный аэропорт Алматы", "airport"],
  ["Almaty Airport", "airport"],
  ["Железнодорожный вокзал Алматы-2", "station"],
  ["Отель Достык", "hotel"],
  ["Dostyk Plaza", "place"],
  ["ТРЦ Mega Center", "shopping"],
  ["Кофейня Coffee Boom", "cafe"],
  ["Ресторан Нават", "restaurant"],
  ["Городская клиническая больница", "medical"],
  ["Казахский национальный университет", "education"],
  ["Стадион Центральный", "sport"],
  ["АЗС Гелиос", "fuel"],
  ["Парк Первого Президента", "park"],
]
for (const [name, expected] of KINDS) {
  assert.equal(detectPlaceKind(name), expected, `${name} → ${expected}`)
}
assert.equal(detectPlaceKind(""), "place", "Пустая строка не должна падать")
assert.equal(detectPlaceKind("Mega", "shop", "mall"), "shopping", "Категория геокодера тоже учитывается")

// Real brand icons, and nothing weird from junk input.
assert.match(placeIconUrl("https://dostykplaza.kz/"), /favicons\?domain_url=/, "Сайт места даёт настоящую иконку")
assert.match(placeIconUrl("dostykplaza.kz"), /dostykplaza\.kz/, "Голый домен тоже принимается")
assert.equal(placeIconUrl(""), "", "Без сайта иконки нет")
assert.equal(placeIconUrl("not a url"), "", "Мусор не превращается в иконку")
assert.equal(placeIconUrl("http://127.0.0.1:3000"), "", "IP — не бренд")

// Distance drives both sorting and the label in the row.
const almaty = { lat: 43.238, lon: 76.945 }
const airport = { lat: 43.352, lon: 77.041 }
const km = distanceKm(almaty, airport)
assert.ok(km > 12 && km < 18, `Алматы → аэропорт ≈ 14 км, получили ${km.toFixed(1)}`)
assert.equal(formatDistance(0.4), "400 м")
assert.equal(formatDistance(2.43), "2.4 км")
assert.equal(formatDistance(14.2), "14 км")
assert.equal(formatDistance(null), "")

// Speed contract: picking from the list skips the geocoder and the model.
const handoff = fs.readFileSync("app/api/taxi/uber/handoff/route.ts", "utf8")
assert.match(handoff, /destinationPoint/, "Handoff должен принимать готовые координаты")
assert.match(handoff, /picked \|\| await geocodeDestination/, "Выбранное место не должно геокодиться повторно")

const places = fs.readFileSync("app/api/taxi/places/route.ts", "utf8")
assert.match(places, /viewbox/, "Поиск должен смещаться к позиции пассажира")
assert.match(places, /extratags/, "Без extratags не будет настоящих логотипов")
assert.match(places, /readCache|writeCache/, "Повторный запрос должен браться из кэша")
assert.match(places, /latitude: lat/, "Координаты обязаны возвращаться клиенту")

// Layout and colour contract.
const ui = fs.readFileSync("components/sovereign/taxi/UberRealRideV1.tsx", "utf8")
assert.match(ui, /h-\[100dvh\][\s\S]{0,40}overflow-hidden/, "Страница фиксирована по высоте и не прокручивается")
assert.match(ui, /malik-taxi-scroll/, "Скроллится только список")
assert.match(ui, /destinationPoint/, "Клиент должен передавать точные координаты")
assert.match(ui, /ensurePickup/, "Геолокация должна прогреваться заранее")
assert.match(ui, /::selection/, "Синее системное выделение должно быть перекрыто")
assert.match(ui, /-webkit-autofill/, "Синий автозаполнитель должен быть перекрыт")
assert.match(ui, /data-brand-icon/, "Логотипы мест должны быть исключены из обесцвечивания")

const BLUE_TOKENS = /(bg|text|border|ring|from|to|via)-(blue|sky|indigo|cyan|violet|purple|fuchsia)-/
assert.equal(BLUE_TOKENS.test(ui), false, "В интерфейсе такси не должно быть синих/фиолетовых классов")

console.log("✅ Malik Taxi: классификация мест, быстрый handoff и монохромный контракт на месте")
