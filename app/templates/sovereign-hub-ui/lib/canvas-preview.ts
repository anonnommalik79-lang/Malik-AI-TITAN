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

export function createCanvasBlobUrl(srcDoc: string) {
  const blob = new Blob([srcDoc], { type: "text/html;charset=utf-8" })
  return URL.createObjectURL(blob)
}
