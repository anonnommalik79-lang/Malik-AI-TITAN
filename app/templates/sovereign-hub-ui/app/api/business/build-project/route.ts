import { NextResponse } from "next/server"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProjectFile = { path: string; content: string }
type BuildBody = {
  prompt?: string
  html?: string
  name?: string
}

type QaResult = {
  passed: boolean
  checks: string[]
  issues: string[]
  reviewer?: string
  rounds: number
}

const GENERATED_FILES = ["app/page.tsx", "app/layout.tsx", "app/globals.css", "README.md"] as const

const SYSTEM_PROMPT = `
You are Malik AI Product Builder. Convert an approved autonomous-company plan into a real, multi-file Next.js App Router project.

OUTPUT CONTRACT:
- Return ONLY file blocks. No markdown fences and no prose outside blocks.
- Exact block format:
<<<FILE:app/page.tsx>>>
...content...
<<<END_FILE>>>
- You MUST return exactly these generated files:
  app/page.tsx
  app/layout.tsx
  app/globals.css
  README.md
- Do not return package.json, tsconfig.json, next.config.ts or next-env.d.ts; the server provides those stable build files.

IMPLEMENTATION RULES:
- Next.js App Router + React + TypeScript.
- The project must be runnable with npm install && npm run build && npm start.
- Build a finished investor-demo-quality product, not a wireframe and not a tutorial.
- Preserve the company name, market, ICP, offer, pricing and CTA from the plan. Never invent a different business.
- No TODO, placeholder, lorem ipsum, fake customers, fake testimonials, fake revenue, fake investors or fake partnerships.
- Do not require secrets or a backend for the demo to render.
- Avoid external image dependencies. Prefer CSS, gradients, typography and inline SVG if visuals are needed.
- app/layout.tsx must import ./globals.css and export default RootLayout.
- app/page.tsx must export default a complete page component.
- Make it responsive and accessible.
- Keep dependencies to React/Next only; do not import third-party UI packages.
`.trim()

const PACKAGE_JSON = JSON.stringify({
  name: "malik-autonomous-company",
  version: "1.0.0",
  private: true,
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
  },
  dependencies: {
    next: "16.2.7",
    react: "19.1.0",
    "react-dom": "19.1.0",
  },
  devDependencies: {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    typescript: "^5.8.0",
  },
}, null, 2)

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2017",
    lib: ["dom", "dom.iterable", "esnext"],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "react-jsx",
    incremental: true,
    plugins: [{ name: "next" }],
  },
  include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  exclude: ["node_modules"],
}, null, 2)

const FIXED_FILES: ProjectFile[] = [
  { path: "package.json", content: PACKAGE_JSON },
  { path: "tsconfig.json", content: TSCONFIG },
  { path: "next-env.d.ts", content: '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n' },
  { path: "next.config.ts", content: 'import type { NextConfig } from "next"\n\nconst nextConfig: NextConfig = { reactStrictMode: true }\n\nexport default nextConfig\n' },
  { path: ".gitignore", content: "node_modules\n.next\nout\n.env*\n!.env.example\n" },
]

function cleanName(value?: string) {
  return String(value || "malik-autonomous-company")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "malik-autonomous-company"
}

function parseFileBlocks(raw: string): ProjectFile[] {
  const text = String(raw || "").trim()
  const pattern = /<<<FILE:([^>]+)>>>([\s\S]*?)<<<END_FILE>>>/g
  const files: ProjectFile[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const path = String(match[1] || "").trim().replace(/^\/+/, "")
    const content = String(match[2] || "").replace(/^\s*\n/, "").trimEnd()
    if (path && content) files.push({ path, content })
  }
  return files
}

function safeGeneratedFiles(files: ProjectFile[]) {
  const allowed = new Set<string>(GENERATED_FILES)
  const unique = new Map<string, string>()
  for (const file of files) {
    if (!allowed.has(file.path)) continue
    if (file.path.includes("..") || file.path.startsWith("/")) continue
    unique.set(file.path, file.content)
  }
  return Array.from(unique, ([path, content]) => ({ path, content }))
}

function validateProject(files: ProjectFile[]) {
  const issues: string[] = []
  const checks: string[] = []
  const byPath = new Map(files.map((file) => [file.path, file.content]))

  for (const path of GENERATED_FILES) {
    if (!byPath.get(path)?.trim()) issues.push(`Missing required file: ${path}`)
    else checks.push(`${path} present`)
  }

  const page = byPath.get("app/page.tsx") || ""
  const layout = byPath.get("app/layout.tsx") || ""
  const css = byPath.get("app/globals.css") || ""
  const combined = files.map((file) => file.content).join("\n")

  if (!/export\s+default\s+(?:function|async\s+function|class|[A-Za-z_$])/m.test(page)) issues.push("app/page.tsx must export a default component")
  else checks.push("page default export")

  if (!/export\s+default\s+(?:function|async\s+function|class|[A-Za-z_$])/m.test(layout)) issues.push("app/layout.tsx must export a default layout")
  else checks.push("layout default export")

  if (!/import\s+[\"']\.\/globals\.css[\"']/.test(layout)) issues.push("app/layout.tsx must import ./globals.css")
  else checks.push("global CSS wired")

  if (css.trim().length < 300) issues.push("app/globals.css is too small for a finished product")
  else checks.push("visual system present")

  if (/```/.test(combined)) issues.push("Markdown fences leaked into project files")
  else checks.push("no markdown fences")

  if (/\b(?:TODO|placeholder|lorem ipsum|rest omitted|continue similarly)\b/i.test(combined)) issues.push("Project contains placeholder/TODO content")
  else checks.push("no placeholder content")

  if (/process\.env\.[A-Z0-9_]+/.test(combined)) issues.push("Demo requires environment secrets")
  else checks.push("no required secrets")

  if (/from\s+[\"'](?!react(?:\/|[\"'])|next(?:\/|[\"'])|\.|@\/)[^\"']+[\"']/.test(combined)) {
    issues.push("Generated source imports a third-party package outside React/Next")
  } else checks.push("dependency surface locked")

  const total = files.reduce((sum, file) => sum + file.content.length, 0)
  if (total > 700_000) issues.push("Generated project is too large")
  else checks.push("project size sane")

  return { issues, checks }
}

function projectSnapshot(files: ProjectFile[], max = 13_000) {
  let out = ""
  for (const file of files) {
    const block = `\n--- ${file.path} ---\n${file.content}\n`
    if (out.length + block.length > max) {
      out += block.slice(0, Math.max(0, max - out.length))
      break
    }
    out += block
  }
  return out.trim()
}

async function aiReview(prompt: string, files: ProjectFile[]) {
  try {
    const result = await runStrictMalikModel({
      modelId: "malik-coder-32b",
      systemPrompt: "You are a strict senior Next.js build reviewer. Return PASS if the supplied project is coherent and demo-ready. Otherwise return concise FIX lines only. Do not rewrite the project.",
      prompt: `ORIGINAL BUSINESS BRIEF:\n${prompt.slice(0, 3500)}\n\nPROJECT:\n${projectSnapshot(files, 9000)}`,
      maxTokens: 700,
      temperature: 0.02,
    })
    return String(result.content || "").trim().slice(0, 3500)
  } catch {
    return "REVIEW_UNAVAILABLE"
  }
}

async function generateDynamicFiles(prompt: string, html: string, feedback = "") {
  const visualReference = html
    ? `\n\nEXISTING STANDALONE PREVIEW (visual/product reference only; do not copy script tags blindly):\n${html.slice(0, 5000)}`
    : ""
  const repair = feedback ? `\n\nQA FEEDBACK FROM PREVIOUS ATTEMPT:\n${feedback.slice(0, 3000)}\nFix every item in the regenerated files.` : ""

  const result = await runStrictMalikModel({
    modelId: "malik-coder-32b",
    systemPrompt: SYSTEM_PROMPT,
    prompt: `APPROVED COMPANY PLAN:\n${prompt.slice(0, 14_000)}${visualReference}${repair}`,
    maxTokens: 7000,
    temperature: 0.05,
  })
  return {
    files: safeGeneratedFiles(parseFileBlocks(result.content)),
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildBody
    const prompt = String(body?.prompt || "").trim()
    const html = String(body?.html || "").trim()
    if (!prompt) return NextResponse.json({ ok: false, error: "`prompt` is required" }, { status: 400 })
    if (prompt.length > 40_000) return NextResponse.json({ ok: false, error: "Project brief is too long" }, { status: 413 })

    let rounds = 0
    let generated = await generateDynamicFiles(prompt, html)
    rounds += 1
    let merged = [...FIXED_FILES, ...generated.files]
    let staticQa = validateProject(merged)
    let reviewer = ""

    if (!staticQa.issues.length) reviewer = await aiReview(prompt, merged)

    const reviewerPassed = !reviewer || reviewer === "REVIEW_UNAVAILABLE" || /^PASS\b/i.test(reviewer)
    if (staticQa.issues.length || !reviewerPassed) {
      const feedback = [...staticQa.issues, reviewerPassed ? "" : reviewer].filter(Boolean).join("\n")
      generated = await generateDynamicFiles(prompt, html, feedback)
      rounds += 1
      merged = [...FIXED_FILES, ...generated.files]
      staticQa = validateProject(merged)
      if (!staticQa.issues.length) reviewer = await aiReview(prompt, merged)
    }

    const finalReviewerPassed = !reviewer || reviewer === "REVIEW_UNAVAILABLE" || /^PASS\b/i.test(reviewer)
    const qa: QaResult = {
      passed: staticQa.issues.length === 0 && finalReviewerPassed,
      checks: staticQa.checks,
      issues: [...staticQa.issues, finalReviewerPassed ? "" : reviewer].filter(Boolean),
      reviewer,
      rounds,
    }

    if (!qa.passed) {
      return NextResponse.json({ ok: false, code: "PROJECT_QA_FAILED", qa, files: merged }, { status: 502 })
    }

    const projectName = cleanName(body?.name)
    const files = merged.map((file) => file.path === "package.json"
      ? { ...file, content: file.content.replace('"malik-autonomous-company"', JSON.stringify(projectName)) }
      : file)

    return NextResponse.json({
      ok: true,
      projectName,
      files,
      qa,
      provider: generated.provider,
      model: generated.model,
      latencyMs: generated.latencyMs,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: "PROJECT_BUILD_FAILED", error: error instanceof Error ? error.message : "Project build failed" },
      { status: 500 },
    )
  }
}
