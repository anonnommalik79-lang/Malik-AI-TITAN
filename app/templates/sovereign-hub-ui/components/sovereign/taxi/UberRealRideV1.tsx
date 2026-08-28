"use client"

import { useMemo, useState } from "react"
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  Home,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Plane,
  ShieldCheck,
} from "lucide-react"

type Coordinates = { latitude: number; longitude: number }
type TemplateId = "home" | "work" | "airport"

type HandoffResponse = {
  ok: boolean
  appUrl: string
  webUrl: string
  destination: {
    latitude: number
    longitude: number
    address: string
    nickname: string
  }
}

const STORAGE_KEY = "malik_taxi_real_templates_v1"
const UBER_LOGO_SRC = "https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/uber.svg"

const TEMPLATE_META: Array<{ id: TemplateId; title: string; note: string; icon: typeof Home }> = [
  { id: "home", title: "Домой", note: "Сохранить адрес дома", icon: Home },
  { id: "work", title: "На работу", note: "Сохранить адрес работы", icon: BriefcaseBusiness },
  { id: "airport", title: "В аэропорт", note: "Сохранить аэропорт", icon: Plane },
]

function readTemplates(): Partial<Record<TemplateId, string>> {
  if (typeof window === "undefined") return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}")
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function saveTemplates(value: Partial<Record<TemplateId, string>>) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function currentPosition(): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Браузер не поддерживает геолокацию."))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED
        ? "Разреши Malik AI доступ к геопозиции — она нужна для точки подачи."
        : "Не удалось определить текущее местоположение.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  })
}

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false) throw new Error(String(data?.message || `HTTP ${response.status}`))
  return data
}

function UberMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[20px] bg-white shadow-[0_18px_60px_rgba(0,0,0,.42)] ${compact ? "h-11 w-11" : "h-[60px] w-[60px]"}`}>
      <img
        src={UBER_LOGO_SRC}
        alt="Uber"
        className={compact ? "h-[22px] w-[22px]" : "h-[30px] w-[30px]"}
        draggable={false}
      />
    </span>
  )
}

function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[24px] border border-white/[0.08] bg-[#0d0d0f] ${className}`}>
      {children}
    </div>
  )
}

export function UberRealRideV1() {
  const [templates, setTemplates] = useState<Partial<Record<TemplateId, string>>>(() => readTemplates())
  const [editing, setEditing] = useState<TemplateId | "custom" | null>(null)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [prepared, setPrepared] = useState<HandoffResponse | null>(null)

  const editingTitle = useMemo(() => {
    if (editing === "home") return "Дом"
    if (editing === "work") return "Работа"
    if (editing === "airport") return "Аэропорт"
    return "Куда едем?"
  }, [editing])

  const openEditor = (id: TemplateId | "custom") => {
    setError("")
    setPrepared(null)
    setEditing(id)
    setInput(id === "custom" ? "" : templates[id] || "")
  }

  const prepareRide = async (destination: string) => {
    const clean = destination.trim()
    if (clean.length < 3) {
      setError("Укажи город, улицу или название места.")
      return
    }

    setBusy(true)
    setError("")
    setPrepared(null)

    try {
      const pickup = await currentPosition()
      const data = await jsonFetch("/api/taxi/uber/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup, destination: clean }),
      }) as HandoffResponse
      setPrepared(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось подготовить поездку Uber.")
    } finally {
      setBusy(false)
    }
  }

  const runTemplate = async (id: TemplateId) => {
    const value = templates[id]?.trim()
    if (!value) {
      openEditor(id)
      return
    }
    await prepareRide(value)
  }

  const saveAndPrepare = async () => {
    const clean = input.trim()
    if (clean.length < 3) {
      setError("Укажи полный адрес или название места.")
      return
    }

    if (editing && editing !== "custom") {
      const next = { ...templates, [editing]: clean }
      setTemplates(next)
      saveTemplates(next)
    }

    setEditing(null)
    await prepareRide(clean)
  }

  const openUber = (preferApp = true) => {
    if (!prepared) return
    window.location.assign(preferApp ? prepared.appUrl : prepared.webUrl)
  }

  return (
    <main className="min-h-[100dvh] bg-[#050505] font-sans text-white [-webkit-tap-highlight-color:transparent] selection:bg-white selection:text-black">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#050505]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[980px] items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.assign("/dashboard")}
              className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Вернуться в Malik AI"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold tracking-[-0.02em]">Malik Taxi</p>
              <p className="truncate text-[11px] text-zinc-600">Uber</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Официальный переход</span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[980px] px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-10">
        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-[18px] border border-red-400/15 bg-red-400/[0.05] px-4 py-3.5 text-[12px] leading-5 text-red-100">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <span className="min-w-0 flex-1">{error}</span>
          </div>
        ) : null}

        <section className="flex items-center gap-4 border-b border-white/[0.06] pb-6 sm:pb-8">
          <UberMark />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-semibold tracking-[-0.045em]">Uber</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-0.5 text-[9px] font-medium text-zinc-400">
                <Check className="h-2.5 w-2.5" /> подключено
              </span>
            </div>
            <p className="mt-1 max-w-xl text-[12px] leading-5 text-zinc-500">
              Выбери готовый маршрут. Malik заполнит поездку, тебе останется подтвердить её в Uber.
            </p>
          </div>
        </section>

        {prepared ? (
          <section className="mx-auto mt-8 max-w-[660px] sm:mt-10">
            <Surface className="overflow-hidden">
              <div className="border-b border-white/[0.06] p-5 sm:p-6">
                <div className="flex items-center gap-4">
                  <UberMark compact />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-zinc-500">Маршрут готов</p>
                    <h2 className="mt-1 truncate text-[19px] font-semibold tracking-[-0.03em]">{prepared.destination.nickname || "Uber"}</h2>
                  </div>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="h-4 w-4" /></span>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <div className="flex gap-3 rounded-[18px] bg-black/35 p-4">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-700">Куда</p>
                    <p className="mt-1 text-[12px] leading-5 text-zinc-300">{prepared.destination.address}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openUber(true)}
                  className="mt-5 flex h-[52px] w-full touch-manipulation items-center justify-center gap-2 rounded-[16px] bg-white px-5 text-[14px] font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  Подтвердить поездку в Uber <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openUber(false)}
                  className="mt-2 h-10 w-full touch-manipulation rounded-xl text-[11px] text-zinc-600 transition hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Открыть Uber в браузере
                </button>
              </div>
            </Surface>

            <button type="button" onClick={() => setPrepared(null)} className="mt-4 w-full touch-manipulation py-2 text-center text-xs text-zinc-600 hover:text-zinc-300 focus-visible:outline-none">Изменить маршрут</button>
          </section>
        ) : editing ? (
          <section className="mx-auto mt-8 max-w-[620px] sm:mt-10">
            <button type="button" onClick={() => setEditing(null)} className="mb-5 inline-flex touch-manipulation items-center gap-1.5 py-2 text-xs text-zinc-500 hover:text-white focus-visible:outline-none">
              <ArrowLeft className="h-3.5 w-3.5" /> Назад
            </button>

            <p className="text-[12px] font-medium text-zinc-500">{editing === "custom" ? "Новый маршрут" : "Настройка шаблона"}</p>
            <h2 className="mt-1.5 text-[30px] font-semibold tracking-[-0.055em] sm:text-[36px]">{editingTitle}</h2>
            <p className="mt-2 text-[13px] leading-5 text-zinc-500">Введи полный адрес или название места.</p>

            <Surface className="mt-6 p-2">
              <div className="flex items-center gap-2">
                <div className="grid h-11 w-11 shrink-0 place-items-center text-zinc-500"><MapPin className="h-[18px] w-[18px]" /></div>
                <input
                  autoFocus
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void saveAndPrepare() }}
                  placeholder="Например: Dostyk Plaza, Almaty"
                  className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[14px] text-white outline-none placeholder:text-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => void saveAndPrepare()}
                  disabled={busy}
                  className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-[14px] bg-white text-black transition active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  aria-label="Продолжить"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </Surface>
          </section>
        ) : (
          <section className="mt-8 sm:mt-10">
            <div className="max-w-xl">
              <p className="text-[12px] font-medium text-zinc-500">Быстрый заказ</p>
              <h2 className="mt-1.5 text-[34px] font-semibold tracking-[-0.06em] sm:text-[42px]">Куда едем?</h2>
              <p className="mt-2 text-[13px] leading-5 text-zinc-500">Нажми один шаблон — Malik сам возьмёт точку подачи и подготовит маршрут.</p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {TEMPLATE_META.map((template) => {
                const Icon = template.icon
                const value = templates[template.id]
                return (
                  <Surface key={template.id} className="group relative overflow-hidden transition hover:border-white/[0.14] hover:bg-[#111113]">
                    <button
                      type="button"
                      onClick={() => void runTemplate(template.id)}
                      disabled={busy}
                      className="min-h-[142px] w-full touch-manipulation p-5 text-left transition active:bg-white/[0.025] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 sm:min-h-[158px]"
                    >
                      <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-white/[0.055] text-zinc-200"><Icon className="h-[18px] w-[18px]" /></div>
                      <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.02em]">{template.title}</h3>
                      <p className="mt-1 truncate pr-7 text-[11px] text-zinc-600">{value || template.note}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(template.id)}
                      className="absolute right-3 top-3 grid h-9 w-9 touch-manipulation place-items-center rounded-full text-zinc-600 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Изменить ${template.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </Surface>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => openEditor("custom")}
              disabled={busy}
              className="mt-3 flex min-h-[68px] w-full touch-manipulation items-center gap-4 rounded-[22px] border border-white/[0.08] bg-[#0d0d0f] px-4 text-left transition hover:border-white/[0.14] hover:bg-[#111113] active:bg-white/[0.035] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-5"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white/[0.055] text-zinc-300"><Navigation className="h-[17px] w-[17px]" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">Другой адрес</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">Ввести место вручную</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700" />
            </button>

            {busy ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Готовлю маршрут…
              </div>
            ) : null}
          </section>
        )}

        <footer className="mt-12 border-t border-white/[0.055] pt-5 text-center text-[10px] leading-5 text-zinc-700">
          Маршрут передаётся в Uber для финального подтверждения. Malik AI не хранит пароль Uber и данные оплаты.
        </footer>
      </div>
    </main>
  )
}
