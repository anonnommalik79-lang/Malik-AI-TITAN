// Malik AI OS executor: a whole Superflow against simulated tools.
// Parallel execution, dependencies, retries, self-check, credits charged
// once, cancellation, restart recovery, idempotent start, demo cache and
// persistence. No network, no provider keys.
//
//   npm run test:os-flow

import assert from "node:assert/strict"

const root = new URL("..", import.meta.url).pathname
const store = await import(`${root}lib/os/store.ts`)
const executor = await import(`${root}lib/os/executor.ts`)
const events = await import(`${root}lib/os/events.ts`)
const planner = await import(`${root}lib/os/planner.ts`)

let failed = 0
let count = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 5).join("\n       ")}`)
  }
}

const SHOWCASE = "Создай казахстанский технологический стартап и подготовь его к презентации инвесторам."
const OWNER = { userId: "founder@example.com", plan: "pro", authenticated: true }

const longText = (title, headingsCount, extra = "") => {
  const sections = Array.from({ length: headingsCount }, (_, i) => `## Раздел ${i + 1}\n${extra} Это содержательный абзац раздела номер ${i + 1}: оценка рынка и допущения описаны подробно, чтобы текст был полным и полезным. `.repeat(3))
  return `# ${title}\n\n${sections.join("\n\n")}`
}

function makeDeps(options = {}) {
  let clock = 1_700_000_000_000
  const calls = { text: 0, image: 0, imageRecord: 0, reserve: 0, refund: 0, refunded: 0, site: 0, search: 0, running: 0, maxRunning: 0, imageRunning: 0, maxImageRunning: 0 }
  const brandName = options.brandName || "Qazyna AI"
  const failures = { ...(options.failures || {}) }
  const take = (key) => {
    if (failures[key] > 0) {
      failures[key] -= 1
      return true
    }
    return false
  }
  const track = async (fn) => {
    calls.running += 1
    calls.maxRunning = Math.max(calls.maxRunning, calls.running)
    try {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return await fn()
    } finally {
      calls.running -= 1
    }
  }
  const deps = {
    calls,
    async text(request) {
      calls.text += 1
      return track(async () => {
        const system = request.system
        if (/Прочитай цель/.test(system)) {
          if (take("understand")) throw Object.assign(new Error("upstream 503"), { status: 503 })
          return { provider: "test", model: "m", content: JSON.stringify({ title: "ИИ для фермеров", language: "ru", country: "Казахстан", industry: "агротех", idea: "Платформа ИИ-прогнозов урожая для фермеров Казахстана", audience: "фермеры", problem: "потери урожая", solution: "прогнозы", businessModel: "подписка", deliverables: [], queries: ["агротех Казахстан рынок", "precision agriculture Kazakhstan"], constraints: [] }) }
        }
        if (/бренд-стратег/.test(system)) {
          if (take("brand")) throw Object.assign(new Error("model busy"), { status: 429 })
          return { provider: "test", model: "m", content: JSON.stringify({ name: brandName, tagline: "Урожай под контролем", positioning: "ИИ-агроном", audience: "фермеры", values: ["точность"], voice: "уверенный", colors: { primary: "#112233", secondary: "#eeeeee", accent: "#22aa55", background: "#ffffff", text: "#111111" }, typography: "Inter", logoConcept: "колос и сеть", nameRationale: "казына — богатство" }) }
        }
        if (/аналитик рынка/.test(system)) {
          return { provider: "test", model: "m", content: `## Коротко\nРынок растёт [1].\n\n## Рынок и спрос\nСпрос высокий [2].\n\n## Конкуренты и альтернативы\nЕсть игроки [1].\n\n## Риски\nПогода [2].` + " Подробности рынка. ".repeat(20) }
        }
        if (/финансовый консультант/.test(system)) return { provider: "test", model: "m", content: longText(`Бизнес-план ${brandName}`, 11, `${brandName}: финансовый план, выручка — оценка.`) }
        if (/операционный стратег/.test(system)) {
          const phase = { outcome: "Проверена гипотеза агротех-сервиса", actions: ["Провести интервью с фермерами", "Проверить прототип прогноза урожая"], evidence: ["Записи интервью и результаты пилота"] }
          return { provider: "test", model: "m", content: JSON.stringify({ roadmap: { day7: phase, day30: phase, day90: phase }, pitches: { seconds30: `${brandName} помогает фермерам Казахстана точнее планировать урожай. Проверяем решение в пилоте, не выдавая прогнозы за подтверждённые продажи.`, minutes2: `${brandName} помогает фермерам Казахстана принимать решения об урожае на основе прогноза. Пока мы проверяем спрос через интервью и пилот. До финансового прогноза уточним стоимость внедрения и фактическое удержание клиентов. `.repeat(2), minutes5: `${brandName} решает проблему потерь урожая для фермеров Казахстана. Команда проверяет спрос, стоимость внедрения и качество прогноза в реальном пилоте. Рыночные выводы требуют подтверждения источниками. Финансовые показатели будут рассчитаны только после получения реальных исходных данных. `.repeat(3) }, openQuestions: ["Сколько ферм участвует в пилоте?"] }) }
        }
        if (/сценарист/.test(system)) return { provider: "test", model: "m", content: `# Сценарий ${brandName}\n\n` + Array.from({ length: 7 }, (_, i) => `## Сцена ${i + 1} · 0:0${i}–0:1${i}\n**Кадр:** поле. **Закадровый текст:** ${brandName} помогает фермерам.`).join("\n\n") }
        return { provider: "test", model: "m", content: longText("Документ", 5) }
      })
    },
    async search() {
      calls.search += 1
      if (take("search")) return []
      return [
        { title: "Агротех в Казахстане", url: "https://example.kz/a", domain: "example.kz", text: "Рынок агротеха растёт." },
        { title: "Precision farming", url: "https://example.com/b", domain: "example.com", text: "Adoption grows." },
      ]
    },
    image: {
      async check() {
        return options.noImageCredits ? { ok: false, code: "IMAGE_CREDITS_EXHAUSTED", message: "Недостаточно фото-кредитов." } : { ok: true }
      },
      async generate() {
        calls.image += 1
        calls.imageRunning += 1
        calls.maxImageRunning = Math.max(calls.maxImageRunning, calls.imageRunning)
        try {
          await new Promise((resolve) => setTimeout(resolve, 5))
          if (take("image")) throw Object.assign(new Error("service unavailable"), { status: 503 })
          return { url: "https://cdn.example.com/logo.webp", provider: "test-image", ephemeral: true, durable: false }
        } finally {
          calls.imageRunning -= 1
        }
      },
      async record() {
        calls.imageRecord += 1
      },
    },
    async site() {
      calls.site += 1
      return track(async () => {
        const bad = take("siteBad")
        const sections = bad ? "" : Array.from({ length: 5 }, (_, i) => `<section id="s${i}"><h2>Раздел ${i}</h2><p>${"Текст сайта о продукте. ".repeat(20)}</p></section>`).join("")
        return {
          html: `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width"><title>${brandName}</title></head><body><nav><a class="brand" href="#top">${brandName}</a></nav>${sections}</body></html>`,
          plan: { brand: { name: brandName }, hero: { title: "Урожай" }, sections: [], locale: "ru" },
          provider: "test",
          model: "m",
          plannerUsed: true,
          quality: { score: 90, issues: [] },
        }
      })
    },
    presentation: {
      async reserve(_owner, cost) {
        calls.reserve += cost
        if (options.noDeckCredits) return { ok: false, code: "PRESENTATION_CREDITS_EXHAUSTED", message: "Кредиты на презентации закончились." }
        return { ok: true }
      },
      async refund(_owner, cost) {
        calls.refund += 1
        calls.refunded += cost
      },
      async maxSlides() {
        return 12
      },
      async outline(input) {
        return { title: `${brandName} — pitch`, items: Array.from({ length: input.count }, (_, i) => ({ title: `Слайд ${i + 1}`, point: "p", layout: i === 0 ? "title" : "bullets" })) }
      },
      async slides(input) {
        if (take("slides")) return { slides: [], missing: Array.from({ length: input.count }, (_, i) => input.startIndex + i) }
        return { slides: Array.from({ length: input.count }, (_, i) => ({ index: input.startIndex + i, slide: { id: `s${input.startIndex + i}`, layout: input.startIndex + i === 0 ? "title" : "bullets", title: `${brandName} слайд ${input.startIndex + i + 1}` } })), missing: [] }
      },
    },
    async code() {
      return { title: "app", files: [{ path: "index.html", content: "<html></html>" }], provider: "t", model: "m", qaPassed: true }
    },
    now: () => clock,
    async sleep(ms, signal) {
      if (signal?.aborted) throw new Error("aborted")
      clock += ms
      await new Promise((resolve) => setImmediate(resolve))
    },
    random: () => 0.5,
  }
  return deps
}

async function waitDone(flowId, ownerId = OWNER.userId, timeoutMs = 20_000) {
  const started = Date.now()
  for (;;) {
    const flow = await store.getFlow(ownerId, flowId)
    if (flow && !executor.isFlowRunning(flowId) && flow.finishedAt) return flow
    if (Date.now() - started > timeoutMs) throw new Error(`flow did not finish: ${JSON.stringify(flow?.tasks.map((t) => [t.label, t.status]))}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const step = (flow, id) => flow.tasks.find((task) => planner.stepIdOf(task) === id)

console.log("superflow")

await check("the showcase goal runs end to end, in dependency order, in parallel", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps()
  const seen = []
  let subscribed = null
  const { flow, created } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-1", deps })
  subscribed = events.subscribe(flow.id, (event) => seen.push(event))
  assert.equal(created, true)
  const done = await waitDone(flow.id)
  subscribed()
  assert.equal(done.status, "completed", JSON.stringify(done.tasks.map((t) => [t.label, t.status, t.error?.message])))
  for (const task of done.tasks) {
    assert.equal(task.status, "completed", task.label)
    assert.ok(task.artifactIds.length >= 1, task.label)
    for (const dependency of task.dependencies) {
      const before = done.tasks.find((t) => t.id === dependency)
      assert.ok(before.finishedAt <= task.startedAt, `${before.label} must finish before ${task.label}`)
    }
  }
  assert.ok(deps.calls.maxRunning >= 2, `ran in parallel (max ${deps.calls.maxRunning})`)
  assert.ok(deps.calls.maxRunning <= 3, `never more than three at once (max ${deps.calls.maxRunning})`)
  assert.equal(deps.calls.maxImageRunning, 1)
  assert.equal(deps.calls.imageRecord, 1, "one picture, one charge")
  assert.equal(deps.calls.refunded, 0)
  // Events: statuses and summaries only.
  assert.ok(seen.some((event) => event.type === "task"))
  assert.ok(seen.some((event) => event.type === "artifact"))
  assert.ok(seen.some((event) => event.type === "done"))
  for (const event of seen.filter((item) => item.type === "artifact")) assert.equal("content" in event.artifact, false)
  // Every deliverable passed its self-check, and the brand is the same everywhere.
  const site = await store.getArtifact(OWNER.userId, step(done, "site").artifactIds[0])
  assert.equal(site.kind, "website")
  assert.equal(site.validation.ok, true)
  assert.match(site.content, /cdn\.example\.com\/logo\.webp/, "the logo is on the site")
  const deck = await store.getArtifact(OWNER.userId, step(done, "deck").artifactIds[0])
  assert.equal(JSON.parse(deck.content).slides.length, 11)
  assert.equal(JSON.parse(deck.content).slides[0].imageUrl, "https://cdn.example.com/logo.webp")
  const project = await store.getProject(OWNER.userId, done.projectId)
  assert.equal(project.facts.brandName, "Qazyna AI")
  assert.equal(project.sources.length, 2)
  assert.ok(project.artifactIds.length >= done.tasks.length)
  const summary = await store.getArtifact(OWNER.userId, step(done, "result").artifactIds[0])
  assert.match(summary.content, /Готово/)
  assert.doesNotMatch(summary.content, /Требует внимания/)
})

await check("the same request id never starts a second flow, even when sent twice at once", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps()
  const [a, b] = await Promise.all([
    executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-dup", deps }),
    executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-dup", deps }),
  ])
  assert.equal(a.flow.id, b.flow.id)
  await waitDone(a.flow.id)
  const again = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-dup", deps })
  assert.equal(again.created, false)
  assert.equal(again.flow.id, a.flow.id)
  assert.equal((await store.listProjects(OWNER.userId)).length, 1, "one project")
  assert.equal(deps.calls.imageRecord, 1)
})

await check("temporary failures are retried with backoff and then succeed", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps({ failures: { understand: 1, brand: 2, image: 1 } })
  const { flow } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-retry", deps })
  const done = await waitDone(flow.id)
  assert.equal(done.status, "completed", JSON.stringify(done.tasks.map((t) => [t.label, t.status, t.error?.code])))
  assert.equal(step(done, "understand").retry.attempts, 2)
  assert.equal(step(done, "brand").retry.attempts, 3)
  assert.equal(step(done, "logo").retry.attempts, 2)
  assert.equal(deps.calls.imageRecord, 1, "the failed picture was not charged")
})

await check("a result that fails its self-check is redone with the list of problems", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps({ failures: { siteBad: 1 } })
  const { flow } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-check", deps })
  const done = await waitDone(flow.id)
  assert.equal(step(done, "site").status, "completed")
  assert.equal(step(done, "site").retry.attempts, 2)
  assert.equal(deps.calls.site, 2)
})

await check("a failed step does not stop the others; the summary says what failed", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps({ noDeckCredits: true, failures: { search: 5 } })
  const { flow } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-partial", deps })
  const done = await waitDone(flow.id)
  assert.equal(done.status, "partial")
  const deck = step(done, "deck")
  assert.equal(deck.status, "failed")
  assert.equal(deck.error.code, "NO_CREDITS")
  assert.equal(deck.retry.attempts, 1, "no retry for missing credits")
  assert.doesNotMatch(deck.error.message, /load failed|failed to fetch/i)
  const research = step(done, "research")
  assert.equal(research.status, "failed")
  assert.equal(research.error.code, "NO_SOURCES")
  // Brand, site and plan ran without the research.
  for (const id of ["brand", "site", "plan", "video", "result"]) assert.equal(step(done, id).status, "completed", id)
  const summary = await store.getArtifact(OWNER.userId, step(done, "result").artifactIds[0])
  assert.match(summary.content, /Не получилось/)
  assert.match(summary.content, /Investor Deck/)
})

await check("slides that do not arrive are refunded in full", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps({ failures: { slides: 30 } })
  const { flow } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-refund", deps })
  const done = await waitDone(flow.id)
  const deck = step(done, "deck")
  assert.equal(deck.status, "failed")
  assert.equal(deps.calls.refunded, deps.calls.reserve, "everything reserved was given back")
})

await check("cancelling stops the flow and nothing keeps running", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps()
  const { flow } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-cancel", deps })
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(await executor.cancelFlow(OWNER.userId, flow.id), true)
  const done = await waitDone(flow.id)
  assert.ok(["cancelled", "partial"].includes(done.status), done.status)
  assert.ok(done.tasks.some((task) => task.status === "cancelled"))
  assert.equal(done.tasks.some((task) => ["running", "queued", "retrying", "planned"].includes(task.status)), false)
})

await check("after a restart, a half-done flow is marked interrupted and can be continued", async () => {
  const backend = store.memoryBackend()
  store.configureOsBackend(backend)
  const deps = makeDeps()
  const { flow } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-restart", deps })
  const done = await waitDone(flow.id)
  // Simulate a snapshot saved mid-run: the site and everything after it unfinished.
  const snapshot = JSON.parse(JSON.stringify(done))
  snapshot.tasks = snapshot.tasks.map((task) => (["site", "deck", "result"].includes(planner.stepIdOf(task)) ? { ...task, status: task.id.endsWith("site") ? "running" : "planned", artifactIds: [], finishedAt: undefined } : task))
  await store.saveFlow(OWNER.userId, snapshot)
  await store.flushWrites()
  // A new process: same storage, empty memory.
  store.configureOsBackend(backend)
  const loaded = await store.getFlow(OWNER.userId, flow.id)
  const recovered = await executor.recoverInterrupted(OWNER.userId, loaded)
  assert.equal(recovered.interrupted, true)
  assert.equal(step(recovered, "site").status, "failed")
  assert.equal(step(recovered, "site").error.code, "INTERRUPTED")
  await executor.retryFlow(OWNER.userId, flow.id, OWNER, deps)
  const resumed = await waitDone(flow.id)
  assert.equal(resumed.status, "completed", JSON.stringify(resumed.tasks.map((t) => [t.label, t.status])))
  assert.equal(resumed.interrupted, false)
})

await check("demo mode shows a saved copy, labeled, when a step fails for good", async () => {
  store.configureOsBackend(store.memoryBackend())
  const good = makeDeps()
  const first = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-demo-1", deps: good })
  await waitDone(first.flow.id)
  const bad = makeDeps({ failures: { brand: 10 } })
  const second = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-demo-2", deps: bad, demo: true })
  const done = await waitDone(second.flow.id)
  const brand = step(done, "brand")
  assert.equal(brand.status, "completed")
  assert.equal(brand.provider, "demo-cache")
  const copy = await store.getArtifact(OWNER.userId, brand.artifactIds[0])
  assert.equal(copy.fallback.kind, "demo-cache")
  assert.ok(copy.fallback.originalCreatedAt < copy.createdAt || copy.fallback.originalCreatedAt <= copy.createdAt)
  // Without demo mode the same failure is a failure.
  const third = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-demo-3", deps: makeDeps({ failures: { brand: 10 } }) })
  const plain = await waitDone(third.flow.id)
  assert.equal(step(plain, "brand").status, "failed")
})

await check("storage keeps no media bytes and no oversized content", async () => {
  store.configureOsBackend(store.memoryBackend())
  await assert.rejects(store.putArtifact(OWNER.userId, { projectId: "proj_x1", kind: "image", title: "x", sourceTool: "user", url: "data:image/png;base64,AAAA" }), /DATA/)
  await assert.rejects(store.putArtifact(OWNER.userId, { projectId: "proj_x1", kind: "text", title: "x", sourceTool: "user", content: "x".repeat(400_001) }), /TOO_LARGE/)
})

await check("one account cannot read another account's flows or artifacts", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = makeDeps()
  const { flow } = await executor.startFlow({ owner: OWNER, goal: SHOWCASE, clientRequestId: "req-own", deps })
  const done = await waitDone(flow.id)
  const other = "someone@else.com"
  assert.equal(await store.getFlow(other, flow.id), null)
  assert.equal(await store.getArtifact(other, done.tasks[0].artifactIds[0]), null)
  assert.equal(await store.getProject(other, done.projectId), null)
})

await check("writes to the same key are serialized and the latest value wins", async () => {
  const writes = []
  let active = 0
  let maxActive = 0
  const backend = {
    durable: true,
    async read() { return null },
    async write(key, value) {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 3))
      writes.push(value)
      active -= 1
      return true
    },
    async remove() { return true },
  }
  store.configureOsBackend(backend)
  const project = await store.createProject(OWNER.userId, { title: "t", goal: "g" })
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.updateProject(OWNER.userId, project.id, (target) => { target.facts[`k${i}`] = String(i) })))
  await store.flushWrites()
  assert.equal(maxActive <= 2, true, "index and project each one at a time")
  const last = writes.filter((value) => value && value.facts).at(-1)
  assert.equal(Object.keys(last.facts).length, 20, "no update lost")
  assert.ok(writes.length < 44, `coalesced (${writes.length} writes for 21 updates × 2 keys)`)
})

console.log(`\n${count - failed}/${count} passed`)
process.exit(failed ? 1 : 0)
