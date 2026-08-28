"use client"

import { useMemo, useState } from "react"
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
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

const TEMPLATE_META: Array<{ id: TemplateId; title: string; note: string; icon: typeof Home }> = [
  { id: "home", title: "Домой", note: "Сохранить один раз", icon: Home },
  { id: "work", title: "На работу", note: "Сохранить один раз", icon: BriefcaseBusiness },
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
        ? "Разреши Malik AI доступ к геопозиции — она нужна только для точки подачи."
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

function UberMark() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white text-[16px] font-black tracking-[-0.04em] text-black shadow-[0_12px_40px_rgba(0,0,0,.38)]">
      UBER
    </span>
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
    if (editing === "home") return "Адрес дома"
    if (editing === "work") return "Адрес работы"
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
    <main className="min-h-[100dvh] bg-[#050506] text-white selection:bg-white selection:text-black">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#050506]/95 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => window.location.assign("/dashboard")} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/[0.06] hover:text-white" aria-label="Вернуться в Malik AI">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div>
            <p className="text-[13px] font-semibold tracking-[-0.01em]">Malik AI <span className="text-zinc-600">/</span> Taxi</p>
            <p className="text-[10px] text-zinc-600">Real Ride V1 · official Uber handoff</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-2.5 py-1 text-[10px] text-emerald-300">Real rides</span>
          <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-zinc-500">0 LLM tokens</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[920px] px-4 py-9 sm:px-6 sm:py-14">
        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-400/15 bg-red-400/[0.055] px-4 py-3 text-[12px] leading-5 text-red-100">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="flex flex-col gap-7 border-b border-white/[0.07] pb-9 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <UberMark />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-[-0.04em]">Uber</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-medium text-emerald-300"><ShieldCheck className="h-2.5 w-2.5" /> официальный переход</span>
              </div>
              <p className="mt-1 max-w-lg text-xs leading-5 text-zinc-600">Malik заполняет маршрут. Финальное подтверждение поездки сейчас происходит в Uber, пока Riders API не выдал Malik user ride-request access.</p>
            </div>
          </div>
          <a href="/taxi/native" className="inline-flex h-9 items-center justify-center rounded-xl border border-white/[0.08] px-3 text-[11px] text-zinc-500 transition hover:bg-white/[0.04] hover:text-white">Native API mode</a>
        </section>

        {prepared ? (
          <section className="mx-auto mt-10 max-w-[640px]">
            <div className="rounded-[26px] border border-white/[0.09] bg-[#0b0b0d] p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Маршрут готов</p>
                  <h2 className="mt-1 truncate text-lg font-semibold">{prepared.destination.nickname || "Uber"}</h2>
                </div>
              </div>
              <div className="mt-5 flex gap-3 rounded-2xl border border-white/[0.06] bg-black/35 p-4">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <p className="text-xs leading-5 text-zinc-400">{prepared.destination.address}</p>
              </div>
              <button type="button" onClick={() => openUber(true)} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-black transition hover:bg-zinc-200">
                Открыть Uber и подтвердить поездку <ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => openUber(false)} className="mt-2 h-10 w-full rounded-xl text-[11px] text-zinc-600 hover:text-zinc-300">Открыть веб-версию Uber</button>
            </div>
            <button type="button" onClick={() => setPrepared(null)} className="mt-4 w-full text-center text-xs text-zinc-600 hover:text-white">Выбрать другой маршрут</button>
          </section>
        ) : editing ? (
          <section className="mx-auto mt-10 max-w-[600px]">
            <button type="button" onClick={() => setEditing(null)} className="mb-5 inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Назад</button>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600">Шаблон</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">{editingTitle}</h2>
            <p className="mt-3 text-sm text-zinc-500">Напиши полный адрес или название места. Для шаблонов Malik сохранит его только в этом браузере.</p>
            <div className="mt-6 flex gap-2 rounded-2xl border border-white/[0.09] bg-[#0b0b0d] p-2">
              <MapPin className="ml-2 mt-3 h-4 w-4 shrink-0 text-zinc-600" />
              <input autoFocus value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveAndPrepare() }} placeholder="Например: Dostyk Plaza, Almaty" className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-zinc-700" />
              <button type="button" onClick={() => void saveAndPrepare()} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </section>
        ) : (
          <section className="mt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600">Быстрый заказ</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] sm:text-[40px]">Куда едем?</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Шаблоны не вызывают ИИ. Нажал → Malik берёт геопозицию → готовит официальный Uber-маршрут → остаётся подтвердить поездку.</p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {TEMPLATE_META.map((template) => {
                const Icon = template.icon
                const value = templates[template.id]
                return (
                  <div key={template.id} className="group relative rounded-[22px] border border-white/[0.08] bg-[#0b0b0d] p-5 transition hover:border-white/[0.15] hover:bg-white/[0.035]">
                    <button type="button" onClick={() => void runTemplate(template.id)} disabled={busy} className="w-full text-left disabled:opacity-50">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-zinc-300"><Icon className="h-5 w-5" /></div>
                      <h3 className="mt-5 text-[15px] font-semibold">{template.title}</h3>
                      <p className="mt-1 truncate text-[11px] text-zinc-600">{value || template.note}</p>
                    </button>
                    <button type="button" onClick={() => openEditor(template.id)} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl text-zinc-700 opacity-0 transition hover:bg-white/[0.06] hover:text-white group-hover:opacity-100" aria-label={`Изменить ${template.title}`}><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                )
              })}
            </div>

            <button type="button" onClick={() => openEditor("custom")} disabled={busy} className="mt-3 flex min-h-16 w-full items-center gap-4 rounded-[20px] border border-white/[0.08] bg-[#0b0b0d] px-5 text-left transition hover:border-white/[0.15] hover:bg-white/[0.035] disabled:opacity-50">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/[0.08] text-zinc-400"><Navigation className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">Другой адрес</p><p className="mt-1 text-[11px] text-zinc-600">Ввести место вручную</p></div>
              <ChevronRight className="h-4 w-4 text-zinc-700" />
            </button>

            {busy ? <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-600"><Loader2 className="h-4 w-4 animate-spin" /> Определяю геопозицию и готовлю Uber…</div> : null}

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.06] p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-700">1</p><p className="mt-2 text-xs text-zinc-400">Выбери шаблон</p></div>
              <div className="rounded-2xl border border-white/[0.06] p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-700">2</p><p className="mt-2 text-xs text-zinc-400">Malik заполнит маршрут</p></div>
              <div className="rounded-2xl border border-white/[0.06] p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-700">3</p><p className="mt-2 text-xs text-zinc-400">Подтверди в Uber</p></div>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-white/[0.06] pt-5 text-center text-[10px] leading-5 text-zinc-700">
          Маршрут передаётся через официальный Uber deep-link flow. Поиск адреса: OpenStreetMap / Nominatim. Malik AI не хранит пароль Uber и не принимает оплату за поездку.
        </footer>
      </div>
    </main>
  )
}
