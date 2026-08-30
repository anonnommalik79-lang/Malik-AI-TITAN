import { detectPlaceKind, distanceKm, placeIconUrl, type PlaceKindId } from "@/lib/taxi/place-kind"
import { isSameMalikOrigin } from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Destination search for Malik Taxi.
 *
 * Three things make this fast enough to type against:
 *
 *  - results are biased to the rider's own position, so "Достык" finds the mall
 *    two kilometres away instead of a street on another continent;
 *  - every answer is cached in memory for a minute, so backspacing and retyping
 *    costs nothing and the upstream geocoder is not hammered;
 *  - coordinates come back with each result, which lets the client skip BOTH the
 *    LLM parse and the second geocode when the rider picks from the list.
 */

const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 400
const UPSTREAM_TIMEOUT_MS = 6000
const SEARCH_LIMIT = 8
// ~65 km box around the rider. Preferred, not enforced: a far destination is
// still findable, it just ranks below nearby ones.
const BIAS_DEGREES = 0.6

type NominatimPlace = {
  place_id?: number | string
  lat?: string
  lon?: string
  display_name?: string
  name?: string
  category?: string
  type?: string
  addresstype?: string
  namedetails?: Record<string, string>
  extratags?: Record<string, string>
  address?: Record<string, string>
}

export type TaxiPlace = {
  id: string
  label: string
  address: string
  short: string
  category: string
  type: string
  kind: PlaceKindId
  latitude: number
  longitude: number
  iconUrl: string
  distanceKm: number | null
}

type CacheEntry = { at: number; places: TaxiPlace[] }

type PlacesGlobal = typeof globalThis & { __malikTaxiPlaceCache?: Map<string, CacheEntry> }

function cache() {
  const scope = globalThis as PlacesGlobal
  if (!scope.__malikTaxiPlaceCache) scope.__malikTaxiPlaceCache = new Map()
  return scope.__malikTaxiPlaceCache
}

function readCache(key: string) {
  const entry = cache().get(key)
  if (!entry) return null
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache().delete(key)
    return null
  }
  return entry.places
}

function writeCache(key: string, places: TaxiPlace[]) {
  const store = cache()
  store.set(key, { at: Date.now(), places })
  while (store.size > CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

function cleanText(value: unknown, max = 260) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

function coordinate(value: string | null, limit: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null
}

function labelFor(place: NominatimPlace) {
  const details = place.namedetails || {}
  const address = place.address || {}
  const primary =
    details["name:ru"] ||
    details["name:kk"] ||
    place.name ||
    address.amenity ||
    address.shop ||
    address.building ||
    place.display_name?.split(",")[0]
  return cleanText(primary || "Место", 90)
}

/**
 * Nominatim's display_name is a 280-character comma chain. The list needs a
 * short second line a human can scan, so build one from the useful components.
 */
function shortAddress(place: NominatimPlace) {
  const address = place.address || {}
  const street = address.road || address.pedestrian || address.footway || ""
  const number = address.house_number || ""
  const area = address.suburb || address.city_district || address.district || address.neighbourhood || ""
  const city = address.city || address.town || address.village || address.municipality || address.county || ""

  const line = [
    [street, number].filter(Boolean).join(" "),
    area,
    city,
  ].filter(Boolean)

  const unique = line.filter((part, index) => line.indexOf(part) === index)
  if (unique.length) return cleanText(unique.join(", "), 120)

  // No structured address: fall back to the tail of display_name, minus the
  // part already shown as the title.
  const parts = cleanText(place.display_name, 260).split(",").map((part) => part.trim()).filter(Boolean)
  return cleanText(parts.slice(1, 4).join(", "), 120)
}

function websiteOf(place: NominatimPlace) {
  const tags = place.extratags || {}
  return (
    tags.website ||
    tags["contact:website"] ||
    tags.url ||
    tags["brand:website"] ||
    tags["operator:website"] ||
    ""
  )
}

export async function GET(request: Request) {
  if (!isSameMalikOrigin(request)) {
    return Response.json({ ok: false, code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403 })
  }

  const params = new URL(request.url).searchParams
  const query = cleanText(params.get("q"), 180)
  const latitude = coordinate(params.get("lat"), 90)
  const longitude = coordinate(params.get("lon"), 180)

  if (query.length < 2) {
    return Response.json({ ok: true, places: [] }, { headers: { "Cache-Control": "no-store" } })
  }

  // Bias key is coarse on purpose: everyone in the same neighbourhood shares a
  // cache entry instead of each rider warming their own.
  const biasKey = latitude != null && longitude != null
    ? `${latitude.toFixed(1)},${longitude.toFixed(1)}`
    : "global"
  const cacheKey = `${query.toLocaleLowerCase("ru")}|${biasKey}`

  const cached = readCache(cacheKey)
  if (cached) {
    return Response.json(
      { ok: true, places: cached, cached: true },
      { headers: { "Cache-Control": "private, max-age=30" } },
    )
  }

  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", String(SEARCH_LIMIT))
  url.searchParams.set("q", query)
  url.searchParams.set("namedetails", "1")
  url.searchParams.set("addressdetails", "1")
  url.searchParams.set("extratags", "1")
  if (latitude != null && longitude != null) {
    url.searchParams.set(
      "viewbox",
      [
        longitude - BIAS_DEGREES,
        latitude + BIAS_DEGREES,
        longitude + BIAS_DEGREES,
        latitude - BIAS_DEGREES,
      ].join(","),
    )
    url.searchParams.set("bounded", "0")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "ru,kk;q=0.9,en;q=0.7",
        "User-Agent": "Malik-AI-Taxi/1.0 (+https://malikaiworld.world)",
      },
    })
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`)

    const payload = await response.json().catch(() => []) as NominatimPlace[]
    const rider = latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null

    const places: TaxiPlace[] = (Array.isArray(payload) ? payload : [])
      .map((place, index): TaxiPlace | null => {
        const lat = Number(place.lat)
        const lon = Number(place.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

        const label = labelFor(place)
        return {
          id: cleanText(place.place_id || `${index}-${lat}-${lon}`, 80),
          label,
          address: cleanText(place.display_name || place.name, 280),
          short: shortAddress(place),
          category: cleanText(place.category, 48),
          type: cleanText(place.type || place.addresstype, 48),
          kind: detectPlaceKind(label, place.category, place.type, place.addresstype, place.display_name),
          latitude: lat,
          longitude: lon,
          iconUrl: placeIconUrl(websiteOf(place)),
          distanceKm: rider ? Number(distanceKm(rider, { lat, lon }).toFixed(2)) : null,
        } satisfies TaxiPlace
      })
      .filter((place): place is TaxiPlace => Boolean(place?.address))

    writeCache(cacheKey, places)
    return Response.json(
      { ok: true, places },
      { headers: { "Cache-Control": "private, max-age=30" } },
    )
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Поиск адреса отвечает слишком долго."
      : "Не удалось загрузить варианты адреса."
    return Response.json({ ok: false, code: "PLACE_SEARCH_FAILED", message }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
