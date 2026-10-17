import "server-only"
import { createHash } from "node:crypto"
import ts from "typescript"
import { isIgnoredPath, isSecretPath, isTextPath, normalizeProjectFiles, safeProjectPath, type ProjectFile } from "@/lib/work/code/files"
import { analyzeProject, type Diagnostic } from "@/lib/work/code/diagnostics"

export const validProjectId = (id: string) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)
export const ownerKey = (actor: string) => createHash("sha256").update(actor.trim().toLowerCase()).digest("hex")
export function workspaceRoot(id: string) {
  if (!validProjectId(id)) throw new Error("INVALID_PROJECT_ID")
  return `projects/${id}`
}
export function projectFiles(input: ProjectFile[]) {
  if (!Array.isArray(input) || input.length > 80) throw new Error("WORKSPACE_FILE_LIMIT")
  const result = normalizeProjectFiles(input, { stripRoot: false })
  if (result.rejected.length) throw new Error(`WORKSPACE_REJECTED:${result.rejected[0].code}:${result.rejected[0].path}`)
  if (result.totalChars > 2_000_000) throw new Error("WORKSPACE_SIZE_LIMIT")
  const seen = new Set<string>()
  for (const file of result.files) {
    if (/(?:^|\/)MALIK-(?:VERIFICATION|ASSETS)\.md$/i.test(file.path)) throw new Error("RESERVED_RECEIPT_PATH")
    const key = file.path.toLowerCase()
    if (file.path.split("/").some(part => /[:<>"|?*]|[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("WINDOWS_UNSAFE_PATH")
    if (seen.has(key)) throw new Error("WORKSPACE_CASE_COLLISION")
    seen.add(key)
    if (/(?:^|\/)(?:malik-ai-files|projects)\//i.test(file.path)) throw new Error("NESTED_WORKSPACE_ROOT")
    if (/\.(?:tsx?|jsx?|html?|css|json)$/.test(file.path) && /```(?:tsx?|jsx?|html|css)?\s*\n/.test(file.content)) throw new Error(`MARKDOWN_IN_SOURCE:${file.path}`)
    if (/VISUAL_DATA|To get started, edit|Get started by editing/i.test(file.content)) throw new Error(`UNFINISHED_SOURCE:${file.path}`)
    // Actual credentials must never reach exports; examples/placeholders are allowed.
    if (/(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(file.content)) throw new Error("SECRET_IN_SOURCE")
  }
  return result.files
}
export function applyFiles(base: ProjectFile[], patch: ProjectFile[], allowed?: string[]) {
  const checked = projectFiles(patch)
  if (allowed && checked.some(file => !allowed.includes(file.path))) throw new Error("UNPLANNED_FILE_WRITE")
  const next = new Map(base.map(file => [file.path, file]))
  for (const file of checked) next.set(file.path, file)
  return projectFiles([...next.values()])
}
export function sourceHash(files: ProjectFile[]) {
  return createHash("sha256").update(JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path)))).digest("hex")
}

/** The compiler binds JSX identifiers to their lexical declarations. Unlike a
 * transpile-only check, this finds <Compass/> without its import, including
 * nested-scope cases. Library declarations are intentionally not fabricated. */
export function missingJsxBindings(files: ProjectFile[]): Diagnostic[] {
  const sources = new Map(files.filter(f => /\.(?:tsx|jsx)$/.test(f.path)).map(f => [f.path, f.content]))
  const options: ts.CompilerOptions = { jsx: ts.JsxEmit.Preserve, noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.ES2020 }
  const host = ts.createCompilerHost(options)
  host.getSourceFile = (name, version) => sources.has(name) ? ts.createSourceFile(name, sources.get(name)!, version, true, /\.tsx$/.test(name) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX) : undefined
  host.fileExists = name => sources.has(name)
  host.readFile = name => sources.get(name)
  const program = ts.createProgram([...sources.keys()], options, host)
  const checker = program.getTypeChecker()
  const out: Diagnostic[] = []
  for (const name of sources.keys()) {
    const source = program.getSourceFile(name)!
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        let tag: ts.Node = node.tagName
        while (ts.isPropertyAccessExpression(tag)) tag = tag.expression
        if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text) && !checker.getSymbolAtLocation(tag)) {
          const pos = source.getLineAndCharacterOfPosition(tag.getStart())
          out.push({ file: name, line: pos.line + 1, column: pos.character + 1, severity: "error", code: "JSX_UNBOUND", message: `JSX «${tag.text}» не объявлен и не импортирован.`, source: "imports" })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return out
}
export function validateSources(files: ProjectFile[]) {
  const analysis = analyzeProject(files)
  const diagnostics = [...analysis.diagnostics, ...missingJsxBindings(files)]
  return { ...analysis, diagnostics, counts: { ...analysis.counts, errors: diagnostics.filter(d => d.severity === "error").length } }
}

/** Installation is never performed on the Malik web host. These checks form
 * an explicit contract for an isolated executor, not a claim of npm success. */
export function dependencyProblems(files: ProjectFile[]): string[] {
  const file = files.find(f => f.path === "package.json")
  if (!file) return []
  let pkg
  try { pkg = JSON.parse(file.content) } catch { return ["INVALID_PACKAGE_JSON"] }
  const issues: string[] = []
  for (const group of [pkg.dependencies, pkg.devDependencies]) for (const [name, version] of Object.entries(group || {})) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name) || typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) issues.push(`UNPINNED_OR_UNSAFE_DEPENDENCY:${name}`)
  }
  for (const name of ["preinstall", "install", "postinstall", "prepare", "prepublish"]) if (pkg.scripts?.[name]) issues.push(`PROJECT_LIFECYCLE_SCRIPT:${name}`)
  const lock = files.find(f => f.path === "package-lock.json")
  if (lock) {
    try {
      const parsed = JSON.parse(lock.content)
      if (parsed.lockfileVersion < 2 || !parsed.packages?.[""]) issues.push("INVALID_LOCKFILE")
      else for (const group of ["dependencies", "devDependencies"]) if (JSON.stringify(parsed.packages[""][group] || {}) !== JSON.stringify(pkg[group] || {})) issues.push(`STALE_LOCKFILE:${group}`)
      for (const value of Object.values(parsed.packages || {}) as Array<{ resolved?: string }>) if (value.resolved && !/^https:\/\/registry\.npmjs\.org\//.test(value.resolved)) issues.push("UNTRUSTED_LOCKFILE_REGISTRY")
    } catch { issues.push("INVALID_LOCKFILE") }
  }
  return [...new Set(issues)]
}
export function safeManifestPath(path: string) {
  return safeProjectPath(path) === path && !isIgnoredPath(path) && !isSecretPath(path) && isTextPath(path) && !/(?:^|\/)MALIK-(?:VERIFICATION|ASSETS)\.md$/i.test(path)
}

export function environmentDiagnosis(log: string) {
  if (/Failed to load SWC|@next\/swc|SWC.*binding|not a valid Win32/i.test(log)) return "SWC_NATIVE_BINDING_MISSING: verify Node/OS/architecture and reinstall optional native dependencies in the sandbox; not an application source defect."
  if (/Turbopack.*wasm|wasm.*Turbopack|turbo.*not supported.*wasm/i.test(log)) return "TURBOPACK_WASM_UNSUPPORTED: use the supported Webpack mode; do not pretend to repair it by changing page.tsx."
  if (/EADDRINUSE|address already in use/i.test(log)) return "PORT_CONFLICT: allocate a free sandbox preview port; do not kill unrelated processes."
  if (/Cannot find.*typescript|install.*@types\/react|TypeScript.*not installed/i.test(log)) return "TYPESCRIPT_DEPENDENCIES_MISSING: install the declared compiler/types with the project dependencies in the sandbox."
  return "PROJECT_BUILD_DIAGNOSTIC: inspect the concrete file/line and preserve unrelated functionality."
}
