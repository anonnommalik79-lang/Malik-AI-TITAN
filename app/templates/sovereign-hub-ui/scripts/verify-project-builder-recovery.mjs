import assert from "node:assert/strict"
import { test } from "node:test"
import { workTestLoader } from "./work-test-loader.mjs"

// Reproduces a provider cutting a large response after two complete files.
// The builder must request the missing files individually and retain the
// original complete files instead of regenerating everything.
test("project builder recovers a truncated multi-file answer", async () => {
  const calls = []
  const page = '"use client"\nexport default function Page() { return <main>Recovered city simulator</main> }'
  const layout = 'import "./globals.css"\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html> }'
  const css = 'body { background: #090d19; color: white; font-family: system-ui; }\n' + Array(16).fill('.node { border: 1px solid #0af; padding: 12px; }').join("\n")
  const readme = '# PROJECT OMEGA\n\n' + Array(16).fill('Interactive city command center with accessible controls.').join(" ") + '\n\nRun `npm install`, `npm run dev` and `npm run build`.\n'
  const file = (name, body) => `<<<FILE:${name}>>>\n${body}\n<<<END_FILE>>>`
  const mockedModel = async ({ prompt }) => {
    calls.push(prompt)
    let answer
    if (prompt.includes("PROJECT SNAPSHOT:")) answer = "PASS"
    else if (prompt.includes("RECOVERY FILE: app/globals.css")) answer = file("app/globals.css", css)
    else if (prompt.includes("RECOVERY FILE: README.md")) answer = file("README.md", readme)
    else answer = [file("app/page.tsx", page), file("app/layout.tsx", layout), "<<<FILE:app/globals.css>>>\nbody { truncated"].join("\n")
    return { content: answer, provider: "test-provider", model: "mock", latencyMs: 1 }
  }
  const load = workTestLoader({
    "@/lib/server/malik-model-router": { runStrictMalikModel: mockedModel },
    "@/lib/work/code/diagnostics": { analyzeProject: () => ({ diagnostics: [], checks: ["mock compiler"] }) },
    "@/lib/server/chat-website-design": { chatWebsiteInstruction: () => "" },
    "@/lib/proof/project": { projectPassport: () => ({ kind: "project", status: "test" }) },
  })
  const { generateProjectWithBrain, mergeProjectGeneratedFiles } = load("lib/ai/project-builder.ts")
  const result = await generateProjectWithBrain({ prompt: "Build PROJECT OMEGA city command center in React", modelId: "malik-coder-32b" })
  assert.equal(result.status, "completed", result.error)
  assert.equal(result.qa?.passed, true)
  assert.equal(result.files.find(item => item.path === "app/page.tsx")?.content, page)
  assert.equal(result.files.find(item => item.path === "app/globals.css")?.content, css)
  assert.equal(result.files.find(item => item.path === "README.md")?.content, readme)
  assert.equal(calls.filter(prompt => prompt.includes("RECOVERY FILE:")).length, 2)
  assert.equal(calls.length, 4)
  const merged = mergeProjectGeneratedFiles(
    [{ path: "app/page.tsx", content: page, language: "tsx" }, { path: "README.md", content: readme, language: "markdown" }],
    [{ path: "README.md", content: readme + "\nUpdated", language: "markdown" }],
  )
  assert.equal(merged.length, 2)
  assert.equal(merged[0].content, page)
  assert.ok(merged[1].content.endsWith("Updated"))
})
