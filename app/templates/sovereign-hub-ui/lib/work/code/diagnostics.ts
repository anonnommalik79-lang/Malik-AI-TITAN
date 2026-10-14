import "server-only"
import ts from "typescript"
import { languageOf, type ProjectFile } from "./files"

/**
 * Real diagnostics for a project, without running it:
 *   - syntax of every TS/TSX/JS/JSX file (the TypeScript compiler's parser),
 *   - JSON validity (tsconfig-style comments allowed where they are legal),
 *   - every import resolved: relative paths, tsconfig `paths` aliases, and
 *     packages checked against package.json,
 *   - Next.js App Router rules that break real builds (hooks or event
 *     handlers in a Server Component, metadata exported from a client file,
 *     missing root layout/page),
 *   - unbalanced CSS and broken local references in HTML.
 *
 * Every finding has a file, a line and a code, so it can be shown, fixed and
 * re-checked. Type checking against library types is not performed here and
 * is reported as a limitation, never as a pass.
 */

export type DiagnosticSource = "syntax" | "imports" | "json" | "structure" | "dependencies" | "css" | "html" | "runtime"
export type Diagnostic = { file: string; line: number; column: number; severity: "error" | "warning" | "info"; code: string; message: string; source: DiagnosticSource }
export type ProjectStack = "next-app" | "next-pages" | "react-vite" | "react" | "static-html" | "node" | "python" | "unknown"

export type ProjectAnalysis = {
  stack: ProjectStack
  packageName: string | null
  scripts: string[]
  dependencies: string[]
  entries: string[]
  diagnostics: Diagnostic[]
  counts: { errors: number; warnings: number; infos: number }
  stats: { files: number; lines: number; languages: Record<string, number> }
  checks: string[]
  limitations: string[]
}

const CODE_FILE = /(?<!\.d)\.(?:tsx?|jsx?|mjs|cjs)$/i
const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json", ".css", ".scss", ".sass", ".less", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".md", ".mdx"]
const INDEX_FILES = ["/index.tsx", "/index.ts", "/index.jsx", "/index.js"]
const NODE_BUILTINS = new Set(["assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "fs/promises", "http", "http2", "https", "inspector", "module", "net", "os", "path", "path/posix", "path/win32", "perf_hooks", "process", "punycode", "querystring", "readline", "repl", "stream", "stream/promises", "stream/web", "string_decoder", "timers", "timers/promises", "tls", "trace_events", "tty", "url", "util", "util/types", "v8", "vm", "wasi", "worker_threads", "zlib", "test"])
const CLIENT_ONLY = /\buse(?:State|Effect|LayoutEffect|Reducer|Ref|Context|Transition|DeferredValue|ImperativeHandle|SyncExternalStore|Optimistic|ActionState|FormStatus)\s*\(|\s(?:onClick|onChange|onSubmit|onInput|onKeyDown|onKeyUp|onMouseEnter|onMouseLeave|onFocus|onBlur|onScroll|onPointerDown)\s*=\s*\{/
const NEXT_SPECIAL = /^(?:src\/)?app\/(?:.*\/)?(?:page|layout|template|loading|not-found|default)\.(?:tsx|jsx|ts|js)$/

const lineCol = (text: string, index: number) => {
  let line = 1, last = -1
  for (let cursor = 0; cursor < Math.min(index, text.length); cursor++) if (text.charCodeAt(cursor) === 10) { line++; last = cursor }
  return { line, column: index - last }
}

function packageNameOf(specifier: string) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/")
  return specifier.split("/")[0]
}

function isUseClient(text: string) { return /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(text) }

function parseJsonLike(path: string, text: string): { value: unknown; error?: { message: string; index: number } } {
  if (/(?:^|\/)(?:tsconfig[^/]*|jsconfig)\.json$/i.test(path)) {
    const parsed = ts.parseConfigFileTextToJson(path, text)
    if (parsed.error) return { value: null, error: { message: ts.flattenDiagnosticMessageText(parsed.error.messageText, " "), index: parsed.error.start ?? 0 } }
    return { value: parsed.config }
  }
  try { return { value: JSON.parse(text) } } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON"
    const position = Number(message.match(/position (\d+)/)?.[1] ?? 0)
    return { value: null, error: { message, index: position } }
  }
}

type Aliases = Array<{ prefix: string; suffix: string; targets: string[] }>

function aliasesFrom(files: Map<string, string>): Aliases {
  const config = ["tsconfig.json", "jsconfig.json"].map((name) => files.get(name)).find(Boolean)
  if (!config) return []
  const parsed = ts.parseConfigFileTextToJson("tsconfig.json", config)
  const options = (parsed.config as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | undefined)?.compilerOptions
  const base = String(options?.baseUrl || ".").replace(/^\.\/?/, "").replace(/\/$/, "")
  return Object.entries(options?.paths || {}).map(([pattern, targets]) => {
    const star = pattern.indexOf("*")
    return {
      prefix: star >= 0 ? pattern.slice(0, star) : pattern,
      suffix: star >= 0 ? pattern.slice(star + 1) : "",
      targets: (Array.isArray(targets) ? targets : []).map((target) => [base, target.replace(/^\.\//, "")].filter(Boolean).join("/")),
    }
  })
}

/** The project file an import points to, or null. Packages return undefined. */
export function resolveImport(from: string, specifier: string, files: Map<string, string>, aliases: Aliases): string | null | undefined {
  const tryPath = (base: string) => {
    const clean = base.replace(/\/+$/, "")
    for (const extension of RESOLVE_EXTENSIONS) if (files.has(clean + extension)) return clean + extension
    for (const index of INDEX_FILES) if (files.has(clean + index)) return clean + index
    return null
  }
  const normalize = (path: string) => {
    const out: string[] = []
    for (const part of path.split("/")) {
      if (!part || part === ".") continue
      if (part === "..") { if (!out.length) return null; out.pop() } else out.push(part)
    }
    return out.join("/")
  }
  if (specifier.startsWith(".")) {
    const directory = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : ""
    const target = normalize(`${directory}/${specifier}`)
    return target === null ? null : tryPath(target)
  }
  if (specifier.startsWith("/")) return tryPath(normalize(specifier) || "")
  for (const alias of aliases) {
    if (specifier.startsWith(alias.prefix) && specifier.endsWith(alias.suffix) && (alias.prefix || alias.suffix)) {
      const middle = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length)
      for (const target of alias.targets) {
        const found = tryPath(normalize(target.replace("*", middle)) || "")
        if (found) return found
      }
      return null
    }
  }
  return undefined
}

export function detectStack(files: Map<string, string>, pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null): ProjectStack {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const has = (path: RegExp) => [...files.keys()].some((name) => path.test(name))
  if (has(/^(?:src\/)?app\/(?:.*\/)?page\.(?:tsx|jsx|ts|js)$/)) return "next-app"
  if ("next" in deps && has(/^(?:src\/)?pages\/.+\.(?:tsx|jsx|ts|js)$/)) return "next-pages"
  if (("vite" in deps || files.has("vite.config.ts") || files.has("vite.config.js")) && has(/^src\/main\.(?:tsx|jsx|ts|js)$/)) return "react-vite"
  if ("react" in deps && has(/^src\/(?:main|index)\.(?:tsx|jsx|ts|js)$/)) return "react"
  if (has(/(?:^|\/)index\.html?$/)) return "static-html"
  if (has(/\.py$/)) return "python"
  if (pkg) return "node"
  if (has(/\.(?:tsx|jsx)$/)) return "react"
  return "unknown"
}

export function analyzeProject(input: ProjectFile[]): ProjectAnalysis {
  const files = new Map(input.map((file) => [file.path, file.content]))
  const diagnostics: Diagnostic[] = []
  const checks: string[] = []
  const limitations = ["Типы библиотек (React, Next.js) не проверяются: выполняется синтаксический разбор, проверка импортов и правил фреймворка."]
  const add = (file: string, index: number | { line: number; column: number }, severity: Diagnostic["severity"], code: string, message: string, source: DiagnosticSource) => {
    const position = typeof index === "number" ? lineCol(files.get(file) || "", index) : index
    if (diagnostics.length < 500) diagnostics.push({ file, line: position.line, column: position.column, severity, code, message: message.slice(0, 400), source })
  }

  // package.json and JSON files
  type PackageJson = { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
  let pkg: PackageJson | null = null
  for (const [path, text] of files) {
    if (!/\.json$/i.test(path)) continue
    const parsed = parseJsonLike(path, text)
    if (parsed.error) add(path, parsed.error.index, "error", "JSON_INVALID", parsed.error.message, "json")
    else if (path === "package.json" && parsed.value && typeof parsed.value === "object") pkg = parsed.value as PackageJson
  }
  const stack = detectStack(files, pkg)
  const dependencySet = new Set(Object.keys({ ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}), ...(pkg?.peerDependencies || {}) }))
  if (pkg) {
    checks.push("package.json прочитан")
    if (["next-app", "next-pages", "react-vite", "react"].includes(stack) && !pkg.scripts?.build) add("package.json", 0, "warning", "NO_BUILD_SCRIPT", "В package.json нет скрипта build.", "structure")
  } else if (["next-app", "next-pages", "react-vite"].includes(stack)) add("package.json", { line: 1, column: 1 }, "warning", "NO_PACKAGE_JSON", "Нет package.json: зависимости не объявлены, проект не установится.", "dependencies")

  // Syntax and imports
  const aliases = aliasesFrom(files)
  const graph = new Map<string, string[]>()
  for (const [path, text] of files) {
    if (!CODE_FILE.test(path)) continue
    const isTsx = /\.(?:tsx|jsx)$/i.test(path)
    let output: ts.TranspileOutput
    try {
      output = ts.transpileModule(text, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, allowJs: true },
      })
    } catch (error) {
      add(path, 0, "warning", "COMPILER_INTERNAL", `Компилятор не смог разобрать файл: ${error instanceof Error ? error.message : String(error)}`, "syntax")
      continue
    }
    void isTsx
    for (const item of output.diagnostics || []) {
      // Only errors in the file itself; compiler-option messages are ours, not the project's.
      if (item.category !== ts.DiagnosticCategory.Error || !item.file) continue
      add(path, item.start ?? 0, "error", `TS${item.code}`, ts.flattenDiagnosticMessageText(item.messageText, " "), "syntax")
    }
    const imports = ts.preProcessFile(text, true, true).importedFiles
    const local: string[] = []
    for (const item of imports) {
      const specifier = item.fileName
      const resolved = resolveImport(path, specifier, files, aliases)
      if (resolved === null) add(path, item.pos, "error", "IMPORT_NOT_FOUND", `Импорт «${specifier}» не найден в проекте.`, "imports")
      else if (typeof resolved === "string") local.push(resolved)
      else {
        const name = packageNameOf(specifier.replace(/^node:/, ""))
        if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(name)) continue
        if (pkg && !dependencySet.has(name)) add(path, item.pos, "error", "DEPENDENCY_MISSING", `Пакет «${name}» используется, но не указан в package.json.`, "dependencies")
      }
    }
    graph.set(path, local)
  }

  // Next.js App Router rules
  if (stack === "next-app") {
    const prefix = files.has("src/app/layout.tsx") || [...files.keys()].some((name) => name.startsWith("src/app/")) ? "src/app/" : "app/"
    const layout = [".tsx", ".jsx", ".js", ".ts"].map((ext) => `${prefix}layout${ext}`).find((name) => files.has(name))
    if (!layout) add(`${prefix}layout.tsx`, { line: 1, column: 1 }, "error", "NEXT_ROOT_LAYOUT_MISSING", "Нет корневого app/layout — Next.js не соберёт проект.", "structure")
    for (const [path, text] of files) {
      if (NEXT_SPECIAL.test(path) && !/export\s+default\b/.test(text)) add(path, { line: 1, column: 1 }, "error", "NEXT_DEFAULT_EXPORT_MISSING", "Страница или layout Next.js должны экспортировать компонент по умолчанию.", "structure")
      if (/(?:^|\/)app\/(?:.*\/)?error\.(?:tsx|jsx|js|ts)$/.test(path) && !isUseClient(text)) add(path, { line: 1, column: 1 }, "error", "NEXT_ERROR_NOT_CLIENT", "app/error должен начинаться с \"use client\".", "structure")
      if (isUseClient(text) && /export\s+(?:const|async\s+function|function)\s+(?:metadata|generateMetadata)\b/.test(text)) {
        add(path, text.search(/export\s+(?:const|async\s+function|function)\s+(?:metadata|generateMetadata)\b/), "error", "NEXT_METADATA_IN_CLIENT", "metadata нельзя экспортировать из клиентского компонента (\"use client\").", "structure")
      }
    }
    // Walk from server entries; a "use client" file is a boundary.
    const server = new Set<string>()
    const queue = [...files.keys()].filter((path) => NEXT_SPECIAL.test(path))
    while (queue.length) {
      const path = queue.shift() as string
      if (server.has(path) || !CODE_FILE.test(path) || isUseClient(files.get(path) || "")) continue
      server.add(path)
      queue.push(...(graph.get(path) || []))
    }
    for (const path of server) {
      const text = files.get(path) || ""
      const match = text.match(CLIENT_ONLY)
      if (match && match.index !== undefined) add(path, match.index, "error", "NEXT_CLIENT_CODE_IN_SERVER", `«${match[0].trim().replace(/\($/, "")}» работает только в клиентском компоненте: добавьте "use client" в начало файла.`, "structure")
    }
    checks.push(`Next.js App Router: ${server.size} серверных модулей проверено`)
  }

  // CSS and HTML
  for (const [path, text] of files) {
    if (/\.css$/i.test(path)) {
      const clean = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " ")).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (quoted) => quoted.replace(/[{}]/g, " "))
      if (/\/\*(?![\s\S]*\*\/)/.test(clean)) add(path, clean.lastIndexOf("/*"), "error", "CSS_UNTERMINATED_COMMENT", "Незакрытый комментарий CSS.", "css")
      let depth = 0
      for (let index = 0; index < clean.length; index++) {
        if (clean[index] === "{") depth++
        else if (clean[index] === "}") { depth--; if (depth < 0) { add(path, index, "error", "CSS_UNBALANCED", "Лишняя закрывающая скобка «}».", "css"); break } }
      }
      if (depth > 0) add(path, clean.length, "error", "CSS_UNBALANCED", "Не закрыто фигурных скобок: " + depth + ".", "css")
    }
    if (/\.html?$/i.test(path)) {
      const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""
      for (const match of text.matchAll(/<(?:script|img|link|source)\b[^>]*?\s(?:src|href)=["']([^"'#?]+)[^"']*["']/gi)) {
        const ref = match[1]
        if (/^(?:[a-z]+:)?\/\//i.test(ref) || /^(?:data|mailto|tel|javascript):/i.test(ref)) continue
        const target = ref.startsWith("/") ? ref.slice(1) : `${directory}${ref.replace(/^\.\//, "")}`
        const candidates = [target, `public/${target}`, ref.startsWith("/") ? `public${ref}` : ""]
        if (!candidates.some((candidate) => candidate && files.has(candidate))) add(path, match.index ?? 0, "warning", "HTML_REFERENCE_MISSING", `Файл «${ref}» не найден в проекте.`, "html")
      }
    }
  }

  const entries = [...files.keys()].filter((path) => NEXT_SPECIAL.test(path) || /^(?:src\/)?(?:main|index)\.(?:tsx|jsx|ts|js)$/.test(path) || /(?:^|\/)index\.html?$/.test(path)).slice(0, 40)
  const languages: Record<string, number> = {}
  let lines = 0
  for (const [path, text] of files) { const language = languageOf(path); languages[language] = (languages[language] || 0) + 1; lines += text.split("\n").length }
  const counts = { errors: diagnostics.filter((item) => item.severity === "error").length, warnings: diagnostics.filter((item) => item.severity === "warning").length, infos: diagnostics.filter((item) => item.severity === "info").length }
  checks.push(`Синтаксис: ${[...files.keys()].filter((path) => CODE_FILE.test(path)).length} файлов кода`, `Импорты: ${[...graph.values()].reduce((sum, list) => sum + list.length, 0)} локальных связей`)
  return { stack, packageName: pkg?.name || null, scripts: Object.keys(pkg?.scripts || {}), dependencies: [...dependencySet], entries, diagnostics, counts, stats: { files: files.size, lines, languages }, checks, limitations }
}

/** What a repair round changed: fixed, still present, and newly introduced problems. */
export function compareDiagnostics(before: Diagnostic[], after: Diagnostic[]) {
  const key = (item: Diagnostic) => `${item.file}|${item.code}|${item.message}`
  const previous = new Set(before.filter((item) => item.severity === "error").map(key))
  const current = new Set(after.filter((item) => item.severity === "error").map(key))
  return {
    fixed: [...previous].filter((item) => !current.has(item)).length,
    remaining: [...current].filter((item) => previous.has(item)).length,
    introduced: [...current].filter((item) => !previous.has(item)).length,
    improved: current.size < previous.size,
  }
}
