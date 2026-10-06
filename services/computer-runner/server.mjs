import { createServer } from "node:http"
import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import { chromium } from "playwright"
import { actionPolicy, publicUrl } from "./policy.mjs"
import { startEgressProxy } from "./egress.mjs"

const secret = process.env.MALIK_COMPUTER_USE_TOKEN || ""
const planner = process.env.MALIK_COMPUTER_PLANNER_URL || ""
if (secret.length < 32 || !planner.startsWith("https://")) throw new Error("Set a shared token (at least 32 characters) and HTTPS planner URL before starting.")
const sessions = new Map()
const LIMIT = Math.max(1, Math.min(4, Number(process.env.MALIK_COMPUTER_MAX_SESSIONS) || 1))
const TTL = 20 * 60_000
const TERMINAL = new Set(["complete", "failed", "cancelled", "handoff"])
let browserPromise
const browser = () => browserPromise ||= (async () => {
  if (process.env.MALIK_BROWSER_CDP_URL) {
    if (process.env.MALIK_BROWSER_EGRESS_ISOLATED !== "true") throw new Error("Remote browser requires verified private-network/metadata egress isolation.")
    return chromium.connectOverCDP(process.env.MALIK_BROWSER_CDP_URL)
  }
  return chromium.launch({ headless: true, chromiumSandbox: true, proxy: { server: await startEgressProxy(), bypass: "<-loopback>" } })
})().catch(error => { browserPromise = undefined; throw error })
const fingerprint = observation => createHash("sha256").update(JSON.stringify(observation)).digest("hex")
const record = (session, action, status, detail) => {
  session.steps.push({ action: String(action).slice(0, 180), status, detail: detail ? String(detail).slice(0, 6000) : undefined })
  session.steps = session.steps.slice(-60)
}
const receipt = session => ({ ok: session.status !== "failed", sessionId: session.id, status: session.status, summary: session.summary, steps: session.steps, screenshots: session.screenshot ? [session.screenshot] : [], pageUrl: session.page?.url(), pageTitle: session.pageTitle, approval: session.pending ? { id: session.pending.id, title: session.pending.plan.title || "Подтвердите действие", detail: session.pending.detail, pageUrl: session.page.url() } : undefined })

async function observe(session) {
  const page = session.page
  const observation = await page.evaluate(() => {
    document.querySelectorAll("[data-malik-control]").forEach(element => element.removeAttribute("data-malik-control"))
    const controls = [...document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && !element.disabled
    }).slice(0, 80)
    // These IDs bind to this observed DOM. Nothing from the model is evaluated as JS.
    controls.forEach((element, id) => element.setAttribute("data-malik-control", String(id)))
    return { url: location.href, title: document.title, text: document.body.innerText.slice(0, 12_000), controls: controls.map((element, id) => ({
      id, tag: element.tagName.toLowerCase(), type: element.getAttribute("type") || "", label: (element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.labels?.[0]?.innerText || element.innerText || element.getAttribute("name") || "").slice(0, 180), href: element.tagName === "A" ? element.href : undefined, inForm: Boolean(element.closest("form")),
      value: element.getAttribute("type") === "password" ? "[скрыто]" : String(element.value || "").slice(0, 6000), valueTruncated: String(element.value || "").length > 6000,
    })) }
  })
  session.pageTitle = observation.title
  const jpeg = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false })
  if (jpeg.length <= 650_000) session.screenshot = { url: "data:image/jpeg;base64," + jpeg.toString("base64"), label: observation.title || "Снимок браузера" }
  return observation
}

async function execute(session, plan, control) {
  if (session.status === "cancelled") return
  const page = session.page
  if (plan.action === "navigate" || plan.action === "click" && actionPolicy(plan, control) === "navigate") {
    const target = await publicUrl(plan.action === "navigate" ? plan.url : control.href)
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25_000 })
  } else if (plan.action === "click") await page.locator(`[data-malik-control="${control.id}"]`).click({ timeout: 10_000 })
  else if (plan.action === "fill") {
    const locator = page.locator(`[data-malik-control="${control.id}"]`)
    if (control.tag === "select") await locator.selectOption(String(plan.value || ""), { timeout: 10_000 })
    else await locator.fill(String(plan.value || "").slice(0, 6000), { timeout: 10_000 })
  } else if (plan.action === "scroll") await page.mouse.wheel(0, Math.max(-900, Math.min(900, Number(plan.value) || 650)))
  record(session, plan.title || plan.action, "done", control ? `${control.label}${plan.action === "fill" ? "\n" + String(plan.value || "") : ""}` : page.url())
}

async function advance(session, approved) {
  if (session.busy || TERMINAL.has(session.status)) return
  session.busy = true; session.status = "running"
  try {
    if (approved) {
      const observation = await observe(session)
      if (fingerprint(observation) !== approved.fingerprint) throw new Error("Страница изменилась после подтверждения. Действие не выполнено; запустите задачу заново.")
      await execute(session, approved.plan, approved.control)
      session.count++
    }
    for (; session.count < 30 && session.status === "running"; session.count++) {
      if (Date.now() > session.expires) throw new Error("Сессия истекла. Действия остановлены.")
      const observation = await observe(session)
      if (/captcha|verify you are human|checking your browser|провер(?:ка|ьте).*человек/iu.test(observation.text)) { session.status = "handoff"; session.summary = "Сайт требует проверку пользователя. Браузер остановлен."; break }
      record(session, "Выбираю следующий шаг", "running")
      const response = await fetch(planner, { method: "POST", headers: { authorization: "Bearer " + secret, "content-type": "application/json" }, body: JSON.stringify({ task: session.task, observation, history: session.steps.slice(-8) }), signal: AbortSignal.timeout(90_000), redirect: "error" })
      if (!response.ok) throw new Error("Модель не вернула следующий шаг. Действие не выполнено.")
      const plan = await response.json()
      session.steps.at(-1).status = "done"
      if (session.status !== "running") break
      const control = observation.controls.find(item => item.id === Number(plan.target))
      const policy = actionPolicy(plan, control)
      if (policy === "invalid") throw new Error("Модель указала недоступный элемент.")
      if (policy === "done" || policy === "handoff") { session.status = policy === "done" ? "complete" : "handoff"; session.summary = String(plan.summary || "Работа браузера завершена.").slice(0, 4000); break }
      if (policy === "confirm") {
        const detail = `Страница: ${observation.url}\nДействие: ${plan.action}\nЭлемент: ${control.label}\n${plan.action === "fill" ? "Значение: " + String(plan.value || "") + "\n" : ""}Текущие поля страницы:\n${observation.controls.filter(item => item.value).map(item => `${item.label}: ${item.value}`).join("\n")}`
        if (detail.length > 6000 || observation.controls.some(item => item.valueTruncated)) { session.status = "handoff"; session.summary = "Содержимое формы слишком большое для полного подтверждения. Заполните её самостоятельно."; break }
        session.pending = { id: randomUUID(), plan, control, fingerprint: fingerprint(observation), detail }
        session.status = "awaiting-confirmation"; record(session, plan.title || "Действие ожидает подтверждения", "pending", session.pending.detail); break
      }
      await execute(session, plan, control)
    }
    if (session.count >= 30 && session.status === "running") { session.status = "handoff"; session.summary = "Достигнут предел 30 действий. Проверьте результат и уточните следующую задачу." }
    if (session.status !== "cancelled") await observe(session)
  } catch (error) {
    if (session.status !== "cancelled") { session.status = "failed"; session.summary = safeError(error); record(session, "Браузер остановлен", "failed", session.summary) }
  } finally { session.busy = false; if (TERMINAL.has(session.status)) await session.context?.close().catch(() => {}) }
}

async function createSession(body) {
  if (sessions.size >= LIMIT) throw new Error("Браузер занят. Дождитесь окончания текущей сессии.")
  const session = { id: randomUUID(), owner: body.ownerId, task: String(body.task || "").trim(), status: "running", summary: "", steps: [], count: 0, expires: Date.now() + TTL }
  if (!session.task || session.task.length > 8000) throw new Error("Укажите задачу до 8000 символов.")
  sessions.set(session.id, session)
  try {
    const instance = await browser()
    session.context = await instance.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", acceptDownloads: false })
    await session.context.route("**/*", async route => {
      try { await publicUrl(route.request().url()); await route.continue() } catch { await route.abort("blockedbyclient") }
    })
    session.page = await session.context.newPage()
    session.context.on("page", page => { if (page !== session.page) void page.close() })
    session.page.on("dialog", dialog => void dialog.dismiss())
    record(session, "Открыта отдельная браузерная сессия", "done")
    void advance(session)
    return session
  } catch (error) { sessions.delete(session.id); await session.context?.close().catch(() => {}); throw error }
}

function respond(response, status, value) { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(value)) }
function safeError(error) { return String(error.message || "Браузер недоступен").replaceAll(secret, "[скрыто]").replaceAll(process.env.MALIK_BROWSER_CDP_URL || "__no_cdp__", "[скрыто]").slice(0, 900) }
createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return respond(response, 200, { ok: true, version: 2 })
  if (request.method !== "POST" || request.url !== "/v1/tasks") return respond(response, 404, { error: "NOT_FOUND" })
  const actual = Buffer.from(request.headers.authorization || ""), expected = Buffer.from("Bearer " + secret)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return respond(response, 401, { error: "UNAUTHORIZED" })
  try {
    let raw = ""
    for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 40_000) return respond(response, 413, { error: "TOO_LARGE" }) }
    const body = JSON.parse(raw)
    if (body.version !== 2 || !/^[a-f0-9]{64}$/u.test(body.ownerId || "")) return respond(response, 400, { error: "INVALID_REQUEST" })
    if (body.operation === "start") return respond(response, 202, receipt(await createSession(body)))
    const session = sessions.get(body.sessionId)
    if (!session || session.owner !== body.ownerId) return respond(response, 404, { error: "SESSION_NOT_FOUND", message: "Сессия отсутствует или истекла. Повторный запуск не выполнялся." })
    if (body.operation === "cancel") { session.status = "cancelled"; session.pending = undefined; session.summary = "Задача остановлена. Уже завершённые действия не отменены."; await session.context?.close().catch(() => {}); sessions.delete(session.id); return respond(response, 200, receipt(session)) }
    if (body.operation === "approve") {
      if (session.busy) return respond(response, 409, { error: "SESSION_BUSY", message: "Снимок страницы ещё обновляется. Подтверждение не использовано." })
      if (session.status !== "awaiting-confirmation" || !session.pending || session.pending.id !== body.approvalId || Date.now() > session.expires) return respond(response, 409, { error: "APPROVAL_EXPIRED", message: "Подтверждение истекло или уже использовано." })
      const approved = session.pending
      session.pending = undefined // Consume before executing. Poll/retry never repeats the action.
      void advance(session, approved)
    } else if (body.operation !== "poll") return respond(response, 400, { error: "INVALID_OPERATION" })
    const result = receipt(session)
    if (TERMINAL.has(session.status) && !session.busy) sessions.delete(session.id)
    return respond(response, 200, result)
  } catch (error) { return respond(response, 502, { error: "COMPUTER_FAILED", message: safeError(error) }) }
}).listen(Number(process.env.PORT) || 10000, "0.0.0.0")
setInterval(() => { for (const session of sessions.values()) if (Date.now() > session.expires) { session.status = "cancelled"; void session.context?.close().catch(() => {}); sessions.delete(session.id) } }, 30_000).unref()
