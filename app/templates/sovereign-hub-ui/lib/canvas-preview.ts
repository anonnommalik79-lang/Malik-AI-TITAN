export const CANVAS_DEFAULT_PREVIEW_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Malik Canvas</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#030303;color:#f4f6f5;font-family:system-ui,sans-serif;display:grid;place-items:center;padding:32px}main{max-width:720px;text-align:center}h1{font-size:clamp(32px,5vw,48px);margin:0 0 12px;font-weight:600}p{color:#94a3b8;line-height:1.6;margin:0}</style></head><body><main><h1>Malik Canvas</h1><p>Live preview — как в v0. Сгенерируйте сайт, код или HTML и откройте Canvas.</p></main></body></html>`

export function stripCodeFence(code: string) {
  const value = (code || "").trim()
  const match = value.match(/^```(?:tsx|jsx|html|javascript|js|typescript|ts)?\s*([\s\S]*?)```$/i)
  return (match ? match[1] : value).trim()
}

function needsTailwind(code: string) {
  return /\bclass(?:Name)?\s*=/.test(code) && /(?:bg-|text-|flex|grid|rounded-|p-|m-|w-|h-|min-h-|max-w-)/.test(code)
}

function needsBabelCompile(code: string) {
  if (/<!doctype html|<html[\s>]/i.test(code)) return false
  if (/export\s+default|function\s+[A-Z]|<[A-Z][A-Za-z0-9]|\breturn\s*\(\s*</.test(code)) return true
  return /<[A-Z]/.test(code) && !/<html/i.test(code)
}

function wrapHtmlFragment(fragment: string, withTailwind: boolean) {
  const tw = withTailwind
    ? `<script src="https://cdn.tailwindcss.com"></script>`
    : ""
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>${tw}<style>body{margin:0;background:#030303;color:#f4f6f5;font-family:system-ui,sans-serif}</style></head><body>${fragment}</body></html>`
}

function wrapReactComponent(component: string, withTailwind: boolean) {
  const tw = withTailwind
    ? `<script src="https://cdn.tailwindcss.com"></script>`
    : ""
  let body = component
    .replace(/import\s+[^;]+;?/g, "")
    .replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/, "function App")
    .replace(/export\s+default\s+function\s*\(/, "function App(")
    .replace(/export\s+default\s+/, "const App = ")
    .replace(/export\s+\{[^}]+\};?/g, "")

  if (!/function\s+App|const\s+App\s*=/.test(body)) {
    body = `function App(){return (${body})}`
  }

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
${tw}
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{margin:0;background:#030303;color:#f4f6f5;font-family:system-ui,sans-serif}*{box-sizing:border-box}</style>
</head><body><div id="root"></div><script type="text/babel">
const {useState,useEffect,useMemo,useRef}=React;
${body}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
</script></body></html>`
}

/** Build iframe HTML — fast path for full HTML, Babel only when needed (v0-style). */
export function buildCanvasSrcDoc(rawInput: string) {
  const code = stripCodeFence(rawInput)
  if (!code) return CANVAS_DEFAULT_PREVIEW_HTML
  if (/<!doctype html|<html[\s>]/i.test(code)) return code

  const tailwind = needsTailwind(code)

  if (/<body[\s>]|<main[\s>]|<section[\s>]|<div[\s>]/i.test(code) && !/import\s+/.test(code) && !needsBabelCompile(code)) {
    return wrapHtmlFragment(code, tailwind)
  }

  if (needsBabelCompile(code)) {
    return wrapReactComponent(code, tailwind)
  }

  return wrapHtmlFragment(code, tailwind)
}

type PreviewFile = { name: string; content: string }

function localPreviewPath(value: string) {
  const path = String(value || "").split(/[?#]/, 1)[0].replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "")
  if (!path || /^(?:https?:|data:|blob:|\/\/)/i.test(value) || path.split("/").includes("..")) return ""
  return path.toLowerCase()
}

/** Preview the model's actual HTML/CSS/JS files together, without uploading code. */
export function buildCanvasProjectSrcDoc(files: PreviewFile[], htmlFilename: string) {
  const htmlFile = files.find((file) => localPreviewPath(file.name) === localPreviewPath(htmlFilename))
  if (!htmlFile) return ""
  const byPath = new Map(files.map((file) => [localPreviewPath(file.name), file.content]))
  const used = new Set<string>()
  let doc = buildCanvasSrcDoc(htmlFile.content)
  const assetPath = (reference: string) => {
    const path = localPreviewPath(reference)
    if (!path || byPath.has(path)) return path
    const directory = localPreviewPath(htmlFilename).split("/").slice(0, -1).join("/")
    const relative = directory ? `${directory}/${path}` : path
    return byPath.has(relative) ? relative : path
  }

  doc = doc.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] || ""
    const path = assetPath(href)
    const content = path.endsWith(".css") ? byPath.get(path) : undefined
    if (content === undefined) return tag
    used.add(path)
    return `<style>${content.replace(/<\/style/gi, "<\\/style")}</style>`
  })
  doc = doc.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => {
    const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] || ""
    const path = assetPath(src)
    const content = /\.(?:js|mjs)$/.test(path) ? byPath.get(path) : undefined
    if (content === undefined) return tag
    used.add(path)
    return `<script>${content.replace(/<\/script/gi, "<\\/script")}</script>`
  })

  // Models sometimes return HTML, CSS and JS as separate fenced files but
  // forget their link/script tags. Wire only the unambiguous single-file case.
  const css = files.filter((file) => /\.css$/i.test(file.name) && !used.has(localPreviewPath(file.name)))
  if (css.length === 1) doc = doc.replace(/<\/head>/i, `<style>${css[0].content.replace(/<\/style/gi, "<\\/style")}</style></head>`)
  const js = files.filter((file) => /\.(?:js|mjs)$/i.test(file.name) && !used.has(localPreviewPath(file.name)))
  if (js.length === 1 && !/^\s*(?:import|export)\b/m.test(js[0].content)) {
    doc = doc.replace(/<\/body>/i, `<script>${js[0].content.replace(/<\/script/gi, "<\\/script")}</script></body>`)
  }
  return doc
}

export function createCanvasBlobUrl(srcDoc: string) {
  const blob = new Blob([srcDoc], { type: "text/html;charset=utf-8" })
  return URL.createObjectURL(blob)
}
