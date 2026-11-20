import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

const owner = { userId: "qa-work-delivery", authenticated: true, plan: "pro" }
let session = owner
let now = Date.now()
let requests = []
let actions = []
let balance = 0
let refuseArtifactWrites = false
let closeSlideBatchEarly = false
let researchSources
let lookups = 0
const deps = {
  now: () => ++now,
  random: () => 0.5,
  async sleep(ms) { now += ms },
  async text(request) {
    requests.push(request)
    assert.ok(actions.length, "unexpected model call")
    const action = actions.shift()
    const content = typeof action === "function" ? await action(request) : typeof action === "string" ? action : JSON.stringify(action)
    return { content, model: "qa", provider: "fixture" }
  },
  async site() { throw Error("Unexpected site call") },
  async code() { throw Error("Work must use the requested stack, not the Next.js-only generator") },
  async search(queries, options) {
    assert.ok(researchSources, "Unexpected web search")
    assert.match(queries[0], /Water Survey/)
    assert.equal(options.signal.aborted, false)
    lookups++
    return researchSources
  },
  presentation: {
    async maxSlides() { return 12 },
    async reserve(_owner, cost) { balance -= cost; return { ok: true } },
    async refund(_owner, cost) { balance += cost },
    async outline({ count, language, topic }) {
      assert.equal(language, "kk")
      assert.match(topic, /Алматы/u)
      return { title: "Алматы", items: Array.from({ length: count }, (_, i) => ({ title: `Тақырып ${i + 1}`, point: "Басты ой", layout: "title" })) }
    },
    async slides({ startIndex, count }) {
      const size = closeSlideBatchEarly ? count - 1 : count
      closeSlideBatchEarly = false
      return { slides: Array.from({ length: size }, (_, i) => ({
        index: startIndex + i, slide: { id: `slide-${i + 1}`, layout: "title", title: `Алматы ${i + 1}` },
      })), missing: [] }
    },
  },
}
const load = workTestLoader({
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => session },
  "@/lib/os/runtime": { serverToolDeps: () => deps },
})
const store = load("lib/os/store.ts")
const backend = store.memoryBackend()
store.configureOsBackend({
  ...backend,
  async write(path, value) {
    if (refuseArtifactWrites && /\/artifacts\//.test(path)) return false
    return backend.write(path, value)
  },
})
const executor = load("lib/os/executor.ts")
const native = load("lib/work/documents/verify-native.ts")
const zip = load("lib/work/code/zip-read.ts")
const postFlow = load("app/api/os/flows/route.ts").POST
const getEvents = load("app/api/os/flows/[id]/events/route.ts").GET
const retryFlow = load("app/api/os/flows/[id]/retry/route.ts").POST
const download = load("app/api/os/artifacts/[id]/export/route.ts").GET
const streamEvents = load("lib/os/events.ts")

let count = 0
let requestId = 0
const context = id => ({ params: Promise.resolve({ id }) })
const body = value => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) })
const submit = (goal, id = `qa-work-delivery-${++requestId}`) =>
  postFlow(new Request("http://qa.invalid/api/os/flows", body({ goal, workspaceMode: "work", clientRequestId: id })))
const file = (id, format) => download(new Request(`http://qa.invalid/api/os/artifacts/${id}/export?format=${format}`), context(id))
async function start(goal) {
  const response = await submit(goal)
  const data = await response.json()
  assert.equal(response.status, 201, JSON.stringify(data))
  return data.flow.id
}
async function waitFor(predicate) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const result = await predicate()
    if (result) return result
    assert.ok(Date.now() < deadline, "flow timed out")
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
const finished = id => waitFor(async () => {
  const flow = await store.getFlow(owner.userId, id)
  return !executor.isFlowRunning(id) && flow?.finishedAt && flow
})
const deliveries = flow => store.getArtifacts(owner.userId, flow.tasks.filter(task => task.type !== "result.assemble").flatMap(task => task.artifactIds))
async function check(name, fn) {
  requests = []
  actions = []
  await fn()
  assert.deepEqual(actions, [], "unused model fixtures")
  count++
  console.log(`PASS ${name}`)
}

await check("PDF on a Python topic reaches only the document tool and downloads native bytes", async () => {
  const manuscript = "# Запуск\nОткройте терминал.\n\n```bash\npython app.py\n```"
  actions = [manuscript]
  const flow = await finished(await start("Подготовь PDF с инструкцией по запуску сайта на Python"))
  assert.equal(flow.status, "completed")
  assert.deepEqual(flow.tasks.map(task => task.type), ["document.write", "result.assemble"])
  assert.equal(requests.length, 1)
  const [artifact] = await deliveries(flow)
  assert.equal(artifact.content, manuscript)
  assert.equal(artifact.metadata.verifiedExports[0].format, "pdf")
  const saved = await store.readStoredArtifact(owner.userId, artifact.id)
  assert.equal(saved.content, artifact.content)
  const response = await file(artifact.id, "pdf")
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "application/pdf")
  assert.match(Buffer.from(await response.arrayBuffer()).toString("latin1"), /^%PDF-/)
})

await check("XLSX missing a table retries once and returns actual formulas, data and a chart", async () => {
  actions = [
    "# Затраты\nВ первом ответе таблицы нет.",
    "# Затраты\n\n| Месяц | Расходы | Итого |\n| --- | --- | --- |\n| Январь | 10 | =B2*2 |\n| Февраль | 15 | =B3*2 |",
  ]
  const flow = await finished(await start("Подготовь XLSX с формулами и диаграммой. Январь 10, февраль 15, итог — удвоенное значение."))
  assert.equal(flow.status, "completed")
  assert.equal(requests.length, 2)
  assert.match(requests[1].prompt, /XLSX не прошёл проверку/u)
  assert.equal(flow.events.filter(event => event.type === "tool.retrying").length, 1)
  const [artifact] = await deliveries(flow)
  assert.deepEqual(artifact.metadata.verifiedExports.map(item => [item.format, item.formulas, item.charts]), [["xlsx", 2, 1]])
  const response = await file(artifact.id, "xlsx")
  assert.equal(response.status, 200)
  const archive = native.nativePackage(new Uint8Array(await response.arrayBuffer()))
  assert.match(archive.get("xl/worksheets/sheet1.xml"), /<f>B2\*2<\/f><v>20<\/v>/u)
  assert.ok(archive.has("xl/charts/chart1.xml"))
})

let incompleteId
await check("a second invalid spreadsheet attempt leaves a failed task and no downloadable result", async () => {
  actions = ["# Расходы\nТаблицы нет.", "# Расходы\nТаблицы всё ещё нет."]
  incompleteId = await start("Сделай XLSX с таблицей расходов")
  const flow = await finished(incompleteId)
  assert.equal(flow.status, "failed")
  assert.equal(flow.tasks[0].error.code, "EXPORT_CHECK_FAILED")
  assert.equal(flow.tasks[0].retry.attempts, 2)
  assert.deepEqual(await deliveries(flow), [])
  assert.equal(flow.events.some(event => event.type === "artifact.ready"), false)
})

await check("the retry API recovers an unfinished export and opens an actual spreadsheet", async () => {
  actions = ["# План\n\n| Статья | Сумма |\n| --- | --- |\n| Аренда | 70 |"]
  const response = await retryFlow(new Request(`http://qa.invalid/api/os/flows/${incompleteId}/retry`, body({})), context(incompleteId))
  assert.equal(response.status, 200)
  const flow = await finished(incompleteId)
  assert.equal(flow.status, "completed")
  assert.equal(flow.tasks[0].retry.attempts, 1)
  const [artifact] = await deliveries(flow)
  assert.equal((await file(artifact.id, "xlsx")).status, 200)
})

await check("one report is exported in both requested formats with one model call", async () => {
  actions = ["# Meeting report\nThe team chose a workshop on Monday."]
  const flow = await finished(await start("Write a report in DOCX and PDF about the workshop"))
  const [artifact] = await deliveries(flow)
  assert.equal(flow.status, "completed")
  assert.equal(requests.length, 1)
  assert.deepEqual(artifact.metadata.verifiedExports.map(item => item.format), ["docx", "pdf"])
  const response = await file(artifact.id, "docx")
  assert.equal(response.status, 200)
  assert.match(native.nativePackage(new Uint8Array(await response.arrayBuffer())).get("word/document.xml"), /workshop on Monday/)
})

await check("an explicit sources request searches first and includes verified numbered links in Word", async () => {
  lookups = 0
  researchSources = [
    { title: "Official assessment", url: "https://water.example.org/study", domain: "water.example.org", text: "The survey began in April." },
    { title: "University report", url: "https://research.example.edu/study", domain: "research.example.edu", text: "The organizers published the survey plan." },
  ]
  actions = [
    "## Key result\nThe Water Survey began in April according to the official assessment [1].\n## Verified details\nThe university report confirms the organizers published a study plan [2].\n## Remaining questions\nThe publications did not establish when final results would be available.",
    "# Water Survey\nThe survey started in April [99].",
    "# Water Survey\nThe assessment records an April start [1]. The university confirms a study plan was published [2].",
  ]
  try {
    const flow = await finished(await start("Create a DOCX report about the Water Survey with official sources"))
    assert.equal(flow.status, "completed", JSON.stringify(flow.tasks.map(task => task.error)))
    assert.equal(lookups, 1)
    assert.deepEqual(flow.tasks.map(task => task.type), ["research.web", "document.write", "result.assemble"])
    assert.match(requests[2].prompt, /убери отсутствующие номера/u)
    const artifact = (await deliveries(flow)).find(item => item.kind === "document")
    const downloaded = await file(artifact.id, "docx")
    const entries = native.nativePackage(new Uint8Array(await downloaded.arrayBuffer()))
    assert.match(entries.get("word/_rels/document.xml.rels"), /https:\/\/water\.example\.org\/study/)
    assert.match(entries.get("word/document.xml"), /assessment records an April start \[1\]/)
  } finally { researchSources = undefined }
})

await check("a sources request cannot produce a report when the search has no evidence", async () => {
  lookups = 0
  researchSources = []
  try {
    const flow = await finished(await start("Find Water Survey evidence and make a DOCX report"))
    assert.equal(flow.status, "failed")
    assert.equal(lookups, 2)
    assert.equal(requests.length, 0)
    assert.equal(flow.tasks.find(task => task.type === "research.web").error.code, "NO_SOURCES")
    assert.equal(flow.tasks.find(task => task.type === "document.write").status, "cancelled")
    assert.deepEqual(await deliveries(flow), [])
  } finally { researchSources = undefined }
})

const python = {
  title: "Habit tracker",
  files: [
    { path: "README.md", content: "# Habit tracker\nRun python src/habits.py\n" },
    { path: "src/habits.py", content: "def record(name):\n    return name.strip()\n" },
    { path: "tests/test_habits.py", content: "from src.habits import record\n\ndef test_record():\n    assert record('walk ') == 'walk'\n" },
  ],
}
let codeArtifact
await check("source validation rejects the wrong stack, then returns the complete Python ZIP", async () => {
  actions = [
    { title: "Wrong language", files: [python.files[0], { path: "app.js", content: "export const x = 1;" }] },
    python,
  ]
  const flow = await finished(await start("Разработай Python-проект для трекера привычек"))
  assert.equal(flow.status, "completed")
  assert.equal(requests.length, 2)
  assert.match(requests[1].prompt, /нет запрошенных исходников на Python/u)
  const [project] = await deliveries(flow)
  codeArtifact = project
  assert.equal(codeArtifact.metadata.testsExecuted, false)
  assert.equal(codeArtifact.metadata.buildExecuted, false)
  assert.equal(codeArtifact.metadata.stack, "python")
  const response = await file(codeArtifact.id, "zip")
  assert.equal(response.status, 200)
  const unpacked = zip.readProjectZip(Buffer.from(await response.arrayBuffer()))
  const unpackedSource = new Map(unpacked.files.map(item => [item.path, item.content]))
  assert.deepEqual(unpackedSource, new Map(python.files.map(item => [item.path, item.content])))
})

await check("path traversal, credential files and case-folded collisions cannot reach the archive", async () => {
  actions = [
    { ...python, files: [...python.files, { path: "../escape.py", content: "pass" }, { path: ".env", content: "EXAMPLE_KEY=fixture" }] },
    { ...python, files: [...python.files, { path: "SRC/HABITS.PY", content: "pass" }] },
  ]
  const flow = await finished(await start("Build a Python CLI project to track habits"))
  assert.equal(flow.status, "failed")
  assert.match(flow.tasks[0].error.message, /уникальными и безопасными/u)
  assert.deepEqual(await deliveries(flow), [])
})

await check("an older truncated export is refused and another account cannot download the full project", async () => {
  const truncated = await store.putArtifact(owner.userId, {
    projectId: codeArtifact.projectId, kind: "code", sourceTool: "code.project", title: "Legacy",
    content: JSON.stringify({ files: [python.files[0]], truncated: true }), metadata: { fileCount: 3 },
  })
  assert.equal((await file(truncated.id, "zip")).status, 422)
  session = { ...owner, userId: "qa-other-account" }
  try { assert.equal((await file(codeArtifact.id, "zip")).status, 404) }
  finally { session = owner }
})

await check("a mixed job keeps the valid DOCX and only retries the malformed code", async () => {
  const invalid = { title: "Broken JS", files: [python.files[0], { path: "index.js", content: "export const broken = (" }] }
  actions = [
    request => request.system.startsWith("Собери полные") ? JSON.stringify(invalid) : "# Решение\nКраткий отчёт по итогам.",
    request => request.system.startsWith("Собери полные") ? JSON.stringify(invalid) : "# Решение\nКраткий отчёт по итогам.",
    invalid,
  ]
  const id = await start("Подготовь DOCX по встрече и собери приложение на JavaScript")
  const firstRun = await finished(id)
  assert.equal(firstRun.status, "partial")
  assert.equal(firstRun.tasks.find(task => task.type === "code.project").error.code, "SOURCE_CHECK_FAILED")
  assert.equal((await deliveries(firstRun)).length, 1)
  const firstDocument = (await deliveries(firstRun))[0]
  actions = [{ title: "Fixed JS", files: [python.files[0], { path: "index.js", content: "export const result = 2;" }] }]
  assert.equal((await retryFlow(new Request(`http://qa.invalid/api/os/flows/${id}/retry`, body({})), context(id))).status, 200)
  const secondRun = await finished(id)
  assert.equal(secondRun.status, "completed")
  assert.equal(requests.filter(request => request.system.startsWith("Ты — редактор")).length, 1)
  const artifacts = await deliveries(secondRun)
  assert.equal(artifacts.find(artifact => artifact.kind === "document").id, firstDocument.id)
  assert.equal(artifacts.length, 2)
})

await check("the exact requested Kazakh slide count survives one incomplete batch and a PPTX download", async () => {
  closeSlideBatchEarly = true
  const flow = await finished(await start("Алматы туралы 3 слайдтан PPTX дайында"))
  assert.equal(flow.status, "completed", JSON.stringify(flow.tasks.map(task => task.error)))
  assert.equal(balance, -4, "the incomplete attempt was fully refunded")
  assert.equal(flow.tasks[0].retry.attempts, 2)
  const [artifact] = await deliveries(flow)
  const response = await file(artifact.id, "pptx")
  assert.equal(response.status, 200)
  const bytes = native.nativePackage(new Uint8Array(await response.arrayBuffer()))
  assert.equal([...bytes.keys()].filter(key => /^ppt\/slides\/slide\d+\.xml$/.test(key)).length, 3)
  assert.match(bytes.get("ppt/slides/slide3.xml"), /Алматы 3/u)
})

await check("storage refusal never publishes an artifact or records a successful export", async () => {
  actions = ["# Письмо\nТекст письма.", "# Письмо\nТекст письма."]
  refuseArtifactWrites = true
  try {
    const flow = await finished(await start("Сделай DOCX с письмом"))
    assert.equal(flow.status, "failed")
    assert.equal(flow.tasks[0].error.code, "ARTIFACT_WRITE_FAILED")
    assert.equal(flow.events.some(event => event.type === "artifact.ready" || event.type === "tool.completed"), false)
    assert.deepEqual(await deliveries(flow), [])
  } finally { refuseArtifactWrites = false }
})

await check("two simultaneous requests share one flow and one model call", async () => {
  actions = ["# Записка\nКороткий текст."]
  const id = "qa-work-delivery-double-send"
  const responses = await Promise.all([submit("Сделай DOCX с запиской", id), submit("Сделай DOCX с запиской", id)])
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201])
  const [first, second] = await Promise.all(responses.map(response => response.json()))
  assert.equal(first.flow.id, second.flow.id)
  await finished(first.flow.id)
  assert.equal(requests.length, 1)
})

await check("the final artifact and completion event survive finishing while the SSE snapshot is loaded", async () => {
  let finishDocument
  actions = [() => new Promise(resolve => { finishDocument = resolve })]
  const id = await start("Сделай DOCX с короткой встречей")
  await waitFor(() => finishDocument)
  const getArtifacts = store.getArtifacts
  let releaseSnapshot
  store.getArtifacts = async (...args) => {
    if (!releaseSnapshot) await new Promise(resolve => { releaseSnapshot = resolve })
    return getArtifacts(...args)
  }
  try {
    const response = await getEvents(new Request(`http://qa.invalid/api/os/flows/${id}/events`), context(id))
    assert.equal(response.status, 200)
    await waitFor(() => releaseSnapshot)
    finishDocument("# Встреча\nДоговорились проверить макет.")
    await finished(id)
    releaseSnapshot()
    const raw = await response.text()
    assert.match(raw, /^event: snapshot/m)
    assert.match(raw, /event: artifact/m)
    assert.match(raw, /event: done\ndata: [^\n]*"status":"completed"/m)
    assert.equal(streamEvents.subscriberCount(id), 0)
  } finally { store.getArtifacts = getArtifacts }
})

await check("reopen repairs the missing terminal timestamp after the last task finished", async () => {
  actions = ["# Записка\nКороткий текст."]
  const id = await start("Сделай DOCX с короткой заметкой")
  const flow = await finished(id)
  delete flow.finishedAt
  await store.saveFlow(owner.userId, flow)
  const response = await getEvents(new Request(`http://qa.invalid/api/os/flows/${id}/events`), context(id))
  const output = await response.text()
  assert.match(output, /"finishedAt":\d+/u)
  assert.match(output, /event: done\ndata: [^\n]*"status":"completed"/m)
  assert.equal(streamEvents.subscriberCount(id), 0)
})

console.log(`${count}/${count} PASS (Work API, actual exports and SSE; auth and model/provider fixtures)`)
