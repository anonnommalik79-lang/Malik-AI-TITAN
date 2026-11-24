import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const load = workTestLoader(), { routeWorkRequest } = load("lib/work/orchestrator.ts"), { decideSuperflow } = load("lib/os/capabilities.ts")
const cases = [
  ["Создай документ о проекте", "flow"], ["Подготовь отчёт по продажам", "flow"], ["Сделай презентацию для команды", "flow"], ["Создай сайт для кофейни", "flow"], ["Напиши бизнес-план кофейни", "flow"],
  ["Сделай PDF с итогами встречи", "flow"], ["Создай DOCX для письма", "flow"], ["Подготовь XLSX с таблицей затрат", "flow"], ["Создай PPTX для проекта", "flow"], ["Собери проект Python в zip", "flow"],
  ["Create a document about our project", "flow"], ["Prepare a report on sales", "flow"], ["Make a presentation for investors", "flow"], ["Build a website for a cafe", "flow"], ["Draft a business plan for the cafe", "flow"],
  ["Generate a PDF with meeting notes", "flow"], ["Write a DOCX letter for my team", "flow"], ["Export an XLSX expense report", "flow"], ["Create a PPTX presentation", "flow"], ["Make a Python project in zip", "flow"],
  ["Что такое бизнес-план?", "chat"], ["Как сделать сайт?", "chat"], ["Сделай документ?", "chat"], ["Расскажи про презентации", "chat"], ["How do I create a report?", "chat"], ["Can you make a PDF?", "chat"],
  ["Напиши код сортировки на Python", "chat"], ["Write a function to sort numbers", "chat"], ["Сделай HTML код простой страницы", "chat"], ["Объясни SQL запрос для таблицы", "chat"], ["Привет", "chat"], ["Посчитай 12 * 34", "chat"], ["Напиши письмо коллеге", "chat"], ["/create document for tomorrow", "chat"],
  ["Создай стартап и полный пакет для запуска", "flow"], ["Create a startup with research, website and business plan", "flow"],
  // A brief answers as a whole: a file mentioned in item 3 is content, not an order.
  ["Ответь на 4 пункта.\n1) Объясни, что такое юнит-экономика.\n2) Сравни Kaspi и Halyk.\n3) Подготовь отчёт по рынку кофе.\n4) Дай вывод.", "chat"],
  ["Подготовь отчёт по продажам за квартал.\n1) выручка\n2) расходы\n3) прибыль", "flow"],
]
let count = 0
for (const [goal, expected] of cases) {
  assert.equal(routeWorkRequest(goal, { mode: "work", signedIn: true }).route, expected, goal); count++
  assert.equal(routeWorkRequest(goal, { mode: "chat", signedIn: true }).route, decideSuperflow(goal).run ? "flow" : "chat", `chat regression: ${goal}`); count++
  assert.equal(routeWorkRequest(goal, { mode: "work", signedIn: false }).route, "chat", `guest: ${goal}`); count++
}
const deliverables = [
  ["Разработай Python-проект для трекера привычек", { code: ["zip"] }],
  ["Build a Python CLI project to track expenses", { code: ["zip"] }],
  ["Подготовь PDF с инструкцией по запуску сайта на Python", { document: ["pdf"] }],
  ["Подготовь XLSX с таблицей затрат", { document: ["xlsx"] }],
  ["Шығындар бойынша XLSX кестесін жаса", { document: ["xlsx"] }],
  ["Шағын Python жобасын құрастыр", { code: ["zip"] }],
  ["Маркетинг туралы таныстырылым дайында", { presentation: ["pptx"] }],
  ["Сделай PDF", { document: ["pdf"] }],
  ["Write a report in DOCX and PDF about startup investments", { document: ["docx", "pdf"] }],
  ["Сделай XLSX с диаграммой динамики", { document: ["xlsx"] }],
  ["Создай сайт на Next.js для музея", { code: ["zip"] }],
  ["Собери сайт для кофейни и подготовь PPTX на 3 слайда", { website: ["html"], presentation: ["pptx"] }],
  ["Подготовь бизнес-план для кафе в PDF", { "business-plan": ["pdf"] }],
  ["Create a business plan as a PDF", { "business-plan": ["pdf"] }],
  ["Create a website and a presentation for our team", { website: ["html"], presentation: ["pptx"] }],
  ["Подготовь отчёт о расходах в PDF и XLSX", { document: ["pdf", "xlsx"] }],
  ["Create a CSV expense sheet", { document: ["csv"] }],
  ["Сгенерируй сайт в ZIP", { code: ["zip"] }],
  ["Подготовь отчёт о продажах, без презентации", { document: ["docx"] }],
  ["Найди сведения о проекте и подготовь PDF", { document: ["pdf"] }, true],
  ["Create a PDF report with official sources", { document: ["pdf"] }, true],
  ["Сделай PDF с источниками из текста, без интернета", { document: ["pdf"] }],
  ["Find the latest reports", null],
  ["Напиши инструкцию по установке Python", null],
  ["Напиши код приложения на Python", null],
  ["Explain how to build a website", null],
  ["Write a guide to build a website with React", null],
  ["Не создавай сайт, объясни его структуру", null],
  ["Don't build a website, describe the template", null],
  ["Напиши обзор PDF", null],
  ["Экспортируй предыдущий отчёт в PDF", null],
  ["Write a PDF of the text above", null],
  ["Сделай DOCX из предыдущего ответа", null],
  ["Сделай краткий пример Python-проекта", null],
  ["Расскажи, как экспортировать CSV", null],
  ["Сделай HTML код простой страницы", null],
]
for (const [goal, expected, withResearch] of deliverables) {
  const decision = routeWorkRequest(goal, { mode: "work", signedIn: true })
  assert.equal(decision.route, expected ? "flow" : "chat", goal)
  assert.deepEqual(decision.files || null, expected, goal)
  if (expected) assert.deepEqual(decision.capabilities, [...(withResearch ? ["research"] : []), ...Object.keys(expected)], goal)
  const chatDecision = routeWorkRequest(goal, { mode: "chat", signedIn: true })
  const multiple = expected && Object.values(expected).flat().length > 1
  if (multiple) {
    assert.equal(chatDecision.route, "flow", goal)
    assert.deepEqual(chatDecision.files, expected, goal)
  } else if (!decideSuperflow(goal).run) {
    assert.equal(chatDecision.route, "chat", goal)
  }
  assert.equal(routeWorkRequest(goal, { mode: "chat", signedIn: false }).route, "chat", goal)
  count++
}
console.log(`${count}/${count} passed (work/chat/guest and exact requested deliverables)`)
