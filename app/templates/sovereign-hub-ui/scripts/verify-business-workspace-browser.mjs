// PLAYWRIGHT_MODULE may point to a preinstalled Playwright index.mjs.
// Deterministic UI contract test: API responses are fixtures, not a live-model evaluation.
import assert from "node:assert/strict"
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({ channel: "msedge", headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: "malik-guest", value: "1", url: "http://127.0.0.1:3000", httpOnly: true, sameSite: "Lax" }])
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("http://127.0.0.1:3000/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.getByRole("button", { name: "Бизнес под ключ", exact: true }).first().click({ timeout: 60000 })
  const root = page.locator('[data-view="business-autonomous"]')
  await root.getByRole("button", { name: "Запустить Autonomous Company", exact: true }).click()
  await root.getByRole("heading", { name: "Бизнес под ключ", exact: true }).waitFor()
  assert.equal(await root.getAttribute("data-stage"), "workspace")
  await root.getByLabel("Описание бизнеса").fill("Тестовый проект — студия дизайна")
  await root.locator("summary").filter({ hasText: "Контекст компании" }).click()
  await root.getByLabel("Материалы компании", { exact: true }).fill("Бюджет подтверждён: 500000 тенге.")
  await root.getByLabel("Язык результата").selectOption("kz")
  await root.getByRole("button", { name: "Сохранить сценарий", exact: true }).click()
  await root.getByRole("button", { name: "Мои шаблоны", exact: true }).click()
  await root.getByRole("heading", { name: "Тестовый проект — студия дизайна" }).waitFor()
  const calls = []
  let fail = true
  await page.route("**/api/business/run", async (route) => {
    const body = route.request().postDataJSON()
    calls.push(body)
    if (calls.length === 2 && fail) {
      fail = false
      await route.fulfill({ status: 503, json: { ok: false, error: "Тестовая ошибка" } })
    } else await route.fulfill({ json: { ok: true, content: "Тестовый результат " + body.mode, model: "fixture", provider: "fixture" } })
  })
  await root.getByRole("button", { name: "Запустить Autonomous Company", exact: true }).click()
  await root.getByText("Research остановился: Тестовая ошибка", { exact: true }).waitFor()
  assert.equal(calls.length, 2)
  assert.equal(calls[0].language, "kz")
  assert.ok(calls[0].input.includes("500000"))
  await root.getByRole("button", { name: "Повторить незавершённый этап", exact: true }).click()
  await root.getByText("8 из 8 агентов завершили работу", { exact: true }).waitFor()
  assert.equal(calls.length, 9)
  assert.equal(calls.filter((call) => call.mode === "ceo-decision").length, 1)
  const pending = page.waitForEvent("download")
  await root.getByRole("button", { name: "Скачать материалы .md", exact: true }).click()
  assert.equal((await pending).suggestedFilename(), "business-results.md")
  await page.reload({ waitUntil: "domcontentloaded" })
  const business = page.getByRole("button", { name: "Бизнес под ключ", exact: true }).first()
  await business.waitFor({ timeout: 60000 })
  if (!(await root.isVisible())) await business.click()
  await root.getByRole("button", { name: "Запустить Autonomous Company", exact: true }).click()
  await root.getByText("8 из 8 агентов завершили работу", { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await root.evaluate((element) => element.getBoundingClientRect().width <= 391))
  assert.deepEqual(errors, [])
  console.log("PASS: workspace, context, language, saved scenario, failure, resume, export, reload, mobile width, no page errors (fixture API)")
} finally { await browser.close() }
