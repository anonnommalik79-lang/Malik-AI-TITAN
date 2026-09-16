import type { MalikModelId } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"

export type ProjectFile = {
  path: string
  content: string
  language: string
}

export type ProjectQualityReport = {
  passed: boolean
  checks: string[]
  issues: string[]
  reviewer?: string
  rounds: number
}

export type ProjectBuilderInput = {
  prompt: string
  userId?: string
  userEmail?: string
  framework?: "next" | "react" | "vite" | "html"
  language?: "typescript" | "javascript"
  style?: "premium-dark" | "minimal" | "saas" | "dashboard"
  modelId?: MalikModelId
}

export type ProjectBuilderResult = {
  projectId: string
  title: string
  description: string
  status: "queued" | "processing" | "completed" | "failed"
  plan: string[]
  structure: string[]
  files: ProjectFile[]
  commands: string[]
  provider?: string
  model?: string
  error?: string
  qa?: ProjectQualityReport
  createdAt: string
}

type GeneratedProject = {
  files: ProjectFile[]
  provider: string
  model: string
  latencyMs: number
}

const DEFAULT_MODEL: MalikModelId = "malik-coder-32b"
const REQUIRED_GENERATED = ["app/page.tsx", "app/layout.tsx", "app/globals.css", "README.md"] as const
const MAX_FILES = 24
const MAX_TOTAL_CHARS = 900_000
const ALLOWED_ROOTS = ["app/", "components/", "lib/", "public/", "types/", "README.md"] as const

const BASE_PACKAGE = {
  name: "malik-generated-project",
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
    "lucide-react": "^0.564.0",
    zod: "^3.24.1",
  },
  devDependencies: {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    typescript: "^5.8.0",
  },
}

const BASE_TSCONFIG = {
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
}

const BASE_FILES: ProjectFile[] = [
  { path: "package.json", language: "json", content: JSON.stringify(BASE_PACKAGE, null, 2) },
  { path: "tsconfig.json", language: "json", content: JSON.stringify(BASE_TSCONFIG, null, 2) },
  { path: "next-env.d.ts", language: "typescript", content: '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n' },
  { path: "next.config.ts", language: "typescript", content: 'import type { NextConfig } from "next"\n\nconst nextConfig: NextConfig = { reactStrictMode: true }\n\nexport default nextConfig\n' },
  { path: ".gitignore", language: "text", content: "node_modules\n.next\nout\n.env*\n!.env.example\n" },
]

const BUILDER_SYSTEM_PROMPT = `
You are MALIK AI Project Builder, a senior product engineer. Build the exact product the user requested as a real multi-file Next.js App Router project.

SOURCE OF TRUTH:
- The user's brief is the specification. Preserve every concrete feature, interaction, data rule, visual constraint and named concept from it.
- Do not replace the requested product with a generic SaaS starter, generic landing page, tutorial, portfolio, or MALIK-branded demo.
- If the brief is underspecified, make the smallest reasonable product decisions needed to produce a coherent working result.

OUTPUT CONTRACT:
- Return ONLY file blocks. No prose and no Markdown fences outside file contents.
- Exact syntax:
<<<FILE:app/page.tsx>>>
...complete file...
<<<END_FILE>>>
- Return 4-16 useful generated files. The server adds package.json, tsconfig.json, next-env.d.ts, next.config.ts and .gitignore.
- You MUST include: app/page.tsx, app/layout.tsx, app/globals.css, README.md.
- Add components/, lib/, types/, app/api/ routes when they genuinely improve the requested product.

PRODUCTION CODE CONTRACT:
- Next.js App Router + React + TypeScript. Use only React, Next.js, lucide-react and zod as package dependencies.
- Implement actual requested behavior. Buttons, forms, filters, tabs, dialogs, navigation, local persistence and state must work when promised by the brief.
- API routes must validate input, return useful HTTP statuses and handle errors. Never expose secrets to the client.
- Use accessible labels, keyboard-safe controls, responsive layouts, loading/empty/error/success states where relevant.
- Do not use TODO, FIXME, placeholder, lorem ipsum, stub, pseudo-code, "rest omitted", "implement here", fake testimonials, fake customers, fake revenue or comments in place of logic.
- Never omit imports, types, handlers or supporting files required by code you return.
- Do not require a secret for the project to render. If an optional external integration is relevant, provide a functional local mode and document the optional env variable in README.
- Avoid remote image dependencies; use CSS, inline SVG, gradients and local UI where possible.
- app/layout.tsx must import ./globals.css and export a default RootLayout.
- app/page.tsx must export a default component.
- README.md must contain exact install/run/build commands, a concise feature list, architecture notes and any optional environment variables.
- Make the visual result polished and product-specific, but never sacrifice working logic for decoration.
`.trim()

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "malik-project"
}

function titleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim()
  if (!clean) return "Malik AI Project"
  const firstSentence = clean.split(/[.!?\n]/)[0]?.trim() || clean
  return firstSentence.slice(0, 72)
}

function languageForPath(path: string) {
  if (/\.tsx$/i.test(path)) return "tsx"
  if (/\.ts$/i.test(path)) return "typescript"
  if (/\.css$/i.test(path)) return "css"
  if (/\.json$/i.test(path)) return "json"
  if (/\.md$/i.test(path)) return "markdown"
  if (/\.svg$/i.test(path)) return "svg"
  return "text"
}

function safePath(value: string) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "")
  if (!path || path.includes("..") || /(^|\/)node_modules(\/|$)/i.test(path) || /(^|\/)\.git(\/|$)/i.test(path)) return ""
  if (/^\.env(?:\.|$)/i.test(path)) return path === ".env.example" ? path : ""
  if (["package.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", ".gitignore"].includes(path)) return ""
  if (!ALLOWED_ROOTS.some((root) => path === root || path.startsWith(root))) return ""
  return path.slice(0, 180)
}

function parseFileBlocks(raw: string): ProjectFile[] {
  const text = String(raw || "")
  const pattern = /<<<FILE:([^>]+)>>>([\s\S]*?)<<<END_FILE>>>/g
  const unique = new Map<string, ProjectFile>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const path = safePath(match[1])
    const content = String(match[2] || "").replace(/^\s*\n/, "").trimEnd()
    if (!path || !content) continue
    unique.set(path, { path, content, language: languageForPath(path) })
    if (unique.size >= MAX_FILES) break
  }
  return [...unique.values()]
}

function mergeBaseFiles(files: ProjectFile[], title: string) {
  const name = slugify(title)
  return BASE_FILES.map((file) => file.path === "package.json"
    ? { ...file, content: JSON.stringify({ ...BASE_PACKAGE, name }, null, 2) }
    : file).concat(files)
}

function validateProject(files: ProjectFile[]) {
  const issues: string[] = []
  const checks: string[] = []
  const byPath = new Map(files.map((file) => [file.path, file.content]))
  const generated = files.filter((file) => !BASE_FILES.some((base) => base.path === file.path))

  for (const path of REQUIRED_GENERATED) {
    if (!byPath.get(path)?.trim()) issues.push(`Missing required file: ${path}`)
    else checks.push(`${path} present`)
  }

  if (generated.length < 4) issues.push("Project does not contain enough generated files")
  else checks.push(`${generated.length} generated files`)

  const page = byPath.get("app/page.tsx") || ""
  const layout = byPath.get("app/layout.tsx") || ""
  const css = byPath.get("app/globals.css") || ""
  const readme = byPath.get("README.md") || ""
  const combined = generated.map((file) => file.content).join("\n")

  if (!/export\s+default\s+(?:async\s+)?(?:function|class|[A-Za-z_$])/m.test(page)) issues.push("app/page.tsx must export a default component")
  else checks.push("page default export")

  if (!/export\s+default\s+(?:async\s+)?(?:function|class|[A-Za-z_$])/m.test(layout)) issues.push("app/layout.tsx must export a default layout")
  else checks.push("layout default export")

  if (!/import\s+[\"']\.\/globals\.css[\"']/.test(layout)) issues.push("app/layout.tsx must import ./globals.css")
  else checks.push("global CSS wired")

  if (css.trim().length < 350) issues.push("app/globals.css is too small for a finished product")
  else checks.push("visual system present")

  if (readme.trim().length < 280 || !/npm\s+(?:install|i)/i.test(readme) || !/npm\s+run\s+(?:dev|build)/i.test(readme)) {
    issues.push("README.md must contain usable install/run/build instructions")
  } else checks.push("README runbook present")

  const forbidden = /\b(?:TODO|FIXME|placeholder|lorem ipsum|rest omitted|continue similarly|implement here|add your logic|your code here)\b/i
  if (forbidden.test(combined)) issues.push("Project contains unfinished placeholder content")
  else checks.push("no placeholder content")

  if (/^\s*```/m.test(combined)) issues.push("Markdown fences leaked into source files")
  else checks.push("source files are fence-free")

  if (/process\.env\.[A-Z0-9_]+/.test(combined) && !byPath.has(".env.example")) {
    issues.push("Project uses environment variables without .env.example")
  } else checks.push("environment contract coherent")

  const imports = [...combined.matchAll(/from\s+[\"']([^\"']+)[\"']/g)].map((match) => match[1])
  const externalImports = imports.filter((source) => !source.startsWith(".") && !source.startsWith("@/") && !source.startsWith("react") && !source.startsWith("next") && source !== "lucide-react" && source !== "zod")
  if (externalImports.length) issues.push(`Unsupported package imports: ${[...new Set(externalImports)].slice(0, 6).join(", ")}`)
  else checks.push("dependency surface valid")

  const totalChars = files.reduce((sum, file) => sum + file.content.length, 0)
  if (totalChars > MAX_TOTAL_CHARS) issues.push("Generated project exceeds safe bundle size")
  else checks.push(`bundle size ${Math.round(totalChars / 1024)}KB`)

  return { issues, checks }
}

function projectSnapshot(files: ProjectFile[], maxChars = 18_000) {
  let out = ""
  for (const file of files) {
    const block = `\n--- ${file.path} ---\n${file.content}\n`
    if (out.length + block.length > maxChars) {
      out += block.slice(0, Math.max(0, maxChars - out.length))
      break
    }
    out += block
  }
  return out.trim()
}

function reviewerPassed(review: string) {
  return /^PASS\b/i.test(String(review || "").trim())
}

async function aiReview(input: ProjectBuilderInput, files: ProjectFile[]) {
  try {
    const result = await runStrictMalikModel({
      modelId: DEFAULT_MODEL,
      systemPrompt: [
        "You are MALIK AI Project QA, a strict senior reviewer.",
        "Check whether the project actually implements the user's brief, has coherent imports/handlers/state and looks production-ready for its requested scope.",
        "Return exactly PASS when acceptable. Otherwise return short FIX: lines describing concrete defects. Do not rewrite code.",
      ].join("\n"),
      prompt: `USER BRIEF:\n${input.prompt.slice(0, 7000)}\n\nPROJECT SNAPSHOT:\n${projectSnapshot(files)}`,
      maxTokens: 850,
      temperature: 0.02,
    })
    return String(result.content || "").trim().slice(0, 5000)
  } catch {
    return "PASS"
  }
}

async function generateFiles(input: ProjectBuilderInput, feedback = ""): Promise<GeneratedProject> {
  const modelId = input.modelId || DEFAULT_MODEL
  const feedbackBlock = feedback
    ? `\n\nPREVIOUS QA FAILED. Regenerate the project and fix EVERY item below. Do not merely describe the fixes.\n${feedback.slice(0, 6000)}`
    : ""
  const preferences = [
    input.framework ? `Framework preference: ${input.framework}` : "",
    input.language ? `Language preference: ${input.language}` : "",
    input.style ? `Visual style preference: ${input.style}` : "",
  ].filter(Boolean).join("\n")

  const result = await runStrictMalikModel({
    modelId,
    systemPrompt: BUILDER_SYSTEM_PROMPT,
    prompt: `USER PROJECT BRIEF:\n${input.prompt.slice(0, 24_000)}${preferences ? `\n\nPREFERENCES:\n${preferences}` : ""}${feedbackBlock}`,
    maxTokens: Number(process.env.MAX_CODE_OUTPUT_TOKENS || 8_000),
    temperature: feedback ? 0.03 : 0.08,
  })

  return {
    files: parseFileBlocks(result.content),
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  }
}

export async function generateProjectWithBrain(input: ProjectBuilderInput): Promise<ProjectBuilderResult> {
  const prompt = String(input.prompt || "").trim()
  const title = titleFromPrompt(prompt)
  const createdAt = new Date().toISOString()
  const projectId = `project_${crypto.randomUUID()}`

  if (!prompt) {
    return {
      projectId,
      title,
      description: "Project generation failed.",
      status: "failed",
      plan: [],
      structure: [],
      files: [],
      commands: [],
      error: "Project prompt is empty.",
      createdAt,
    }
  }

  let rounds = 0
  try {
    let generated = await generateFiles(input)
    rounds += 1
    let files = mergeBaseFiles(generated.files, title)
    let staticQa = validateProject(files)
    let reviewer = staticQa.issues.length ? "" : await aiReview(input, files)

    if (staticQa.issues.length || !reviewerPassed(reviewer)) {
      const feedback = [...staticQa.issues, reviewer && !reviewerPassed(reviewer) ? reviewer : ""].filter(Boolean).join("\n")
      generated = await generateFiles(input, feedback)
      rounds += 1
      files = mergeBaseFiles(generated.files, title)
      staticQa = validateProject(files)
      reviewer = staticQa.issues.length ? "" : await aiReview(input, files)
    }

    const reviewOk = staticQa.issues.length === 0 && reviewerPassed(reviewer)
    const qa: ProjectQualityReport = {
      passed: reviewOk,
      checks: staticQa.checks,
      issues: [...staticQa.issues, reviewer && !reviewerPassed(reviewer) ? reviewer : ""].filter(Boolean),
      reviewer: reviewer || undefined,
      rounds,
    }

    if (!qa.passed) {
      return {
        projectId,
        title,
        description: "Project generation did not pass final QA.",
        status: "failed",
        plan: ["Parse the brief", "Generate complete project files", "Run static QA", "Run AI review", "Repair once when needed"],
        structure: files.map((file) => file.path),
        files,
        commands: ["npm install", "npm run dev", "npm run build"],
        provider: generated.provider,
        model: generated.model,
        error: qa.issues.join("; ").slice(0, 4000) || "Project QA failed.",
        qa,
        createdAt,
      }
    }

    return {
      projectId,
      title,
      description: `Production project generated from the user's brief and validated in ${rounds} QA round${rounds === 1 ? "" : "s"}.`,
      status: "completed",
      plan: [
        "Parse the user's requirements as the source of truth",
        "Generate a coherent multi-file Next.js implementation",
        "Validate structure, imports, runtime contracts and unfinished code",
        "Run an independent AI quality review",
        "Repair the project automatically when QA finds defects",
        "Package the validated files as a downloadable project artifact",
      ],
      structure: files.map((file) => file.path),
      files,
      commands: ["npm install", "npm run dev", "npm run build", "npm start"],
      provider: generated.provider,
      model: generated.model,
      qa,
      createdAt,
    }
  } catch (error) {
    return {
      projectId,
      title,
      description: "Project generation failed before a valid artifact could be produced.",
      status: "failed",
      plan: ["Generate project", "Validate project", "Package only after QA passes"],
      structure: [],
      files: [],
      commands: [],
      error: error instanceof Error ? error.message : String(error),
      qa: { passed: false, checks: [], issues: [error instanceof Error ? error.message : String(error)], rounds },
      createdAt,
    }
  }
}
