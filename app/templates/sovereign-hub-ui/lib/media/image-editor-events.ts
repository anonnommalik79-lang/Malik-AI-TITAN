"use client"

export type MalikImageEditorMode =
  | "edit"
  | "variation"
  | "transparent"
  | "enhance"
  | "detail"
  | "remaster"
  | "cinematic"
  | "wide"
  | "portrait"

export type MalikImageSelection = {
  left: number
  top: number
  width: number
  height: number
  coverage: number
}

export type MalikImageEditorRequest = {
  sourceSrc: string
  sourcePrompt: string
  prompt: string
  mode: MalikImageEditorMode
  imageSize?: "1K" | "2K" | "4K"
  imageAspectRatio?: "1:1" | "16:9" | "9:16" | "4:5" | "4:3"
  selection?: MalikImageSelection
  parentHistoryId?: string
}

export const MALIK_IMAGE_EDITOR_REQUEST_EVENT = "malik-image-editor-request"

function finitePercent(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
}

export function normalizeMalikImageSelection(value: unknown): MalikImageSelection | undefined {
  if (!value || typeof value !== "object") return undefined
  const item = value as Partial<MalikImageSelection>
  const left = finitePercent(item.left)
  const top = finitePercent(item.top)
  const width = Math.max(0, Math.min(100 - left, finitePercent(item.width)))
  const height = Math.max(0, Math.min(100 - top, finitePercent(item.height)))
  if (width < 0.5 || height < 0.5) return undefined
  return {
    left,
    top,
    width,
    height,
    coverage: Math.max(0, Math.min(100, Number(item.coverage) || width * height / 100)),
  }
}

export function requestMalikImageEditor(input: MalikImageEditorRequest) {
  if (typeof window === "undefined") return false
  const sourceSrc = String(input.sourceSrc || "").trim()
  const prompt = String(input.prompt || "").trim()
  if (!sourceSrc || !prompt) return false
  const detail: MalikImageEditorRequest = {
    ...input,
    sourceSrc,
    sourcePrompt: String(input.sourcePrompt || "").trim(),
    prompt,
    selection: normalizeMalikImageSelection(input.selection),
  }
  window.dispatchEvent(new CustomEvent<MalikImageEditorRequest>(MALIK_IMAGE_EDITOR_REQUEST_EVENT, { detail }))
  return true
}
