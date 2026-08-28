"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Home,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"

type UberPlace = {
  placeId: "home" | "work"
  available: boolean
  address?: string
}

type UberStatus = {
  ok: boolean
  configured: boolean
  connected: boolean
  mode: "sandbox" | "production"
  scopes: string[]
  profile?: {
    firstName?: string
    lastName?: string
    email?: string
    picture?: string
  } | null
  places: UberPlace[]
  message?: string
  code?: string
}

type RideDestination = { kind: "saved"; placeId: "home" | "work" }

type RideOption = {
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

type RideSnapshot = {
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
}

type Coordinates = { latitude: number; longitude: number }

type QuickRide = {
  id: "home" | "work"
  title: string
  subtitle: string
  placeId: "home" | "work"
  icon: typeof Home
}

const ACTIVE_RIDE_KEY = "malik_taxi_uber_active_ride_v1"
const LAST_DESTINATION_KEY = "malik_taxi_uber_last_destination_v1"

const QUICK_RIDES: QuickRide[] = [
  { id: "home", title: "Домой", subtitle: "Точка Home из Uber", placeId: "home", icon: Home },
  { id: "work", title: "На работу", subtitle: "Точка Work из Uber", placeId: "work", icon: BriefcaseBusiness },
]

const TERMINAL_STATUSES = new Set([
  "completed",
  "rider_canceled",
  "driver_canceled",
  "no_drivers_available",
])

const STATUS_LABELS: Record<string, string> = {
  processing: "Uber ищет водителя",
  accepted: "Водитель найден",
  arriving: "Водитель подъезжает",
  in_progress: "Поездка идёт",
  completed: "Поездка завершена",
  rider_canceled: "Поездка отменена",
  driver_canceled: "Водитель отменил поездку",
  no_drivers_available: "Свободных машин нет",
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "—"
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} мин`
}

function statusLabel(status?: string) {
  return STATUS_LABELS[String(status || "").toLowerCase()] || "Статус поездки обновляется"
}

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false) {
    const error = new Error(String(data?.message || data?.code || `HTTP ${response.status}`)) as Error & { status?: number; code?: string }
    error.status = response.status
    error.code = String(data?.code || "")
    throw error
  }
  return data
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
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Разреши Malik AI доступ к геопозиции — она нужна только для точки подачи."
          : "Не удалось определить текущее местоположение."
        reject(new Error(message))
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  })
}

function UberMark() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white text-[16px] font-black tracking-[-0.04em] text-black shadow-[0_12px_40px_rgba(0,0,0,.35)]">
      UBER
    </span>
  )
}

export function UberTaxiStudio() {
  const [status, setStatus] = useState<UberStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [destination, setDestination] = useState<RideDestination | null>(null)
  const [destinationLabel, setDestinationLabel] = useState("")
  const [pickup, setPickup] = useState<Coordinates | null>(null)
  const [options, setOptions] = useState<RideOption[]>([])
  const [ride, setRide] = useState<RideSnapshot | null>(null)
  const [tick, setTick] = useState(Date.now())

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    setError("")
    try {
      const data = await jsonFetch("/api/taxi/uber/status")
      setStatus(data)
    } catch (caught) {
      setStatus(null)
      setError(caught instanceof Error ? caught.message : "Не удалось проверить Uber.")
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  const refreshRide = useCallback(async (requestId: string, quiet = false) => {
    try {
      if (!quiet) setBusy("ride-refresh")
      const data = await jsonFetch(`/api/taxi/uber/request?id=${encodeURIComponent(requestId)}`)
      setRide(data.ride)
      if (data?.ride?.requestId && typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_RIDE_KEY, data.ride.requestId)
      }
    } catch (caught) {
      if (!quiet) setError(caught instanceof Error ? caught.message : "Не удалось обновить поездку.")
    } finally {
      if (!quiet) setBusy(null)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    if (typeof window !== "undefined") {
      const activeRideId = window.localStorage.getItem(ACTIVE_RIDE_KEY)
      if (activeRideId) refreshRide(activeRideId, true)
    }
  }, [loadStatus, refreshRide])

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!ride?.requestId || TERMINAL_STATUSES.has(String(ride.status).toLowerCase())) return
    const timer = window.setInterval(() => refreshRide(ride.requestId, true), 5000)
    return () => window.clearInterval(timer)
  }, [ride?.requestId, ride?.status, refreshRide])

  const places = useMemo(() => new Map((status?.places || []).map((place) => [place.placeId, place])), [status?.places])
  const connected = Boolean(status?.connected)
  const isSandbox = status?.mode !== "production"
  const terminalRide = ride ? TERMINAL_STATUSES.has(String(ride.status).toLowerCase()) : false

  const repeatDestination = useMemo(() => {
    if (typeof window === "undefined") return null
    try {
      const parsed = JSON.parse(window.localStorage.getItem(LAST_DESTINATION_KEY) || "null")
      if (parsed?.kind === "saved" && (parsed.placeId === "home" || parsed.placeId === "work")) return parsed as RideDestination
    } catch {}
    return null
  }, [ride?.requestId])

  const connect = () => {
    window.location.assign("/api/taxi/uber/connect")
  }

  const disconnect = async () => {
    setBusy("disconnect")
    setError("")
    try {
      await jsonFetch("/api/taxi/uber/status", { method: "DELETE" })
      setRide(null)
      setOptions([])
      if (typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_RIDE_KEY)
      await loadStatus()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отключить Uber.")
    } finally {
      setBusy(null)
    }
  }

  const getQuote = useCallback(async (target: RideDestination, label: string) => {
    setBusy(`quote-${target.placeId}`)
    setError("")
    setOptions([])
    setDestination(target)
    setDestinationLabel(label)
    try {
      const location = await currentPosition()
      setPickup(location)
      const data = await jsonFetch("/api/taxi/uber/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: location, destination: target }),
      })
      setOptions(Array.isArray(data?.options) ? data.options : [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось получить цену Uber.")
    } finally {
      setBusy(null)
    }
  }, [])

  const book = async (option: RideOption) => {
    if (option.expiresAt <= Date.now()) {
      setError("Цена уже обновилась. Нажми «Обновить цены».")
      return
    }
    setBusy(`book-${option.productId}`)
    setError("")
    try {
      const data = await jsonFetch("/api/taxi/uber/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteToken: option.quoteToken, confirm: true }),
      })
      setRide(data.ride)
      setOptions([])
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_RIDE_KEY, data.ride.requestId)
        if (destination) window.localStorage.setItem(LAST_DESTINATION_KEY, JSON.stringify(destination))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uber не смог создать поездку.")
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    if (!ride?.requestId) return
    if (!window.confirm("Отменить поездку? Uber может применить сбор за отмену по своим правилам.")) return
    setBusy("cancel")
    setError("")
    try {
      await jsonFetch(`/api/taxi/uber/request?id=${encodeURIComponent(ride.requestId)}`, { method: "DELETE" })
      await refreshRide(ride.requestId, true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отменить поездку.")
    } finally {
      setBusy(null)
    }
  }

  const closeRideSession = () => {
    setRide(null)
    setOptions([])
    setDestination(null)
    setDestinationLabel("")
    if (typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_RIDE_KEY)
  }

  const refreshQuote = () => {
    if (!destination) return
    void getQuote(destination, destinationLabel || (destination.placeId === "home" ? "Домой" : "На работу"))
  }

  return (
    <main className="min-h-[100dvh] bg-[#050506] text-white selection:bg-white selection:text-black">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#050506]/95 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.assign("/dashboard")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Вернуться в Malik AI"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">Malik AI <span className="text-zinc-600">/</span> Taxi</p>
            <p className="truncate text-[10px] text-zinc-600">Official Uber Riders API</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.connected ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-zinc-400 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${isSandbox ? "bg-amber-300" : "bg-emerald-400"}`} />
              {isSandbox ? "Sandbox" : "Live Uber"}
            </span>
          ) : null}
          <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-zinc-500">0 LLM tokens</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-6 sm:py-12">
        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-400/15 bg-red-400/[0.055] px-4 py-3 text-[12px] leading-5 text-red-100">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} className="text-red-200/60 hover:text-red-100" aria-label="Закрыть"><X className="h-4 w-4" /></button>
          </div>
        ) : null}

        {loadingStatus ? (
          <div className="flex min-h-[52vh] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Проверяю Uber…</div>
          </div>
        ) : !status?.configured ? (
          <section className="mx-auto max-w-xl rounded-[28px] border border-white/[0.08] bg-[#0b0b0d] p-7 sm:p-9">
            <UberMark />
            <h1 className="mt-7 text-2xl font-semibold tracking-[-0.04em]">Uber готов к подключению</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-500">Интерфейс и официальный OAuth уже подготовлены. На сервере нужно добавить Uber Client ID, Client Secret и ключ шифрования.</p>
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-black/40 p-4 font-mono text-[11px] leading-6 text-zinc-500">
              UBER_CLIENT_ID<br />UBER_CLIENT_SECRET<br />UBER_TOKEN_ENCRYPTION_KEY<br />UBER_API_MODE=sandbox
            </div>
          </section>
        ) : !connected ? (
          <section className="mx-auto max-w-xl text-center">
            <div className="mx-auto flex w-fit"><UberMark /></div>
            <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-600">Malik Taxi</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] sm:text-[40px]">Подключи Uber один раз.</h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-zinc-500">Malik не видит пароль Uber. Авторизация проходит на официальной странице Uber, а затем поездки можно заказывать внутри Malik AI.</p>
            <button
              type="button"
              onClick={connect}
              className="mt-8 inline-flex h-12 items-center justify-center gap-3 rounded-2xl bg-white px-7 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <span className="font-black tracking-[-0.04em]">UBER</span>
              Подключить Uber
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="mx-auto mt-8 grid max-w-md gap-2 text-left text-[11px] text-zinc-600 sm:grid-cols-3">
              <span className="rounded-xl border border-white/[0.06] px-3 py-2.5">OAuth 2.0</span>
              <span className="rounded-xl border border-white/[0.06] px-3 py-2.5">Зашифрованная сессия</span>
              <span className="rounded-xl border border-white/[0.06] px-3 py-2.5">Заказ через Uber API</span>
            </div>
          </section>
        ) : ride ? (
          <section className="mx-auto max-w-[680px]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600">Активная поездка</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{statusLabel(ride.status)}</h1>
              </div>
              <button type="button" onClick={() => refreshRide(ride.requestId)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] text-zinc-500 hover:bg-white/[0.05] hover:text-white" aria-label="Обновить">
                <RefreshCw className={`h-4 w-4 ${busy === "ride-refresh" ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="mt-7 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0b0b0d]">
              <div className="flex min-h-52 items-center justify-center border-b border-white/[0.06] bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,.06),transparent_38%)] p-8 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-white/[0.1] bg-white/[0.04]">
                    {terminalRide ? <Check className="h-7 w-7 text-emerald-300" /> : <Navigation className="h-7 w-7 text-white" />}
                  </div>
                  <p className="mt-5 text-4xl font-semibold tracking-[-0.06em]">{ride.eta != null && !terminalRide ? `${ride.eta} мин` : terminalRide ? "Готово" : "—"}</p>
                  <p className="mt-2 text-xs text-zinc-600">{statusLabel(ride.status)}</p>
                </div>
              </div>

              <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
                <div className="bg-[#0b0b0d] p-5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-700">Машина</p>
                  <p className="mt-2 text-sm font-medium">{[ride.vehicle?.make, ride.vehicle?.model].filter(Boolean).join(" ") || "Назначается"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{ride.vehicle?.licensePlate || "Номер появится после назначения"}</p>
                </div>
                <div className="bg-[#0b0b0d] p-5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-700">Водитель</p>
                  <p className="mt-2 text-sm font-medium">{ride.driver?.name || "Ищем водителя"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{ride.driver?.rating ? `★ ${ride.driver.rating}` : "Рейтинг появится после назначения"}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              {terminalRide ? (
                <button type="button" onClick={closeRideSession} className="h-12 flex-1 rounded-2xl bg-white text-sm font-semibold text-black hover:bg-zinc-200">Завершить сессию</button>
              ) : (
                <button type="button" onClick={cancel} disabled={busy === "cancel"} className="h-12 flex-1 rounded-2xl border border-red-400/15 bg-red-400/[0.04] text-sm font-medium text-red-200 hover:bg-red-400/[0.08] disabled:opacity-50">
                  {busy === "cancel" ? "Отменяю…" : "Отменить поездку"}
                </button>
              )}
            </div>
            <p className="mt-4 text-center text-[10px] leading-5 text-zinc-700">Статус берётся напрямую из Uber. Поездка также видна в официальном приложении Uber.</p>
          </section>
        ) : options.length ? (
          <section>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <button type="button" onClick={() => setOptions([])} className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Шаблоны</button>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600">Куда едем</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{destinationLabel}</h1>
                <p className="mt-2 flex items-center gap-2 text-xs text-zinc-600"><LocateFixed className="h-3.5 w-3.5" /> Подача: текущее местоположение</p>
              </div>
              <button type="button" onClick={refreshQuote} disabled={Boolean(busy)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Обновить цены</button>
            </div>

            <div className="mt-7 grid gap-3">
              {options.map((option, index) => {
                const secondsLeft = Math.max(0, Math.floor((option.expiresAt - tick) / 1000))
                const expired = secondsLeft <= 0
                return (
                  <article key={`${option.productId}-${option.quoteToken.slice(-8)}`} className="group rounded-[22px] border border-white/[0.08] bg-[#0b0b0d] p-4 transition hover:border-white/[0.14] sm:p-5">
                    <div className="flex items-center gap-4">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[10px] font-black tracking-[-0.04em] text-black">UBER</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-[15px] font-semibold">{option.displayName}</h2>
                          {index === 0 ? <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-black">Самый выгодный</span> : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600">
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {option.pickupEstimateMinutes == null ? "ETA —" : `${option.pickupEstimateMinutes} мин подача`}</span>
                          <span className="inline-flex items-center gap-1"><Route className="h-3 w-3" /> {formatDuration(option.durationEstimateSeconds)}</span>
                          {option.capacity ? <span>{option.capacity} мест</span> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold tracking-[-0.03em]">{option.fareDisplay}</p>
                        <p className={`mt-1 text-[10px] ${expired ? "text-red-300" : secondsLeft < 30 ? "text-amber-300" : "text-zinc-700"}`}>
                          {expired ? "Цена истекла" : `ещё ${secondsLeft} сек`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => book(option)}
                      disabled={expired || Boolean(busy)}
                      className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[12px] font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                    >
                      {busy === `book-${option.productId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {expired ? "Обновить цену" : `Заказать за ${option.fareDisplay}`}
                    </button>
                  </article>
                )
              })}
            </div>
            <p className="mt-5 text-center text-[10px] leading-5 text-zinc-700">Нажатие на кнопку с ценой является подтверждением заказа. Оплата проходит через способ оплаты, сохранённый в Uber.</p>
          </section>
        ) : (
          <section>
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-3">
                  <UberMark />
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-semibold tracking-[-0.035em]">Uber</h1>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-medium text-emerald-300"><Check className="h-2.5 w-2.5" /> Подключено</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">{status?.profile?.firstName ? `${status.profile.firstName}${status.profile.lastName ? ` ${status.profile.lastName}` : ""}` : status?.profile?.email || "Аккаунт Uber"}</p>
                  </div>
                </div>
                <h2 className="mt-8 text-3xl font-semibold tracking-[-0.055em] sm:text-[38px]">Куда едем?</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Нажми шаблон. Malik возьмёт текущее местоположение, запросит живую цену Uber и покажет кнопку заказа. Модель ИИ для этого вообще не вызывается.</p>
              </div>
              <button type="button" onClick={disconnect} disabled={busy === "disconnect"} className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-xl border border-white/[0.07] px-3 text-[11px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-50"><LogOut className="h-3.5 w-3.5" /> Отключить</button>
            </div>

            {isSandbox ? (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300/10 bg-amber-300/[0.035] px-4 py-3 text-[11px] leading-5 text-amber-100/70">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/70" />
                <span><strong className="font-medium text-amber-100">Sandbox включён.</strong> Сейчас Malik создаёт тестовые поездки Uber без реальной машины и оплаты. После Full Access переключается одной переменной на production.</span>
              </div>
            ) : null}

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {QUICK_RIDES.map((template) => {
                const Icon = template.icon
                const place = places.get(template.placeId)
                const unavailable = place && place.available === false
                const loading = busy === `quote-${template.placeId}`
                return (
                  <button
                    key={template.id}
                    type="button"
                    disabled={loading || Boolean(busy && !loading) || unavailable}
                    onClick={() => getQuote({ kind: "saved", placeId: template.placeId }, template.title)}
                    className="group flex min-h-28 items-center gap-4 rounded-[22px] border border-white/[0.075] bg-[#0b0b0d] p-5 text-left transition hover:border-white/[0.14] hover:bg-[#0e0e10] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-zinc-300"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold tracking-[-0.02em]">{template.title}</span>
                      <span className="mt-1 block truncate text-[11px] text-zinc-600">{unavailable ? "Не сохранено в аккаунте Uber" : place?.address || template.subtitle}</span>
                    </span>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-zinc-400" />}
                  </button>
                )
              })}

              {repeatDestination ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => getQuote(repeatDestination, repeatDestination.placeId === "home" ? "Повторить: Домой" : "Повторить: Работа")}
                  className="group flex min-h-28 items-center gap-4 rounded-[22px] border border-white/[0.075] bg-[#0b0b0d] p-5 text-left transition hover:border-white/[0.14] hover:bg-[#0e0e10] disabled:opacity-45"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-zinc-300"><RefreshCw className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Повторить</span><span className="mt-1 block text-[11px] text-zinc-600">Последний маршрут Malik Taxi</span></span>
                  <ChevronRight className="h-4 w-4 text-zinc-700" />
                </button>
              ) : null}

              <div className="flex min-h-28 items-center gap-4 rounded-[22px] border border-dashed border-white/[0.07] p-5 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/[0.05] text-zinc-700"><MapPin className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-zinc-500">Другой адрес</span><span className="mt-1 block text-[11px] leading-4 text-zinc-700">Следующий этап: поиск места без LLM + аэропорты + избранное</span></span>
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.055] p-4"><LocateFixed className="h-4 w-4 text-zinc-500" /><p className="mt-3 text-xs font-medium">Точка подачи</p><p className="mt-1 text-[11px] leading-5 text-zinc-700">Берётся с устройства только после нажатия шаблона.</p></div>
              <div className="rounded-2xl border border-white/[0.055] p-4"><Sparkles className="h-4 w-4 text-zinc-500" /><p className="mt-3 text-xs font-medium">Без AI-запроса</p><p className="mt-1 text-[11px] leading-5 text-zinc-700">Шаблон → Uber API. Никакой LLM не тратит токены.</p></div>
              <div className="rounded-2xl border border-white/[0.055] p-4"><UserRound className="h-4 w-4 text-zinc-500" /><p className="mt-3 text-xs font-medium">Официальный аккаунт</p><p className="mt-1 text-[11px] leading-5 text-zinc-700">Поездка создаётся от имени подключённого Uber rider.</p></div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

export default UberTaxiStudio
