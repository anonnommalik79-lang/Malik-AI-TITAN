import { blueprintById, GENERIC_BLUEPRINT, type ForgeLocale } from "./blueprints"
import { readForgeSite } from "./index"
import { fallbackPlan, mergePlan, type ForgePlan } from "./plan"
import { reviewSiteHtml } from "./quality"
import { renderSite, type PhotoMap, type SitePhoto } from "./render"

/**
 * What may be published on malikaiworld.world: only a Malik Site Forge page,
 * and never the HTML the browser sent. The embedded plan is cleaned field by
 * field (the same merge the model's plans go through), photographs keep only
 * https addresses, and the page is rendered again on the server. So a link
 * can carry nothing but a forge site, whatever was posted.
 */

export const PUBLISH_LIMITS = { requestBytes: 1_200_000, pageBytes: 900_000, perAccount: 50, perDay: 30 } as const

export type PreparedSite = { ok: true; html: string; title: string; brand: string; key: string; plan: ForgePlan }
export type PrepareError = { ok: false; code: "NOT_A_SITE" | "INVALID_SITE" | "SITE_TOO_LARGE" }

const LOCALES: ForgeLocale[] = ["ru", "kk", "en"]
const SAMPLE_FIELDS = new Set(["phone", "email", "address"])

function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return ""
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : ""
  } catch {
    return ""
  }
}

function cleanPhotos(value: unknown): PhotoMap {
  const photos: PhotoMap = {}
  if (!value || typeof value !== "object") return photos
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    if (!/^(?:hero|about|booking|gallery:\d{1,2}|item:i\d{1,2})$/.test(key) || !raw || typeof raw !== "object") continue
    const photo = raw as Record<string, unknown>
    const url = httpsUrl(photo.url)
    if (!url) continue
    const clean: SitePhoto = { url, alt: String(photo.alt || "").slice(0, 160) }
    if (typeof photo.credit === "string" && photo.credit.trim()) clean.credit = photo.credit.slice(0, 160)
    const link = httpsUrl(photo.link)
    if (link) clean.link = link
    photos[key] = clean
  }
  return photos
}

export function preparePublishedSite(html: unknown): PreparedSite | PrepareError {
  const site = readForgeSite(String(html || "").slice(0, PUBLISH_LIMITS.requestBytes))
  if (!site) return { ok: false, code: "NOT_A_SITE" }
  try {
    const raw = site.plan as ForgePlan
    const blueprint = blueprintById(raw.blueprint) || GENERIC_BLUEPRINT
    const locale = LOCALES.includes(raw.locale) ? raw.locale : "ru"
    const base = { ...fallbackPlan(locale === "en" ? "website" : "сайт", blueprint), locale }
    // «от 5000» survives the merge as a string, as the model writes it.
    const items = Array.isArray(raw.catalog?.items) ? raw.catalog.items.map((item) => ({ ...item, price: item?.from && typeof item.price === "number" ? `от ${item.price}` : item?.price })) : []
    const merged = mergePlan({ ...raw, catalog: { ...raw.catalog, items } }, base)
    const plan: ForgePlan = { ...merged, samples: (Array.isArray(raw.samples) ? raw.samples : []).filter((field) => SAMPLE_FIELDS.has(field)) }
    const rendered = renderSite(plan, cleanPhotos(site.photos))
    if (rendered.html.length > PUBLISH_LIMITS.pageBytes) return { ok: false, code: "SITE_TOO_LARGE" }
    if (!reviewSiteHtml(rendered.html).ok) return { ok: false, code: "INVALID_SITE" }
    const brand = plan.brand.name
    return { ok: true, html: rendered.html, title: (plan.seo.title || brand).slice(0, 120), brand, key: `${brand.trim().toLowerCase()}|${plan.blueprint}`, plan }
  } catch {
    return { ok: false, code: "INVALID_SITE" }
  }
}

/**
 * Headers for a published page. `sandbox` without allow-same-origin gives the
 * page an opaque origin: it cannot read the visitor's Malik session, cookies
 * or storage, even though it is served from the same domain.
 */
export const PUBLISHED_SITE_CSP = [
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "img-src https: data: blob:",
  "frame-src https://maps.google.com https://www.google.com",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ")

export function publishedSiteHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": PUBLISHED_SITE_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  }
}

export function sitePath(id: string) {
  return `/site/${id}`
}

export const PUBLISH_ERROR_TEXT: Record<string, string> = {
  AUTH_REQUIRED: "Войдите в аккаунт, чтобы опубликовать сайт по ссылке.",
  TOO_FREQUENT: "Слишком много публикаций за минуту. Попробуйте чуть позже.",
  STORAGE_UNAVAILABLE: "Публикация сейчас недоступна: хранилище не отвечает. Сайт можно скачать файлом.",
  ACCOUNT_LIMIT: `У аккаунта уже ${PUBLISH_LIMITS.perAccount} опубликованных сайтов. Удалите старые и попробуйте снова.`,
  DAILY_LIMIT: "Лимит новых публикаций на сегодня исчерпан. Завтра можно будет опубликовать снова.",
  CONFLICT: "Сайт публиковали одновременно в другой вкладке. Попробуйте ещё раз.",
  NOT_FOUND: "Сайт уже снят с публикации или не существует.",
  FORBIDDEN: "Снять сайт с публикации может только его автор.",
  NOT_A_SITE: "Опубликовать по ссылке можно сайт, собранный Malik Site Forge.",
  INVALID_SITE: "Сайт не прошёл проверку перед публикацией. Соберите его заново.",
  SITE_TOO_LARGE: "Сайт слишком большой для публикации.",
  BODY_TOO_LARGE: "Сайт слишком большой для публикации.",
  INVALID_JSON: "Не удалось прочитать запрос.",
}

export function publishErrorText(code: unknown) {
  return PUBLISH_ERROR_TEXT[String(code || "")] || "Не удалось опубликовать сайт. Попробуйте ещё раз."
}
