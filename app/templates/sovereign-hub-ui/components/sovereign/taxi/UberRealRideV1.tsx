"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronRight,
  Home,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Plane,
  X,
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

const UBER_PATH = "M0 7.97v4.958c0 1.867 1.302 3.101 3 3.101.826 0 1.562-.316 2.094-.87v.736H6.27V7.97H5.082v4.888c0 1.257-.85 2.106-1.947 2.106-1.11 0-1.946-.827-1.946-2.106V7.971H0zm7.44 0v7.925h1.13v-.725c.521.532 1.257.86 2.06.86a3.006 3.006 0 0 0 3.034-3.01 3.01 3.01 0 0 0-3.033-3.024 2.86 2.86 0 0 0-2.049.861V7.971H7.439zm9.869 2.038c-1.687 0-2.965 1.37-2.965 3 0 1.72 1.334 3.01 3.066 3.01 1.053 0 1.913-.463 2.49-1.233l-.826-.611c-.43.577-.996.847-1.664.847-.973 0-1.753-.7-1.912-1.64h4.697v-.373c0-1.72-1.222-3-2.886-3zm6.295.068c-.634 0-1.098.294-1.381.758v-.713h-1.131v5.774h1.142V12.61c0-.894.544-1.47 1.291-1.47H24v-1.065h-.396zm-6.319.928c.85 0 1.564.588 1.756 1.47H15.52c.203-.882.916-1.47 1.765-1.47zm-6.732.012c1.086 0 1.98.883 1.98 2.004a1.993 1.993 0 0 1-1.98 2.001A1.989 1.989 0 0 1 8.56 13.02a1.99 1.99 0 0 1 1.992-2.004z"

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

function UberLogo({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg role="img" aria-label="Uber" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d={UBER_PATH} />
    </svg>
  )
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[22px] border border-white/[0.10] bg-[#0a0a0a] ${className}`}>{children}</div>
}

function IconBox({ children }: { children: ReactNode }) {
  return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/[0.10] bg-black text-white">{children}</div>
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
    <main
      className="min-h-[100dvh] bg-black font-sans text-white selection:bg-white selection:text-black"
      style={{ WebkitTapHighlightColor: "transparent", colorScheme: "dark" }}
    >
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-black/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[960px] items-center justify-between px-4 sm:px-6">
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
            <UberLogo className="h-[15px] w-auto text-white" />
          </div>

          <div className="h-10 w-10" aria-hidden />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[960px] px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-[18px] border border-white/[0.14] bg-[#0a0a0a] px-4 py-3.5 text-[12px] leading-5 text-white">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/[0.08] hover:text-white" aria-label="Закрыть">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <section className="mb-9 sm:mb-11">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/[0.12] bg-[#0a0a0a] text-white">
            <UberLogo className="h-7 w-auto" />
          </div>
          <h1 className="max-w-2xl text-[36px] font-semibold leading-[1.02] tracking-[-0.06em] sm:text-[48px]">Заказать поездку</h1>
          <p className="mt-3 max-w-xl text-[13px] leading-6 text-white/50 sm:text-[14px]">
            Выбери шаблон или введи адрес. Malik подготовит маршрут и передаст его в Uber для финального подтверждения.
          </p>
        </section>

        {prepared ? (
          <section className="mx-auto max-w-[680px]">
            <Panel className="overflow-hidden">
              <div className="border-b border-white/[0.08] px-5 py-5 sm:px-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-white/45">Маршрут готов</p>
                    <h2 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.04em]">{prepared.destination.nickname || "Uber"}</h2>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.10] bg-black text-white">
                    <UberLogo className="h-5 w-auto" />
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <div className="relative pl-8">
                  <div className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-px bg-white/15" />
                  <div className="relative pb-5">
                    <span className="absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-black" />
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">Откуда</p>
                    <p className="mt-1 text-[13px] text-white">Текущее местоположение</p>
                  </div>
                  <div className="relative">
                    <span className="absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-[3px] bg-white" />
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">Куда</p>
                    <p className="mt-1 text-[13px] leading-5 text-white">{prepared.destination.address}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openUber(true)}
                  className="mt-7 flex h-[54px] w-full touch-manipulation items-center justify-center gap-2 rounded-[16px] bg-white px-5 text-[14px] font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  Подтвердить поездку <ChevronRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => openUber(false)}
                  className="mt-2 h-11 w-full touch-manipulation rounded-[14px] border border-white/[0.10] bg-black text-[12px] font-medium text-white transition hover:bg-white/[0.06] active:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Открыть Uber в браузере
                </button>
              </div>
            </Panel>

            <button type="button" onClick={() => setPrepared(null)} className="mt-4 w-full py-2 text-center text-[12px] text-white/45 hover:text-white">Изменить маршрут</button>
          </section>
        ) : editing ? (
          <section className="mx-auto max-w-[680px]">
            <button type="button" onClick={() => setEditing(null)} className="mb-5 inline-flex h-10 touch-manipulation items-center gap-2 rounded-full px-1 text-[12px] text-white/55 hover:text-white focus-visible:outline-none">
              <ArrowLeft className="h-4 w-4" /> Назад
            </button>

            <h2 className="text-[30px] font-semibold tracking-[-0.055em] sm:text-[36px]">{editingTitle}</h2>
            <p className="mt-2 text-[13px] leading-5 text-white/45">Введи полный адрес или название места.</p>

            <Panel className="mt-6 p-2">
              <div className="flex items-center gap-1">
                <div className="grid h-12 w-12 shrink-0 place-items-center text-white/55"><MapPin className="h-[18px] w-[18px]" /></div>
                <input
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="go"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void saveAndPrepare() }}
                  placeholder="Например: Dostyk Plaza, Almaty"
                  className="h-12 min-w-0 flex-1 appearance-none bg-transparent px-1 text-[14px] text-white caret-white outline-none placeholder:text-white/25"
                />
                <button
                  type="button"
                  onClick={() => void saveAndPrepare()}
                  disabled={busy}
                  className="grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-[14px] bg-white text-black transition active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label="Продолжить"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </Panel>
          </section>
        ) : (
          <section>
            <div className="grid gap-3 sm:grid-cols-3">
              {TEMPLATE_META.map((template) => {
                const Icon = template.icon
                const value = templates[template.id]
                return (
                  <Panel key={template.id} className="group relative overflow-hidden transition hover:border-white/[0.18]">
                    <button
                      type="button"
                      onClick={() => void runTemplate(template.id)}
                      disabled={busy}
                      className="flex min-h-[132px] w-full touch-manipulation flex-col items-start p-5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.05] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
                    >
                      <IconBox><Icon className="h-[19px] w-[19px]" /></IconBox>
                      <p className="mt-4 text-[15px] font-semibold tracking-[-0.02em]">{template.title}</p>
                      <p className="mt-1 max-w-full truncate text-[11px] text-white/35">{value || template.note}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(template.id)}
                      className="absolute right-3 top-3 grid h-9 w-9 touch-manipulation place-items-center rounded-full text-white/35 transition hover:bg-white/[0.08] hover:text-white active:bg-white/[0.12] sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Изменить ${template.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </Panel>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => openEditor("custom")}
              disabled={busy}
              className="mt-3 flex min-h-[72px] w-full touch-manipulation items-center gap-4 rounded-[22px] border border-white/[0.10] bg-[#0a0a0a] px-5 text-left transition hover:border-white/[0.18] hover:bg-white/[0.025] active:bg-white/[0.05] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <IconBox><Navigation className="h-[18px] w-[18px]" /></IconBox>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold tracking-[-0.02em]">Другой адрес</p>
                <p className="mt-1 text-[11px] text-white/35">Ввести место вручную</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
            </button>

            {busy ? (
              <div className="mt-5 flex items-center justify-center gap-2 text-[12px] text-white/45">
                <Loader2 className="h-4 w-4 animate-spin" /> Готовлю маршрут…
              </div>
            ) : null}

            <div className="mt-10 grid gap-px overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-3">
              <div className="bg-black px-5 py-4"><p className="text-[10px] text-white/30">01</p><p className="mt-1 text-[12px] text-white/75">Выбери маршрут</p></div>
              <div className="bg-black px-5 py-4"><p className="text-[10px] text-white/30">02</p><p className="mt-1 text-[12px] text-white/75">Malik заполнит поездку</p></div>
              <div className="bg-black px-5 py-4"><p className="text-[10px] text-white/30">03</p><p className="mt-1 text-[12px] text-white/75">Подтверди в Uber</p></div>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-white/[0.07] pt-5 text-center text-[10px] leading-5 text-white/25">
          Маршрут передаётся в Uber. Malik AI не хранит пароль Uber и не принимает оплату за поездку.
        </footer>
      </div>
    </main>
  )
}
