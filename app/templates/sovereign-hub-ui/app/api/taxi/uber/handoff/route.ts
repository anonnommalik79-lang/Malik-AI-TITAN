import { isSameMalikOrigin } from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Coordinates = { latitude: number; longitude: number }

type NominatimResult = {
  lat?: string
  lon?: string
  display_name?: string
  name?: string
  category?: string
  type?: string
}

function cleanText(value: unknown, max = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

function validCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false
  const latitude = Number((value as Coordinates).latitude)
  const longitude = Number((value as Coordinates).longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

async function geocodeDestination(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", "1")
  url.searchParams.set("q", query)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "ru,en;q=0.8",
        "User-Agent": "Malik-AI-Taxi/1.0 (+https://malikaiworld.world)",
      },
    })
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`)
    const payload = await response.json().catch(() => []) as NominatimResult[]
    const first = Array.isArray(payload) ? payload[0] : null
    const latitude = Number(first?.lat)
    const longitude = Number(first?.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return {
      latitude,
      longitude,
      address: cleanText(first?.display_name || query, 260),
      nickname: cleanText(first?.name || query, 80),
      category: cleanText(first?.category, 48),
      type: cleanText(first?.type, 48),
    }
  } finally {
    clearTimeout(timeout)
  }
}

type ResolvedDestination = NonNullable<Awaited<ReturnType<typeof geocodeDestination>>>

/**
 * When the rider picked a result from the search list, the exact coordinates are
 * already known — the list came from the same geocoder. Re-resolving the text
 * would add a second external round trip and, worse, could land on a different
 * place than the one that was actually tapped.
 */
function exactDestination(value: unknown): ResolvedDestination | null {
  if (!validCoordinates(value)) return null
  const point = value as Coordinates & Record<string, unknown>
  const nickname = cleanText(point.nickname, 80)
  const address = cleanText(point.address, 260)
  if (!nickname && !address) return null
  return {
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    address: address || nickname,
    nickname: nickname || address,
    category: cleanText(point.category, 48),
    type: cleanText(point.type, 48),
  }
}

function buildUberUrl(clientId: string, pickup: Coordinates, destination: Awaited<ReturnType<typeof geocodeDestination>>) {
  if (!destination) throw new Error("DESTINATION_NOT_FOUND")

  const pickupLocation = {
    latitude: pickup.latitude,
    longitude: pickup.longitude,
    addressLine1: "Текущее местоположение",
    addressLine2: "Malik AI",
  }
  const dropoffLocation = {
    latitude: destination.latitude,
    longitude: destination.longitude,
    addressLine1: destination.nickname || "Пункт назначения",
    addressLine2: destination.address,
  }

  const appUrl = new URL("https://m.uber.com/looking")
  appUrl.searchParams.set("client_id", clientId)
  appUrl.searchParams.set("pickup", JSON.stringify(pickupLocation))
  appUrl.searchParams.set("drop[0]", JSON.stringify(dropoffLocation))

  const webUrl = new URL("https://m.uber.com/")
  webUrl.searchParams.set("client_id", clientId)
  webUrl.searchParams.set("pickup", JSON.stringify(pickupLocation))
  webUrl.searchParams.set("drop[0]", JSON.stringify(dropoffLocation))

  return { appUrl: appUrl.toString(), webUrl: webUrl.toString() }
}

export async function POST(request: Request) {
  if (!isSameMalikOrigin(request)) {
    return Response.json({ ok: false, code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403 })
  }

  const clientId = String(process.env.UBER_CLIENT_ID || "").trim()
  if (!clientId) {
    return Response.json({ ok: false, code: "UBER_CLIENT_ID_REQUIRED", message: "UBER_CLIENT_ID ещё не добавлен в Render." }, { status: 503 })
  }

  try {
    const body = await request.json().catch(() => null)
    const pickup = body?.pickup
    const destinationQuery = cleanText(body?.destination, 180)
    const picked = exactDestination(body?.destinationPoint)

    if (!validCoordinates(pickup)) {
      return Response.json({ ok: false, code: "PICKUP_REQUIRED", message: "Не удалось определить точку подачи." }, { status: 400 })
    }
    if (!picked && destinationQuery.length < 3) {
      return Response.json({ ok: false, code: "DESTINATION_REQUIRED", message: "Укажи пункт назначения." }, { status: 400 })
    }

    // Tapped a search result → zero external calls. Free text → geocode once.
    const destination = picked || await geocodeDestination(destinationQuery)
    if (!destination) {
      return Response.json({ ok: false, code: "DESTINATION_NOT_FOUND", message: "Не удалось найти этот адрес. Уточни город, улицу или название места." }, { status: 404 })
    }

    const links = buildUberUrl(clientId, pickup, destination)
    return Response.json({
      ok: true,
      mode: "official-handoff",
      resolvedBy: picked ? "picked" : "geocoder",
      destination,
      ...links,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Сервис поиска адреса отвечает слишком долго. Попробуй ещё раз."
      : "Не удалось подготовить поездку Uber."
    return Response.json({ ok: false, code: "HANDOFF_FAILED", message }, { status: 502 })
  }
}
