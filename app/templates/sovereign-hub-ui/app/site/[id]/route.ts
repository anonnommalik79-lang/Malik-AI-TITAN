import { readPublishedSite } from "@/lib/server/published-sites"
import { publishedSiteHeaders } from "@/lib/sites/forge/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

const MISSING = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Сайт не найден</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#111;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}h1{font-size:28px;margin:0 0 8px}a{color:#111}</style></head><body><main><h1>Сайт не найден</h1><p>Его сняли с публикации или ссылка набрана с ошибкой.</p><p><a href="https://malikaiworld.world" target="_blank" rel="noopener">Создать свой сайт в Malik AI</a></p></main></body></html>`

/** A published Malik Site Forge page, isolated from the app by a sandboxing CSP. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const site = await readPublishedSite(id).catch(() => null)
  if (!site) return new Response(MISSING, { status: 404, headers: { ...publishedSiteHeaders(), "Cache-Control": "public, max-age=15" } })
  return new Response(site.html, { status: 200, headers: publishedSiteHeaders() })
}
