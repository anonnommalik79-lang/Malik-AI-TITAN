/**
 * Code preview helpers: a sandboxed page that reports its own runtime
 * errors to Malik AI (for "Fix with AI"), a multi-file project folded into
 * one previewable page, and a ZIP of any file set built in the browser — so
 * nothing heavy is sent through the server.
 */

export const PREVIEW_ERROR_MESSAGE = "malik-preview-error"

/** Injected first into the preview: forwards errors to the parent window. */
export function errorReporterScript(token: string) {
  return `<script>(function(){var t=${JSON.stringify(token)};var n=0;function s(m){if(n>20)return;n++;try{parent.postMessage({type:${JSON.stringify(PREVIEW_ERROR_MESSAGE)},token:t,message:String(m).slice(0,400)},"*")}catch(e){}}window.addEventListener("error",function(e){if(e&&e.target&&e.target!==window&&(e.target.src||e.target.href)){s("Не загрузился ресурс: "+(e.target.src||e.target.href));return}s((e.message||"Error")+(e.lineno?" (строка "+e.lineno+":"+e.colno+")":""))},true);window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;s("Unhandled promise rejection: "+(r&&r.message||r))});var c=console.error;console.error=function(){try{s([].slice.call(arguments).map(function(a){return a&&a.message||String(a)}).join(" "))}catch(e){}return c.apply(console,arguments)}})();</script>`
}

export function withErrorReporter(html: string, token: string) {
  const script = errorReporterScript(token)
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${script}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${script}</head>`)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${script}</head><body>${html}</body></html>`
}

export type ProjectFile = { path: string; content: string }

/**
 * A plain HTML/CSS/JS project as one page: local stylesheets and scripts
 * referenced by index.html are inlined. Projects that need a build step
 * (React, Next, TypeScript) return null — they are downloaded, not faked.
 */
export function foldProjectForPreview(files: ProjectFile[]): string | null {
  const byPath = new Map(files.map((file) => [file.path.replace(/^\.?\//, ""), file.content]))
  const entry = ["index.html", "public/index.html", "src/index.html"].find((path) => byPath.has(path))
  if (!entry) return null
  let html = byPath.get(entry) || ""
  const base = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/") + 1) : ""
  const resolve = (href: string) => {
    const clean = href.replace(/^\.?\//, "").split(/[?#]/)[0]
    return byPath.get(clean) ?? byPath.get(`${base}${clean}`)
  }
  if (/<script[^>]+type=["']module["'][^>]*src=["'][^"']+\.(?:tsx?|jsx)["']/i.test(html)) return null
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href: string) => {
    if (/^(?:https?:)?\/\//i.test(href)) return match
    const css = resolve(href)
    return css === undefined ? match : `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`
  })
  html = html.replace(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (match, before: string, src: string, after: string) => {
    if (/^(?:https?:)?\/\//i.test(src)) return match
    const js = resolve(src)
    return js === undefined ? match : `<script${before}${after}>${js.replace(/<\/script/gi, "<\\/script")}</script>`
  })
  return html
}

/* ----------------------------------------------------------------- zip */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A ZIP (stored, no compression) of text files. */
export function zipFiles(files: ProjectFile[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.path.replace(/^\/+/, ""))
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    chunks.push(new Uint8Array(local.buffer), name, data)
    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + data.length
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/zip" })
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function safeFileName(value: string, extension: string) {
  const base = String(value || "malik").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "malik"
  return `${base}.${extension}`
}
