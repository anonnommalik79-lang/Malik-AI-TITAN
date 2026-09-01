import type { ImageMode } from "./types"
import type { MalikImageQuality } from "./image-quality-presets"

const QUALITY_SUFFIX: Record<MalikImageQuality, string> = {
  draft: "",
  balanced: "high detail, clean composition, crisp subject focus",
  quality: "high fidelity, fine surface texture, crisp micro-details, clean edges, realistic tonal range, artifact-free finish",
  ultra: "ultra high fidelity, precise micro-textures, physically plausible materials, realistic reflections, controlled highlights, natural tonal range, clean edges, crisp micro-details, artifact-free professional finish",
}

const MODE_SUFFIX: Record<ImageMode, string> = {
  cinematic: "cinematic lighting, controlled depth, dimensional contrast",
  realistic: "photorealistic material response, natural lighting, realistic texture",
  product: "premium studio lighting, accurate material texture, clean product separation",
  design: "precise graphic structure, clean geometry, polished visual hierarchy",
}

const NEGATIVE_DETAIL = [
  "blur", "soft focus", "muddy texture", "banding", "posterization",
  "compression artifacts", "haloing", "oversharpened edges", "plastic skin",
  "duplicate objects", "warped geometry", "broken reflections", "inconsistent lighting",
].join(", ")

function compact(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim()
}

/**
 * This enhancer never invents subjects, people, places, colours or actions.
 * It only describes rendering fidelity. That keeps literal user intent intact
 * while giving every backend model the same Malik quality language.
 */
export function enhanceImagePrompt(
  prompt: string,
  options: { mode?: ImageMode; quality: MalikImageQuality; detailBoost?: boolean },
) {
  const base = compact(prompt)
  if (!base) return ""
  const parts = [base]
  const mode = options.mode
  if (mode && !base.toLowerCase().includes(MODE_SUFFIX[mode].toLowerCase())) parts.push(MODE_SUFFIX[mode])
  if (options.detailBoost !== false && QUALITY_SUFFIX[options.quality]) parts.push(QUALITY_SUFFIX[options.quality])
  return compact(parts.filter(Boolean).join(", ")).slice(0, 1200)
}

export function enhanceNegativePrompt(negativePrompt: string, quality: MalikImageQuality) {
  const base = compact(negativePrompt)
  if (quality === "draft" || quality === "balanced") return base
  const combined = [base, NEGATIVE_DETAIL].filter(Boolean).join(", ")
  return compact(combined).slice(0, 900)
}
