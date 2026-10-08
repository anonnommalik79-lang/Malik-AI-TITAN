/**
 * «Добавить папку»: a whole folder in one message.
 *
 * A chat message holds a dozen attachments, a project folder holds hundreds
 * of files - most of them .git internals, node_modules and build output.
 * Here the folder is sorted out: service folders, lock files and anything
 * that looks like a secret are left on the person's computer; code and texts
 * are written into one Markdown document (a tree, then every file); photos,
 * PDFs and office files go in as ordinary attachments while room is left.
 */

export type FolderEntry = { path: string; size: number; type: string }

export const FOLDER_LIMITS = {
  /** Characters of the document; the chat reads up to 600 000. */
  digestChars: 450_000,
  perFileChars: 60_000,
  /** A text file bigger than this is generated or a dump, not something to read. */
  textFileBytes: 1_500_000,
  treeLines: 400,
  scanned: 5_000,
} as const

const SERVICE_DIRS = new Set([
  ".git", ".svn", ".hg", "node_modules", "bower_components", "__MACOSX", ".next", ".nuxt", ".svelte-kit", ".angular",
  ".expo", ".turbo", ".cache", ".parcel-cache", ".vercel", ".netlify", ".terraform", "dist", "build", "out",
  "coverage", ".nyc_output", ".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
  ".tox", ".idea", ".vscode", ".gradle", "target", "Pods", "DerivedData", ".dart_tool", ".pub-cache",
])
const SERVICE_FILES = new Set([
  ".ds_store", "thumbs.db", "desktop.ini", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
  "poetry.lock", "cargo.lock", "composer.lock", "gemfile.lock", "pipfile.lock", "go.sum",
])
const SECRET_NAMES = [
  /^\.env(?:\.(?!example$|sample$|template$|dist$)[\w.-]+)?$/iu,
  /\.env$/iu,
  /\.(?:pem|key|p12|pfx|keystore|jks|asc|gpg)$/iu,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/iu,
  /^(?:credentials|secrets?)\.(?:json|ya?ml|toml|txt)$/iu,
  /service[-_]?account.*\.json$/iu,
  /^\.(?:npmrc|pypirc|netrc|htpasswd|git-credentials)$/iu,
]
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "rst", "csv", "tsv", "json", "jsonc", "jsonl", "yaml", "yml", "xml", "html", "htm", "css", "scss",
  "sass", "less", "js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte", "astro", "py", "ipynb", "java", "kt", "kts",
  "go", "rs", "rb", "php", "swift", "m", "c", "h", "cpp", "cc", "hpp", "cs", "fs", "scala", "dart", "lua", "r", "sql",
  "graphql", "gql", "proto", "sh", "bash", "zsh", "fish", "ps1", "bat", "toml", "ini", "cfg", "conf", "properties",
  "gradle", "tf", "log", "tex", "svg",
])
const TEXT_NAMES = new Set(["dockerfile", "makefile", "procfile", "readme", "license", "changelog", "gemfile", "rakefile", ".gitignore", ".dockerignore", ".editorconfig", ".env.example", ".env.sample", ".env.template"])
const MEDIA_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "pdf", "docx", "xlsx", "pptx"])
const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "cargo.toml", "pom.xml", "build.gradle", "composer.json", "gemfile", "dockerfile", "docker-compose.yml", "next.config.mjs", "next.config.js", "tsconfig.json"]

const segments = (path: string) => path.split("/").filter(Boolean)
const baseName = (path: string) => segments(path).at(-1) || path
const extension = (name: string) => /\.([a-z0-9]+)$/iu.exec(name)?.[1]?.toLowerCase() || ""

export type FolderPlan = {
  folderName: string
  text: FolderEntry[]
  media: FolderEntry[]
  skipped: { service: number; secrets: number; tooLarge: number; unsupported: number }
}

function priority(path: string) {
  const name = baseName(path).toLowerCase()
  const depth = segments(path).length
  if (/^readme(?:\.|$)/u.test(name)) return depth * 10
  const manifest = MANIFESTS.indexOf(name)
  if (manifest >= 0) return 1000 + depth * 10 + manifest
  return 10_000 + depth * 10
}

export function planFolder(entries: FolderEntry[]): FolderPlan {
  const plan: FolderPlan = { folderName: "", text: [], media: [], skipped: { service: 0, secrets: 0, tooLarge: 0, unsupported: 0 } }
  for (const entry of entries.slice(0, FOLDER_LIMITS.scanned)) {
    const parts = segments(entry.path)
    if (!plan.folderName && parts.length > 1) plan.folderName = parts[0]
    const name = baseName(entry.path)
    const lower = name.toLowerCase()
    const dirs = parts.slice(0, -1)
    if (dirs.some((dir) => SERVICE_DIRS.has(dir)) || SERVICE_FILES.has(lower) || /\.(?:min\.(?:js|css)|map)$/iu.test(lower)) { plan.skipped.service += 1; continue }
    if (SECRET_NAMES.some((pattern) => pattern.test(name))) { plan.skipped.secrets += 1; continue }
    const ext = extension(name)
    const isMedia = MEDIA_EXTENSIONS.has(ext) || entry.type.startsWith("image/") || entry.type === "application/pdf"
    const isText = !isMedia && (TEXT_EXTENSIONS.has(ext) || TEXT_NAMES.has(lower) || TEXT_NAMES.has(lower.replace(/\.[a-z]+$/u, "")) || entry.type.startsWith("text/") || entry.type === "application/json")
    if (isText) {
      if (entry.size > FOLDER_LIMITS.textFileBytes) { plan.skipped.tooLarge += 1; continue }
      plan.text.push(entry)
    } else if (isMedia) {
      plan.media.push(entry)
    } else {
      plan.skipped.unsupported += 1
    }
  }
  if (entries.length > FOLDER_LIMITS.scanned) plan.skipped.unsupported += entries.length - FOLDER_LIMITS.scanned
  if (!plan.folderName) plan.folderName = "Папка"
  plan.text.sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path))
  plan.media.sort((a, b) => a.path.localeCompare(b.path))
  return plan
}

/** An indented tree of the folder, directories first. */
export function folderTree(paths: string[], maxLines: number = FOLDER_LIMITS.treeLines) {
  type Node = { dirs: Map<string, Node>; files: string[] }
  const root: Node = { dirs: new Map(), files: [] }
  for (const path of paths) {
    const parts = segments(path)
    let node = root
    parts.slice(0, -1).forEach((part) => {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] })
      node = node.dirs.get(part)!
    })
    node.files.push(parts.at(-1) || path)
  }
  const lines: string[] = []
  const walk = (node: Node, depth: number) => {
    for (const [name, child] of [...node.dirs].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${"  ".repeat(depth)}${name}/`)
      walk(child, depth + 1)
    }
    for (const file of [...node.files].sort((a, b) => a.localeCompare(b))) lines.push(`${"  ".repeat(depth)}${file}`)
  }
  walk(root, 0)
  return lines.length > maxLines ? [...lines.slice(0, maxLines), `… и ещё ${lines.length - maxLines}`].join("\n") : lines.join("\n")
}

/** A fence longer than any backtick run inside, so a file can never close it. */
function fenceFor(text: string) {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/gu), (match) => match[0].length))
  return "`".repeat(longest + 1)
}

const LANGUAGE: Record<string, string> = { ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js", py: "python", rb: "ruby", rs: "rust", kt: "kotlin", yml: "yaml", md: "markdown", sh: "bash", ps1: "powershell" }

export function buildFolderDigest(folderName: string, files: Array<{ path: string; text: string }>, allPaths: string[], limits: { digestChars: number; perFileChars: number } = FOLDER_LIMITS) {
  const relative = (path: string) => segments(path)[0] === folderName ? segments(path).slice(1).join("/") : path
  const head = [`# Папка «${folderName}»`, "", "## Структура", "", "```", `${folderName}/`, folderTree(allPaths.map(relative)).split("\n").map((line) => `  ${line}`).join("\n"), "```", "", "## Файлы", "", ""].join("\n")
  let markdown = head
  const included: string[] = []
  const truncated: string[] = []
  const omitted: string[] = []
  for (const file of files) {
    const path = relative(file.path)
    let body = file.text.replace(/\r\n?/gu, "\n")
    let cut = false
    if (body.length > limits.perFileChars) { body = body.slice(0, limits.perFileChars); cut = true }
    const fence = fenceFor(body)
    const block = `### ${path}\n\n${fence}${LANGUAGE[extension(path)] || extension(path)}\n${body}${body.endsWith("\n") ? "" : "\n"}${fence}\n${cut ? `\n_Файл обрезан: показаны первые ${limits.perFileChars.toLocaleString("ru-RU")} символов._\n` : ""}\n`
    if (markdown.length + block.length > limits.digestChars) { omitted.push(path); continue }
    markdown += block
    included.push(path)
    if (cut) truncated.push(path)
  }
  if (omitted.length) markdown += `## Не поместились в документ\n\n${omitted.map((path) => `- ${path}`).join("\n")}\n`
  return { markdown, included, truncated, omitted }
}

function plural(count: number, one: string, few: string, many: string) {
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n > 10 && n < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

export function folderNotice(input: { folderName: string; documentFiles: number; omitted: number; media: number; mediaLeft: number; skipped: FolderPlan["skipped"] }) {
  const parts: string[] = []
  if (input.documentFiles) parts.push(`${input.documentFiles} ${plural(input.documentFiles, "файл", "файла", "файлов")} в одном документе`)
  if (input.media) parts.push(`${input.media} ${plural(input.media, "вложение", "вложения", "вложений")}`)
  const skipped: string[] = []
  if (input.skipped.service) skipped.push(`${input.skipped.service} служебных`)
  if (input.skipped.secrets) skipped.push(`${input.skipped.secrets} с ключами и паролями`)
  if (input.skipped.tooLarge) skipped.push(`${input.skipped.tooLarge} слишком больших`)
  if (input.skipped.unsupported) skipped.push(`${input.skipped.unsupported} неподдерживаемых`)
  if (input.omitted) skipped.push(`${input.omitted} не поместились в документ`)
  if (input.mediaLeft) skipped.push(`${input.mediaLeft} фото и файлов сверх лимита вложений`)
  return `Папка «${input.folderName}»: ${parts.join(", ") || "ничего не добавлено"}.${skipped.length ? ` Пропущено: ${skipped.join(", ")}.` : ""}`
}

/** What a composer attaches for a picked folder. */
export type PreparedFolder = {
  document: { name: string; text: string; size: number } | null
  media: File[]
  notice: string
  error: string
}

export async function prepareFolder(files: File[], room: number): Promise<PreparedFolder> {
  const entries = files.map((file) => ({ file, entry: { path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, size: file.size, type: file.type || "" } }))
  const plan = planFolder(entries.map((item) => item.entry))
  const byPath = new Map(entries.map((item) => [item.entry.path, item.file]))
  if (!room) return { document: null, media: [], notice: "", error: "Достигнут лимит вложений в одном сообщении." }

  const texts: Array<{ path: string; text: string }> = []
  let readChars = 0
  for (const entry of plan.text) {
    if (readChars > FOLDER_LIMITS.digestChars * 1.2) { texts.push({ path: entry.path, text: "" }); continue }
    const file = byPath.get(entry.path)
    if (!file) continue
    try {
      const text = await file.text()
      // A text extension on a binary file: leave it out.
      if (text.slice(0, 2000).includes("\u0000")) { plan.skipped.unsupported += 1; continue }
      texts.push({ path: entry.path, text })
      readChars += Math.min(text.length, FOLDER_LIMITS.perFileChars)
    } catch {
      plan.skipped.unsupported += 1
    }
  }

  const readable = texts.filter((item) => item.text)
  const digest = readable.length
    ? buildFolderDigest(plan.folderName, readable, [...plan.text, ...plan.media].map((entry) => entry.path))
    : null
  const omitted = (digest?.omitted.length || 0) + texts.filter((item) => !item.text).length
  const mediaRoom = Math.max(0, room - (digest ? 1 : 0))
  const media = plan.media.slice(0, mediaRoom).map((entry) => byPath.get(entry.path)).filter((file): file is File => Boolean(file))
  if (!digest && !media.length) {
    return { document: null, media: [], notice: "", error: `В папке «${plan.folderName}» нет файлов, которые Malik AI может прочитать.` }
  }
  return {
    document: digest ? { name: `${plan.folderName}.md`, text: digest.markdown, size: new TextEncoder().encode(digest.markdown).length } : null,
    media,
    notice: folderNotice({ folderName: plan.folderName, documentFiles: digest?.included.length || 0, omitted, media: media.length, mediaLeft: plan.media.length - media.length, skipped: plan.skipped }),
    error: "",
  }
}
