/** Validated raster bytes, never a model-provided remote URL. */
export type DocumentAsset = { slideIndex: number; dataUrl: string; credit: string }

export function documentAssets(value: unknown): DocumentAsset[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 2 || value.some(a => !a || !Number.isInteger(a.slideIndex) || a.slideIndex < 0 || a.slideIndex > 29 || typeof a.dataUrl !== "string" || a.dataUrl.length > 1_400_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(a.dataUrl) || typeof a.credit !== "string" || a.credit.length > 2000)) throw new Error("INVALID_DOCUMENT_ASSETS")
  return value as DocumentAsset[]
}
