import { workTestLoader } from "../work-test-loader.mjs"

export const load = workTestLoader({ "@/lib/server/private-json-store": { privateJsonStoreConfigured: () => false } })
export const { runSkill, getSkillRun, skillRunView, skillResultMarkdown } = load("lib/skills/orchestrator.ts")
export const { memorySkillStore, skillHash, skillOwnerKey } = load("lib/skills/store.ts")
export const { SkillError } = load("lib/skills/types.ts")
const workspace = load("lib/website/engine/workspace.ts")
export const sourceHash = files => workspace.sourceHash(workspace.projectFiles(files))
export const project = () => ({ projectId: "fixture-project", title: "Fixture CLI", description: "Reviewed immutable test fixture", status: "completed", plan: [], structure: [], commands: ["node --test"],
  createdAt: "2026-01-01T00:00:00.000Z", provider: "fixture", model: "fixture", qa: { passed: true, checks: ["fixture static check"], issues: [], rounds: 1 }, files: [
    { path: "package.json", language: "json", content: '{"type":"module","scripts":{"test":"node --test"}}' },
    { path: "add.mjs", language: "javascript", content: "export const add = (a, b) => a + b;\n" },
    { path: "add.test.mjs", language: "javascript", content: "import test from 'node:test'; import assert from 'node:assert/strict'; import {add} from './add.mjs'; test('add', () => assert.equal(add(17,23),40));\n" },
    { path: "README.md", language: "text", content: "# Fixture\nRun node --test.\n" },
  ] })
export const sources = () => [1, 2, 3].map(n => ({ url: `https://example.org/skills-fixture/${n}`, title: `TEST FIXTURE ${n}`, snippet: `This is reviewed test evidence ${n}, not a real-world claim. The observation appears in both fixture records.`, publishedAt: new Date(Date.now() - n * 3600_000).toISOString(), read: false }))
export function fixtureRuntime(overrides = {}) {
  const calls = [], published = []
  const runtime = {
    async model(input) {
      calls.push({ tool: "model", ...input })
      if (/Return only JSON/.test(input.systemPrompt)) return JSON.stringify({ criteria: ["Implement the exact fixture task"], queries: ["test fixture primary evidence", "test fixture supporting evidence"] })
      return /SOURCE DATA:\n\[\]/.test(input.prompt) ? "Fixture assessment; no external actions were performed." : "This is reviewed test evidence 1, not a real-world claim. [1]\n\nThe observation appears in both fixture records. [2]"
    },
    async search(query) { calls.push({ tool: "search", query }); return sources() },
    async read(source) { calls.push({ tool: "read", url: source.url }); return { ...source, read: true, readAt: new Date().toISOString() } },
    async build(prompt, model, signal) { calls.push({ tool: "build", prompt }); await model({ systemPrompt: "Fixture project author", prompt, maxTokens: 900, signal }); return project() },
    async test(value) { calls.push({ tool: "test" }); return { sourceHash: sourceHash(value.files), status: "not_run", details: ["Test worker not configured in this fixture"] } },
    async publish(value) { calls.push({ tool: "publish" }); published.push(value); return { id: "12345678-1234-4234-8234-123456789abc", downloadUrl: "/api/ai/project/artifacts/12345678-1234-4234-8234-123456789abc/download", filename: "fixture.zip", expiresAt: Date.now() + 86400_000 } },
    ...overrides,
  }
  return { runtime, calls, published }
}
let serial = 0
export const input = (extra = {}) => ({ ownerId: "fixture-owner", skill: "deep.research", prompt: "Research the test fixture observations", modelId: "malik-max", requestId: `fixture-request-${++serial}`, ...extra })
