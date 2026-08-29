import { isSameMalikOrigin } from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
}

function cleanText(value: unknown, max = 260) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

function labelFor(place: NominatimPlace) {
  const details = place.namedetails || {}
  return cleanText(
    details["name:ru"] || details["name:kk"] || place.name || place.display_name?.split(",")[0] || "Место",
    100,
  )
}

export async function GET(request: Request) {
  if (!isSameMalikOrigin(request)) {
    return Response.json({ ok: false, code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403 })
  }

  const query = cleanText(new URL(request.url).searchParams.get("q"), 180)
  if (query.length < 3) {
    return Response.json({ ok: true, places: [] }, { headers: { "Cache-Control": "no-store" } })
  }

  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", "6")
  url.searchParams.set("q", query)
  url.searchParams.set("namedetails", "1")
  url.searchParams.set("addressdetails", "1")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

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
    const places = (Array.isArray(payload) ? payload : []).map((place, index) => ({
      id: cleanText(place.place_id || `${index}-${place.lat}-${place.lon}`, 80),
      label: labelFor(place),
      address: cleanText(place.display_name || place.name, 280),
      category: cleanText(place.category, 48),
      type: cleanText(place.type || place.addresstype, 48),
    })).filter((place) => Boolean(place.address))

    return Response.json({ ok: true, places }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Поиск адреса отвечает слишком долго."
      : "Не удалось загрузить варианты адреса."
    return Response.json({ ok: false, code: "PLACE_SEARCH_FAILED", message }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
