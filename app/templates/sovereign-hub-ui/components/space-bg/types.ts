/**
 * Shared types and design tokens for the Malik AI space background system.
 *
 * Z-INDEX MAP (single source of truth)
 * ------------------------------------
 * Every layer lives inside the `.malik-space-bg` root and is absolutely
 * positioned. To keep the stacking order predictable across the many
 * individual feature files, all z-indexes are defined here and only here.
 */
export const SPACE_Z = {
  base: 0,
  nebula: 1,
  milkyway: 2,
  lattice: 3,
  matrix: 4,
  auroraLeft: 5,
  auroraRight: 5,
  energy: 6,
  orbits: 7,
  heroGlow: 8,
  pulse: 9,
  core: 10,
  starsFar: 11,
  starsMid: 12,
  starsNear: 13,
  dust: 14,
  shootingFar: 15,
  shootingNear: 16,
  horizon: 17,
  horizonRim: 18,
  scanline: 19,
  vignette: 20,
  centerCalm: 21,
  grain: 22,
} as const

export type SpaceZKey = keyof typeof SPACE_Z

/** Stellar colour temperature classes (loosely based on the Morgan–Keenan system). */
export type StarClass = "O" | "B" | "A" | "F" | "G" | "K" | "M"

/** Hex colour for each spectral class — from hot blue (O) to cool red (M). */
export const STAR_COLORS: Record<StarClass, string> = {
  O: "#a9c7ff", // hot blue-white
  B: "#cdddff", // blue-white
  A: "#eef3ff", // white
  F: "#fbf8ff", // yellow-white
  G: "#fff4e8", // sun-like
  K: "#ffe6c4", // warm amber
  M: "#ffcaa6", // red dwarf / giant
}

/**
 * Relative spawn weight of each spectral class.
 * Cool, faint stars massively outnumber hot giants in a real sky, so the
 * distribution is intentionally skewed toward A/F/G/K.
 */
export const STAR_CLASS_WEIGHTS: Array<{ cls: StarClass; weight: number }> = [
  { cls: "O", weight: 0.4 },
  { cls: "B", weight: 1.4 },
  { cls: "A", weight: 6 },
  { cls: "F", weight: 9 },
  { cls: "G", weight: 11 },
  { cls: "K", weight: 9 },
  { cls: "M", weight: 6 },
]

export interface StarSpec {
  id: string
  left: string
  top: string
  size: string
  opacity: string
  twinkleDuration: string
  twinkleDelay: string
  twinkles: boolean
  spike: boolean
  color: string
  glow: string
}

export interface ShootingStarSpec {
  id: string
  top: string
  left: string
  length: string
  rotate: string
  duration: string
  delay: string
  far: boolean
  hue: string
}

export interface DustSpec {
  id: string
  left: string
  top: string
  size: string
  driftX: string
  driftY: string
  duration: string
  delay: string
  opacity: string
}
