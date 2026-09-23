export type MalikImageEffectId = "off" | "malik-aura" | "malik-aura-x"

export type MalikImageEffectProfile = {
  id: MalikImageEffectId
  label: string
  brightness: number
  saturation: number
  linearGain: number
  linearOffset: number
  sharpenBoost: number
}

/**
 * Signature Malik AI finish for freshly generated images.
 *
 * The values are deliberately bounded: Aura X should make a frame feel richer
 * and more cinematic without repainting faces, text, hands or composition.
 * This runs inside the existing Sharp delivery pass, so it does not spend a
 * second model generation or a second image credit.
 */
export const DEFAULT_MALIK_IMAGE_EFFECT: MalikImageEffectId = "malik-aura-x"

const PROFILES: Record<MalikImageEffectId, MalikImageEffectProfile> = {
  off: {
    id: "off",
    label: "Off",
    brightness: 1,
    saturation: 1,
    linearGain: 1,
    linearOffset: 0,
    sharpenBoost: 0,
  },
  "malik-aura": {
    id: "malik-aura",
    label: "Malik Aura",
    brightness: 1.006,
    saturation: 1.035,
    linearGain: 1.025,
    linearOffset: -3.2,
    sharpenBoost: 0.05,
  },
  "malik-aura-x": {
    id: "malik-aura-x",
    label: "Malik Aura X",
    brightness: 1.012,
    saturation: 1.065,
    linearGain: 1.055,
    linearOffset: -7,
    sharpenBoost: 0.12,
  },
}

export function isMalikImageEffectId(value: unknown): value is MalikImageEffectId {
  return value === "off" || value === "malik-aura" || value === "malik-aura-x"
}

export function resolveMalikImageEffect(
  value: unknown,
  fallback: MalikImageEffectId = DEFAULT_MALIK_IMAGE_EFFECT,
): MalikImageEffectId {
  if (isMalikImageEffectId(value)) return value

  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return fallback
  if (normalized === "none" || normalized === "false" || normalized === "disabled") return "off"
  if (normalized === "aura" || normalized === "malik aura" || normalized === "malik_aura") return "malik-aura"
  if (
    normalized === "aura x"
    || normalized === "aura-x"
    || normalized === "malik aura x"
    || normalized === "malik_aura_x"
    || normalized === "strong"
  ) return "malik-aura-x"

  return fallback
}

export function getMalikImageEffectProfile(effect: MalikImageEffectId) {
  return PROFILES[effect] || PROFILES.off
}
