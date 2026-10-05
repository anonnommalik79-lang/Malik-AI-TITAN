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
]
let count = 0
for (const [goal, expected] of cases) {
  assert.equal(routeWorkRequest(goal, { mode: "work", signedIn: true }).route, expected, goal); count++
  assert.equal(routeWorkRequest(goal, { mode: "chat", signedIn: true }).route, decideSuperflow(goal).run ? "flow" : "chat", `chat regression: ${goal}`); count++
  assert.equal(routeWorkRequest(goal, { mode: "work", signedIn: false }).route, "chat", `guest: ${goal}`); count++
}
console.log(`${count}/${count} passed (${cases.length} phrases; work/chat/guest)`)
