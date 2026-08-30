/**
 * One classifier for destination places, shared by the search API and the UI.
 *
 * Two things come out of it: a category (so every result has a meaningful glyph
 * even with no logo) and the real brand icon URL when the place has a website.
 * A mall, an airport and a coffee shop should not look identical in the list —
 * recognising a destination by its logo is most of what makes picking one fast.
 */

export type PlaceKindId =
  | "airport"
  | "station"
  | "hotel"
  | "shopping"
  | "restaurant"
  | "cafe"
  | "medical"
  | "education"
  | "residential"
  | "office"
  | "landmark"
  | "sport"
  | "fuel"
  | "bank"
  | "park"
  | "home"
  | "place"

export const PLACE_KIND_LABELS: Record<PlaceKindId, string> = {
  airport: "Аэропорт",
  station: "Вокзал или станция",
  hotel: "Отель",
  shopping: "Магазин или ТРЦ",
  restaurant: "Ресторан",
  cafe: "Кофейня",
  medical: "Медицина",
  education: "Образование",
  residential: "Жилой дом",
  office: "Офис",
  landmark: "Достопримечательность",
  sport: "Спорт",
  fuel: "Заправка",
  bank: "Банк",
  park: "Парк",
  home: "Дом",
  place: "Место",
}

/**
 * `\b` is defined over [A-Za-z0-9_], so it never matches next to a Cyrillic
 * letter: /азс\b/ silently fails on "АЗС Гелиос" and /\bпарк\b/ on "Парк
 * Первого Президента". These are the equivalent boundaries that do work, and
 * they still keep "Паркинг" out of the park category.
 */
const B = "(?:^|[^\\p{L}\\p{N}])"
const E = "(?![\\p{L}\\p{N}])"
const word = (value: string) => `${B}${value}${E}`

const RULES: [PlaceKindId, RegExp][] = [
  ["airport", /аэропорт|airport|әуежай|aerodrome|терминал/iu],
  ["station", /вокзал|станци|station|railway|train|metro|метро|автовокзал|bus_stop|автостанц/iu],
  ["hotel", /отель|hotel|гостиниц|hostel|apartment_hotel|resort/iu],
  ["shopping", new RegExp(`трц|${word("тц")}|торгов|shopping|mall|supermarket|магазин|market|department_store|convenience|retail`, "iu")],
  ["cafe", /кофейн|coffee|cafe|кафе|bakery|пекарн|чайхан/iu],
  ["restaurant", new RegExp(`ресторан|restaurant|food|${word("бар")}|${word("pub")}|пицц|столов|fast_food|dining`, "iu")],
  ["medical", /больниц|клиник|hospital|clinic|medical|аптек|pharmacy|doctors|поликлин/iu],
  ["education", /школ|университет|college|school|education|академ|институт|kindergarten|детск.{0,4}сад|library|библиотек/iu],
  ["sport", /стадион|stadium|фитнес|fitness|gym|бассейн|sports_centre|спорт|arena/iu],
  ["fuel", new RegExp(`заправ|fuel|gas_station|${word("азс")}|charging_station`, "iu")],
  ["bank", new RegExp(`банк|${word("bank")}|${word("atm")}|банкомат`, "iu")],
  ["park", new RegExp(`${word("парк")}|${word("park")}|garden|сквер|nature_reserve|набережн`, "iu")],
  ["landmark", /музей|museum|театр|theatre|monument|landmark|достопримеч|мечет|mosque|церк|church|cinema|кинотеатр|attraction/iu],
  ["office", new RegExp(`офис|office|business|коворкинг|coworking|${word("бц")}|бизнес.?центр`, "iu")],
  ["residential", new RegExp(`${word("жк")}|жилой|residential|apartments?|квартир|общежит|dormitory|yard|house_number`, "iu")],
  ["home", new RegExp(`${word("дом")}|${word("house")}|коттедж|detached|villa`, "iu")],
]

export function detectPlaceKind(...parts: (string | undefined)[]): PlaceKindId {
  const text = parts.filter(Boolean).join(" ")
  if (!text.trim()) return "place"
  for (const [kind, pattern] of RULES) {
    if (pattern.test(text)) return kind
  }
  return "place"
}

function hostFrom(website: string) {
  const raw = String(website || "").trim()
  if (!raw) return ""
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^www\./i, "")
    // A bare TLD or an IP is never a brand.
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) && !/^\d+(\.\d+){3}$/.test(host) ? host : ""
  } catch {
    return ""
  }
}

/**
 * Real brand icon for a place, or "" when it has no website to take one from.
 * Same favicon service the chat already uses for web sources, so there is one
 * icon pipeline in the product rather than two.
 */
export function placeIconUrl(website?: string, size = 128) {
  const host = hostFrom(website || "")
  if (!host) return ""
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${host}`)}&sz=${size}`
}

/** Great-circle distance in km. Used to sort and to show "2.4 км" next to a result. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadius = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(km?: number | null) {
  if (typeof km !== "number" || !Number.isFinite(km) || km < 0) return ""
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} м`
  if (km < 10) return `${km.toFixed(1)} км`
  return `${Math.round(km)} км`
}
