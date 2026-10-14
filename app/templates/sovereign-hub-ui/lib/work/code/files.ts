/**
 * Project files as Malik Work handles them: text only, safe relative paths,
 * hard limits. Everything that reaches the analyzer, the preview compiler or
 * a saved project passes through normalizeProjectFiles first.
 *
 * Pure (no Node or browser APIs) so the browser can pre-check an upload and
 * the server can enforce the same rules.
 */

export type ProjectFile = { path: string; content: string }

export const PROJECT_LIMITS = {
  files: 400,
  fileChars: 512_000,
  totalChars: 8_000_000,
  pathChars: 240,
  depth: 16,
} as const

/** Folders that are generated or private, never project source. */
export const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".turbo", ".vercel", ".cache", "coverage", "__pycache__", ".venv", "venv", ".idea", ".vscode", ".DS_Store"])
/** Files that hold secrets: never read, never stored, never previewed. */
const SECRET_FILE = /(?:^|\/)(?:\.env(?:\.(?!example$)[^/]*)?|\.npmrc|\.pypirc|id_rsa[^/]*|id_ed25519[^/]*|[^/]*\.pem|[^/]*\.key|[^/]*\.p12|[^/]*\.pfx|credentials\.json|service-account[^/]*\.json)$/i
const TEXT_EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs|json|jsonc|css|scss|sass|less|html?|md|mdx|txt|svg|ya?ml|toml|ini|env\.example|xml|csv|tsv|py|rb|go|rs|java|kt|swift|php|c|h|cpp|hpp|cs|sh|bash|zsh|ps1|sql|graphql|gql|prisma|vue|svelte|astro|lock|gitignore|editorconfig|prettierrc|eslintrc|babelrc|npmignore|dockerignore|dockerfile)$/i
const TEXT_NAMES = /(?:^|\/)(?:Dockerfile|Makefile|Procfile|LICENSE|README|CHANGELOG|\.gitignore|\.env\.example|\.nvmrc|\.node-version)$/i

export type FileRejection = { path: string; code: "UNSAFE_PATH" | "SECRET_FILE" | "BINARY_OR_UNSUPPORTED" | "TOO_LARGE" | "IGNORED_DIRECTORY" | "LIMIT_FILES" | "LIMIT_TOTAL" | "DUPLICATE" }

/**
 * A safe project-relative path, or null. Rejects absolute paths, drive
 * letters, `..`, empty segments, control characters and over-long names.
 */
export function safeProjectPath(raw: string): string | null {
  let value = String(raw || "").replace(/\\/g, "/").trim()
  if (!value || value.length > PROJECT_LIMITS.pathChars * 2) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  if (/^[a-zA-Z]:/.test(value) || value.startsWith("/") || value.startsWith("~")) return null
  value = value.replace(/^\.\/+/, "")
  const parts = value.split("/")
  if (parts.some((part) => !part || part === "." || part === ".." || part.length > 120)) return null
  if (parts.length > PROJECT_LIMITS.depth) return null
  const path = parts.join("/")
  return path.length <= PROJECT_LIMITS.pathChars ? path : null
}

export function isIgnoredPath(path: string) {
  return path.split("/").slice(0, -1).some((part) => IGNORED_DIRECTORIES.has(part)) || /(?:^|\/)\.DS_Store$/.test(path)
}

export function isSecretPath(path: string) { return SECRET_FILE.test(path) }

export function isTextPath(path: string) { return TEXT_EXTENSIONS.test(path) || TEXT_NAMES.test(path) }

/** Text that is really text: no NUL bytes and few replacement characters. */
export function looksLikeText(content: string) {
  if (content.includes("\u0000")) return false
  const sample = content.slice(0, 8000)
  const broken = (sample.match(/�/g) || []).length
  return broken <= Math.max(2, sample.length * 0.01)
}

/**
 * Removes a single shared top folder ("my-app/src/…" → "src/…") so a zipped
 * or picked folder behaves like its contents.
 */
export function stripCommonRoot(files: ProjectFile[]) {
  if (files.length < 2) return files
  const first = files[0].path.split("/")
  if (first.length < 2) return files
  const root = first[0]
  if (!files.every((file) => file.path.startsWith(`${root}/`))) return files
  return files.map((file) => ({ ...file, path: file.path.slice(root.length + 1) }))
}

/** Validates and limits a file set; reports every file left out and why. */
export function normalizeProjectFiles(input: Array<{ path: string; content: string }>) {
  const files: ProjectFile[] = []
  const rejected: FileRejection[] = []
  const seen = new Set<string>()
  let total = 0
  for (const item of input) {
    const path = safeProjectPath(item?.path)
    const shown = String(item?.path || "").slice(0, 200)
    if (!path) { rejected.push({ path: shown, code: "UNSAFE_PATH" }); continue }
    if (isIgnoredPath(path)) { rejected.push({ path, code: "IGNORED_DIRECTORY" }); continue }
    if (isSecretPath(path)) { rejected.push({ path, code: "SECRET_FILE" }); continue }
    const content = typeof item?.content === "string" ? item.content : ""
    if (!isTextPath(path) || !looksLikeText(content)) { rejected.push({ path, code: "BINARY_OR_UNSUPPORTED" }); continue }
    if (content.length > PROJECT_LIMITS.fileChars) { rejected.push({ path, code: "TOO_LARGE" }); continue }
    if (seen.has(path)) { rejected.push({ path, code: "DUPLICATE" }); continue }
    if (files.length >= PROJECT_LIMITS.files) { rejected.push({ path, code: "LIMIT_FILES" }); continue }
    if (total + content.length > PROJECT_LIMITS.totalChars) { rejected.push({ path, code: "LIMIT_TOTAL" }); continue }
    seen.add(path)
    total += content.length
    files.push({ path, content })
  }
  return { files: stripCommonRoot(files), rejected, totalChars: total }
}

export type TreeNode = { name: string; path: string; type: "dir" | "file"; children?: TreeNode[] }

/** Folders first, then files, alphabetically — the way editors show a project. */
export function projectTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] }
  for (const file of files) {
    const parts = file.path.split("/")
    let node = root
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/")
      const isFile = index === parts.length - 1
      let child = node.children!.find((item) => item.name === part && item.type === (isFile ? "file" : "dir"))
      if (!child) {
        child = isFile ? { name: part, path, type: "file" } : { name: part, path, type: "dir", children: [] }
        node.children!.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] => nodes
    .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1)
    .map((node) => node.children ? { ...node, children: sort(node.children) } : node)
  return sort(root.children!)
}

export function languageOf(path: string) {
  const extension = path.toLowerCase().split(".").pop() || ""
  const map: Record<string, string> = { ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript", json: "json", css: "css", scss: "scss", html: "html", htm: "html", md: "markdown", py: "python", sql: "sql", yml: "yaml", yaml: "yaml", svg: "xml", sh: "shell" }
  return map[extension] || "text"
}
