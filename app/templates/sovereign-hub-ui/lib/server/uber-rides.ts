import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getPublicOrigin, getPublicUrl } from "@/lib/public-origin"

const UBER_AUTH_AUTHORIZE = "https://auth.uber.com/oauth/v2/authorize"
const UBER_AUTH_TOKEN = "https://auth.uber.com/oauth/v2/token"
const UBER_PRODUCTION_API = "https://api.uber.com/v1.2"
const UBER_SANDBOX_API = "https://sandbox-api.uber.com/v1.2"

const UBER_SESSION_COOKIE = "malik_uber_session_v1"
const UBER_STATE_COOKIE = "malik_uber_oauth_state_v1"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000
const MAX_PROVIDER_ERROR = 420

export type UberApiMode = "sandbox" | "production"
export type UberSavedPlaceId = "home" | "work"

export type UberCoordinates = {
  latitude: number
  longitude: number
}

export type UberRideDestination =
  | { kind: "saved"; placeId: UberSavedPlaceId }
  | { kind: "coordinates"; latitude: number; longitude: number; nickname?: string; address?: string }

export type UberRideOption = {
  productId: string
  displayName: string
  description?: string
  capacity?: number
  image?: string
  fareDisplay: string
  fareValue?: number
  currencyCode?: string
  pickupEstimateMinutes?: number | null
  durationEstimateSeconds?: number | null
  distanceEstimate?: number | null
  distanceUnit?: string
  expiresAt: number
  quoteToken: string
}

export type UberRideSnapshot = {
  requestId: string
  productId?: string
  status: string
  eta?: number | null
  driver?: {
    name?: string
    rating?: number | null
    phoneNumber?: string
    pictureUrl?: string
  } | null
  vehicle?: {
    make?: string
    model?: string
    licensePlate?: string
    pictureUrl?: string
  } | null
  location?: {
    latitude?: number
    longitude?: number
    bearing?: number
  } | null
  surgeMultiplier?: number | null
}

type UberTokenBundle = {
  version: 1
  malikUserId: string
  accessToken: string
  refreshToken?: string
  tokenType?: string
  scope?: string
  expiresAt: number
  uberProfile?: {
    uuid?: string
    riderId?: string
    firstName?: string
    lastName?: string
    email?: string
    picture?: string
  }
}

type UberQuotePayload = {
  version: 1
  malikUserId: string
  productId: string
  fareId: string
  expiresAt: number
  start: UberCoordinates
  destination: UberRideDestination
}

type ProviderJson = Record<string, any>

function uberClientId() {
  return String(process.env.UBER_CLIENT_ID || "").trim()
}

function uberClientSecret() {
  return String(process.env.UBER_CLIENT_SECRET || "").trim()
}

function encryptionSecret() {
  return String(process.env.UBER_TOKEN_ENCRYPTION_KEY || process.env.WORKOS_COOKIE_PASSWORD || "").trim()
}

export function getUberApiMode(): UberApiMode {
  return String(process.env.UBER_API_MODE || "sandbox").trim().toLowerCase() === "production"
    ? "production"
    : "sandbox"
}

function apiBase() {
  return getUberApiMode() === "production" ? UBER_PRODUCTION_API : UBER_SANDBOX_API
}

export function getUberRedirectUri() {
  const configured = String(process.env.UBER_REDIRECT_URI || "").trim()
  if (configured) {
    try {
      return new URL(configured).toString()
    } catch {
      // Fall back to the canonical Malik AI callback.
    }
  }
  return getPublicUrl("/api/taxi/uber/callback")
}

export function getUberScopes() {
  const configured = String(process.env.UBER_SCOPES || "profile request places offline_access").trim()
  return configured.split(/[\s,]+/).filter(Boolean)
}

export function isUberConfigured() {
  return Boolean(uberClientId() && uberClientSecret() && encryptionSecret())
}

function key() {
  const secret = encryptionSecret()
  if (!secret) throw new Error("UBER_TOKEN_ENCRYPTION_KEY is not configured")
  return createHash("sha256").update(secret, "utf8").digest()
}

function seal(value: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const plaintext = Buffer.from(JSON.stringify(value), "utf8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url")
}

function unseal<T>(token: string): T | null {
  try {
    const packed = Buffer.from(token, "base64url")
    if (packed.length < 29) return null
    const iv = packed.subarray(0, 12)
    const tag = packed.subarray(12, 28)
    const ciphertext = packed.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", key(), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
    return JSON.parse(plaintext) as T
  } catch {
    return null
  }
}

function cookieOptions(maxAge = COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

function cleanProviderError(value: unknown) {
  return String(value || "Uber request failed").replace(/\s+/g, " ").trim().slice(0, MAX_PROVIDER_ERROR)
}

async function providerJson(response: Response): Promise<ProviderJson> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as ProviderJson
  } catch {
    return { message: text }
  }
}

function providerError(status: number, payload: ProviderJson) {
  const detail =
    payload?.message ||
    payload?.error_description ||
    payload?.error?.message ||
    payload?.error ||
    `Uber API returned ${status}`
  const error = new Error(cleanProviderError(detail)) as Error & { status?: number; providerCode?: string }
  error.status = status
  error.providerCode = String(payload?.code || payload?.error?.code || payload?.error || "")
  return error
}

async function requireMalikUser() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.id) throw Object.assign(new Error("MALIK_AUTH_REQUIRED"), { status: 401 })
  return user
}

export async function getUberMalikUser() {
  return requireMalikUser()
}

async function saveBundle(bundle: UberTokenBundle) {
  const store = await cookies()
  store.set(UBER_SESSION_COOKIE, seal(bundle), cookieOptions())
}

export async function disconnectUber() {
  const store = await cookies()
  store.delete(UBER_SESSION_COOKIE)
}

async function readBundle(userId: string): Promise<UberTokenBundle | null> {
  if (!isUberConfigured()) return null
  const store = await cookies()
  const encoded = store.get(UBER_SESSION_COOKIE)?.value
  if (!encoded) return null
  const bundle = unseal<UberTokenBundle>(encoded)
  if (!bundle || bundle.version !== 1 || bundle.malikUserId !== userId || !bundle.accessToken) return null
  return bundle
}

async function exchangeToken(params: Record<string, string>) {
  const body = new URLSearchParams({
    client_id: uberClientId(),
    client_secret: uberClientSecret(),
    ...params,
  })

  const response = await fetch(UBER_AUTH_TOKEN, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const payload = await providerJson(response)
  if (!response.ok || !payload?.access_token) throw providerError(response.status, payload)
  return payload
}

async function refreshBundle(bundle: UberTokenBundle) {
  if (!bundle.refreshToken) throw Object.assign(new Error("UBER_RECONNECT_REQUIRED"), { status: 401 })
  const payload = await exchangeToken({ grant_type: "refresh_token", refresh_token: bundle.refreshToken })
  const refreshed: UberTokenBundle = {
    ...bundle,
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token || bundle.refreshToken || "") || undefined,
    tokenType: String(payload.token_type || bundle.tokenType || "Bearer"),
    scope: String(payload.scope || bundle.scope || ""),
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
  }
  await saveBundle(refreshed)
  return refreshed
}

async function currentBundle(userId: string) {
  const bundle = await readBundle(userId)
  if (!bundle) throw Object.assign(new Error("UBER_NOT_CONNECTED"), { status: 401 })
  if (bundle.expiresAt - Date.now() <= TOKEN_REFRESH_SKEW_MS) return refreshBundle(bundle)
  return bundle
}

async function uberFetchWithBundle(
  userId: string,
  path: string,
  init: RequestInit = {},
  retryRefresh = true,
): Promise<{ payload: ProviderJson; response: Response; bundle: UberTokenBundle }> {
  let bundle = await currentBundle(userId)
  let response = await fetch(`${apiBase()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bundle.accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  })

  if (response.status === 401 && retryRefresh && bundle.refreshToken) {
    bundle = await refreshBundle(bundle)
    response = await fetch(`${apiBase()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bundle.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    })
  }

  const payload = await providerJson(response)
  if (!response.ok) throw providerError(response.status, payload)
  return { payload, response, bundle }
}

export async function createUberAuthorizationUrl() {
  if (!isUberConfigured()) throw Object.assign(new Error("UBER_NOT_CONFIGURED"), { status: 503 })
  const user = await requireMalikUser()
  const state = randomBytes(24).toString("base64url")
  const store = await cookies()
  store.set(UBER_STATE_COOKIE, `${user.id}.${state}`, cookieOptions(OAUTH_STATE_MAX_AGE_SECONDS))

  const url = new URL(UBER_AUTH_AUTHORIZE)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", uberClientId())
  url.searchParams.set("redirect_uri", getUberRedirectUri())
  url.searchParams.set("scope", getUberScopes().join(" "))
  url.searchParams.set("state", state)
  return url.toString()
}

function statesMatch(expected: string, actual: string) {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function finishUberAuthorization(code: string, state: string) {
  if (!code || !state) throw Object.assign(new Error("UBER_OAUTH_INVALID_CALLBACK"), { status: 400 })
  const user = await requireMalikUser()
  const store = await cookies()
  const stateCookie = String(store.get(UBER_STATE_COOKIE)?.value || "")
  store.delete(UBER_STATE_COOKIE)
  const separator = stateCookie.indexOf(".")
  const ownerId = separator >= 0 ? stateCookie.slice(0, separator) : ""
  const expectedState = separator >= 0 ? stateCookie.slice(separator + 1) : ""
  if (!expectedState || ownerId !== user.id || !statesMatch(expectedState, state)) {
    throw Object.assign(new Error("UBER_OAUTH_STATE_MISMATCH"), { status: 400 })
  }

  const payload = await exchangeToken({
    grant_type: "authorization_code",
    redirect_uri: getUberRedirectUri(),
    code,
  })

  const provisional: UberTokenBundle = {
    version: 1,
    malikUserId: user.id,
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token || "") || undefined,
    tokenType: String(payload.token_type || "Bearer"),
    scope: String(payload.scope || ""),
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
  }
  await saveBundle(provisional)

  try {
    const profileResponse = await fetch(`${apiBase()}/me`, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${provisional.accessToken}` },
    })
    const profile = await providerJson(profileResponse)
    if (profileResponse.ok) {
      provisional.uberProfile = {
        uuid: String(profile?.uuid || "") || undefined,
        riderId: String(profile?.rider_id || "") || undefined,
        firstName: String(profile?.first_name || "") || undefined,
        lastName: String(profile?.last_name || "") || undefined,
        email: String(profile?.email || "") || undefined,
        picture: String(profile?.picture || "") || undefined,
      }
      await saveBundle(provisional)
    }
  } catch {
    // A successful OAuth connection should not be discarded if /me is temporarily unavailable.
  }

  return provisional
}

export async function getUberConnectionStatus() {
  const user = await requireMalikUser()
  const bundle = await readBundle(user.id)
  return {
    configured: isUberConfigured(),
    connected: Boolean(bundle?.accessToken),
    mode: getUberApiMode(),
    scopes: bundle?.scope?.split(/\s+/).filter(Boolean) || [],
    profile: bundle?.uberProfile || null,
    redirectUri: getUberRedirectUri(),
  }
}

export async function getUberSavedPlaces() {
  const user = await requireMalikUser()
  const results = await Promise.all(
    (["home", "work"] as UberSavedPlaceId[]).map(async (placeId) => {
      try {
        const { payload } = await uberFetchWithBundle(user.id, `/places/${placeId}`)
        return {
          placeId,
          available: Boolean(payload?.address || payload?.latitude || payload?.longitude),
          address: String(payload?.address || ""),
          latitude: Number.isFinite(Number(payload?.latitude)) ? Number(payload.latitude) : undefined,
          longitude: Number.isFinite(Number(payload?.longitude)) ? Number(payload.longitude) : undefined,
        }
      } catch {
        return { placeId, available: false, address: "" }
      }
    }),
  )
  return results
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw Object.assign(new Error("INVALID_COORDINATES"), { status: 400 })
  return number
}

export function normalizeCoordinates(input: Partial<UberCoordinates>): UberCoordinates {
  return {
    latitude: finiteCoordinate(input.latitude, -90, 90),
    longitude: finiteCoordinate(input.longitude, -180, 180),
  }
}

function normalizeDestination(input: UberRideDestination): UberRideDestination {
  if (input?.kind === "saved" && (input.placeId === "home" || input.placeId === "work")) {
    return { kind: "saved", placeId: input.placeId }
  }
  if (input?.kind === "coordinates") {
    const coordinates = normalizeCoordinates(input)
    return {
      kind: "coordinates",
      ...coordinates,
      nickname: String(input.nickname || "").trim().slice(0, 80) || undefined,
      address: String(input.address || "").trim().slice(0, 240) || undefined,
    }
  }
  throw Object.assign(new Error("INVALID_DESTINATION"), { status: 400 })
}

function requestLocationBody(start: UberCoordinates, destination: UberRideDestination) {
  return {
    start_latitude: start.latitude,
    start_longitude: start.longitude,
    ...(destination.kind === "saved"
      ? { end_place_id: destination.placeId }
      : {
          end_latitude: destination.latitude,
          end_longitude: destination.longitude,
          ...(destination.nickname ? { end_nickname: destination.nickname } : {}),
          ...(destination.address ? { end_address: destination.address } : {}),
        }),
  }
}

export async function estimateUberRide(startInput: Partial<UberCoordinates>, destinationInput: UberRideDestination) {
  const user = await requireMalikUser()
  const start = normalizeCoordinates(startInput)
  const destination = normalizeDestination(destinationInput)
  const { payload: productsPayload } = await uberFetchWithBundle(
    user.id,
    `/products?latitude=${encodeURIComponent(start.latitude)}&longitude=${encodeURIComponent(start.longitude)}`,
  )
  const products = Array.isArray(productsPayload?.products) ? productsPayload.products : []
  const candidates = products
    .filter((product: any) => product?.product_id && product?.display_name && product?.upfront_fare_enabled !== false)
    .slice(0, 8)

  const options = await Promise.all(candidates.map(async (product: any): Promise<UberRideOption | null> => {
    try {
      const { payload } = await uberFetchWithBundle(user.id, "/requests/estimate", {
        method: "POST",
        body: JSON.stringify({
          product_id: product.product_id,
          ...requestLocationBody(start, destination),
        }),
      })
      const fare = payload?.fare || payload?.price || {}
      const fareId = String(fare?.fare_id || "")
      if (!fareId) return null
      const expiresAt = Number(fare?.expires_at || 0) > 0
        ? Number(fare.expires_at) * 1000
        : Date.now() + 100 * 1000
      const quote: UberQuotePayload = {
        version: 1,
        malikUserId: user.id,
        productId: String(product.product_id),
        fareId,
        expiresAt,
        start,
        destination,
      }
      return {
        productId: quote.productId,
        displayName: String(product.display_name),
        description: String(product.description || "") || undefined,
        capacity: Number.isFinite(Number(product.capacity)) ? Number(product.capacity) : undefined,
        image: String(product.image || "") || undefined,
        fareDisplay: String(fare?.display || fare?.display_name || "Цена от Uber"),
        fareValue: Number.isFinite(Number(fare?.value)) ? Number(fare.value) : undefined,
        currencyCode: String(fare?.currency_code || "") || undefined,
        pickupEstimateMinutes: payload?.pickup_estimate == null ? null : Number(payload.pickup_estimate),
        durationEstimateSeconds: payload?.trip?.duration_estimate == null ? null : Number(payload.trip.duration_estimate),
        distanceEstimate: payload?.trip?.distance_estimate == null ? null : Number(payload.trip.distance_estimate),
        distanceUnit: String(payload?.trip?.distance_unit || "") || undefined,
        expiresAt,
        quoteToken: seal(quote),
      }
    } catch {
      return null
    }
  }))

  const ready = options.filter((option): option is UberRideOption => Boolean(option))
  ready.sort((left, right) => {
    const leftPrice = left.fareValue ?? Number.POSITIVE_INFINITY
    const rightPrice = right.fareValue ?? Number.POSITIVE_INFINITY
    if (leftPrice !== rightPrice) return leftPrice - rightPrice
    return (left.pickupEstimateMinutes ?? 999) - (right.pickupEstimateMinutes ?? 999)
  })
  if (!ready.length) throw Object.assign(new Error("UBER_NO_RIDE_OPTIONS"), { status: 404 })
  return ready
}

function decodeQuote(userId: string, quoteToken: string) {
  const quote = unseal<UberQuotePayload>(quoteToken)
  if (!quote || quote.version !== 1 || quote.malikUserId !== userId || !quote.productId || !quote.fareId) {
    throw Object.assign(new Error("UBER_QUOTE_INVALID"), { status: 400 })
  }
  if (quote.expiresAt <= Date.now()) throw Object.assign(new Error("UBER_QUOTE_EXPIRED"), { status: 409 })
  return quote
}

function normalizeRide(payload: ProviderJson): UberRideSnapshot {
  return {
    requestId: String(payload?.request_id || ""),
    productId: String(payload?.product_id || "") || undefined,
    status: String(payload?.status || "unknown"),
    eta: payload?.eta == null ? null : Number(payload.eta),
    driver: payload?.driver ? {
      name: String(payload.driver.name || "") || undefined,
      rating: payload.driver.rating == null ? null : Number(payload.driver.rating),
      phoneNumber: String(payload.driver.phone_number || "") || undefined,
      pictureUrl: String(payload.driver.picture_url || payload.driver.picture || "") || undefined,
    } : null,
    vehicle: payload?.vehicle ? {
      make: String(payload.vehicle.make || "") || undefined,
      model: String(payload.vehicle.model || "") || undefined,
      licensePlate: String(payload.vehicle.license_plate || "") || undefined,
      pictureUrl: String(payload.vehicle.picture_url || payload.vehicle.picture || "") || undefined,
    } : null,
    location: payload?.location ? {
      latitude: Number.isFinite(Number(payload.location.latitude)) ? Number(payload.location.latitude) : undefined,
      longitude: Number.isFinite(Number(payload.location.longitude)) ? Number(payload.location.longitude) : undefined,
      bearing: Number.isFinite(Number(payload.location.bearing)) ? Number(payload.location.bearing) : undefined,
    } : null,
    surgeMultiplier: payload?.surge_multiplier == null ? null : Number(payload.surge_multiplier),
  }
}

export async function requestUberRide(quoteToken: string) {
  const user = await requireMalikUser()
  const quote = decodeQuote(user.id, String(quoteToken || ""))
  const { payload } = await uberFetchWithBundle(user.id, "/requests", {
    method: "POST",
    body: JSON.stringify({
      product_id: quote.productId,
      fare_id: quote.fareId,
      ...requestLocationBody(quote.start, quote.destination),
    }),
  })
  const ride = normalizeRide(payload)
  if (!ride.requestId) throw Object.assign(new Error("UBER_REQUEST_ID_MISSING"), { status: 502 })
  return ride
}

export async function getUberRide(requestId: string) {
  const user = await requireMalikUser()
  const id = String(requestId || "").trim()
  if (!id || id.length > 180) throw Object.assign(new Error("INVALID_RIDE_ID"), { status: 400 })
  const { payload } = await uberFetchWithBundle(user.id, `/requests/${encodeURIComponent(id)}`)
  return normalizeRide(payload)
}

export async function cancelUberRide(requestId: string) {
  const user = await requireMalikUser()
  const id = String(requestId || "").trim()
  if (!id || id.length > 180) throw Object.assign(new Error("INVALID_RIDE_ID"), { status: 400 })
  const { response } = await uberFetchWithBundle(user.id, `/requests/${encodeURIComponent(id)}`, { method: "DELETE" })
  return { ok: response.ok }
}

export function isSameMalikOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).origin === getPublicOrigin()
  } catch {
    return false
  }
}

export function publicUberError(error: unknown) {
  const candidate = error as Error & { status?: number; providerCode?: string }
  const code = String(candidate?.message || "UBER_REQUEST_FAILED")
  const status = Number(candidate?.status || 500)
  const safeStatus = status >= 400 && status < 600 ? status : 500
  const userMessage = (() => {
    if (code === "MALIK_AUTH_REQUIRED") return "Войди в Malik AI, чтобы подключить Uber."
    if (code === "UBER_NOT_CONFIGURED") return "Uber ещё не настроен на сервере Malik AI."
    if (code === "UBER_NOT_CONNECTED" || code === "UBER_RECONNECT_REQUIRED") return "Подключи Uber ещё раз."
    if (code === "UBER_QUOTE_EXPIRED") return "Цена Uber уже обновилась. Получи свежую цену и повтори заказ."
    if (code === "UBER_NO_RIDE_OPTIONS") return "Uber сейчас не вернул доступные варианты для этой поездки."
    if (code === "INVALID_COORDINATES") return "Не удалось определить корректную точку подачи."
    if (safeStatus === 429) return "Uber временно ограничил запросы. Попробуй чуть позже."
    return cleanProviderError(code)
  })()
  return { status: safeStatus, code, message: userMessage, providerCode: candidate?.providerCode || undefined }
}
