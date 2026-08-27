import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"

// Offline only: no .env loading, provider credits, real sessions or billing writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const nativeRequire = createRequire(import.meta.url)
function loader(stubs = {}) {
  const cache = new Map()
  function load(file) {
    const absolute = path.resolve(root, file)
    if (cache.has(absolute)) return cache.get(absolute).exports
    const module = { exports: {} }
    cache.set(absolute, module)
    const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const require = (specifier) => {
      if (specifier in stubs) return stubs[specifier]
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const target = specifier.startsWith("@/")
          ? path.join(root, specifier.slice(2))
          : path.resolve(path.dirname(absolute), specifier)
        return load(target.endsWith(".ts") ? target : target + ".ts")
      }
      return nativeRequire(specifier)
    }
    new Function("require", "module", "exports", js)(require, module, module.exports)
    return module.exports
  }
  return load
}

let checks = 0
async function check(name, run) {
  await run()
  checks++
  console.log("PASS " + name)
}
const savedEnv = { ...process.env }
const savedFetch = globalThis.fetch
const savedInfo = console.info
try {
  // Do not inherit credentials or flags from the caller.
  for (const key of Object.keys(process.env)) {
    if (/^(MALIK_|GROQ_|CLOUDFLARE_|CEREBRAS_|CF_|SERPER_|TAVILY_|BRAVE_|JINA_|ADMIN_EMAILS|DEV_BYPASS)/.test(key)) delete process.env[key]
  }
  const basic = loader()
  const { shouldUseWeb } = basic("lib/ai/web-search-policy.ts")
  const direct = [
    "привет", "как дела?", "давай поговорим", "мне грустно", "спасибо", "а ты что думаешь?",
    "кто ты?", "что ты умеешь?", "напиши стих про погоду", "переведи: what is photosynthesis",
    "напиши функцию поиска на TypeScript", "исправь ошибку в коде", "посчитай 17*42",
    "найди ошибку в этом коде", "сократи прошлый ответ", "write a story about today",
  ]
  for (const prompt of direct) await check("direct: " + prompt, () => {
    assert.equal(shouldUseWeb(prompt, { research: true }), false)
    assert.equal(shouldUseWeb(prompt), false)
  })
  const search = [
    "поищи кто такой Трамп", "пойщи информацию о фотосинтезе", "что такое фотосинтез",
    "кто такая Мария Кюри", "найди источники про космос", "курс доллара сегодня",
    "какая сейчас погода", "кто сейчас президент", "сколько стоит iPhone",
    "look up the latest news", "what is photosynthesis", "напиши доклад и поищи источники",
  ]
  for (const prompt of search) await check("search: " + prompt, () => assert.equal(shouldUseWeb(prompt), true))
  await check("explicit no-web wins; enabled is auto, not forced", () => {
    assert.equal(shouldUseWeb("что такое React", { research: false }), false)
    assert.equal(shouldUseWeb("поищи новости", { disableResearch: true, forceResearch: true }), false)
    assert.equal(shouldUseWeb("без интернета объясни что такое React"), false)
    assert.equal(shouldUseWeb("привет", { forceResearch: true }), true)
  })

  const { MALIK_MODELS, FREE_MALIK_MODELS, canUseMalikModel } = basic("lib/ai/malik-models.ts")
  const { PUBLIC_PLANS } = basic("lib/billing/plans.ts")
  await check("two plans; three live free MalikLLM models", () => {
    assert.deepEqual(PUBLIC_PLANS.map(p => p.id), ["free", "pro"])
    assert.deepEqual(FREE_MALIK_MODELS.map(m => m.label), ["MalikLLM 20B", "MalikLLM Fast 120B", "MalikLLM Qwen3.8 27B"])
    assert.equal(MALIK_MODELS.length, 10)
    for (const model of MALIK_MODELS) {
      assert.equal(canUseMalikModel(model.id, "free"), model.tier === "free")
      assert.equal(canUseMalikModel(model.id, "pro"), true)
      assert.equal(canUseMalikModel(model.id, "ultra"), true)
    }
  })

  let user = null
  let plan = "free"
  const session = { getOptionalWorkOSAuth: async () => ({ user }) }
  const adminLoad = loader({ "@/lib/auth/server": session })
  const admin = adminLoad("lib/server/admin.ts")
  const bypass = adminLoad("lib/ai/admin-bypass.ts")
  const request = new Request("https://malik.example/api/admin/users")
  const owner = "amangeldymalik38@gmail.com"
  await check("admin: verified owner only; no local flags or env lists", async () => {
    process.env.ADMIN_EMAILS = "outsider@example.com"
    process.env.MALIK_ADMIN_USERS = "outsider@example.com"
    for (const email of ["outsider@example.com", "anonnommalik79@gmail.com", "admin@malik.ai"]) {
      user = { email, emailVerified: true }
      assert.equal((await admin.getAdminAccessAsync(request)).authorized, false)
      assert.equal(bypass.isAdminUser({ email, isAdmin: true, isOwner: true }), false)
    }
    user = null
    const spoof = new Request(request.url, { headers: { "x-malik-admin-email": owner } })
    assert.equal((await admin.getAdminAccessAsync(spoof)).authorized, false)
    user = { email: owner, emailVerified: false }
    assert.equal((await admin.getAdminAccessAsync(request)).authorized, false)
    user.emailVerified = true
    assert.equal((await admin.getAdminAccessAsync(request)).authorized, true)
  })

  const calls = []
  await check("unverified emails cannot inherit owner or paid entitlement", async () => {
    const entitlement = loader({
      "@/lib/auth/server": session,
      "@/lib/server/billing-store": { entitledPlan: async () => "pro" },
    })("lib/server/request-entitlement.ts")
    user = { id: "test-user", email: owner, emailVerified: false }
    const unverified = await entitlement.resolveRequestEntitlement(request)
    assert.equal(unverified.plan, "free")
    assert.equal(bypass.isAdminUser(unverified.userId), false)
    user.emailVerified = true
    assert.equal((await entitlement.resolveRequestEntitlement(request)).plan, "owner")
    user.email = "customer@example.com"
    assert.equal((await entitlement.resolveRequestEntitlement(request)).plan, "pro")
  })

  let fail = false
  const routeLoad = loader({
    "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ authenticated: true, userId: "test@example.com", plan }) },
    "@/lib/ai/providers/base": { providerFetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return fail ? Response.json({ error: "unavailable" }, { status: 503 })
        : Response.json({ choices: [{ message: { content: "Offline fixture response." } }] })
    } },
  })
  const router = routeLoad("lib/server/malik-model-router.ts")
  Object.assign(process.env, { GROQ_API_KEY: "offline", CEREBRAS_API_KEY: "offline", CLOUDFLARE_API_TOKEN: "offline", CLOUDFLARE_ACCOUNT_ID: "offline" })
  console.info = () => {}
  await check("server Free/Plus gates and all ten exact provider routes", async () => {
    for (const model of MALIK_MODELS) {
      plan = "free"
      const resolve = () => router.resolveStrictMalikSelection(request, { model: model.id })
      if (model.tier === "free") assert.equal((await resolve()).modelId, model.id)
      else await assert.rejects(resolve, err => err.status === 403)
      plan = "pro"
      assert.equal((await resolve()).modelId, model.id)
      const response = await router.runStrictMalikModel({ modelId: model.id, prompt: "test", systemPrompt: "test" })
      assert.equal(response.selectedModelId, model.id)
      const call = calls.at(-1)
      const hosts = { groq: "api.groq.com", cerebras: "api.cerebras.ai", cloudflare: "api.cloudflare.com" }
      assert.equal(new URL(call.url).host, hosts[model.provider])
      assert.equal(call.body.model, model.providerModel)
    }
  })
  await check("unavailable selected model exhausts configured fallback", async () => {
    fail = true
    const count = calls.length
    await assert.rejects(() => router.runStrictMalikModel({ modelId: "malik-fast-120b", prompt: "test", systemPrompt: "test" }), err => err.modelId === "malik-fast-120b" && err.status === 503)
    assert.equal(calls.length, count + 2)
  })

  let searches = 0
  const inference = []
  globalThis.fetch = async (url) => {
    searches++
    if (String(url).includes("serper.dev")) return Response.json({
      organic: ["one", "two", "three"].map(domain => ({
        title: "Фотосинтез — определение и процесс",
        link: "https://" + domain + ".example/photosynthesis",
        snippet: "Фотосинтез — процесс преобразования энергии света растениями.",
      })),
    })
    return new Response("", { status: 503 })
  }
  process.env.SERPER_API_KEY = "offline"
  const god = loader({
    "@/lib/server/malik-model-router": { runStrictMalikModel: async (input) => {
      inference.push(input)
      return { content: "Ответ.", provider: "fixture", model: "fixture", selectedModelId: input.modelId, latencyMs: 0 }
    } },
    "@/lib/malik-research/fetch-page": { fetchPageText: async source => ({ title: source.title, text: source.snippet }) },
  })("lib/malik-god-router.ts")
  await check("conversation skips web even with Home research=true", async () => {
    const progress = []
    const result = await god.malikGodAnswer({ originalQuestion: "привет", question: "search the web for sources", research: true }, { modelId: "malik-20b" }, event => progress.push(event))
    assert.equal(searches, 0)
    assert.equal(result.usedWeb, false)
    assert.equal(progress.length, 0)
    assert.equal(inference.at(-1).prompt, "привет")
  })
  await check("requested search returns sources and real reading events", async () => {
    const progress = []
    const result = await god.malikGodAnswer({ originalQuestion: "что такое фотосинтез", research: true }, { modelId: "malik-fast-120b" }, event => progress.push(event))
    assert.ok(searches > 0)
    assert.equal(result.usedWeb, true)
    assert.equal(result.sources.length, 3)
    assert.ok(progress.some(event => event.kind === "reading"))
    assert.match(inference.at(-1).prompt, /Web sources:/)
    assert.equal(inference.at(-1).modelId, "malik-fast-120b")
    const before = searches
    await god.malikGodAnswer({ originalQuestion: "спасибо, давай поговорим", research: true }, { modelId: "malik-fast-120b" })
    assert.equal(searches, before)
  })

  let order
  const billingLoad = loader({
    "@/lib/auth/server": session,
    "@/lib/server/billing-store": {
      createPendingOrder: async (email, plan) => ({ order: order = { id: "test-order", email, plan, status: "pending" }, storage: "fixture" }),
      findOrder: async id => order?.id === id ? order : undefined,
    },
  })
  const checkout = billingLoad("app/api/billing/checkout/route.ts").POST
  const verify = billingLoad("app/api/billing/verify/route.ts").POST
  const post = body => new Request("https://malik.example/api/billing/checkout", { method: "POST", body: JSON.stringify(body) })
  await check("billing uses verified session, supports Plus only and checks ownership", async () => {
    user = null
    assert.equal((await checkout(post({ plan: "pro" }))).status, 401)
    user = { email: "customer@example.com", emailVerified: true }
    assert.equal((await checkout(post({ plan: "ultra" }))).status, 400)
    assert.equal((await checkout(post({ plan: "pro", email: owner }))).status, 200)
    assert.equal(order.email, user.email)
    assert.equal(order.status, "pending")
    assert.equal((await verify(post({ orderId: order.id }))).status, 200)
    user = { email: "other@example.com", emailVerified: true }
    assert.equal((await verify(post({ orderId: order.id }))).status, 404)
  })
  console.log("\n" + checks + " offline checks passed. No provider/API credits used.")
} finally {
  globalThis.fetch = savedFetch
  console.info = savedInfo
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
}
