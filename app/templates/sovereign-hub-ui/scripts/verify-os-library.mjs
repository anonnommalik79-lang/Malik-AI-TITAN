// Malik AI OS: library search and lineage, diff and rollback, cross-tool
// continuation and editing, the data analyst (CSV and XLSX), and plugin
// permissions. No network.
//
//   npm run test:os-library

import assert from "node:assert/strict"
import { deflateRawSync } from "node:zlib"

const root = new URL("..", import.meta.url).pathname
const store = await import(`${root}lib/os/store.ts`)
const executor = await import(`${root}lib/os/executor.ts`)
const library = await import(`${root}lib/os/library.ts`)
const diff = await import(`${root}lib/os/diff.ts`)
const table = await import(`${root}lib/os/data/table.ts`)
const xlsx = await import(`${root}lib/os/data/xlsx.ts`)
const actions = await import(`${root}lib/os/actions.ts`)
const plugins = await import(`${root}lib/os/plugin-actions.ts`)

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

const OWNER = { userId: "analyst@example.com", plan: "pro", authenticated: true }

function stubDeps(textReply) {
  let clock = 1_700_000_000_000
  return {
    async text(request) {
      const reply = typeof textReply === "function" ? textReply(request) : textReply
      if (reply instanceof Error) throw reply
      return { content: reply, provider: "test", model: "m" }
    },
    async search() { return [] },
    image: { async check() { return { ok: true } }, async generate() { throw new Error("no") }, async record() {} },
    async site() { throw new Error("no") },
    presentation: {
      async reserve() { return { ok: true } },
      async refund() {},
      async maxSlides() { return 12 },
      async outline(input) { return { title: "Deck", items: Array.from({ length: input.count }, (_, i) => ({ title: `S${i}`, point: "", layout: "bullets" })) } },
      async slides(input) { return { slides: Array.from({ length: input.count }, (_, i) => ({ index: input.startIndex + i, slide: { id: `x${input.startIndex + i}`, layout: "bullets", title: `Qazyna ${input.startIndex + i}` } })), missing: [] } },
    },
    async code() { throw new Error("no") },
    now: () => (clock += 1),
    async sleep(ms) { clock += ms; await new Promise((resolve) => setImmediate(resolve)) },
    random: () => 0.5,
  }
}

async function waitDone(flowId) {
  const started = Date.now()
  for (;;) {
    const flow = await store.getFlow(OWNER.userId, flowId)
    if (flow?.finishedAt && !executor.isFlowRunning(flowId)) return flow
    if (Date.now() - started > 15_000) throw new Error("flow did not finish")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

console.log("diff and rollback")

await check("the line diff turns the old text into the new one exactly", () => {
  const cases = [
    ["a\nb\nc", "a\nB\nc\nd"],
    ["", "x\ny"],
    ["x\ny", ""],
    ["one\ntwo\nthree\nfour\nfive", "zero\none\nthree\nfour\n4.5\nfive"],
  ]
  for (let i = 0; i < 40; i += 1) {
    const base = Array.from({ length: 30 }, (_, j) => `line ${j % 7}`)
    const next = base.filter(() => Math.random() > 0.25).map((line) => (Math.random() > 0.85 ? `${line}!` : line))
    cases.push([base.join("\n"), next.join("\n")])
  }
  for (const [before, after] of cases) {
    const result = diff.diffLines(before, after)
    const oldText = result.lines.filter((line) => line.type !== "add").map((line) => line.text).join("\n")
    const newText = result.lines.filter((line) => line.type !== "remove").map((line) => line.text).join("\n")
    assert.equal(oldText, before)
    assert.equal(newText, after)
  }
  const small = diff.diffLines("a\nb\nc", "a\nB\nc")
  assert.equal(small.added, 1)
  assert.equal(small.removed, 1)
})

await check("file diffs report added, removed and changed files", () => {
  const changes = diff.diffFiles(
    [{ path: "a.js", content: "1\n2" }, { path: "b.js", content: "x" }, { path: "same.js", content: "s" }],
    [{ path: "a.js", content: "1\n3" }, { path: "c.js", content: "new" }, { path: "same.js", content: "s" }],
  )
  assert.deepEqual(changes.map((file) => [file.path, file.status]), [["a.js", "changed"], ["b.js", "removed"], ["c.js", "added"]])
  const compact = diff.compactDiff(diff.diffLines(Array.from({ length: 50 }, (_, i) => `l${i}`).join("\n"), Array.from({ length: 50 }, (_, i) => (i === 25 ? "changed" : `l${i}`)).join("\n")), 2)
  assert.ok(compact.some((item) => item.type === "gap"))
  assert.equal(compact.filter((item) => item.type !== "gap").length, 6)
})

console.log("library")

await check("search finds by meaning, synonyms and typos, and filters by kind", () => {
  const entry = (id, kind, title, summary = "", createdAt = 1) => ({ id, projectId: "p1", kind, title, createdAt, sourceTool: "user", summary, links: [], keywords: `${title} ${summary}`.toLowerCase() })
  const index = [
    entry("a1", "website", "Сайт Qazyna AI", "лендинг для фермеров", 5),
    entry("a2", "presentation", "Investor Deck Qazyna", "11 слайдов", 4),
    entry("a3", "business-plan", "Бизнес-план Qazyna", "финансовый план на три года", 3),
    entry("a4", "image", "Логотип Qazyna", "знак бренда", 2),
  ]
  assert.equal(library.lexicalSearch(index, "лендинг")[0].id, "a1")
  assert.equal(library.lexicalSearch(index, "landing page")[0].id, "a1")
  assert.equal(library.lexicalSearch(index, "презентацыя инвесторам")[0].id, "a2")
  assert.equal(library.lexicalSearch(index, "финансы")[0].id, "a3")
  assert.equal(library.lexicalSearch(index, "logo")[0].id, "a4")
  assert.deepEqual(library.lexicalSearch(index, "qazyna", { kind: "image" }).map((hit) => hit.id), ["a4"])
  assert.equal(library.lexicalSearch(index, "совершенно другое слово").length, 0)
})

await check("semantic mode re-ranks by vectors only when an embedder works", async () => {
  const index = [
    { id: "b1", projectId: "p", kind: "document", title: "Посевная кампания", createdAt: 2, sourceTool: "user", summary: "пшеница и ячмень", links: [], keywords: "посевная пшеница" },
    { id: "b2", projectId: "p", kind: "document", title: "Отчёт по продажам", createdAt: 1, sourceTool: "user", summary: "выручка магазина", links: [], keywords: "продажи выручка" },
  ]
  const vectors = { "урожай зерна": [1, 0], "Посевная кампания. пшеница и ячмень": [0.9, 0.1], "Отчёт по продажам. выручка магазина": [0, 1] }
  const embed = async (text) => vectors[text] || null
  const result = await library.semanticSearch(index, "урожай зерна", { limit: 5 }, embed, new Map())
  assert.equal(result.mode, "semantic")
  assert.equal(result.hits[0].id, "b1")
  const lexicalOnly = await library.semanticSearch(index, "урожай зерна", { limit: 5 }, null, new Map())
  assert.equal(lexicalOnly.mode, "lexical")
  const broken = await library.semanticSearch(index, "продажи", { limit: 5 }, async () => null, new Map())
  assert.equal(broken.mode, "lexical")
})

console.log("data analyst")

await check("CSV with quotes, semicolons and a header is read exactly", () => {
  const rows = table.parseCsv('Регион;Выручка;Дата\n"Алматы; центр";1 200,50;2026-01-05\nАстана;800;2026-01-06\n')
  assert.deepEqual(rows[1], ["Алматы; центр", "1 200,50", "2026-01-05"])
  const t = table.toTable(rows)
  assert.deepEqual(t.header, ["Регион", "Выручка", "Дата"])
  assert.equal(t.rows.length, 2)
  const profile = table.profileTable(t)
  const revenue = profile.profiles[1]
  assert.equal(revenue.type, "number")
  assert.equal(revenue.sum, 2000.5)
  assert.equal(revenue.mean, 1000.25)
  assert.equal(revenue.min, 800)
  assert.equal(profile.profiles[2].type, "date")
  assert.equal(profile.profiles[2].firstDate, "2026-01-05")
})

await check("statistics: median, correlation and group totals", () => {
  const rows = [["city", "ads", "sales"], ...Array.from({ length: 20 }, (_, i) => [i % 2 ? "A" : "B", String(i), String(i * 2 + 1)])]
  const profile = table.profileTable(table.toTable(rows))
  assert.equal(profile.profiles[1].median, 9.5)
  assert.equal(profile.correlations[0].r, 1)
  const group = profile.groups.find((item) => item.measure === "sales")
  assert.equal(group.rows.reduce((total, row) => total + row.sum, 0), profile.profiles[2].sum)
  assert.match(table.profileMarkdown(profile), /\| sales \| number/)
})

function makeXlsx(cells) {
  // A minimal real .xlsx: shared strings, one sheet, deflate-compressed.
  const strings = []
  const sharedIndex = (value) => {
    const found = strings.indexOf(value)
    if (found >= 0) return found
    strings.push(value)
    return strings.length - 1
  }
  const letters = "ABCDEFGHIJ"
  const rowsXml = cells.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => (typeof value === "number" ? `<c r="${letters[c]}${r + 1}"><v>${value}</v></c>` : `<c r="${letters[c]}${r + 1}" t="s"><v>${sharedIndex(value)}</v></c>`)).join("")}</row>`).join("")
  const files = {
    "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${rowsXml}</sheetData></worksheet>`,
    "xl/sharedStrings.xml": `<sst>${strings.map((value) => `<si><t>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`).join("")}</sst>`,
  }
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8")
    const compressed = deflateRawSync(data)
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, compressed)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + compressed.length
  }
  const centralBytes = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBytes, end])
}

await check("XLSX: the first sheet is read with shared strings and numbers", () => {
  const buffer = makeXlsx([["Товар", "Цена"], ["Чай", 450], ["Кофе & сливки", 1200]])
  assert.deepEqual(xlsx.readXlsx(buffer), [["Товар", "Цена"], ["Чай", "450"], ["Кофе & сливки", "1200"]])
})

await check("an uploaded table becomes a dataset and a computed analysis flow", async () => {
  store.configureOsBackend(store.memoryBackend())
  const deps = stubDeps("## Главное\nПродажи выше в городе A.\n\n## Детали\nКорреляция 1.\n\n## Что проверить\nСезонность.")
  const csv = ["city,ads,sales", ...Array.from({ length: 12 }, (_, i) => `${i % 2 ? "A" : "B"},${i},${i * 3}`)].join("\n")
  const result = await actions.analyzeDataset({ owner: OWNER, fileName: "sales.csv", bytes: Buffer.from(csv), question: "Где продажи выше?", clientRequestId: "data-req-1", deps })
  const done = await waitDone(result.flow.id)
  assert.equal(done.status, "completed", JSON.stringify(done.tasks.map((t) => [t.status, t.error])))
  const analysis = await store.getArtifact(OWNER.userId, done.tasks[0].artifactIds[0])
  assert.equal(analysis.kind, "analysis")
  assert.match(analysis.content, /Продажи выше/)
  assert.match(analysis.content, /\| sales \| number/)
  assert.equal(analysis.links[0].artifactId, result.dataset.id)
  // The same upload again: the same flow and dataset.
  const again = await actions.analyzeDataset({ owner: OWNER, fileName: "sales.csv", bytes: Buffer.from(csv), clientRequestId: "data-req-1", deps })
  assert.equal(again.created, false)
  assert.equal(again.dataset.id, result.dataset.id)
  // Without a model, the exact statistics still arrive — and say so.
  const offline = await actions.analyzeDataset({ owner: OWNER, fileName: "sales2.csv", bytes: Buffer.from(csv), clientRequestId: "data-req-2", deps: stubDeps(new Error("upstream 503")) })
  const offlineDone = await waitDone(offline.flow.id)
  const computed = await store.getArtifact(OWNER.userId, offlineDone.tasks[0].artifactIds[0])
  assert.equal(computed.metadata.fallback, "computed-only")
  assert.match(computed.content, /точная статистика/)
})

console.log("continuation, editing, lineage")

await check("a plan continues into a deck in the same project, with lineage", async () => {
  store.configureOsBackend(store.memoryBackend())
  const project = await store.createProject(OWNER.userId, { title: "Qazyna", goal: "стартап" })
  const brand = await store.putArtifact(OWNER.userId, { projectId: project.id, kind: "text", title: "Бренд Qazyna", sourceTool: "brand.create", content: "# Qazyna", metadata: { role: "brand", brand: { name: "Qazyna", tagline: "t", positioning: "p", colors: {} } } })
  const plan = await store.putArtifact(OWNER.userId, { projectId: project.id, kind: "business-plan", title: "Бизнес-план Qazyna", sourceTool: "business.plan", content: "# План Qazyna\n## Резюме\nтекст" })
  const started = await actions.continueFromArtifact({ owner: OWNER, artifactId: plan.id, target: "presentation", instruction: "Сделай из плана питч для инвесторов", clientRequestId: "cont-req-1", deps: stubDeps("x") })
  assert.equal(started.flow.projectId, project.id)
  const inputs = started.flow.tasks[0].input.sourceArtifactIds
  assert.ok(inputs.includes(plan.id) && inputs.includes(brand.id), "plan and brand go along")
  const done = await waitDone(started.flow.id)
  assert.equal(done.status, "completed", JSON.stringify(done.tasks.map((t) => [t.status, t.error])))
  const deck = await store.getArtifact(OWNER.userId, done.tasks[0].artifactIds[0])
  assert.equal(deck.kind, "presentation")
  assert.ok(deck.links.some((link) => link.artifactId === plan.id))
  const lineage = library.lineageOf(await store.artifactIndex(OWNER.userId), plan.id)
  assert.ok(lineage.derived.some((entry) => entry.id === deck.id), "the plan knows the deck was made from it")
})

await check("Fix with AI: a code edit merges changed files into a new version; rollback restores the old one", async () => {
  store.configureOsBackend(store.memoryBackend())
  const project = await store.createProject(OWNER.userId, { title: "App", goal: "app" })
  const v1 = await store.putArtifact(OWNER.userId, { projectId: project.id, kind: "code", title: "App", sourceTool: "code.project", version: 1, content: JSON.stringify({ files: [{ path: "index.html", content: "<script>boom()</script>" }, { path: "style.css", content: "body{}" }] }), metadata: { role: "code", qaPassed: true } })
  const reply = JSON.stringify({ files: [{ path: "index.html", content: "<script>console.log('ok')</script>" }], deleted: [], note: "Убрал вызов несуществующей функции" })
  const started = await actions.editArtifact({ owner: OWNER, artifactId: v1.id, errors: ["ReferenceError: boom is not defined"], clientRequestId: "edit-req-1", deps: stubDeps(reply) })
  assert.equal(started.flow.tasks[0].label, "Исправляю ошибки")
  const done = await waitDone(started.flow.id)
  assert.equal(done.status, "completed", JSON.stringify(done.tasks.map((t) => [t.status, t.error])))
  const v2 = await store.getArtifact(OWNER.userId, done.tasks[0].artifactIds[0])
  assert.equal(v2.version, 2)
  assert.deepEqual(v2.links, [{ relation: "revision-of", artifactId: v1.id }])
  const files = JSON.parse(v2.content).files
  assert.equal(files.find((file) => file.path === "index.html").content, "<script>console.log('ok')</script>")
  assert.equal(files.find((file) => file.path === "style.css").content, "body{}", "untouched file kept")
  assert.deepEqual(v2.metadata.fixedErrors, ["ReferenceError: boom is not defined"])
  // v1 is unchanged.
  assert.match((await store.getArtifact(OWNER.userId, v1.id)).content, /boom/)
  const v3 = await actions.restoreArtifactVersion(OWNER.userId, v2.id, v1.id)
  assert.equal(v3.version, 3)
  assert.equal(v3.content, v1.content)
  const lineage = library.lineageOf(await store.artifactIndex(OWNER.userId), v2.id)
  assert.deepEqual(lineage.versions.map((entry) => entry.version), [1, 2, 3])
})

await check("an edit that asks for nothing, or of another account's artifact, is refused", async () => {
  store.configureOsBackend(store.memoryBackend())
  const project = await store.createProject(OWNER.userId, { title: "Doc", goal: "doc" })
  const doc = await store.putArtifact(OWNER.userId, { projectId: project.id, kind: "document", title: "Doc", sourceTool: "document.write", content: "# Doc\n" + "text ".repeat(100) })
  await assert.rejects(actions.editArtifact({ owner: OWNER, artifactId: doc.id, clientRequestId: "edit-req-empty", deps: stubDeps("x") }), /Опишите/)
  await assert.rejects(actions.editArtifact({ owner: { ...OWNER, userId: "other@example.com" }, artifactId: doc.id, instruction: "x", clientRequestId: "edit-req-other", deps: stubDeps("x") }), /не найден/)
})

console.log("plugins")

await check("connected plugins need permission; once is used up; open-data plugins do not", async () => {
  store.configureOsBackend(store.memoryBackend())
  assert.deepEqual(await plugins.consumePluginPermission(OWNER.userId, "github"), { ok: false, reason: "permission" })
  await plugins.setPluginGrant(OWNER.userId, "github", "once")
  assert.equal((await plugins.consumePluginPermission(OWNER.userId, "github")).ok, true)
  assert.equal((await plugins.consumePluginPermission(OWNER.userId, "github")).ok, false, "a one-time grant is spent")
  await plugins.setPluginGrant(OWNER.userId, "notion", "always")
  assert.equal((await plugins.consumePluginPermission(OWNER.userId, "notion")).ok, true)
  assert.equal((await plugins.consumePluginPermission(OWNER.userId, "notion")).ok, true)
  await plugins.setPluginGrant(OWNER.userId, "notion", "revoke")
  assert.equal((await plugins.consumePluginPermission(OWNER.userId, "notion")).ok, false)
  assert.equal((await plugins.consumePluginPermission(OWNER.userId, "wikipedia")).ok, true)
  const catalog = plugins.pluginActions()
  assert.ok(catalog.every((plugin) => plugin.scope === "read"))
  assert.ok(catalog.find((plugin) => plugin.id === "gmail").needsConnection)
})

console.log(`\n${count - failed}/${count} passed`)
process.exit(failed ? 1 : 0)
