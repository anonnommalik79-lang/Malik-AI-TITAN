import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const nativeRequire = createRequire(import.meta.url)
let connected = true
let modelCalls = 0
let lastModelInput = null
const plugins = new Map(["github", "gitlab"].map((id) => [id, {
  id, name: id === "github" ? "GitHub" : "GitLab", runtime: "connected", providerSlug: id,
}]))
const stubs = {
  "server-only": {},
  "@/components/sovereign/features/plugin-registry": { getMalikPlugin: (id) => plugins.get(id) },
  "@/lib/server/plugin-pipes": {
    getPluginSessionUser: async () => ({ id: "test-user" }),
    getPipesProviderState: async () => ({ configured: true, connected }),
    getPipesCredential: async () => ({ active: connected, value: connected ? "private-test-token" : "" }),
  },
  "@/lib/malik-god-router": {
    malikGodAnswer: async (body, selection, _research, _token, evidence) => {
      modelCalls++
      lastModelInput = { body, selection, evidence }
      return { content: "Анализ проекта", provider: "test-model", model: selection.modelId, sources: evidence.sources, attempts: [] }
    },
    asJson: (answer) => answer,
  },
  "@/lib/ai/malik-models": { DEFAULT_MALIK_MODEL_ID: "test-model", hasMalikProAccess: () => true },
  "@/lib/server/founder-message-log": { appendFounderMessage: async () => {} },
  "@/lib/server/malik-model-router": {
    resolveStrictMalikSelection: async () => ({ modelId: "test-model", entitlement: { plan: "plus", userId: "test-user" } }),
    malikModelErrorPayload: () => ({}), MalikModelRouteError: class extends Error {},
  },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ plan: "plus", userId: "test-user" }) },
  "@/lib/server/malik-owner-context": { malikIdentityAnswer: () => null, withVerifiedOwnerChatContext: (body) => body },
  "@/lib/server/daily-text-token-quota": { getDailyTextTokenQuota: () => ({ unlimited: true }) },
  "@/lib/malik-compute/runtime": { withCompute: (handler) => handler },
  "@/lib/malik-compute/policies": { chatComputeOperation: () => "chat" },
}
const cache = new Map()
function load(file) {
  const absolute = path.resolve(root, file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }
  cache.set(absolute, module)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const require = (name) => {
    if (name in stubs) return stubs[name]
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name)
      return load(target.endsWith(".ts") ? target : `${target}.ts`)
    }
    return nativeRequire(name)
  }
  new Function("require", "module", "exports", js)(require, module, module.exports)
  return module.exports
}

const originalFetch = globalThis.fetch
const calls = []
globalThis.fetch = async (url, init) => {
  const target = String(url)
  calls.push({ target, auth: init?.headers?.Authorization })
  let data
  if (target === "https://api.github.com/repos/acme/demo") data = { full_name: "acme/demo", html_url: "https://github.com/acme/demo", description: "Real project", default_branch: "main", language: "TypeScript" }
  else if (target.endsWith("/readme")) data = { content: Buffer.from("# Demo project").toString("base64"), encoding: "base64", html_url: "https://github.com/acme/demo/blob/main/README.md" }
  else if (target.endsWith("/contents")) data = [{ path: "src", type: "dir" }, { path: "package.json", type: "file" }]
  else if (target.includes("/issues?")) data = [{ number: 7, title: "Fix login", html_url: "https://github.com/acme/demo/issues/7" }]
  else if (target.includes("/pulls?")) data = []
  else if (target.includes("/user/repos?")) data = [{ full_name: "acme/demo", html_url: "https://github.com/acme/demo", description: "Real project" }]
  else if (target === "https://gitlab.com/api/v4/projects/acme%2Fdemo") data = { path_with_namespace: "acme/demo", web_url: "https://gitlab.com/acme/demo", visibility: "private", default_branch: "main" }
  else if (target.includes("/repository/tree?")) data = [{ path: "src", type: "tree" }]
  else if (target.includes("/repository/files/README.md/raw?")) return new Response("# GitLab project")
  else if (target.includes("/issues?")) data = []
  else throw new Error(`Unexpected provider URL: ${target}`)
  return Response.json(data)
}

try {
  const runtime = load("lib/server/plugin-runtime.ts")
  stubs["@/lib/server/plugin-runtime"] = runtime
  const fusion = load("lib/server/context-fusion.ts")
  const chat = load("app/api/ai/chat/route.ts")
  const streamRoute = fs.readFileSync(path.join(root, "app/api/stream/route-impl.ts"), "utf8")
  assert.match(streamRoute, /parsePluginCommand\(coderPrompt\(body\)\)/)
  assert.match(streamRoute, /runPluginModelAnswer\(pluginCommand, body/)

  assert.deepEqual(fusion.requestedFusionConnectors("Что такое GitHub?"), [])
  assert.deepEqual(fusion.requestedFusionConnectors("Проанализируй мой GitHub проект"), ["github"])
  const github = await runtime.runMalikPlugin("github", "Проанализируй https://github.com/acme/demo")
  assert.equal(github.connected, true)
  assert.match(github.content, /Demo project/)
  assert.match(github.content, /Fix login/)
  assert.ok(github.sources.some((item) => item.url.endsWith("/issues/7")))
  const gitlab = await runtime.runMalikPlugin("gitlab", "Проанализируй https://gitlab.com/acme/demo/-/tree/main")
  assert.match(gitlab.content, /GitLab project/)
  assert.match(gitlab.content, /acme\/demo/)

  const result = await chat.POST(new Request("https://malik.example/api/ai/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "/plugin github проанализируй https://github.com/acme/demo" }),
  }))
  assert.equal(result.status, 200)
  assert.equal(modelCalls, 1)
  assert.equal(lastModelInput.selection.modelId, "test-model")
  assert.match(lastModelInput.evidence.context, /Demo project/)
  assert.doesNotMatch(JSON.stringify(lastModelInput), /private-test-token/)
  assert.equal((await result.json()).content, "Анализ проекта")

  connected = false
  const unavailable = await fusion.collectMalikConnectedContext("Открой мой GitHub")
  assert.equal(unavailable.context, "")
  const denied = await chat.POST(new Request("https://malik.example/api/ai/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "/plugin github мой проект" }),
  }))
  assert.equal((await denied.json()).ok, false)
  assert.equal(modelCalls, 1, "Disconnected account must not reach the model as live context")
  assert.ok(calls.every((item) => item.auth === "Bearer private-test-token"))
  console.log("PASS live GitHub/GitLab project reads, explicit private context, model handoff, no token leak, disconnected fail-closed")
} finally {
  globalThis.fetch = originalFetch
}
