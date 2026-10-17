import "server-only"
import ts from "typescript"
import { detectStack, resolveImport } from "./diagnostics"
import { PREVIEW_RUNTIME } from "./preview-runtime"
import { SANDBOX_STORAGE_SHIM } from "./sandbox-shim"
import type { ProjectFile } from "./files"

/**
 * A real preview of a generated or uploaded project, built from its code.
 *
 *   - Static sites: index.html with local CSS/JS inlined.
 *   - Next.js App Router: every page and its layout chain, compiled with the
 *     TypeScript compiler to CommonJS, run in the browser on React 18 with
 *     stand-ins for next/link, next/image, next/navigation, fonts and
 *     dynamic(); internal links navigate inside the frame.
 *   - React (Vite/CRA): the src/main entry runs as written.
 *
 * The page runs in an iframe sandboxed WITHOUT same-origin: it cannot read
 * Malik AI cookies, storage or the parent page. Its CSP blocks all network
 * requests (API routes and servers do not run in the preview — said, not
 * hidden) and loads the runtime only from Malik AI's own /work-preview/.
 */

export type PreviewMode = "html" | "next-app" | "react"
export type PreviewResult = {
  ok: boolean
  mode: PreviewMode | null
  html: string
  entry: string | null
  routes: string[]
  modules: number
  limitations: string[]
  reason: string | null
}

const RUNTIME_PACKAGES = new Set(["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "next/link", "next/image", "next/navigation", "next/router", "next/head", "next/font/google", "next/font/local", "next/dynamic", "next/script", "clsx", "classnames", "lucide-react"])
const CODE = /(?<!\.d)\.(?:tsx?|jsx?|mjs|cjs)$/i
const MAX_PREVIEW_CHARS = 6_000_000

type ModuleEntry = { kind: "code" | "css" | "json" | "asset"; deps: Record<string, string>; value?: unknown; mapping?: Record<string, string> }

const escapeScript = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--")
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] as string)

export function previewCsp(runtimeBase: string, mode: PreviewMode) {
  const base = runtimeBase.replace(/\/+$/, "")
  const script = mode === "html" ? `'unsafe-inline' https:` : `'unsafe-inline' ${base}/work-preview/`
  return [
    "default-src 'none'",
    `script-src ${script}`,
    "style-src 'unsafe-inline' https:",
    "font-src data: https:",
    "img-src data: blob: https:",
    "media-src data: blob: https:",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ")
}

function head(runtimeBase: string, mode: PreviewMode) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(previewCsp(runtimeBase, mode))}"><script>${SANDBOX_STORAGE_SHIM}</script>`
}

/** Static site: index.html with its local stylesheets and scripts inlined. */
function staticPreview(files: Map<string, string>, entry: string, runtimeBase: string, token: string): string {
  let html = files.get(entry) || ""
  const base = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/") + 1) : ""
  const resolve = (href: string) => {
    const clean = href.replace(/^\.?\//, "").split(/[?#]/)[0]
    return files.get(clean) ?? files.get(`${base}${clean}`) ?? files.get(`public/${clean}`)
  }
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href: string) => {
    if (/^(?:https?:)?\/\//i.test(href)) return match
    const css = resolve(href)
    return css === undefined ? match : `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`
  })
  html = html.replace(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (match, before: string, src: string, after: string) => {
    if (/^(?:https?:)?\/\//i.test(src)) return match
    const js = resolve(src)
    return js === undefined ? match : `<script${before}${after}>${escapeScript(js)}</script>`
  })
  const reporter = `<script>window.__MALIK_PREVIEW__=${JSON.stringify({ token }).replace(/</g, "\\u003c")};(function(){var t=window.__MALIK_PREVIEW__.token,n=0;function p(k,m){if(n++>40)return;try{parent.postMessage({type:k==="error"?"malik-preview-error":"malik-work-preview",kind:k,token:t,message:String(m).slice(0,600)},"*")}catch(e){}}window.addEventListener("error",function(e){if(e&&e.target&&e.target!==window&&(e.target.src||e.target.href)){p("error","Не загрузился ресурс: "+(e.target.src||e.target.href));return}p("error",(e.message||"Error")+(e.lineno?" (строка "+e.lineno+")":""))},true);window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;p("error","Unhandled promise rejection: "+(r&&r.message||r))});document.addEventListener("securitypolicyviolation",function(e){if(String(e.violatedDirective).indexOf("connect-src")===0)p("error","Сетевой запрос заблокирован в превью: "+e.blockedURI)});window.addEventListener("load",function(){p("ready","rendered")})})();</script>`
  // Local documents stay inside the sandbox and request a new source preview
  // from the parent. Never navigate into Malik's authenticated application.
  const pages = [...files.keys()].filter(path => /\.html?$/i.test(path))
  const navigation = `<script>(function(){var pages=${JSON.stringify(pages).replace(/</g, "\\u003c")},entry=${JSON.stringify(entry)},token=${JSON.stringify(token)};document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href");if(!h||h.charAt(0)==="#"||/^(?:[a-z]+:|\\/\\/)/i.test(h))return;var u;try{u=new URL(h,"https://preview.local/"+entry)}catch(_){return}if(u.origin!=="https://preview.local")return;var p=u.pathname.slice(1);if(pages.indexOf(p)<0&&pages.indexOf(p.replace(/\\/$/,"")+"/index.html")>=0)p=p.replace(/\\/$/,"")+"/index.html";e.preventDefault();if(pages.indexOf(p)>=0)parent.postMessage({type:"malik-work-preview",kind:"static-route",token:token,message:"/"+p},"*");else parent.postMessage({type:"malik-preview-error",kind:"error",token:token,message:"Local page not found: "+p},"*")})})();</script>`
  const top = head(runtimeBase, "html") + reporter + navigation
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${top}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${top}</head>`)
  return `<!doctype html><html><head>${top}</head><body>${html}</body></html>`
}

function compile(path: string, source: string) {
  let output: ts.TranspileOutput
  try { output = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, allowJs: true, isolatedModules: true, sourceMap: false },
  }) } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    return { code: `throw new Error(${JSON.stringify(`Компилятор не смог собрать ${path}: ${text}`)});`, error: text }
  }
  const error = (output.diagnostics || []).find((item) => item.category === ts.DiagnosticCategory.Error)
  if (error) {
    const text = ts.flattenDiagnosticMessageText(error.messageText, " ")
    const line = error.file && error.start !== undefined ? error.file.getLineAndCharacterOfPosition(error.start).line + 1 : 0
    return { code: `throw new Error(${JSON.stringify(`Синтаксическая ошибка в ${path}${line ? `:${line}` : ""}: ${text}`)});`, error: text }
  }
  return { code: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/m, ""), error: null }
}

function cssModuleMapping(css: string) {
  const mapping: Record<string, string> = {}
  for (const match of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) mapping[match[1]] = match[1]
  return mapping
}

function nextRoutes(files: Map<string, string>) {
  const root = [...files.keys()].some((path) => path.startsWith("src/app/")) ? "src/app/" : "app/"
  const pages = [...files.keys()].filter((path) => path.startsWith(root) && /(?:^|\/)page\.(?:tsx|jsx|ts|js)$/.test(path) && !/\/@[^/]+\//.test(path) && !/\/_[^/]+\//.test(path))
  const layoutIn = (directory: string) => [".tsx", ".jsx", ".ts", ".js"].map((extension) => `${directory}layout${extension}`).find((name) => files.has(name))
  return pages.map((page) => {
    const segments = page.slice(root.length).split("/").slice(0, -1)
    const layouts: string[] = []
    for (let depth = 0; depth <= segments.length; depth++) {
      const layout = layoutIn(root + segments.slice(0, depth).map((segment) => `${segment}/`).join(""))
      if (layout) layouts.push(layout)
    }
    const pattern = "/" + segments.filter((segment) => !/^\(.+\)$/.test(segment)).join("/")
    return { pattern: pattern === "/" ? "/" : pattern.replace(/\/$/, ""), page, layouts }
  }).sort((a, b) => {
    // Static segments win over dynamic ones, catch-alls last; "/" first.
    const weight = (pattern: string) => pattern.split("/").reduce((sum, part) => sum + (/^\[\.\.\./.test(part) ? 100 : /^\[/.test(part) ? 10 : 0), 0)
    return weight(a.pattern) - weight(b.pattern) || a.pattern.localeCompare(b.pattern)
  })
}

/** Builds the preview document, or says exactly why there is none. */
export function buildProjectPreview(input: ProjectFile[], options: { runtimeBase: string; token: string; route?: string }): PreviewResult {
  const files = new Map(input.map((file) => [file.path, file.content]))
  const none = (reason: string): PreviewResult => ({ ok: false, mode: null, html: "", entry: null, routes: [], modules: 0, limitations: [], reason })
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null
  try { pkg = files.has("package.json") ? JSON.parse(files.get("package.json") as string) : null } catch { pkg = null }
  const stack = detectStack(files, pkg)
  const limitations: string[] = []

  if (stack === "static-html" || (stack !== "next-app" && ![...files.keys()].some((path) => /^(?:src\/)?(?:main|index)\.(?:tsx|jsx|ts|js)$/.test(path)) && [...files.keys()].some((path) => /(?:^|\/)index\.html?$/.test(path)))) {
    const defaultEntry = ["index.html", "public/index.html", "src/index.html"].find((path) => files.has(path)) || [...files.keys()].find((path) => /(?:^|\/)index\.html?$/.test(path)) as string
    const requested = String(options.route || "/").replace(/^\//, "").split(/[?#]/)[0]
    const entry = requested && /\.html?$/i.test(requested) && files.has(requested) ? requested : defaultEntry
    if (/<script[^>]+type=["']module["'][^>]*src=["'][^"']+\.(?:tsx?|jsx)["']/i.test(files.get(entry) || "") && stack !== "static-html") return none("NEEDS_BUNDLER")
    const html = staticPreview(files, entry, options.runtimeBase, options.token)
    limitations.push("Внешние сетевые запросы (fetch/XHR) из превью заблокированы.")
    return { ok: true, mode: "html", html, entry, routes: [...files.keys()].filter(path => /\.html?$/i.test(path)), modules: 1, limitations, reason: null }
  }
  if (stack === "next-pages") return none("NEXT_PAGES_ROUTER_UNSUPPORTED")
  if (stack === "python" || stack === "node" || stack === "unknown") return none(stack === "unknown" ? "NO_ENTRY" : "SERVER_ONLY_PROJECT")

  const routes = stack === "next-app" ? nextRoutes(files) : []
  const entry = stack === "next-app" ? (routes[0]?.page || null) : ["src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js", "src/index.tsx", "src/index.jsx", "src/index.ts", "src/index.js", "main.tsx", "main.jsx", "index.tsx", "index.jsx"].find((path) => files.has(path)) || null
  if (!entry) return none("NO_ENTRY")

  // Everything reachable from the entries, compiled once.
  const aliasSource = ["tsconfig.json", "jsconfig.json"].map((name) => files.get(name)).find(Boolean)
  const aliases = (() => {
    if (!aliasSource) return []
    const parsed = ts.parseConfigFileTextToJson("tsconfig.json", aliasSource)
    const compilerOptions = (parsed.config as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | undefined)?.compilerOptions
    const base = String(compilerOptions?.baseUrl || ".").replace(/^\.\/?/, "").replace(/\/$/, "")
    return Object.entries(compilerOptions?.paths || {}).map(([pattern, targets]) => {
      const star = pattern.indexOf("*")
      return { prefix: star >= 0 ? pattern.slice(0, star) : pattern, suffix: star >= 0 ? pattern.slice(star + 1) : "", targets: (targets || []).map((target) => [base, target.replace(/^\.\//, "")].filter(Boolean).join("/")) }
    })
  })()
  const modules: Record<string, ModuleEntry> = {}
  const code: Array<[string, string]> = []
  const css: string[] = []
  const queue = stack === "next-app" ? [...new Set(routes.flatMap((route) => [...route.layouts, route.page]))] : [entry]
  let usesLucide = false, usesTailwind = false
  const unavailable = new Set<string>()
  while (queue.length) {
    const path = queue.shift() as string
    if (modules[path]) continue
    const source = files.get(path) ?? ""
    if (/\.json$/i.test(path)) { try { modules[path] = { kind: "json", deps: {}, value: JSON.parse(source) } } catch { modules[path] = { kind: "json", deps: {}, value: null } } continue }
    if (/\.(?:css|scss|sass|less)$/i.test(path)) {
      if (/@tailwind\b|@import\s+["']tailwindcss/.test(source)) usesTailwind = true
      if (/\.(?:scss|sass|less)$/i.test(path)) limitations.push(`${path}: SCSS/LESS не компилируется в превью.`)
      else css.push(`/* ${path} */\n${source}`)
      modules[path] = { kind: "css", deps: {}, mapping: /\.module\.css$/i.test(path) ? cssModuleMapping(source) : undefined }
      continue
    }
    if (/\.svg$/i.test(path)) { modules[path] = { kind: "asset", deps: {}, value: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}` }; continue }
    if (!CODE.test(path)) { modules[path] = { kind: "asset", deps: {}, value: "" }; limitations.push(`${path}: файл не передан в превью (бинарный ресурс).`); continue }
    const deps: Record<string, string> = { "react/jsx-runtime": "pkg:react/jsx-runtime" }
    for (const item of ts.preProcessFile(source, true, true).importedFiles) {
      const specifier = item.fileName
      const resolved = resolveImport(path, specifier, files, aliases)
      if (typeof resolved === "string") { deps[specifier] = resolved; queue.push(resolved); continue }
      if (resolved === null) { deps[specifier] = "missing"; continue }
      const name = RUNTIME_PACKAGES.has(specifier) ? specifier : specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]
      if (name === "lucide-react") usesLucide = true
      if (!RUNTIME_PACKAGES.has(name)) unavailable.add(name)
      deps[specifier] = `pkg:${name}`
    }
    const compiled = compile(path, source)
    modules[path] = { kind: "code", deps }
    code.push([path, compiled.code])
  }
  if (usesTailwind) limitations.push("Tailwind CSS не компилируется в превью: утилитарные классы не применятся.")
  for (const name of unavailable) limitations.push(`Пакет «${name}» недоступен в превью — страницы, которые его импортируют, покажут ошибку.`)
  if ([...files.keys()].some((path) => /(?:^|\/)app\/api\/.+\/route\.(?:ts|js)$/.test(path))) limitations.push("API-маршруты (app/api) не выполняются в превью.")
  limitations.push("Превью работает на React 18 в браузере; серверный рендеринг и серверные действия Next.js не выполняются.")

  const base = options.runtimeBase.replace(/\/+$/, "")
  const config = { token: options.token, mode: stack === "next-app" ? "next-app" : "react", entry, route: options.route || "/", routes: routes.map((route) => ({ pattern: route.pattern, page: route.page, layouts: route.layouts })), modules }
  const body = stack === "next-app" ? "" : ((files.get("index.html") || "").match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "").replace(/<script\b[\s\S]*?<\/script>/gi, "") || '<div id="root"></div>'
  const html = [
    `<!doctype html><html lang="ru"><head>${head(base, stack === "next-app" ? "next-app" : "react")}`,
    `<style>html,body{margin:0}${"\n"}${css.join("\n").replace(/<\/style/gi, "<\\/style")}</style>`,
    `<script>window.__MALIK_PREVIEW__=${JSON.stringify(config).replace(/</g, "\\u003c")};window.__MALIK_MODULES__={};</script>`,
    `<script src="${base}/work-preview/react-18.3.1.production.min.js"></script>`,
    `<script src="${base}/work-preview/react-dom-18.3.1.production.min.js"></script>`,
    usesLucide ? `<script>window.react=window.React</script><script src="${base}/work-preview/lucide-react-0.564.0.min.js"></script>` : "",
    `<script>${code.map(([path, source]) => `window.__MALIK_MODULES__[${JSON.stringify(path)}]=function(module,exports,require){${escapeScript(source)}\n};`).join("\n")}</script>`,
    `</head><body>${body}<div id="__malik_root"></div><script>${escapeScript(PREVIEW_RUNTIME)}</script></body></html>`,
  ].join("")
  if (html.length > MAX_PREVIEW_CHARS) return none("PREVIEW_TOO_LARGE")
  return { ok: true, mode: stack === "next-app" ? "next-app" : "react", html, entry, routes: routes.map((route) => route.pattern), modules: Object.keys(modules).length, limitations: [...new Set(limitations)], reason: null }
}
