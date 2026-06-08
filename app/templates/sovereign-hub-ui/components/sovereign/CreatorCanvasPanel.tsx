"use client"

import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { PreviewPanel } from "./preview-panel"
import { canvasContentHash } from "@/lib/prompt-intent"
import { RefreshCw, Sparkles } from "lucide-react"
import type { GenerationStatusType } from "./generation-status"

type CreatorCanvasPanelProps = {
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
  canvasMode?: "preview" | "code"
}

type ErrorBoundaryState = { hasError: boolean }

class CanvasErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn("[CreatorCanvasPanel] preview crashed", error)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 bg-[#050608] p-8 text-center text-white">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-100">
          <Sparkles className="h-6 w-6" />
        </div>
        <h3 className="text-xl font-black">Preview временно недоступен</h3>
        <p className="max-w-md text-sm text-slate-400">
          Canvas не завис — сработал защитный fallback. Обновите preview или переключитесь на вкладку Code.
        </p>
        <button
          type="button"
          onClick={() => {
            this.setState({ hasError: false })
            this.props.onReset?.()
          }}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" />
          Восстановить preview
        </button>
      </div>
    )
  }
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

/**
 * V0-style right canvas — debounced preview, error boundary, no UI freeze.
 */
function CreatorCanvasPanelInner({
  generatedCode = "",
  isGenerating,
  canvasMode = "preview",
  ...props
}: CreatorCanvasPanelProps) {
  const [resetKey, setResetKey] = useState(0)
  const layoutFrameRef = useRef(0)
  const debouncedCode = useDebouncedValue(generatedCode, isGenerating ? 300 : 120)
  const stableHash = useMemo(() => canvasContentHash(debouncedCode), [debouncedCode])

  useEffect(() => {
    layoutFrameRef.current = window.requestAnimationFrame(() => undefined)
    return () => window.cancelAnimationFrame(layoutFrameRef.current)
  }, [props.hasContent, isGenerating, stableHash])

  return (
    <div className="malik-creator-canvas-panel flex h-full min-h-0 w-full flex-col overflow-hidden" data-canvas-hash={stableHash} data-canvas-mode={canvasMode}>
      <CanvasErrorBoundary onReset={() => setResetKey((key) => key + 1)} key={resetKey}>
        <PreviewPanel
          {...props}
          generatedCode={debouncedCode}
          isGenerating={isGenerating}
          initialViewMode={canvasMode === "code" ? "code" : "preview"}
          contentHash={stableHash}
          isFullscreen={props.isFullscreen}
          onToggleFullscreen={props.onToggleFullscreen}
        />
      </CanvasErrorBoundary>
    </div>
  )
}

export const CreatorCanvasPanel = memo(CreatorCanvasPanelInner)
