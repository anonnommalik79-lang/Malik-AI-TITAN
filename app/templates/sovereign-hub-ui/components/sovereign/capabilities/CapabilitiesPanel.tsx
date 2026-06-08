"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { ArrowRight, Check, Copy, ExternalLink, Filter, Play, Search, SendHorizontal, ShieldCheck, Sparkles } from "lucide-react"
import { CAPABILITY_MODES } from "@/lib/ai/capabilities/categories"
import { getCapabilityCategorySummaries } from "@/lib/ai/capabilities/registry"
import { CAPABILITIES, renderCapabilityPrompt } from "@/lib/ai/capabilities/registry"
import { getFeaturedCapabilityGroups, getHomepageFeaturedCapabilities } from "@/lib/ai/capabilities/recommend"
import type { Capability, CapabilityCategory, CapabilitySuggestedMode } from "@/lib/ai/capabilities/types"
import { VIDEO_AI_TEMPLATES } from "@/lib/media-library"

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")

type CapabilitiesPanelProps = {
  variant?: "page" | "dashboard"
  onUseCapability?: (prompt: string, capability: Capability) => void
}

type CapabilityHomeShowcaseProps = {
  onSelectCapability: (capability: Capability) => void
  onOpenCapabilities?: () => void
}

const modeClass: Record<CapabilitySuggestedMode, string> = {
  fast: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  deep: "border-blue-300/25 bg-blue-300/10 text-blue-100",
  pro: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  code: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  photo: "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100",
  video: "border-rose-300/25 bg-rose-300/10 text-rose-100",
}

const riskClass: Record<Capability["riskLevel"], string> = {
  low: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  medium: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  high: "border-rose-300/20 bg-rose-300/10 text-rose-100",
}

function CapabilityCard({
  capability,
  active,
  onSelect,
}: {
  capability: Capability
  active?: boolean
  onSelect: (capability: Capability) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(capability)}
      className={cn(
        "group flex h-full min-h-[188px] flex-col justify-between rounded-lg border bg-white/[0.035] p-4 text-left text-white transition hover:border-cyan-200/35 hover:bg-white/[0.055]",
        active ? "border-cyan-200/45 shadow-[0_18px_60px_rgba(14,165,233,.16)]" : "border-white/10",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="truncate text-xs font-bold text-zinc-500">{capability.category}</span>
        <span className={cn("shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold", modeClass[capability.suggestedMode])}>
          {capability.suggestedMode}
        </span>
      </span>
      <span>
        <strong className="mt-4 block text-lg font-black leading-snug text-white">{capability.title}</strong>
        <span className="mt-2 line-clamp-3 block text-sm leading-6 text-zinc-400">{capability.description}</span>
      </span>
      <span className="mt-4 flex items-center justify-between gap-3">
        <span className={cn("rounded-md border px-2 py-1 text-[11px] font-bold", riskClass[capability.riskLevel])}>{capability.riskLevel} risk</span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-100 opacity-80">
          Select <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </span>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-8 text-center text-white">
      <Search className="mx-auto h-8 w-8 text-zinc-500" />
      <h3 className="mt-4 text-lg font-black">No capabilities found</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">Try a different category, mode or search term.</p>
    </div>
  )
}

export function CapabilitiesPanel({ variant = "page", onUseCapability }: CapabilitiesPanelProps) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<CapabilityCategory | "All">("All")
  const [mode, setMode] = useState<CapabilitySuggestedMode | "All">("All")
  const [selected, setSelected] = useState<Capability>(CAPABILITIES[0])
  const [context, setContext] = useState("")
  const [preparedPrompt, setPreparedPrompt] = useState(() => renderCapabilityPrompt(CAPABILITIES[0], ""))
  const [copied, setCopied] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [runResult, setRunResult] = useState("")
  const [runError, setRunError] = useState("")

  const categoryOptions = useMemo(() => getCapabilityCategorySummaries(), [])
  const featuredGroups = useMemo(() => getFeaturedCapabilityGroups(4), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CAPABILITIES.filter((capability) => {
      const categoryOk = category === "All" || capability.category === category
      const modeOk = mode === "All" || capability.suggestedMode === mode
      const text = `${capability.title} ${capability.category} ${capability.description} ${capability.tags.join(" ")}`.toLowerCase()
      const queryOk = !q || text.includes(q)
      return categoryOk && modeOk && queryOk
    })
  }, [category, mode, query])

  const selectCapability = (capability: Capability) => {
    setSelected(capability)
    setPreparedPrompt(renderCapabilityPrompt(capability, context))
    setRunResult("")
    setRunError("")
  }

  const preparePrompt = () => {
    setPreparedPrompt(renderCapabilityPrompt(selected, context))
    setRunResult("")
    setRunError("")
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard?.writeText(preparedPrompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setRunError("Clipboard is blocked in this browser.")
    }
  }

  const executeCapability = async () => {
    const prompt = renderCapabilityPrompt(selected, context)
    setPreparedPrompt(prompt)

    if (onUseCapability) {
      onUseCapability(prompt, selected)
      return
    }

    setIsRunning(true)
    setRunError("")
    setRunResult("")
    try {
      const response = await fetch("/api/ai/capability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilityId: selected.id, userInput: context, execute: true }),
      })
      const data = await response.json()
      if (!data?.ok && !data?.content) throw new Error(data?.publicError || data?.error || "Capability failed.")
      setRunResult(String(data?.content || data?.publicError || "Capability completed."))
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Capability failed.")
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <main className={cn("min-h-full bg-[#030303] text-white", variant === "dashboard" ? "h-full overflow-y-auto p-4 md:p-6" : "min-h-[100dvh] p-4 md:p-8")}>
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_90px_rgba(0,0,0,.35)] md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                Capabilities Engine
              </div>
              <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">200 practical MALIK AI abilities</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Search the registry, choose a category, prepare a mode-aware prompt and route the task through MALIK AI.
              </p>
            </div>
            {variant === "page" ? (
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-cyan-50">
                Open dashboard <ExternalLink className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <div className="mt-6 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/35 p-4"><strong className="block text-2xl">{CAPABILITIES.length}</strong><span className="text-zinc-500">registered capabilities</span></div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-4"><strong className="block text-2xl">{categoryOptions.length}</strong><span className="text-zinc-500">active categories</span></div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-4"><strong className="block text-2xl">{CAPABILITY_MODES.length}</strong><span className="text-zinc-500">safe public modes</span></div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.025] p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-200">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            Featured groups
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {featuredGroups.map((group) => (
              <div key={group.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                <h2 className="text-sm font-black">{group.title}</h2>
                <div className="mt-3 grid gap-2">
                  {group.capabilities.map((capability) => (
                    <button
                      key={capability.id}
                      type="button"
                      onClick={() => selectCapability(capability)}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-sm hover:border-cyan-200/30 hover:bg-white/[0.06]"
                    >
                      <span className="truncate">{capability.title}</span>
                      <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold", modeClass[capability.suggestedMode])}>{capability.suggestedMode}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0">
            <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
                <label className="relative block">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search abilities..."
                    className="h-11 w-full rounded-md border border-white/10 bg-black/55 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-300/45"
                  />
                </label>
                <label className="relative block">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as CapabilityCategory | "All")}
                    className="h-11 w-full appearance-none rounded-md border border-white/10 bg-black/55 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-300/45"
                  >
                    <option value="All">All categories</option>
                    {categoryOptions.map((item) => (
                      <option key={item.id} value={item.title}>{item.title}</option>
                    ))}
                  </select>
                </label>
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as CapabilitySuggestedMode | "All")}
                  className="h-11 rounded-md border border-white/10 bg-black/55 px-3 text-sm outline-none transition focus:border-cyan-300/45"
                >
                  <option value="All">All modes</option>
                  {CAPABILITY_MODES.filter((item) => item.id !== "memory").map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-xs text-zinc-500">Showing {filtered.length} of {CAPABILITIES.length} capabilities.</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filtered.length ? filtered.map((capability) => (
                <CapabilityCard key={capability.id} capability={capability} active={selected.id === capability.id} onSelect={selectCapability} />
              )) : <div className="sm:col-span-2 2xl:col-span-3"><EmptyState /></div>}
            </div>
          </section>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-lg border border-cyan-200/20 bg-[#05070c] p-4 shadow-[0_22px_80px_rgba(8,47,73,.2)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-zinc-500">{selected.category}</p>
                  <h2 className="mt-2 text-2xl font-black leading-tight">{selected.title}</h2>
                </div>
                <span className={cn("shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold", modeClass[selected.suggestedMode])}>{selected.suggestedMode}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{selected.description}</p>
              {selected.disclaimer ? (
                <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                  <ShieldCheck className="mb-2 h-4 w-4" />
                  {selected.disclaimer}
                </div>
              ) : null}

              <label className="mt-4 block text-xs font-bold text-zinc-500">Context</label>
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Add your business, task, audience, document text or goal..."
                className="mt-2 min-h-28 w-full resize-y rounded-md border border-white/10 bg-black/45 p-3 text-sm leading-6 outline-none transition focus:border-cyan-300/45"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={preparePrompt} className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-bold hover:bg-white/[0.08]">
                  <Sparkles className="h-4 w-4" />
                  Prepare
                </button>
                <button type="button" onClick={copyPrompt} className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-bold hover:bg-white/[0.08]">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                type="button"
                onClick={executeCapability}
                disabled={isRunning}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-3 text-sm font-black text-black transition hover:bg-cyan-50 disabled:opacity-60"
              >
                {onUseCapability ? <SendHorizontal className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isRunning ? "Running..." : onUseCapability ? "Send to chat" : "Run capability"}
              </button>

              <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/55 p-3">
                <p className="mb-2 text-xs font-bold text-zinc-500">Prepared prompt</p>
                <pre className="whitespace-pre-wrap text-xs leading-5 text-zinc-300">{preparedPrompt}</pre>
              </div>

              {runError ? <div className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{runError}</div> : null}
              {runResult ? (
                <div className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-50">
                  {runResult}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function CapabilityVideoCard({
  capability,
  videoSrc,
  poster,
  tint,
  onSelectCapability,
}: {
  capability: Capability
  videoSrc: string
  poster: string
  tint: string
  onSelectCapability: (capability: Capability) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [photoNote, setPhotoNote] = useState("")

  useEffect(() => {
    const node = videoRef.current
    if (!node) return
    if (playing) void node.play().catch(() => {})
    else node.pause()
  }, [playing])

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoNote(file.name)
    onSelectCapability({
      ...capability,
      promptTemplate: `${capability.promptTemplate}\n\nUser reference photo: ${file.name} — use for visual direction.`,
    })
    setPlaying(true)
  }

  return (
    <article
      className={cn(
        "group relative min-h-[168px] overflow-hidden rounded-xl border text-left transition",
        playing ? "border-cyan-300/40 shadow-[0_0_40px_rgba(34,211,238,.18)]" : "border-white/10 hover:border-cyan-200/25",
      )}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={videoSrc}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
      />
      <div className="absolute inset-0" style={{ background: tint }} />
      <div className="absolute inset-0 bg-gradient-to-t from-[#02040a] via-[#02040a]/55 to-transparent" />
      <button
        type="button"
        onClick={() => {
          setPlaying(true)
          onSelectCapability(capability)
        }}
        className="relative z-10 flex h-full min-h-[168px] w-full flex-col justify-end p-3 text-left"
      >
        <span className="block text-sm font-black leading-snug text-white">{capability.title}</span>
        <span className={cn("mt-2 inline-flex w-fit rounded-md border px-2 py-0.5 text-[11px] font-bold", modeClass[capability.suggestedMode])}>
          {capability.suggestedMode}
        </span>
        <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100/80">
          {playing ? "Видео играет · промпт готов" : "Нажми — запустить шаблон"}
        </span>
      </button>
      <label className="absolute right-2 top-2 z-20 cursor-pointer rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur hover:bg-black/75">
        + фото
        <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </label>
      {photoNote ? <span className="absolute bottom-2 right-2 z-20 rounded bg-black/60 px-2 py-0.5 text-[9px] text-cyan-100">{photoNote}</span> : null}
    </article>
  )
}

export function CapabilityHomeShowcase({ onSelectCapability, onOpenCapabilities }: CapabilityHomeShowcaseProps) {
  const groups = useMemo(() => getHomepageFeaturedCapabilities(), [])
  const openAllCapabilities = () => {
    if (onOpenCapabilities) onOpenCapabilities()
    else window.location.href = "/capabilities"
  }

  return (
    <section className="mx-auto mt-8 w-full max-w-6xl px-4 md:px-6" aria-label="Featured capabilities">
      <div className="rounded-2xl border border-white/10 bg-[#04060d]/88 p-4 text-white shadow-[0_24px_90px_rgba(0,0,0,.45)] backdrop-blur-md md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold text-cyan-100">Capabilities Engine · Video templates</p>
            <h2 className="mt-1 text-2xl font-black">Featured practical abilities</h2>
            <p className="mt-1 text-xs text-slate-500">Нажми карточку — видео играет. Можно добавить своё фото.</p>
          </div>
          <button
            type="button"
            onClick={openAllCapabilities}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-bold hover:bg-white/[0.08]"
          >
            All capabilities <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="rounded-xl border border-white/10 bg-black/35 p-3">
              <h3 className="text-sm font-black">{group.title}</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {group.capabilities.map((capability, capIndex) => {
                  const template = VIDEO_AI_TEMPLATES[(groupIndex * 3 + capIndex) % VIDEO_AI_TEMPLATES.length]
                  return (
                    <CapabilityVideoCard
                      key={capability.id}
                      capability={capability}
                      videoSrc={template.src}
                      poster={template.poster}
                      tint={template.tint}
                      onSelectCapability={onSelectCapability}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default CapabilitiesPanel
