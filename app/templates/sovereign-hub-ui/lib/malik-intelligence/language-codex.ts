import type { LanguageProfile } from "./types"

const CORE: LanguageProfile[] = [
  { id: "typescript", title: "TypeScript", family: "web", extensions: [".ts", ".tsx"], defaultFile: "src/index.ts", comment: "//", runHint: "npm run build", confidence: 1 },
  { id: "javascript", title: "JavaScript", family: "web", extensions: [".js", ".jsx"], defaultFile: "src/index.js", comment: "//", runHint: "node src/index.js", confidence: 1 },
  { id: "react", title: "React TSX", family: "web", extensions: [".tsx"], defaultFile: "src/App.tsx", comment: "//", runHint: "npm run build", confidence: 1 },
  { id: "nextjs", title: "Next.js", family: "web", extensions: [".tsx", ".ts"], defaultFile: "app/page.tsx", comment: "//", runHint: "npm run build", confidence: 1 },
  { id: "python", title: "Python", family: "backend", extensions: [".py"], defaultFile: "main.py", comment: "#", runHint: "python main.py", confidence: 1 },
  { id: "go", title: "Go", family: "backend", extensions: [".go"], defaultFile: "main.go", comment: "//", runHint: "go run .", confidence: 1 },
  { id: "rust", title: "Rust", family: "systems", extensions: [".rs"], defaultFile: "src/main.rs", comment: "//", runHint: "cargo run", confidence: 1 },
  { id: "java", title: "Java", family: "backend", extensions: [".java"], defaultFile: "Main.java", comment: "//", runHint: "javac Main.java && java Main", confidence: 1 },
  { id: "cpp", title: "C++", family: "systems", extensions: [".cpp", ".hpp"], defaultFile: "main.cpp", comment: "//", runHint: "g++ main.cpp -o app && ./app", confidence: 1 },
  { id: "c", title: "C", family: "systems", extensions: [".c", ".h"], defaultFile: "main.c", comment: "//", runHint: "gcc main.c -o app && ./app", confidence: 1 },
  { id: "csharp", title: "C#", family: "backend", extensions: [".cs"], defaultFile: "Program.cs", comment: "//", runHint: "dotnet run", confidence: 1 },
  { id: "php", title: "PHP", family: "backend", extensions: [".php"], defaultFile: "index.php", comment: "//", runHint: "php -S localhost:8000", confidence: 1 },
  { id: "ruby", title: "Ruby", family: "backend", extensions: [".rb"], defaultFile: "main.rb", comment: "#", runHint: "ruby main.rb", confidence: 1 },
  { id: "swift", title: "Swift", family: "mobile", extensions: [".swift"], defaultFile: "main.swift", comment: "//", runHint: "swift main.swift", confidence: 1 },
  { id: "kotlin", title: "Kotlin", family: "mobile", extensions: [".kt"], defaultFile: "Main.kt", comment: "//", runHint: "kotlinc Main.kt", confidence: 1 },
  { id: "dart", title: "Dart", family: "mobile", extensions: [".dart"], defaultFile: "lib/main.dart", comment: "//", runHint: "dart run", confidence: 1 },
  { id: "sql", title: "SQL", family: "data", extensions: [".sql"], defaultFile: "schema.sql", comment: "--", runHint: "Run in your database", confidence: 1 },
  { id: "bash", title: "Bash", family: "ops", extensions: [".sh"], defaultFile: "script.sh", comment: "#", runHint: "bash script.sh", confidence: 1 },
  { id: "powershell", title: "PowerShell", family: "ops", extensions: [".ps1"], defaultFile: "script.ps1", comment: "#", runHint: "pwsh script.ps1", confidence: 1 },
  { id: "html", title: "HTML", family: "web", extensions: [".html"], defaultFile: "index.html", comment: "<!--", runHint: "open index.html", confidence: 1 },
  { id: "css", title: "CSS", family: "web", extensions: [".css"], defaultFile: "styles.css", comment: "/*", runHint: "import into HTML", confidence: 1 },
  { id: "vue", title: "Vue", family: "web", extensions: [".vue"], defaultFile: "src/App.vue", comment: "//", runHint: "npm run build", confidence: 1 },
  { id: "svelte", title: "Svelte", family: "web", extensions: [".svelte"], defaultFile: "src/App.svelte", comment: "//", runHint: "npm run build", confidence: 1 },
  { id: "lua", title: "Lua", family: "scripting", extensions: [".lua"], defaultFile: "main.lua", comment: "--", runHint: "lua main.lua", confidence: 1 },
  { id: "r", title: "R", family: "data", extensions: [".r"], defaultFile: "analysis.r", comment: "#", runHint: "Rscript analysis.r", confidence: 1 },
  { id: "scala", title: "Scala", family: "data", extensions: [".scala"], defaultFile: "Main.scala", comment: "//", runHint: "scala Main.scala", confidence: 1 },
  { id: "haskell", title: "Haskell", family: "functional", extensions: [".hs"], defaultFile: "Main.hs", comment: "--", runHint: "runhaskell Main.hs", confidence: 1 },
  { id: "elixir", title: "Elixir", family: "backend", extensions: [".ex", ".exs"], defaultFile: "main.exs", comment: "#", runHint: "elixir main.exs", confidence: 1 },
  { id: "zig", title: "Zig", family: "systems", extensions: [".zig"], defaultFile: "main.zig", comment: "//", runHint: "zig run main.zig", confidence: 1 },
  { id: "ocaml", title: "OCaml", family: "functional", extensions: [".ml"], defaultFile: "main.ml", comment: "(*", runHint: "ocaml main.ml", confidence: 1 },
]

const ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "react",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  node: "javascript",
  nodejs: "javascript",
  reactjs: "react",
  next: "nextjs",
  nextdotjs: "nextjs",
  golang: "go",
  rs: "rust",
  "c#": "csharp",
  cs: "csharp",
  "c++": "cpp",
  shell: "bash",
  sh: "bash",
  ps1: "powershell",
}

export const INTELLIGENCE_LANGUAGES = CORE

export function normalizeLanguage(value?: string) {
  return String(value || "typescript").trim().toLowerCase().replace(/[^a-z0-9+#]+/g, "")
}

export function resolveLanguage(value?: string): LanguageProfile {
  const normalized = normalizeLanguage(value)
  const key = ALIASES[normalized] || normalized
  const found = CORE.find((item) => item.id === key || item.title.toLowerCase() === key)
  if (found) return found

  return {
    id: key || "custom",
    title: value?.trim() || "Custom Language",
    family: "custom-2000-plus",
    extensions: [".txt"],
    defaultFile: `${key || "custom"}-solution.txt`,
    comment: "#",
    runHint: "Use the official compiler/runtime for this target language.",
    compileHint: "Rare/custom language: verify with official docs and compiler.",
    confidence: 0.45,
  }
}

export function detectLanguageFromPrompt(prompt: string) {
  const text = normalizeLanguage(prompt)
  for (const lang of CORE) {
    if (text.includes(lang.id) || text.includes(normalizeLanguage(lang.title))) return lang
  }
  return resolveLanguage("typescript")
}

export function languageMatrix(query = "", limit = 18) {
  const q = normalizeLanguage(query)
  return CORE.filter((item) => !q || item.id.includes(q) || item.title.toLowerCase().includes(q) || item.family.includes(q)).slice(0, limit)
}

