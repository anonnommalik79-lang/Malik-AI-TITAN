"use client"

import {
  DEFAULT_MALIK_IMAGE_QUALITY,
  MALIK_IMAGE_QUALITY_COOKIE,
  MALIK_IMAGE_QUALITY_STORAGE_KEY,
  isMalikImageQuality,
  type MalikImageQuality,
} from "./image-quality-presets"

export const MALIK_IMAGE_QUALITY_EVENT = "malik-image-quality-changed"

export function readMalikImageQuality(): MalikImageQuality {
  if (typeof window === "undefined") return DEFAULT_MALIK_IMAGE_QUALITY
  try {
    const stored = window.localStorage.getItem(MALIK_IMAGE_QUALITY_STORAGE_KEY)
    return isMalikImageQuality(stored) ? stored : DEFAULT_MALIK_IMAGE_QUALITY
  } catch {
    return DEFAULT_MALIK_IMAGE_QUALITY
  }
}

export function writeMalikImageQuality(quality: MalikImageQuality) {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(MALIK_IMAGE_QUALITY_STORAGE_KEY, quality) } catch {}
  try {
    document.cookie = `${MALIK_IMAGE_QUALITY_COOKIE}=${encodeURIComponent(quality)}; Path=/; Max-Age=31536000; SameSite=Lax`
  } catch {}
  window.dispatchEvent(new CustomEvent(MALIK_IMAGE_QUALITY_EVENT, { detail: quality }))
}

/** Ensure every existing image entry point starts on the same product default. */
export function ensureMalikImageQualityPreference() {
  const quality = readMalikImageQuality()
  writeMalikImageQuality(quality)
  return quality
}
