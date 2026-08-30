"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  Banknote,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Dumbbell,
  ExternalLink,
  Fuel,
  GraduationCap,
  Hospital,
  Hotel,
  House,
  Landmark,
  Loader2,
  LocateFixed,
  MapPin,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Train,
  Trees,
  Utensils,
  X,
} from "lucide-react"
import { formatDistance, type PlaceKindId } from "@/lib/taxi/place-kind"

/**
 * Malik Taxi — one screen, no page scroll, strictly monochrome.
 *
 * The old flow spent five sequential round trips before a rider saw anything:
 * an LLM parse, a cold geolocation prompt, a geocode, a status check and an
 * estimate. Now the search list carries coordinates, geolocation is warmed the
 * moment the rider touches the input, and picking a result skips both the LLM
 * and the geocoder entirely — the ride is prepared in a single internal call.
 */

type Coordinates = { latitude: number; longitude: number }

type Pickup = Coordinates & { accuracy?: number; at: number }

type TaxiPlace = {
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

type HandoffResponse = {
  ok: boolean
  appUrl: string
  webUrl: string
  destination: {
    latitude: number
    longitude: number
    address: string
    nickname: string
    category?: string
    type?: string
  }
}

type RideOption = {
  productId: string
  displayName: string
  description?: string
  capacity?: number
  fareDisplay: string
  fareValue?: number
  currencyCode?: string
  pickupEstimateMinutes?: number | null
  durationEstimateSeconds?: number | null
  distanceEstimate?: number | null
  distanceUnit?: string
  expiresAt: number
}

type UberStatus = { ok: boolean; configured: boolean; connected: boolean; mode: "sandbox" | "production" }

type ApiError = Error & { code?: string; status?: number }

type PickupState = "idle" | "asking" | "ready" | "denied" | "failed"

type BusyStage = "route" | "prices" | null

const DRAFT_KEY = "malik_taxi_destination_v2"
const RECENT_KEY = "malik_taxi_recent_v1"
const PICKUP_KEY = "malik_taxi_pickup_v1"
const PICKUP_MAX_AGE_MS = 4 * 60 * 1000
const SEARCH_DEBOUNCE_MS = 140
const AGENT_DEBOUNCE_MS = 550
const MAX_RECENT = 5

const UBER_PATH = "M0 7.97v4.958c0 1.867 1.302 3.101 3 3.101.826 0 1.562-.316 2.094-.87v.736H6.27V7.97H5.082v4.888c0 1.257-.85 2.106-1.947 2.106-1.11 0-1.946-.827-1.946-2.106V7.971H0zm7.44 0v7.925h1.13v-.725c.521.532 1.257.86 2.06.86a3.006 3.006 0 0 0 3.034-3.01 3.01 3.01 0 0 0-3.033-3.024 2.86 2.86 0 0 0-2.049.861V7.971H7.439zm9.869 2.038c-1.687 0-2.965 1.37-2.965 3 0 1.72 1.334 3.01 3.066 3.01 1.053 0 1.913-.463 2.49-1.233l-.826-.611c-.43.577-.996.847-1.664.847-.973 0-1.753-.7-1.912-1.64h4.697v-.373c0-1.72-1.222-3-2.886-3zm6.295.068c-.634 0-1.098.294-1.381.758v-.713h-1.131v5.774h1.142V12.61c0-.894.544-1.47 1.291-1.47H24v-1.065h-.396zm-6.319.928c.85 0 1.564.588 1.756 1.47H15.52c.203-.882.916-1.47 1.765-1.47zm-6.732.012c1.086 0 1.98.883 1.98 2.004a1.993 1.993 0 0 1-1.98 2.001A1.989 1.989 0 0 1 8.56 13.02a1.99 1.99 0 0 1 1.992-2.004z"

const KIND_GLYPHS: Record<PlaceKindId, typeof MapPin> = {
  airport: Plane,
  station: Train,
  hotel: Hotel,
  shopping: ShoppingBag,
  restaurant: Utensils,
  cafe: Coffee,
  medical: Hospital,
  education: GraduationCap,
  residential: Building2,
  office: Building2,
  landmark: Landmark,
  sport: Dumbbell,
  fuel: Fuel,
  bank: Banknote,
  park: Trees,
  home: House,
  place: MapPin,
}

/** A conversational query deserves the model; a place name does not. */
function looksConversational(value: string) {
  const text = value.trim()
  if (text.length < 8) return false
  if (/(хочу|поехали|отвез|мне нужно|надо|давай|поеду|доедем|подскажи|как доехать|take me|i want|go to)/i.test(text)) return true
  return text.split(/\s+/).length >= 4
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode — recents are a convenience, never a requirement */
  }
}

function currentPosition(): Promise<Pickup> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(Object.assign(new Error("Браузер не поддерживает геолокацию."), { code: "UNSUPPORTED" }))
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy || 0),
        at: Date.now(),
      }),
      (error) => reject(Object.assign(
        new Error(error.code === error.PERMISSION_DENIED
          ? "Доступ к геолокации закрыт. Разреши его в браузере — точка подачи берётся отсюда."
          : "Не удалось определить местоположение. Попробуй ещё раз."),
        { code: error.code === error.PERMISSION_DENIED ? "DENIED" : "FAILED" },
      )),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  })
}

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false) {
    const error = new Error(String(data?.message || data?.code || `HTTP ${response.status}`)) as ApiError
    error.code = String(data?.code || "")
    error.status = response.status
    throw error
  }
  return data
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return ""
  return `${Math.max(1, Math.round(seconds / 60))} мин`
}

function UberLogo({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg role="img" aria-label="Uber" viewBox="0 7.55 24 8.9" preserveAspectRatio="xMidYMid meet" className={className} fill="currentColor">
      <path d={UBER_PATH} />
    </svg>
  )
}

/**
 * The only colour on the page. A real logo when the place has a website,
 * a monochrome category glyph when it does not.
 */
function PlaceIcon({ place, large = false }: { place: Pick<TaxiPlace, "iconUrl" | "kind">; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [place.iconUrl])

  const Glyph = KIND_GLYPHS[place.kind] || MapPin
  const box = large ? "h-12 w-12 rounded-[16px]" : "h-11 w-11 rounded-[14px]"
  const showLogo = Boolean(place.iconUrl) && !failed

  return (
    <span className={`malik-taxi-icon grid shrink-0 place-items-center overflow-hidden border border-white/[0.10] bg-white/[0.05] text-white ${box}`}>
      {showLogo ? (
        <img
          src={place.iconUrl}
          alt=""
          data-brand-icon="true"
          loading="lazy"
          onError={() => setFailed(true)}
          className={`object-contain ${large ? "h-7 w-7" : "h-6 w-6"}`}
        />
      ) : (
        <Glyph className={large ? "h-6 w-6" : "h-[19px] w-[19px]"} strokeWidth={1.7} />
      )}
    </span>
  )
}

function Row({
  icon,
  title,
  subtitle,
  meta,
  active,
  onPick,
  testId,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  meta?: string
  active?: boolean
  onPick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={Boolean(active)}
      data-testid={testId}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={`flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors ${
        active ? "bg-white text-black" : "text-white hover:bg-white/[0.06]"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium tracking-[-0.01em]">{title}</span>
        {subtitle ? (
          <span className={`mt-0.5 block truncate text-[12.5px] ${active ? "text-black/55" : "text-white/42"}`}>{subtitle}</span>
        ) : null}
      </span>
      {meta ? (
        <span className={`shrink-0 text-[12px] tabular-nums ${active ? "text-black/55" : "text-white/35"}`}>{meta}</span>
      ) : null}
    </button>
  )
}

export function UberRealRideV1() {
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<TaxiPlace | null>(null)
  const [places, setPlaces] = useState<TaxiPlace[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [recents, setRecents] = useState<TaxiPlace[]>([])

  const [pickup, setPickup] = useState<Pickup | null>(null)
  const [pickupState, setPickupState] = useState<PickupState>("idle")

  const [agentGuess, setAgentGuess] = useState("")
  const [busyStage, setBusyStage] = useState<BusyStage>(null)
  const [error, setError] = useState("")
  const [prepared, setPrepared] = useState<HandoffResponse | null>(null)
  const [rideOptions, setRideOptions] = useState<RideOption[]>([])
  const [priceNote, setPriceNote] = useState("")
  const [uberStatus, setUberStatus] = useState<UberStatus | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const searchCache = useRef(new Map<string, TaxiPlace[]>())
  const pickupRequest = useRef<Promise<Pickup> | null>(null)

  const trimmed = query.replace(/\s+/g, " ").trim()

  // ---------------------------------------------------------------- bootstrap

  useEffect(() => {
    setRecents(readJson<TaxiPlace[]>(RECENT_KEY, []).slice(0, MAX_RECENT))
    try {
      const draft = window.localStorage.getItem(DRAFT_KEY)
      if (draft) setQuery(draft)
    } catch {}

    const cachedPickup = readJson<Pickup | null>(PICKUP_KEY, null)
    if (cachedPickup && Date.now() - cachedPickup.at < PICKUP_MAX_AGE_MS) {
      setPickup(cachedPickup)
      setPickupState("ready")
    }

    // Status is needed only to decide whether fares can be shown. Fetching it
    // here keeps it off the critical path of the ride button.
    void jsonFetch("/api/taxi/uber/status")
      .then((data) => setUberStatus(data as UberStatus))
      .catch(() => setUberStatus(null))
  }, [])

  const ensurePickup = useCallback(async (force = false) => {
    if (!force && pickup && Date.now() - pickup.at < PICKUP_MAX_AGE_MS) return pickup
    if (pickupRequest.current) return pickupRequest.current

    setPickupState("asking")
    const request = currentPosition()
    pickupRequest.current = request

    try {
      const position = await request
      setPickup(position)
      setPickupState("ready")
      writeJson(PICKUP_KEY, position)
      return position
    } catch (caught) {
      const code = (caught as { code?: string })?.code
      setPickupState(code === "DENIED" ? "denied" : "failed")
      throw caught
    } finally {
      pickupRequest.current = null
    }
  }, [pickup])

  // ------------------------------------------------------------------ search

  useEffect(() => {
    if (trimmed.length < 2 || picked) {
      setPlaces([])
      setSearching(false)
      return
    }

    const key = `${trimmed.toLocaleLowerCase("ru")}|${pickup ? `${pickup.latitude.toFixed(1)},${pickup.longitude.toFixed(1)}` : "global"}`
    const hit = searchCache.current.get(key)
    if (hit) {
      setPlaces(hit)
      setSearching(false)
      setActiveIndex(-1)
      return
    }

    const controller = new AbortController()
    setSearching(true)

    const timer = window.setTimeout(async () => {
      try {
        const url = new URL("/api/taxi/places", window.location.origin)
        url.searchParams.set("q", trimmed)
        if (pickup) {
          url.searchParams.set("lat", String(pickup.latitude))
          url.searchParams.set("lon", String(pickup.longitude))
        }
        const response = await fetch(url.toString(), { cache: "no-store", signal: controller.signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(String(data?.message || "PLACE_SEARCH_FAILED"))

        const found = Array.isArray(data?.places) ? (data.places as TaxiPlace[]) : []
        searchCache.current.set(key, found)
        if (searchCache.current.size > 60) {
          const oldest = searchCache.current.keys().next().value
          if (oldest !== undefined) searchCache.current.delete(oldest)
        }
        setPlaces(found)
        setActiveIndex(-1)
      } catch (caught) {
        if ((caught as Error)?.name !== "AbortError") setPlaces([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [picked, pickup, trimmed])

  // MalikLLM runs beside the search, never in front of it. Its reading of a
  // sentence appears as a pinned row the rider can tap; the list never waits.
  useEffect(() => {
    if (picked || !looksConversational(trimmed)) {
      setAgentGuess("")
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/taxi/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed }),
          signal: controller.signal,
          cache: "no-store",
        })
        const data = await response.json().catch(() => ({}))
        const guess = String(data?.destination || "").trim()
        setAgentGuess(guess && guess.toLocaleLowerCase("ru") !== trimmed.toLocaleLowerCase("ru") ? guess : "")
      } catch {
        setAgentGuess("")
      }
    }, AGENT_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [picked, trimmed])

  // ------------------------------------------------------------------ actions

  const choosePlace = (place: TaxiPlace) => {
    setPicked(place)
    setQuery(place.label)
    setPlaces([])
    setActiveIndex(-1)
    setError("")
    try {
      window.localStorage.setItem(DRAFT_KEY, place.label)
    } catch {}
    void ensurePickup().catch(() => {})
  }

  const clearPick = () => {
    setPicked(null)
    setQuery("")
    setPlaces([])
    setAgentGuess("")
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  const rememberRecent = (place: TaxiPlace) => {
    const next = [place, ...recents.filter((item) => item.id !== place.id)].slice(0, MAX_RECENT)
    setRecents(next)
    writeJson(RECENT_KEY, next)
  }

  const prepareRide = async () => {
    if (busyStage) return
    if (!picked && trimmed.length < 3) {
      setError("Напиши, куда ехать, или выбери место из списка.")
      inputRef.current?.focus()
      return
    }

    setError("")
    setRideOptions([])
    setPriceNote("")

    try {
      setBusyStage("route")
      const position = await ensurePickup()

      const handoff = await jsonFetch("/api/taxi/uber/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup: { latitude: position.latitude, longitude: position.longitude },
          // A tapped result carries exact coordinates: no LLM, no second geocode.
          destinationPoint: picked
            ? {
                latitude: picked.latitude,
                longitude: picked.longitude,
                address: picked.address,
                nickname: picked.label,
                category: picked.category,
                type: picked.type,
              }
            : undefined,
          destination: picked ? picked.label : agentGuess || trimmed,
        }),
      }) as HandoffResponse

      setPrepared(handoff)
      if (picked) rememberRecent(picked)

      if (!uberStatus?.configured || !uberStatus.connected) {
        setPriceNote("Подключи Uber, чтобы видеть реальные тарифы прямо здесь. Маршрут уже готов и открывается в Uber без этого.")
        return
      }

      setBusyStage("prices")
      try {
        const estimate = await jsonFetch("/api/taxi/uber/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: { latitude: position.latitude, longitude: position.longitude },
            destination: {
              kind: "coordinates",
              latitude: handoff.destination.latitude,
              longitude: handoff.destination.longitude,
              nickname: handoff.destination.nickname,
              address: handoff.destination.address,
            },
          }),
        }) as { ok: boolean; options: RideOption[] }

        const options = Array.isArray(estimate.options) ? estimate.options : []
        setRideOptions(options)
        setPriceNote(options.length
          ? "Цены и время подачи — напрямую от Uber."
          : "Uber не вернул тарифы. Маршрут можно открыть без сравнения цен.")
      } catch (caught) {
        const apiError = caught as ApiError
        if (apiError.code === "UBER_NOT_CONNECTED" || apiError.code === "UBER_RECONNECT_REQUIRED") {
          setUberStatus((current) => (current ? { ...current, connected: false } : current))
        }
        setPriceNote(apiError.message || "Тарифы недоступны. Маршрут всё равно открывается в Uber.")
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось подготовить поездку.")
    } finally {
      setBusyStage(null)
    }
  }

  const openUber = (productId?: string, preferApp = true) => {
    if (!prepared) return
    const target = new URL(preferApp ? prepared.appUrl : prepared.webUrl)
    if (productId) target.searchParams.set("product_id", productId)
    window.location.assign(target.toString())
  }

  const resetRoute = () => {
    setPrepared(null)
    setRideOptions([])
    setPriceNote("")
    setBusyStage(null)
  }

  // --------------------------------------------------------------- keyboard

  const listItems = useMemo(() => (trimmed.length >= 2 && !picked ? places : recents), [picked, places, recents, trimmed])

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!listItems.length) return
      event.preventDefault()
      setActiveIndex((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1
        if (next < 0) return listItems.length - 1
        if (next >= listItems.length) return 0
        return next
      })
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setActiveIndex(-1)
      setPlaces([])
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      if (activeIndex >= 0 && listItems[activeIndex]) {
        choosePlace(listItems[activeIndex])
        return
      }
      void prepareRide()
    }
  }

  // ------------------------------------------------------------------ render

  const pickupLabel = (() => {
    if (pickupState === "ready" && pickup) {
      return pickup.accuracy ? `Точка подачи готова · ±${pickup.accuracy} м` : "Точка подачи готова"
    }
    if (pickupState === "asking") return "Определяю точку подачи…"
    if (pickupState === "denied") return "Нет доступа к геолокации"
    if (pickupState === "failed") return "Не удалось определить местоположение"
    return "Точка подачи — твоя геолокация"
  })()

  const canSubmit = Boolean(picked || trimmed.length >= 3)
  const compact = trimmed.length > 0 || Boolean(picked)

  return (
    <main
      className="malik-taxi-root flex h-[100dvh] flex-col overflow-hidden bg-black font-sans text-white"
      style={{ WebkitTapHighlightColor: "transparent", colorScheme: "dark" }}
    >
      <style jsx global>{`
        /* Strictly monochrome. Browsers paint selection, carets, focus rings and
           autofill blue by default — every one of them is overridden here. */
        .malik-taxi-root ::selection { background: #fff; color: #000; }
        .malik-taxi-root { accent-color: #fff; }
        .malik-taxi-root input,
        .malik-taxi-root textarea { caret-color: #fff; }
        .malik-taxi-root *:focus { outline: none; }
        /* Only controls get a keyboard ring. The address field lives inside a
           container that already lights up on focus, so a second box around the
           input itself just reads as a stray border. */
        .malik-taxi-root button:focus-visible,
        .malik-taxi-root a:focus-visible {
          outline: 2px solid rgba(255,255,255,.72);
          outline-offset: 2px;
          border-radius: 16px;
        }
        .malik-taxi-root input:focus-visible { outline: none; }
        .malik-taxi-root input:-webkit-autofill,
        .malik-taxi-root input:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff;
          -webkit-box-shadow: 0 0 0 1000px #000 inset;
          caret-color: #fff;
        }
        /* The global anti-blue sweep paints every [role="option"][aria-selected]
           grey via an id selector. Keyboard highlight here is a full white/black
           inversion, so it has to out-specify that rule rather than fight it. */
        #malik-root .malik-taxi-root [role="option"][aria-selected="true"],
        .malik-taxi-root [role="option"][aria-selected="true"] {
          background-color: #ffffff !important;
          color: #000000 !important;
          border-color: transparent !important;
        }
        /* The tile has to invert with the row, or a white-on-white glyph vanishes.
           A real logo is an <img> and keeps its own colours either way. */
        #malik-root .malik-taxi-root [role="option"][aria-selected="true"] .malik-taxi-icon,
        .malik-taxi-root [role="option"][aria-selected="true"] .malik-taxi-icon {
          background-color: rgba(0,0,0,.07) !important;
          border-color: rgba(0,0,0,.14) !important;
          color: #000000 !important;
        }

        .malik-taxi-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
        .malik-taxi-scroll::-webkit-scrollbar { width: 6px; }
        .malik-taxi-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 999px; }
        .malik-taxi-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <header className="shrink-0 border-b border-white/[0.07]">
        <div className="mx-auto flex h-14 w-full max-w-[560px] items-center justify-between px-4">
          <button
            type="button"
            onClick={() => window.location.assign("/dashboard")}
            className="grid h-10 w-10 place-items-center rounded-full text-white transition hover:bg-white/[0.08] active:bg-white/[0.14]"
            aria-label="Назад"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-[13.5px] font-semibold tracking-[-0.02em]">Taxi</span>
            <span className="text-white/20">/</span>
            <UberLogo className="h-[15px] w-auto" />
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-full text-white/45" title="Финальное подтверждение — в Uber">
            <ShieldCheck className="h-[17px] w-[17px]" />
          </span>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 px-4 pt-3">
          <div className="mx-auto flex w-full max-w-[560px] items-start gap-3 rounded-[16px] border border-white/[0.14] bg-[#0b0b0b] px-4 py-3 text-[12.5px] leading-5">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/45 hover:bg-white/10 hover:text-white" aria-label="Закрыть">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile fills the screen; desktop centres a calm 560px column instead of
          stranding the button at the bottom of a mostly empty page. */}
      {!prepared ? (
        <div className="mx-auto flex w-full min-h-0 max-w-[560px] flex-1 flex-col px-4 sm:my-auto sm:flex-initial sm:max-h-full">
          {/* The hero yields its space to the results the moment typing starts,
              so the list never has to push the page into a scroll. */}
          <div
            className={`shrink-0 overflow-hidden transition-all duration-300 ${
              compact ? "max-h-0 opacity-0" : "max-h-[220px] opacity-100"
            }`}
          >
            <div className="pb-6 pt-9">
              <div className="mb-5 inline-flex h-14 w-28 items-center justify-center rounded-[18px] border border-white/[0.12] bg-[#070707]">
                <UberLogo className="h-[26px] w-auto" />
              </div>
              <h1 className="text-[38px] font-semibold leading-[0.95] tracking-[-0.055em] sm:text-[46px]">Куда поедем?</h1>
              <p className="mt-3 max-w-[460px] text-[13.5px] leading-6 text-white/45">
                Напиши название места или обычную фразу. Malik найдёт точку, подтвердит подачу и передаст маршрут в Uber.
              </p>
            </div>
          </div>

          <div className={`shrink-0 ${compact ? "pt-5" : ""}`}>
            <button
              type="button"
              onClick={() => void ensurePickup(true).catch(() => {})}
              disabled={pickupState === "asking"}
              className="mb-2.5 flex w-full items-center gap-3 rounded-[18px] border border-white/[0.09] bg-[#080808] px-4 py-3 text-left transition hover:bg-[#0e0e0e] disabled:cursor-wait"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-black">
                {pickupState === "asking" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : pickupState === "ready" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <LocateFixed className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">Откуда</span>
                <span className="mt-0.5 block truncate text-[13.5px] text-white/85">{pickupLabel}</span>
              </span>
              {pickupState !== "ready" && pickupState !== "asking" ? (
                <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-black">Разрешить</span>
              ) : null}
            </button>

            <div className="flex items-center gap-3 rounded-[20px] border border-white/[0.12] bg-[#0b0b0c] px-4 py-3.5 transition focus-within:border-white/30">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black">
                <MapPin className="h-4 w-4" />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPicked(null)
                }}
                onFocus={() => { void ensurePickup().catch(() => {}) }}
                onKeyDown={onKeyDown}
                enterKeyHint="go"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Куда едем"
                placeholder="Dostyk Plaza, аэропорт, улица…"
                className="min-w-0 flex-1 bg-transparent text-[17px] font-medium leading-6 tracking-[-0.02em] text-white outline-none placeholder:font-normal placeholder:text-white/25"
              />
              {picked || query ? (
                <button type="button" onClick={clearPick} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white" aria-label="Очистить">
                  <X className="h-4 w-4" />
                </button>
              ) : searching ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/40" />
              ) : null}
            </div>
          </div>

          {/* Only this region scrolls. The page itself never does. */}
          <div className="malik-taxi-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2 sm:max-h-[42vh] sm:flex-initial" role="listbox" aria-label="Места">
            {picked ? (
              <div className="mt-1 flex items-center gap-3 rounded-[18px] border border-white/[0.12] bg-[#0a0a0a] px-3 py-3">
                <PlaceIcon place={picked} large />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold tracking-[-0.02em]">{picked.label}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-white/45">{picked.short || picked.address}</span>
                </span>
                {picked.distanceKm != null ? (
                  <span className="shrink-0 text-[12px] tabular-nums text-white/35">{formatDistance(picked.distanceKm)}</span>
                ) : null}
              </div>
            ) : (
              <>
                {agentGuess ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setQuery(agentGuess)}
                    className="mb-1 flex w-full items-center gap-3 rounded-[18px] border border-white/[0.10] bg-[#0a0a0a] px-3 py-3 text-left transition hover:bg-[#101010]"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/[0.10] bg-black">
                      <Sparkles className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">Malik понял так</span>
                      <span className="mt-0.5 block truncate text-[15px] font-medium">{agentGuess}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                  </button>
                ) : null}

                {trimmed.length < 2 && recents.length ? (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/30">Недавние</p>
                ) : null}

                {listItems.map((place, index) => (
                  <Row
                    key={place.id}
                    testId="taxi-place-row"
                    icon={<PlaceIcon place={place} />}
                    title={place.label}
                    subtitle={place.short || place.address}
                    meta={formatDistance(place.distanceKm)}
                    active={index === activeIndex}
                    onPick={() => choosePlace(place)}
                  />
                ))}

                {trimmed.length >= 2 && !listItems.length ? (
                  <p className="px-3 py-6 text-center text-[13px] text-white/35">
                    {searching ? "Ищу места…" : "Ничего не нашлось. Добавь город или уточни название."}
                  </p>
                ) : null}

                {trimmed.length < 2 && !recents.length ? (
                  <p className="px-3 py-6 text-center text-[13px] leading-6 text-white/30">
                    Начни печатать — места появятся здесь с их логотипами и расстоянием от тебя.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="shrink-0 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
            <button
              type="button"
              onClick={() => void prepareRide()}
              disabled={Boolean(busyStage) || !canSubmit}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-white text-[15px] font-semibold text-black transition hover:bg-white/90 active:scale-[0.995] disabled:bg-white/15 disabled:text-white/40"
            >
              {busyStage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busyStage === "route" ? "Готовлю маршрут…" : busyStage === "prices" ? "Смотрю тарифы…" : "Продолжить в Uber"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full min-h-0 max-w-[560px] flex-1 flex-col px-4" data-testid="taxi-route-result">
          <div className="shrink-0 pt-5">
            <div className="flex items-center gap-3 rounded-[20px] border border-white/[0.10] bg-[#090909] px-4 py-4">
              <PlaceIcon
                place={{
                  iconUrl: picked?.iconUrl || "",
                  kind: (picked?.kind || "place") as PlaceKindId,
                }}
                large
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[19px] font-semibold tracking-[-0.03em]">
                  {prepared.destination.nickname || "Маршрут"}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-white/45">{prepared.destination.address}</span>
              </span>
              <button type="button" onClick={resetRoute} className="shrink-0 rounded-full border border-white/[0.12] px-3 py-1.5 text-[11.5px] font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white">
                Изменить
              </button>
            </div>

            <div className="mt-2.5 flex items-center gap-3 rounded-[20px] border border-white/[0.08] bg-[#070707] px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-black">
                <LocateFixed className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-white/70">
                Подача от твоей геолокации{pickup?.accuracy ? ` · ±${pickup.accuracy} м` : ""}
              </span>
            </div>

            <p className="px-1 pb-1 pt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/30">Тарифы Uber</p>
          </div>

          <div className="malik-taxi-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {busyStage === "prices" ? (
              <div className="flex min-h-28 items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] bg-[#080808] text-[13px] text-white/45">
                <Loader2 className="h-4 w-4 animate-spin" /> Получаю цены от Uber…
              </div>
            ) : rideOptions.length ? (
              <div className="space-y-2">
                {rideOptions.map((option, index) => (
                  <button
                    key={option.productId}
                    type="button"
                    onClick={() => openUber(option.productId, true)}
                    className="flex w-full items-center gap-4 rounded-[18px] border border-white/[0.09] bg-[#0a0a0a] px-4 py-4 text-left transition hover:border-white/25 hover:bg-[#101010] active:scale-[0.995]"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/[0.10] bg-black">
                      <UberLogo className="h-4 w-auto" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">{option.displayName}</span>
                        {index === 0 ? (
                          <span className="shrink-0 rounded-full border border-white/[0.14] px-2 py-0.5 text-[9.5px] font-medium text-white/55">Выбор Malik</span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-white/38">
                        {option.pickupEstimateMinutes != null ? (
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> подача ~{option.pickupEstimateMinutes} мин</span>
                        ) : null}
                        {formatDuration(option.durationEstimateSeconds) ? <span>в пути ~{formatDuration(option.durationEstimateSeconds)}</span> : null}
                        {option.capacity ? <span>до {option.capacity} мест</span> : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-[17px] font-semibold tabular-nums tracking-[-0.03em]">{option.fareDisplay}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-white/[0.09] bg-[#0a0a0a] px-4 py-5">
                <p className="text-[13.5px] leading-6 text-white/55">{priceNote || "Проверяю доступные варианты…"}</p>
                {uberStatus && !uberStatus.connected ? (
                  <button
                    type="button"
                    onClick={() => window.location.assign("/api/taxi/uber/connect")}
                    className="mt-4 flex h-11 w-full items-center justify-center rounded-[14px] bg-white text-[13.5px] font-semibold text-black transition hover:bg-white/90"
                  >
                    Подключить Uber
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
            <button
              type="button"
              onClick={() => openUber(undefined, true)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-white text-[15px] font-semibold text-black transition hover:bg-white/90 active:scale-[0.995]"
            >
              Открыть Uber <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => openUber(undefined, false)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.10] text-[13px] font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
            >
              Открыть в браузере <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default UberRealRideV1
