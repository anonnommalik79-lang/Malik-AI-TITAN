"use client"

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { buildCanvasSrcDoc, createCanvasBlobUrl, stripCodeFence, CANVAS_DEFAULT_PREVIEW_HTML } from "@/lib/canvas-preview"
import type { ReactNode } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  Folder,
  Maximize2,
  Minimize2,
  Monitor,
  Play,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tablet,
  Terminal,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaGenerationPlaceholder, type MediaGenerationKind } from "./media-generation-placeholder"
import { MobileNavigationGuard } from "./mobile-navigation-guard"
import type { GenerationStatusType } from "./generation-status"

type DeviceType = "desktop" | "tablet" | "mobile"
type ViewMode = "preview" | "code" | "files" | "console"

interface PreviewPanelProps {
  isLoading?: boolean
  hasContent?: boolean
  generatedCode?: string
  version?: number
  totalVersions?: number
  onVersionChange?: (version: number) => void
  mobileMode?: boolean
  onCloseMobile?: () => void
  onHomeMobile?: () => void
  onClose?: () => void
  onCreateArtifact?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  isGenerating?: boolean
  generationKind?: GenerationStatusType
  initialViewMode?: ViewMode
  contentHash?: string
}

type CanvasBlueprintFile = {
  path: string
  role: string
  status: "ready" | "generated" | "planned"
}

const CANVAS_BLUEPRINT_FILES: CanvasBlueprintFile[] = [
  { path: "app/generated/page.tsx", role: "Main artifact screen", status: "ready" },
  { path: "components/generated/Hero.tsx", role: "Premium hero section", status: "generated" },
  { path: "components/generated/States.tsx", role: "Loading / empty / success states", status: "generated" },
  { path: "components/generated/CommandBar.tsx", role: "Demo controls and actions", status: "planned" },
  { path: "styles/generated.css", role: "Motion, glass, responsive polish", status: "ready" },
]

const CANVAS_EMPTY_STEPS = [
  { n: "01", title: "Сгенерируйте сайт", detail: "Опишите идею в чате — Malik соберёт artifact" },
  { n: "02", title: "Откройте Code preview", detail: "Переключитесь на вкладку Code для исходников" },
  { n: "03", title: "Проверьте responsive", detail: "Desktop, tablet и mobile в один клик" },
  { n: "04", title: "Экспортируйте artifact", detail: "Copy, Download или открыть в новой вкладке" },
] as const

function PreviewPanelInner({
  isLoading,
  hasContent,
  generatedCode,
  version = 1,
  totalVersions = 1,
  onVersionChange,
  mobileMode,
  onCloseMobile,
  onHomeMobile,
  onClose,
  onCreateArtifact,
  isFullscreen = false,
  onToggleFullscreen,
  isGenerating,
  generationKind = "website",
  initialViewMode = "preview",
  contentHash,
}: PreviewPanelProps) {
  const [device, setDevice] = useState<DeviceType>("desktop")
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode)
  const [copied, setCopied] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [progress, setProgress] = useState(0)
  const [iframeSrc, setIframeSrc] = useState("")
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const stableHashRef = useRef("")
  const deferredCode = useDeferredValue(generatedCode || "")
  const srcDoc = useMemo(() => buildCanvasSrcDoc(deferredCode), [deferredCode])
  const busy = Boolean(isLoading || isGenerating)
  const ready = Boolean(hasContent || generatedCode)
  const iframeMountKey = contentHash || (ready && !busy ? srcDoc.slice(0, 96) : "loading")

  useEffect(() => {
    if (contentHash && contentHash !== stableHashRef.current && !busy) {
      stableHashRef.current = contentHash
    }
  }, [contentHash, busy])

  useEffect(() => {
    if (busy && !deferredCode) return
    const url = createCanvasBlobUrl(srcDoc)
    setIframeSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [srcDoc, iframeKey, busy, deferredCode])

  useEffect(() => {
    if (!busy) {
      setProgress(100)
      return
    }
    setProgress(7)
    const timer = window.setInterval(() => setProgress((value) => Math.min(96, value + 4)), 120)
    return () => window.clearInterval(timer)
  }, [busy])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(viewMode === "code" ? stripCodeFence(generatedCode || "") : srcDoc)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDownload = () => {
    const body = viewMode === "code" ? stripCodeFence(generatedCode || "") : srcDoc
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = viewMode === "code" ? "malik-generated.tsx" : "malik-preview.html"
    a.click()
    URL.revokeObjectURL(url)
  }

  const openNew = () => {
    const win = window.open()
    if (!win) return
    win.document.write(srcDoc)
    win.document.close()
  }

  const deviceWidths = {
    desktop: { width: "100%", maxWidth: "100%" },
    tablet: { width: "820px", maxWidth: "100%" },
    mobile: { width: "390px", maxWidth: "100%" },
  } as const
  const activeDeviceWidth = mobileMode ? deviceWidths.desktop : deviceWidths[device]
  const mediaKind: MediaGenerationKind = generationKind === "image" || generationKind === "video" || generationKind === "code" || generationKind === "website" ? generationKind : "website"

  const artifactSizeLabel = useMemo(() => {
    const size = stripCodeFence(generatedCode || "").length
    if (!size) return "No artifact"
    if (size < 1000) return `${size} chars`
    return `${(size / 1000).toFixed(1)}k chars`
  }, [generatedCode])

  const canvasHealth = useMemo(() => {
    if (busy) return "Generating"
    if (ready) return "Ready for demo"
    return "Waiting for artifact"
  }, [busy, ready])

  const consoleLines = useMemo(() => [
    "$ malik canvas status --titan",
    `artifact: ${ready ? "ready" : "empty"}`,
    `kind: ${generationKind}`,
    `size: ${artifactSizeLabel}`,
    `device: ${mobileMode ? "mobile-overlay" : device}`,
    `fullscreen: ${isFullscreen ? "on" : "off"}`,
    "preview shell: online",
    "copy/download: armed",
    "demo handoff: ready",
  ], [artifactSizeLabel, device, generationKind, isFullscreen, mobileMode, ready])

  const viewTabs: Array<{ id: ViewMode; label: string; icon: ReactNode }> = [
    { id: "preview", label: "Preview", icon: <Eye className="h-3.5 w-3.5" /> },
    { id: "code", label: "Code", icon: <Code className="h-3.5 w-3.5" /> },
    { id: "files", label: "Files", icon: <Folder className="h-3.5 w-3.5" /> },
    { id: "console", label: "Console", icon: <Terminal className="h-3.5 w-3.5" /> },
  ]

  const handleClose = onClose || onCloseMobile

  return (
    <div
      className={cn(
        "malik-canvas-v0 malik-canvas-titan flex h-full min-h-0 w-full overflow-hidden text-white",
        mobileMode && "border-l-0",
        isFullscreen && "malik-canvas-v0--fs",
      )}
      style={{ contain: "layout style paint" }}
    >
      {mobileMode && (
        <MobileNavigationGuard
          title="Canvas"
          showClose
          onBack={onCloseMobile}
          onHome={onHomeMobile || onCloseMobile}
          onClose={onCloseMobile}
        />
      )}

      {!mobileMode && (
        <aside className="malik-canvas-files-sidebar canvas-v0-sidebar hidden w-[260px] shrink-0 flex-col lg:flex">
          <div className="malik-canvas-files-head border-b border-white/10 px-4 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/55">Workspace</p>
            <h2 className="mt-1 font-mono text-sm font-bold text-white">generated/</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-0.5">
              {CANVAS_BLUEPRINT_FILES.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setViewMode("files")}
                  className={cn(
                    "malik-canvas-file-row group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                    viewMode === "files" && "is-active",
                  )}
                >
                  <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/60 group-hover:text-cyan-200" />
                  <span className="min-w-0 font-mono text-[11px] leading-5">
                    <span className="block truncate text-zinc-200 group-hover:text-white">{file.path}</span>
                    <span className="block truncate text-[10px] text-zinc-500">{file.role}</span>
                  </span>
                  <span className={cn(
                    "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                    file.status === "ready" && "text-emerald-300/80",
                    file.status === "generated" && "text-cyan-300/80",
                    file.status === "planned" && "text-violet-300/70",
                  )}>
                    {file.status}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-2.5 text-xs font-bold text-emerald-100/90">
              <span className="malik-canvas-live-dot mr-2 inline-block" />
              Canvas online
            </div>
          </div>
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="malik-canvas-header flex shrink-0 items-center gap-3 px-3 py-2.5 sm:px-4">
          <div className="malik-canvas-header-left flex min-w-0 shrink-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10">
              <Sparkles className="h-4 w-4 text-cyan-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-black tracking-tight text-white">Malik Canvas</h3>
                <span className="malik-canvas-live-dot" aria-hidden="true" />
                <span className="malik-canvas-artifact-badge">artifact</span>
              </div>
              <p className="truncate text-[11px] text-slate-400">v0 style · {canvasHealth}</p>
            </div>
          </div>

          <nav className="malik-canvas-tab-pills mx-auto hidden items-center gap-1 md:flex" aria-label="Canvas views">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={cn("malik-canvas-tab-pill", viewMode === tab.id && "is-active")}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="malik-canvas-header-actions flex shrink-0 items-center gap-1">
            {totalVersions > 1 && (
              <div className="malik-canvas-device-toggle hidden items-center gap-0.5 px-1 md:flex">
                <IconBtn onClick={() => onVersionChange?.(Math.max(1, version - 1))} icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Previous version" disabled={version <= 1} />
                <span className="px-1 text-[10px] font-black text-zinc-400">v{version}/{totalVersions}</span>
                <IconBtn onClick={() => onVersionChange?.(Math.min(totalVersions, version + 1))} icon={<ChevronRight className="h-3.5 w-3.5" />} label="Next version" disabled={version >= totalVersions} />
              </div>
            )}

            {viewMode === "preview" && !mobileMode && (
              <div className="malik-canvas-device-toggle hidden p-0.5 md:flex">
                <IconBtn onClick={() => setDevice("desktop")} icon={<Monitor className="h-3.5 w-3.5" />} label="Desktop" active={device === "desktop"} />
                <IconBtn onClick={() => setDevice("tablet")} icon={<Tablet className="h-3.5 w-3.5" />} label="Tablet" active={device === "tablet"} />
                <IconBtn onClick={() => setDevice("mobile")} icon={<Smartphone className="h-3.5 w-3.5" />} label="Mobile" active={device === "mobile"} />
              </div>
            )}

            {ready && <IconBtn onClick={() => setIframeKey((key) => key + 1)} icon={<RefreshCw className="h-3.5 w-3.5" />} label="Refresh" />}
            {ready && <IconBtn onClick={handleCopy} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} label="Copy" active={copied} />}
            {ready && <IconBtn onClick={handleDownload} icon={<Download className="h-3.5 w-3.5" />} label="Download" />}
            {ready && <IconBtn onClick={openNew} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Open new" />}
            {onToggleFullscreen && (
              <IconBtn
                onClick={onToggleFullscreen}
                icon={isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                active={isFullscreen}
              />
            )}
            {handleClose && <IconBtn onClick={handleClose} icon={<X className="h-3.5 w-3.5" />} label="Close canvas" />}
          </div>
        </header>

        <div className="malik-canvas-tab-pills flex shrink-0 gap-1 overflow-x-auto border-b border-white/8 px-3 py-2 md:hidden">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewMode(tab.id)}
              className={cn("malik-canvas-tab-pill shrink-0", viewMode === tab.id && "is-active")}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {busy && (
          <div className="malik-canvas-progress h-0.5 bg-black/60">
            <div className="malik-canvas-progress-bar h-full transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="canvas-v0-stage malik-canvas-stage relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4" style={{ pointerEvents: "auto" }}>
          <div className="malik-canvas-starfield pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="malik-canvas-atmosphere pointer-events-none absolute inset-0" aria-hidden="true" />

          {busy && !ready ? (
            <MediaGenerationPlaceholder kind={mediaKind} status="generating" title="Building Malik canvas artifact..." />
          ) : !ready ? (
            <div className="malik-canvas-empty relative flex h-full min-h-[520px] items-center justify-center p-4 sm:p-6">
              <div className="malik-canvas-empty-card w-full max-w-2xl p-8 text-center sm:p-10">
                <div className="malik-canvas-empty-icon mx-auto flex h-16 w-16 items-center justify-center rounded-2xl">
                  <Sparkles className="h-7 w-7 text-cyan-100" />
                </div>
                <h2 className="mt-6 text-2xl font-black tracking-tight text-white sm:text-3xl">Canvas пуст</h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
                  Здесь появится preview после создания сайта, кода, документа или другого artifact.
                </p>

                <div className="malik-canvas-empty-steps mt-8 grid gap-3 text-left sm:grid-cols-2">
                  {CANVAS_EMPTY_STEPS.map((step) => (
                    <div key={step.n} className="malik-canvas-empty-step rounded-2xl p-4">
                      <span className="malik-canvas-step-badge">{step.n}</span>
                      <p className="mt-2 text-sm font-black text-white">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{step.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="malik-canvas-footer mt-8 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={handleClose} className="malik-canvas-ghost-btn">
                    Закрыть Canvas
                  </button>
                  <button type="button" onClick={onCreateArtifact} className="malik-canvas-cta-primary">
                    <span>Создать artifact</span>
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="malik-canvas-browser relative mx-auto flex h-full min-h-[640px] flex-col overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#05070d]"
              style={{ width: activeDeviceWidth.width, maxWidth: activeDeviceWidth.maxWidth }}
            >
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 bg-[#070a12] px-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
                  <span className="ml-2 hidden rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] text-zinc-500 md:inline">malik-preview.local</span>
                </div>
                <button type="button" onClick={() => setViewMode("preview")} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-100">
                  <Play className="h-3 w-3" />
                  Live
                </button>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-white/[0.02] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                <span>{canvasHealth}</span>
                <span>{artifactSizeLabel}</span>
              </div>

              {viewMode === "preview" ? (
                busy && !ready ? (
                  <div className="min-h-0 flex-1 animate-pulse bg-[#0a0d14] p-6">
                    <div className="mx-auto h-10 w-48 rounded-xl bg-white/10" />
                    <div className="mx-auto mt-8 h-64 max-w-2xl rounded-3xl bg-white/[0.06]" />
                    <div className="mx-auto mt-6 grid max-w-2xl gap-3 md:grid-cols-3">
                      {[0, 1, 2].map((slot) => (
                        <div key={slot} className="h-24 rounded-2xl bg-white/[0.05]" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <iframe
                    key={`${iframeMountKey}-${iframeKey}`}
                    ref={iframeRef}
                    src={iframeSrc || undefined}
                    className="min-h-0 flex-1 bg-white"
                    title="Malik Preview"
                    loading={busy ? "eager" : "lazy"}
                    sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
                  />
                )
              ) : viewMode === "code" ? (
                <pre className="min-h-0 flex-1 overflow-auto bg-[#02040a] p-5 font-mono text-xs leading-6 text-slate-200">
                  <code>{stripCodeFence(generatedCode || CANVAS_DEFAULT_PREVIEW_HTML)}</code>
                </pre>
              ) : viewMode === "files" ? (
                <div className="min-h-0 flex-1 overflow-auto bg-[#02040a] p-5">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Generated workspace</p>
                  {CANVAS_BLUEPRINT_FILES.map((file) => (
                    <div key={file.path} className="malik-canvas-file-card mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-mono text-sm text-zinc-200">{file.path}</span>
                        <span className="shrink-0 rounded border border-cyan-300/15 bg-cyan-300/10 px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider text-cyan-100">{file.status}</span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-zinc-500">{file.role}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="min-h-0 flex-1 overflow-auto bg-black p-5 font-mono text-xs leading-6 text-emerald-200">
                  <code>{consoleLines.join("\n")}</code>
                </pre>
              )}
            </div>
          )}
        </div>

        {ready && (
          <footer className="malik-canvas-footer-bar flex shrink-0 items-center justify-between gap-3 border-t border-white/8 px-4 py-2.5">
            <button type="button" onClick={handleClose} className="malik-canvas-ghost-btn text-xs">
              Закрыть Canvas
            </button>
            <button type="button" onClick={onCreateArtifact} className="malik-canvas-cta-primary text-xs">
              <span>Создать artifact</span>
            </button>
          </footer>
        )}
      </section>
    </div>
  )
}

export const PreviewPanel = memo(PreviewPanelInner)

function IconBtn({ icon, onClick, label, active, disabled }: { icon: ReactNode; onClick: () => void; label: string; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "malik-canvas-icon-btn rounded-lg p-2 text-zinc-400 transition hover:text-white disabled:opacity-35",
        active && "is-active text-white",
      )}
    >
      {icon}
    </button>
  )
}
