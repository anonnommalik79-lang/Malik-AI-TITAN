"use client"

import { memo, type MouseEvent } from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import type { GenerationStatusType } from "./generation-status"

const CreatorCanvasPanel = dynamic(
  () => import("./CreatorCanvasPanel").then((mod) => mod.CreatorCanvasPanel),
  { ssr: false },
)

export type DashboardCanvasSlotProps = {
  mobilePreviewOpen: boolean
  onCloseMobilePreview: () => void
  onMobileHome: () => void
  generatedCode: string
  isGeneratingTerminal: boolean
  activeGenerationKind: GenerationStatusType
  canvasMode: "preview" | "code"
  onCreateArtifact: () => void
  shouldShowPreviewPanel: boolean
  canvasFullscreen: boolean
  canvasSplitPercent: number
  isLoading: boolean
  currentVersion: number
  totalVersions: number
  onVersionChange: (version: number) => void
  onToggleFullscreen: () => void
  onCloseCanvas: () => void
  onCanvasResizeStart: (event: MouseEvent<HTMLDivElement>) => void
}

function DashboardCanvasSlotInner({
  mobilePreviewOpen,
  onCloseMobilePreview,
  onMobileHome,
  generatedCode,
  isGeneratingTerminal,
  activeGenerationKind,
  canvasMode,
  onCreateArtifact,
  shouldShowPreviewPanel,
  canvasFullscreen,
  canvasSplitPercent,
  isLoading,
  currentVersion,
  totalVersions,
  onVersionChange,
  onToggleFullscreen,
  onCloseCanvas,
  onCanvasResizeStart,
}: DashboardCanvasSlotProps) {
  return (
    <>
      {mobilePreviewOpen && (
        <div className="lg:hidden fixed inset-0 z-[80] bg-[#050505] w-full max-w-full overflow-x-hidden h-[100dvh]">
          <div className="h-[100dvh] w-full flex flex-col pt-[max(env(safe-area-inset-top),8px)] pb-[max(env(safe-area-inset-bottom),10px)]">
            <div className="px-3 pb-2 flex items-center gap-2 border-b border-[#1F2937]">
              <button
                type="button"
                aria-label="Назад к чату"
                onClick={onCloseMobilePreview}
                className="p-2 rounded-lg bg-[#121212] border border-[#2A2A2A] text-white"
              >
                ←
              </button>
              <div className="text-sm text-gray-300">Preview</div>
              <div className="ml-auto">
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={onCloseMobilePreview}
                  className="p-2 rounded-lg bg-[#121212] border border-[#2A2A2A] text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <CreatorCanvasPanel
                hasContent={!!generatedCode}
                generatedCode={generatedCode}
                isGenerating={isGeneratingTerminal}
                generationKind={activeGenerationKind}
                canvasMode={canvasMode}
                mobileMode
                onCloseMobile={onCloseMobilePreview}
                onHomeMobile={onMobileHome}
                onCreateArtifact={onCreateArtifact}
              />
            </div>
          </div>
        </div>
      )}

      {shouldShowPreviewPanel && (
        <aside
          className={cn(
            "malik-canvas-panel-host hidden min-h-0 flex-col border-l border-[#1F2937] bg-[#050608] transition-[width,opacity] duration-200 ease-out lg:sticky lg:top-0 lg:h-[100dvh] lg:flex",
            canvasFullscreen ? "malik-canvas-fullscreen" : "malik-canvas-split",
          )}
          style={!canvasFullscreen ? { ["--malik-canvas-width" as string]: `${canvasSplitPercent}%` } : undefined}
        >
          {!canvasFullscreen && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize canvas panel"
              className="malik-canvas-resize-handle"
              onMouseDown={onCanvasResizeStart}
            />
          )}
          <CreatorCanvasPanel
            isLoading={isLoading}
            isGenerating={isGeneratingTerminal}
            hasContent={!!generatedCode || isGeneratingTerminal}
            generatedCode={generatedCode}
            version={currentVersion}
            totalVersions={totalVersions}
            onVersionChange={onVersionChange}
            generationKind={activeGenerationKind}
            canvasMode={canvasMode}
            isFullscreen={canvasFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            onClose={onCloseCanvas}
            onCreateArtifact={onCreateArtifact}
          />
        </aside>
      )}
    </>
  )
}

export const DashboardCanvasSlot = memo(DashboardCanvasSlotInner)
export default DashboardCanvasSlot
