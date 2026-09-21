/**
 * Instagram publishing — the official way, and the only way worth building.
 *
 * What was asked for was "log into my Instagram and post". That is a password
 * sitting in a database and a headless browser pretending to be a phone, and
 * Meta bans accounts for it. This module does the same job through Instagram
 * Login: the person authorises Malik AI in Instagram's own window, Instagram
 * hands back a token, and the password is never seen, never sent and never
 * stored. The token is encrypted at rest and bound to the account it belongs
 * to, so a stolen row is useless on its own.
 *
 * Publishing is deliberately two calls, because Instagram's API is two calls:
 * a container is built from a public image URL and a caption, and only then is
 * it published. The gap between them is where a person gets to look at what is
 * about to go out under their name — see app/api/instagram/publish/route.ts,
 * which will not publish without an explicit confirmation in the request.
 *
 * Account requirements, which are Meta's and not ours: the Instagram account
 * must be Business or Creator, the image must be reachable at a public https
 * URL (Instagram fetches it itself — it does not accept an upload), and the
 * app needs `instagram_business_content_publish`. Until Meta approves that
 * permission publicly, the flow works for accounts with a role on the app,
 * which is exactly what is needed to demonstrate it.
 */

const OAUTH_HOST = "https://api.instagram.com"
const GRAPH_HOST = "https://graph.instagram.com"

/** Reading the profile, and publishing. Nothing else is requested. */
export const INSTAGRAM_SCOPE = "instagram_business_basic,instagram_business_content_publish"

export type InstagramConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export type InstagramProfile = {
  id: string
  username: string
  accountType?: string
}

export class InstagramError extends Error {
  status: number
  code: string

  constructor(message: string, status = 502, code = "INSTAGRAM_ERROR") {
    super(message)
    this.name = "InstagramError"
    this.status = status
    this.code = code
  }
}

export function instagramConfigured() {
  return Boolean(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET)
}

export function instagramConfig(): InstagramConfig {
  const clientId = String(process.env.INSTAGRAM_CLIENT_ID || "").trim()
  const clientSecret = String(process.env.INSTAGRAM_CLIENT_SECRET || "").trim()
  const appUrl = String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "")
  const redirectUri = String(process.env.INSTAGRAM_REDIRECT_URI || (appUrl ? `${appUrl}/api/instagram/callback` : "")).trim()

  if (!clientId || !clientSecret || !redirectUri) {
    throw new InstagramError(
      "Instagram не настроен на сервере: нужны INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET и INSTAGRAM_REDIRECT_URI.",
      503,
      "INSTAGRAM_CONFIGURATION_REQUIRED",
    )
  }

  // Meta rejects a redirect that is not https and not an exact match for the
  // one registered on the app, and the error it returns says neither. Failing
  // here names the real problem instead.
  let parsed: URL
  try {
    parsed = new URL(redirectUri)
  } catch {
    throw new InstagramError("INSTAGRAM_REDIRECT_URI не является адресом.", 503, "INSTAGRAM_CONFIGURATION_REQUIRED")
  }
  if (parsed.protocol !== "https:") {
    throw new InstagramError("INSTAGRAM_REDIRECT_URI должен быть https.", 503, "INSTAGRAM_CONFIGURATION_REQUIRED")
  }
  if (parsed.pathname !== "/api/instagram/callback") {
    throw new InstagramError(
      "INSTAGRAM_REDIRECT_URI должен заканчиваться на /api/instagram/callback.",
      503,
      "INSTAGRAM_CONFIGURATION_REQUIRED",
    )
  }

  return { clientId, clientSecret, redirectUri: parsed.toString() }
}

export function authorizeUrl(state: string) {
  const config = instagramConfig()
  const url = new URL(`${OAUTH_HOST}/oauth/authorize`)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", INSTAGRAM_SCOPE)
  url.searchParams.set("state", state)
  return url.toString()
}

async function readError(response: Response) {
  const text = await response.text().catch(() => "")
  try {
    const parsed = JSON.parse(text)
    const message = parsed?.error_message || parsed?.error?.message || parsed?.error_description
    if (message) return String(message)
  } catch {
    /* Meta answers with HTML on some failures; the status carries the meaning. */
  }
  return text.slice(0, 300) || `HTTP ${response.status}`
}

/** Short-lived token (one hour), straight from the authorization code. */
export async function exchangeCode(code: string) {
  const config = instagramConfig()
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  })

  const response = await fetch(`${OAUTH_HOST}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  if (!response.ok) throw new InstagramError(`Instagram не принял код авторизации: ${await readError(response)}`, 400, "INSTAGRAM_CODE_REJECTED")

  const data = await response.json() as { access_token?: string; user_id?: string | number; permissions?: string }
  if (!data.access_token) throw new InstagramError("Instagram не вернул токен доступа.", 502, "INSTAGRAM_NO_TOKEN")
  return { accessToken: String(data.access_token), userId: data.user_id ? String(data.user_id) : "", permissions: String(data.permissions || "") }
}

/**
 * Sixty days instead of one hour. Without this step the connection dies while
 * the person is still reading the success page.
 */
export async function exchangeLongLived(shortLivedToken: string) {
  const config = instagramConfig()
  const url = new URL(`${GRAPH_HOST}/access_token`)
  url.searchParams.set("grant_type", "ig_exchange_token")
  url.searchParams.set("client_secret", config.clientSecret)
  url.searchParams.set("access_token", shortLivedToken)

  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new InstagramError(`Instagram не выдал долгий токен: ${await readError(response)}`, 502, "INSTAGRAM_LONG_TOKEN_FAILED")

  const data = await response.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new InstagramError("Instagram не вернул долгий токен.", 502, "INSTAGRAM_NO_TOKEN")
  return {
    accessToken: String(data.access_token),
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in) || 0) * 1000,
  }
}

/** A long-lived token can be renewed once it is at least a day old. */
export async function refreshLongLived(accessToken: string) {
  const url = new URL(`${GRAPH_HOST}/refresh_access_token`)
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", accessToken)

  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new InstagramError(`Не удалось продлить токен Instagram: ${await readError(response)}`, 502, "INSTAGRAM_REFRESH_FAILED")

  const data = await response.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null
  return {
    accessToken: String(data.access_token),
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in) || 0) * 1000,
  }
}

export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_HOST}/me`)
  url.searchParams.set("fields", "id,username,account_type")
  url.searchParams.set("access_token", accessToken)

  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new InstagramError(`Instagram не отдал профиль: ${await readError(response)}`, 502, "INSTAGRAM_PROFILE_FAILED")

  const data = await response.json() as { id?: string; username?: string; account_type?: string }
  if (!data.id) throw new InstagramError("Instagram не вернул идентификатор аккаунта.", 502, "INSTAGRAM_NO_ACCOUNT")
  return { id: String(data.id), username: String(data.username || ""), accountType: data.account_type ? String(data.account_type) : undefined }
}

/**
 * Step one of two. Instagram fetches the image itself, so the URL has to be
 * public — a signed link that expires in five minutes, a localhost address or
 * anything behind a login will fail here with a message about the media, not
 * about the URL.
 */
export async function createMediaContainer(input: {
  accessToken: string
  accountId: string
  imageUrl: string
  caption?: string
}) {
  const body = new URLSearchParams({ image_url: input.imageUrl, access_token: input.accessToken })
  if (input.caption) body.set("caption", input.caption)

  const response = await fetch(`${GRAPH_HOST}/${encodeURIComponent(input.accountId)}/media`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  if (!response.ok) throw new InstagramError(`Instagram не принял изображение: ${await readError(response)}`, 400, "INSTAGRAM_CONTAINER_FAILED")

  const data = await response.json() as { id?: string }
  if (!data.id) throw new InstagramError("Instagram не вернул черновик публикации.", 502, "INSTAGRAM_NO_CONTAINER")
  return String(data.id)
}

/** Step two. After this the post is public, and there is no undo. */
export async function publishMediaContainer(input: { accessToken: string; accountId: string; creationId: string }) {
  const body = new URLSearchParams({ creation_id: input.creationId, access_token: input.accessToken })

  const response = await fetch(`${GRAPH_HOST}/${encodeURIComponent(input.accountId)}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  if (!response.ok) throw new InstagramError(`Instagram не опубликовал пост: ${await readError(response)}`, 400, "INSTAGRAM_PUBLISH_FAILED")

  const data = await response.json() as { id?: string }
  if (!data.id) throw new InstagramError("Instagram не вернул идентификатор поста.", 502, "INSTAGRAM_NO_MEDIA_ID")
  return String(data.id)
}

/** The link a person can open to see what went out. */
export async function fetchPermalink(accessToken: string, mediaId: string) {
  const url = new URL(`${GRAPH_HOST}/${encodeURIComponent(mediaId)}`)
  url.searchParams.set("fields", "permalink")
  url.searchParams.set("access_token", accessToken)

  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) return ""
  const data = await response.json().catch(() => null) as { permalink?: string } | null
  return String(data?.permalink || "")
}
