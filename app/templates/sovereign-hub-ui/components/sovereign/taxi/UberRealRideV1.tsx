"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  Coffee,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Hospital,
  Hotel,
  House,
  Landmark,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Plane,
  Route,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
} from "lucide-react"

type Coordinates = { latitude: number; longitude: number }

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

type PlaceSuggestion = {
  id: string
  label: string
  address: string
  category: string
  type: string
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

type UberStatus = {
  ok: boolean
  configured: boolean
  connected: boolean
  mode: "sandbox" | "production"
}

type AgentResponse = {
  ok: boolean
  destination: string
  fallback?: boolean
  model?: {
    id: string
    label: string
    description: string
  }
}

type ApiError = Error & { code?: string; status?: number }

type BusyStage = "agent" | "location" | "route" | "prices" | null

const DRAFT_KEY = "malik_taxi_destination_v2"
const UBER_PATH = "M0 7.97v4.958c0 1.867 1.302 3.101 3 3.101.826 0 1.562-.316 2.094-.87v.736H6.27V7.97H5.082v4.888c0 1.257-.85 2.106-1.947 2.106-1.11 0-1.946-.827-1.946-2.106V7.971H0zm7.44 0v7.925h1.13v-.725c.521.532 1.257.86 2.06.86a3.006 3.006 0 0 0 3.034-3.01 3.01 3.01 0 0 0-3.033-3.024 2.86 2.86 0 0 0-2.049.861V7.971H7.439zm9.869 2.038c-1.687 0-2.965 1.37-2.965 3 0 1.72 1.334 3.01 3.066 3.01 1.053 0 1.913-.463 2.49-1.233l-.826-.611c-.43.577-.996.847-1.664.847-.973 0-1.753-.7-1.912-1.64h4.697v-.373c0-1.72-1.222-3-2.886-3zm6.295.068c-.634 0-1.098.294-1.381.758v-.713h-1.131v5.774h1.142V12.61c0-.894.544-1.47 1.291-1.47H24v-1.065h-.396zm-6.319.928c.85 0 1.564.588 1.756 1.47H15.52c.203-.882.916-1.47 1.765-1.47zm-6.732.012c1.086 0 1.98.883 1.98 2.004a1.993 1.993 0 0 1-1.98 2.001A1.989 1.989 0 0 1 8.56 13.02a1.99 1.99 0 0 1 1.992-2.004z"

const PLACE_KINDS = {
  restaurant: { label: "Ресторан или кафе", Icon: Utensils },
  residential: { label: "Жилой комплекс", Icon: Building2 },
  airport: { label: "Аэропорт", Icon: Plane },
  hotel: { label: "Отель", Icon: Hotel },
  shopping: { label: "Магазин или ТРЦ", Icon: ShoppingBag },
  medical: { label: "Больница или клиника", Icon: Hospital },
  education: { label: "Учебное заведение", Icon: GraduationCap },
  home: { label: "Дом", Icon: House },
  landmark: { label: "Достопримечательность", Icon: Landmark },
  cafe: { label: "Кофейня", Icon: Coffee },
  place: { label: "Место назначения", Icon: MapPin },
} as const

type PlaceKind = keyof typeof PLACE_KINDS

function detectPlaceKind(value: string, category = "", type = ""): PlaceKind {
  const text = `${value} ${category} ${type}`.toLocaleLowerCase("ru")
  if (/кофе|coffee|coffee_shop|кофейн/.test(text)) return "cafe"
  if (/ресторан|restaurant|food|кафе|cafe|бар\b|пицц|столов/.test(text)) return "restaurant"
  if (/\bжк\b|жилой|residential|apartments?|квартир|общежит/.test(text)) return "residential"
  if (/аэропорт|airport|әуежай|аэродром/.test(text)) return "airport"
  if (/отель|hotel|гостиниц|hostel/.test(text)) return "hotel"
  if (/трц|торгов|shopping|mall|supermarket|магазин|market/.test(text)) return "shopping"
  if (/больниц|клиник|hospital|clinic|medical|аптек/.test(text)) return "medical"
  if (/школ|университет|college|school|education|академ/.test(text)) return "education"
  if (/дом\b|house|home|коттедж/.test(text)) return "home"
  if (/museum|музей|театр|парк|monument|landmark|достопримеч/.test(text)) return "landmark"
  return "place"
}

function PlaceMark({ value, category = "", type = "", size = "normal" }: {
  value: string
  category?: string
  type?: string
  size?: "small" | "normal" | "large"
}) {
  const presentation = PLACE_KINDS[detectPlaceKind(value, category, type)]
  const Icon = presentation.Icon
  const dimensions = size === "large" ? "h-14 w-14 rounded-[18px]" : size === "small" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-[15px]"
  const iconSize = size === "large" ? "h-6 w-6" : size === "small" ? "h-4 w-4" : "h-5 w-5"

  return (
    <span
      className={`grid shrink-0 place-items-center border border-white/[0.10] bg-white/[0.06] text-white ${dimensions}`}
      title={presentation.label}
      aria-label={presentation.label}
    >
      <Icon className={iconSize} strokeWidth={1.8} />
    </span>
  )
}

function currentPosition(): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Браузер не поддерживает геолокацию."))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      (error) => reject(new Error(
        error.code === error.PERMISSION_DENIED
          ? "Разреши Malik AI доступ к геопозиции — она нужна для точки подачи."
          : "Не удалось определить текущее местоположение.",
      )),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
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
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} мин`
}

function UberLogo({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Uber"
      viewBox="0 7.55 24 8.9"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      fill="currentColor"
    >
      <path d={UBER_PATH} />
    </svg>
  )
}

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] border border-white/[0.09] bg-[#090909] ${className}`}>{children}</div>
}

function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex min-h-8 items-center rounded-full border border-white/[0.08] bg-[#0f0f10] px-3 text-[11px] font-medium text-white/70 ${className}`}>
      {children}
    </span>
  )
}

export function UberRealRideV1() {
  const [destination, setDestination] = useState("")
  const [normalizedDestination, setNormalizedDestination] = useState("")
  const [busyStage, setBusyStage] = useState<BusyStage>(null)
  const [error, setError] = useState("")
  const [prepared, setPrepared] = useState<HandoffResponse | null>(null)
  const [rideOptions, setRideOptions] = useState<RideOption[]>([])
  const [priceNote, setPriceNote] = useState("")
  const [uberStatus, setUberStatus] = useState<UberStatus | null>(null)
  const [agentMeta, setAgentMeta] = useState<AgentResponse["model"] | null>(null)
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [searchingPlaces, setSearchingPlaces] = useState(false)
  const resultRef = useRef<HTMLElement>(null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY)
      if (saved) setDestination(saved)
    } catch {}

    void refreshUberStatus()
  }, [])

  useEffect(() => {
    const query = destination.replace(/\s+/g, " ").trim()
    if (!suggestionsOpen || query.length < 3) {
      setPlaceSuggestions([])
      setSearchingPlaces(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchingPlaces(true)
      try {
        const response = await fetch(`/api/taxi/places?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(String(data?.message || "PLACE_SEARCH_FAILED"))
        setPlaceSuggestions(Array.isArray(data?.places) ? data.places : [])
      } catch (caught) {
        if ((caught as Error)?.name !== "AbortError") setPlaceSuggestions([])
      } finally {
        if (!controller.signal.aborted) setSearchingPlaces(false)
      }
    }, 420)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [destination, suggestionsOpen])

  useEffect(() => {
    if (!prepared) return
    const timer = window.setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      resultRef.current?.focus({ preventScroll: true })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [prepared])

  const refreshUberStatus = async () => {
    try {
      const data = await jsonFetch("/api/taxi/uber/status") as UberStatus
      setUberStatus(data)
      return data
    } catch {
      setUberStatus(null)
      return null
    }
  }

  const prepareRide = async () => {
    const clean = destination.replace(/\s+/g, " ").trim()
    if (clean.length < 3) {
      setError("Укажи город, улицу или название места.")
      return
    }

    setError("")
    setPrepared(null)
    setRideOptions([])
    setPriceNote("")
    setNormalizedDestination("")

    try {
      window.localStorage.setItem(DRAFT_KEY, clean)
    } catch {}

    try {
      setBusyStage("agent")
      const agent = await jsonFetch("/api/taxi/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean }),
      }) as AgentResponse

      const understood = String(agent.destination || clean).trim() || clean
      setNormalizedDestination(understood)
      setAgentMeta(agent.model || null)

      setBusyStage("location")
      const pickup = await currentPosition()

      setBusyStage("route")
      const handoff = await jsonFetch("/api/taxi/uber/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup, destination: understood }),
      }) as HandoffResponse
      setPrepared(handoff)

      setBusyStage("prices")
      const status = await refreshUberStatus()
      if (!status?.configured || !status.connected) {
        setPriceNote("Подключи Uber, чтобы Malik показал реальные тарифы до перехода. Маршрут уже готов и может открыться в Uber без сравнения цен.")
        return
      }

      try {
        const estimate = await jsonFetch("/api/taxi/uber/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: pickup,
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
          ? "Цены и ETA получены напрямую от Uber. Нажми тариф — Malik передаст маршрут и product_id в официальный Uber для финального подтверждения."
          : "Uber не вернул тарифы. Можно продолжить в официальный Uber без предварительного сравнения.")
      } catch (caught) {
        const apiError = caught as ApiError
        if (apiError.code === "UBER_NOT_CONNECTED" || apiError.code === "UBER_RECONNECT_REQUIRED") {
          setUberStatus((current) => current ? { ...current, connected: false } : current)
        }
        setPriceNote(apiError.message || "Не удалось получить тарифы. Маршрут всё равно можно открыть в Uber.")
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось подготовить поездку Uber.")
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

  const connectUber = () => {
    try {
      if (destination.trim()) window.localStorage.setItem(DRAFT_KEY, destination.trim())
    } catch {}
    window.location.assign("/api/taxi/uber/connect")
  }

  const open2GIS = () => {
    const query = encodeURIComponent(destination.trim() || "Алматы")
    window.open(`https://2gis.kz/almaty/search/${query}`, "_blank", "noopener,noreferrer")
  }

  const openMaps = () => {
    const query = encodeURIComponent(destination.trim() || "Алматы")
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank", "noopener,noreferrer")
  }

  const busyLabel = (() => {
    if (busyStage === "agent") return "MalikLLM понимает маршрут…"
    if (busyStage === "location") return "Подтверждаю точку подачи…"
    if (busyStage === "route") return "Готовлю маршрут…"
    if (busyStage === "prices") return "Получаю реальные тарифы Uber…"
    return ""
  })()

  return (
    <main
      className="malik-taxi-surface min-h-[100dvh] bg-black font-sans text-white selection:bg-white selection:text-black"
      style={{ WebkitTapHighlightColor: "transparent", colorScheme: "dark" }}
    >
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-black/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => window.location.assign("/dashboard")}
            className="grid h-10 w-10 touch-manipulation place-items-center rounded-full text-white transition hover:bg-white/[0.08] active:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Назад"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-[14px] font-semibold tracking-[-0.02em]">Taxi</span>
            <span className="text-white/25">/</span>
            <UberLogo className="h-[17px] w-auto text-white" />
          </div>

          <Chip className="max-w-[128px] justify-center px-2.5 sm:max-w-none sm:px-3">
            <span className="truncate sm:hidden">27B · 2M/день</span>
            <span className="hidden sm:inline">MalikLLM Qwen3.8 27B · 2M токенов/день</span>
          </Chip>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-12">
        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-[18px] border border-white/[0.12] bg-[#0a0a0a] px-4 py-3.5 text-[12px] leading-5 text-white">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/[0.08] hover:text-white"
              aria-label="Закрыть"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <section className="mb-9 sm:mb-12">
          <div className="mb-6 inline-flex h-20 w-40 items-center justify-center rounded-[24px] border border-white/[0.12] bg-[#080808] px-5 text-white">
            <UberLogo className="h-[34px] w-auto max-w-full" />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Chip><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Malik Taxi Agent</Chip>
            <Chip><ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Финал официально в Uber</Chip>
            <Chip><LocateFixed className="mr-1.5 h-3.5 w-3.5" /> Геолокация по подтверждению</Chip>
          </div>

          <h1 className="max-w-3xl text-[40px] font-semibold leading-[0.98] tracking-[-0.065em] sm:text-[62px]">
            Куда поедем?
          </h1>
          <p className="mt-4 max-w-3xl text-[14px] leading-7 text-white/52 sm:text-[15px]">
            Напиши место обычным языком. MalikLLM поймёт пункт назначения, браузер подтвердит твою точку подачи,
            затем Malik получит доступные тарифы Uber и откроет официальный Uber для финального подтверждения.
          </p>
        </section>

        {!prepared ? (
          <section className="mx-auto max-w-[920px]">
            <Surface className="overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-5 sm:px-7 sm:py-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">Malik Taxi Agent</p>
                <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] sm:text-[34px]">Просто напиши адрес</h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-white/50">
                  Шаблоны убраны. Можно написать «Dostyk Plaza», полный адрес или обычный запрос вроде «хочу в аэропорт Алматы».
                </p>
              </div>

              <div className="p-4 sm:p-6">
                <div className="rounded-[32px] border border-white/[0.08] bg-[#111112]">
                  <div className="flex items-start gap-3 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
                    <div className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black text-white/70">
                      <Navigation className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 text-[12px] font-medium text-white/38">Куда едем?</p>
                      <textarea
                        value={destination}
                        onChange={(event) => {
                          setDestination(event.target.value)
                          setSuggestionsOpen(true)
                        }}
                        onFocus={() => setSuggestionsOpen(true)}
                        onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 160)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault()
                            if (!busyStage) void prepareRide()
                          }
                        }}
                        rows={2}
                        placeholder="Например: Dostyk Plaza, Almaty"
                        className="min-h-[92px] w-full resize-none bg-transparent text-[19px] leading-7 tracking-[-0.02em] text-white caret-white outline-none placeholder:text-white/25"
                      />
                    </div>
                  </div>

                  {suggestionsOpen && destination.trim().length >= 3 ? (
                    <div className="mx-3 mb-3 overflow-hidden rounded-[22px] border border-white/[0.10] bg-[#080808] sm:mx-4" role="listbox" aria-label="Найденные адреса">
                      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 text-[11px] text-white/42">
                        {searchingPlaces ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        {searchingPlaces ? "Ищу адрес…" : placeSuggestions.length ? "Выбери точное место" : "Продолжай вводить адрес"}
                      </div>
                      {placeSuggestions.length ? (
                        <div className="max-h-64 overflow-y-auto overscroll-contain py-1 [scrollbar-color:#454545_#080808]" data-testid="taxi-place-suggestions">
                          {placeSuggestions.map((place) => (
                            <button
                              key={place.id}
                              type="button"
                              role="option"
                              aria-selected="false"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setDestination(place.address || place.label)
                                setSuggestionsOpen(false)
                                setPlaceSuggestions([])
                              }}
                              className="flex min-h-[68px] w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none"
                            >
                              <PlaceMark value={`${place.label} ${place.address}`} category={place.category} type={place.type} size="small" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-white">{place.label}</span>
                                <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-white/42">{place.address}</span>
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex flex-wrap gap-2">
                      <Chip><Route className="mr-1.5 h-3.5 w-3.5" /> MalikLLM понимает запрос</Chip>
                      <Chip><MapPin className="mr-1.5 h-3.5 w-3.5" /> Точка подачи — твоя геолокация</Chip>
                    </div>

                    <button
                      type="button"
                      onClick={() => void prepareRide()}
                      disabled={Boolean(busyStage)}
                      className="flex min-h-12 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      {busyStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                      {busyStage ? "Готовлю…" : "Подтвердить место и продолжить"}
                    </button>
                  </div>
                </div>

                {busyLabel ? (
                  <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-white/45">
                    <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={open2GIS}
                    className="flex min-h-[54px] w-full touch-manipulation items-center justify-center gap-2 rounded-[18px] border border-white/[0.10] bg-[#0b0b0b] px-4 text-[13px] font-medium text-white transition hover:bg-white/[0.04] active:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    Открыть 2GIS для поиска места <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={openMaps}
                    className="flex min-h-[54px] w-full touch-manipulation items-center justify-center gap-2 rounded-[18px] border border-white/[0.10] bg-[#0b0b0b] px-4 text-[13px] font-medium text-white transition hover:bg-white/[0.04] active:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    Открыть Google Maps <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Surface>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Surface className="p-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">01</p>
                <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em]">Пишешь куда ехать</p>
                <p className="mt-2 text-[12px] leading-6 text-white/45">MalikLLM 27B выделяет пункт назначения без шаблонов.</p>
              </Surface>
              <Surface className="p-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">02</p>
                <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em]">Подтверждаешь геолокацию</p>
                <p className="mt-2 text-[12px] leading-6 text-white/45">Она используется как точка подачи для текущего запроса.</p>
              </Surface>
              <Surface className="p-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">03</p>
                <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em]">Выбираешь тариф Uber</p>
                <p className="mt-2 text-[12px] leading-6 text-white/45">Если Uber подключён, Malik показывает реальные цены и ETA перед переходом.</p>
              </Surface>
            </div>
          </section>
        ) : (
          <section ref={resultRef} tabIndex={-1} className="mx-auto max-w-[920px] scroll-mt-24 outline-none" data-testid="taxi-route-result">
            <Surface className="overflow-hidden">
              <div className="border-b border-white/[0.08] px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">Маршрут готов</p>
                    <div className="mt-3 flex items-center gap-3">
                      <PlaceMark
                        value={`${prepared.destination.nickname} ${prepared.destination.address}`}
                        category={prepared.destination.category}
                        type={prepared.destination.type}
                        size="large"
                      />
                      <h2 className="min-w-0 text-[28px] font-semibold tracking-[-0.05em] sm:text-[36px]">
                        {prepared.destination.nickname || "Uber"}
                      </h2>
                    </div>
                    <p className="mt-2 max-w-2xl text-[13px] leading-6 text-white/55">{prepared.destination.address}</p>
                    {normalizedDestination ? (
                      <p className="mt-3 text-[11px] text-white/35">
                        {agentMeta?.label || "MalikLLM"} понял запрос как: <span className="text-white/60">{normalizedDestination}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex min-h-16 min-w-28 shrink-0 items-center justify-center rounded-[20px] border border-white/[0.10] bg-black px-4 text-white">
                    <UberLogo className="h-8 w-auto" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-[1.15fr_.85fr] sm:p-7">
                <div className="rounded-[24px] border border-white/[0.08] bg-[#0d0d0e] p-5">
                  <div className="relative pl-8">
                    <div className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-px bg-white/15" />
                    <div className="relative pb-6">
                      <span className="absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-black" />
                      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">Откуда</p>
                      <p className="mt-1 text-[13px] leading-5 text-white">Текущее местоположение</p>
                    </div>
                    <div className="relative flex items-start justify-between gap-3">
                      <span className="absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-[4px] bg-white" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">Куда</p>
                        <p className="mt-1 text-[13px] leading-6 text-white">{prepared.destination.address}</p>
                      </div>
                      <PlaceMark
                        value={`${prepared.destination.nickname} ${prepared.destination.address}`}
                        category={prepared.destination.category}
                        type={prepared.destination.type}
                        size="small"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/[0.08] bg-[#0d0d0e] p-5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">Безопасный handoff</p>
                  <div className="mt-4 space-y-3 text-[13px] leading-6 text-white/65">
                    <p className="flex items-start gap-3"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-white" /> Маршрут подготовлен в Malik AI.</p>
                    <p className="flex items-start gap-3"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-white" /> Реальная цена приходит от Uber API.</p>
                    <p className="flex items-start gap-3"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-white" /> Финальное подтверждение и оплата остаются в Uber.</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.08] px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">Реальные тарифы Uber</p>
                    <p className="mt-1 text-[12px] leading-5 text-white/45">{priceNote || "Проверяю доступные варианты…"}</p>
                  </div>
                  {uberStatus?.connected ? (
                    <Chip>Uber подключён</Chip>
                  ) : null}
                </div>

                {busyStage === "prices" ? (
                  <div className="mt-5 flex min-h-24 items-center justify-center gap-2 rounded-[20px] border border-white/[0.08] bg-[#0b0b0b] text-[12px] text-white/45">
                    <Loader2 className="h-4 w-4 animate-spin" /> Получаю цены от Uber…
                  </div>
                ) : rideOptions.length ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {rideOptions.map((option, index) => (
                      <button
                        key={option.productId}
                        type="button"
                        onClick={() => openUber(option.productId, true)}
                        className="group flex min-h-[116px] w-full touch-manipulation items-center gap-4 rounded-[22px] border border-white/[0.09] bg-[#0b0b0b] p-4 text-left transition hover:border-white/[0.20] hover:bg-[#111111] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                      >
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] border border-white/[0.10] bg-black text-white">
                          <UberLogo className="h-5 w-auto" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[15px] font-semibold tracking-[-0.02em]">{option.displayName}</p>
                            {index === 0 ? <span className="shrink-0 rounded-full border border-white/[0.10] px-2 py-0.5 text-[9px] font-medium text-white/50">Выбор Malik</span> : null}
                          </div>
                          <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-white">{option.fareDisplay}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/38">
                            {option.pickupEstimateMinutes != null ? <span>Подача ~{option.pickupEstimateMinutes} мин</span> : null}
                            {formatDuration(option.durationEstimateSeconds) ? <span>В пути ~{formatDuration(option.durationEstimateSeconds)}</span> : null}
                            {option.capacity ? <span>До {option.capacity} мест</span> : null}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition group-hover:text-white/70" />
                      </button>
                    ))}
                  </div>
                ) : !uberStatus?.connected ? (
                  <div className="mt-5 rounded-[22px] border border-white/[0.09] bg-[#0b0b0b] p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="max-w-xl">
                        <p className="text-[14px] font-semibold">Подключить Uber для цен</p>
                        <p className="mt-1 text-[12px] leading-6 text-white/45">
                          Подключение нужно только для получения реальных тарифов и ETA внутри Malik AI. Финальное подтверждение всё равно будет в Uber.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={connectUber}
                        className="flex min-h-12 shrink-0 items-center justify-center rounded-full bg-white px-5 text-[13px] font-semibold text-black transition hover:bg-white/90 active:scale-[0.99]"
                      >
                        Подключить Uber
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => openUber(undefined, true)}
                    className="flex min-h-[54px] w-full touch-manipulation items-center justify-center gap-2 rounded-[16px] bg-white px-5 text-[14px] font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    Открыть официальный Uber <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openUber(undefined, false)}
                    className="flex min-h-[54px] w-full touch-manipulation items-center justify-center gap-2 rounded-[16px] border border-white/[0.10] bg-black px-5 text-[14px] font-medium text-white transition hover:bg-white/[0.06] active:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    Uber в браузере <ExternalLink className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPrepared(null)
                    setRideOptions([])
                    setPriceNote("")
                    setNormalizedDestination("")
                  }}
                  className="mt-4 w-full py-2 text-center text-[12px] text-white/45 hover:text-white"
                >
                  Изменить маршрут
                </button>
              </div>
            </Surface>
          </section>
        )}

        <footer className="mt-12 border-t border-white/[0.07] pt-5 text-center text-[10px] leading-5 text-white/25">
          Malik AI получает маршрут и, при подключённом Uber, тарифы через Uber API. Пароль Uber и оплату Malik AI не хранит.
        </footer>
      </div>

      {prepared ? (
        <div className="fixed bottom-5 right-3 z-40 flex flex-col gap-2 sm:bottom-7 sm:right-6" aria-label="Навигация по маршруту">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/[0.14] bg-[#0a0a0a] text-white shadow-[0_8px_28px_rgba(0,0,0,.55)] transition hover:bg-[#151515] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
            aria-label="Наверх"
            title="Наверх"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/[0.14] bg-white text-black shadow-[0_8px_28px_rgba(0,0,0,.55)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
            aria-label="К подготовленному маршруту"
            title="К маршруту"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </main>
  )
}
