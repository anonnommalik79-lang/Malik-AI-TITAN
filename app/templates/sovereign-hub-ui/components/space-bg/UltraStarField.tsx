"use client"

import type { CSSProperties } from "react"

import { createSeededRandom, fixed, type SeededRandom } from "./prng"
import { SPACE_Z, STAR_CLASS_WEIGHTS, STAR_COLORS, type StarClass, type StarSpec } from "./types"

/**
 * UltraStarField
 * ==============
 * A photographic, multi-depth star field — the centrepiece of the
 * "open space" look.
 *
 * Realism techniques used here:
 *  - THREE parallax depth layers (far / mid / near). Far stars are tiny,
 *    dim and static; near stars are larger, brighter, twinkle and a few
 *    sport diffraction spikes (the four-point "telescope" cross).
 *  - A SPECTRAL colour distribution (Morgan–Keenan O→M). Real skies are
 *    mostly white/blue-white with a sprinkling of warm amber and red stars,
 *    never a flat grey dot grid.
 *  - SIZE follows a power-law bias: a great many faint pinpricks, very few
 *    bright suns — exactly how magnitude works.
 *  - Independent twinkle timing per star so the sky shimmers organically
 *    instead of pulsing in unison.
 *
 * All positions are seeded (deterministic) so SSR and client markup match
 * perfectly — no hydration errors.
 */

interface LayerConfig {
  key: "far" | "mid" | "near"
  z: number
  count: number
  /** [minSize, maxSize] in px before the power-law bias is applied. */
  size: [number, number]
  /** Power for the low-bias: higher → more tiny stars. */
  sizeBias: number
  /** [minOpacity, maxOpacity]. */
  opacity: [number, number]
  /** Probability that a star in this layer twinkles. */
  twinkleChance: number
  /** Probability that a (bright) star shows diffraction spikes. */
  spikeChance: number
  /** Base glow blur radius in px. */
  glow: number
}

const LAYERS: LayerConfig[] = [
  {
    key: "far",
    z: SPACE_Z.starsFar,
    count: 220,
    size: [0.35, 1.15],
    sizeBias: 2.8,
    opacity: [0.18, 0.55],
    twinkleChance: 0.18,
    spikeChance: 0,
    glow: 2,
  },
  {
    key: "mid",
    z: SPACE_Z.starsMid,
    count: 96,
    size: [0.75, 1.9],
    sizeBias: 2.1,
    opacity: [0.36, 0.8],
    twinkleChance: 0.55,
    spikeChance: 0.04,
    glow: 4,
  },
  {
    key: "near",
    z: SPACE_Z.starsNear,
    count: 26,
    size: [1.1, 2.9],
    sizeBias: 1.8,
    opacity: [0.58, 0.94],
    twinkleChance: 0.85,
    spikeChance: 0.18,
    glow: 7,
  },
]

/** Total weight of all spectral classes, computed once. */
const TOTAL_STAR_WEIGHT = STAR_CLASS_WEIGHTS.reduce((sum, item) => sum + item.weight, 0)

/** Pick a spectral class using the weighted distribution. */
function pickStarClass(rng: SeededRandom): StarClass {
  let roll = rng.next() * TOTAL_STAR_WEIGHT
  for (const { cls, weight } of STAR_CLASS_WEIGHTS) {
    roll -= weight
    if (roll <= 0) return cls
  }
  return "G"
}

/** Convert a hex colour to an `r, g, b` string for use inside rgba(). */
function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

/** Build all stars for one depth layer. */
function buildLayer(config: LayerConfig, rng: SeededRandom): StarSpec[] {
  const [minS, maxS] = config.size
  const [minO, maxO] = config.opacity
  return Array.from({ length: config.count }, (_, i) => {
    const sizeRoll = rng.biasLow(config.sizeBias)
    const size = minS + sizeRoll * (maxS - minS)
    const cls = pickStarClass(rng)
    const color = STAR_COLORS[cls]
    const rgb = hexToRgb(color)
    const isBright = sizeRoll > 0.72
    return {
      id: `${config.key}-${i}`,
      left: `${fixed(rng.next() * 100)}%`,
      top: `${fixed(rng.next() * 100)}%`,
      size: `${fixed(size)}px`,
      opacity: fixed(rng.range(minO, maxO)),
      twinkleDuration: `${fixed(rng.range(2.2, 6))}s`,
      twinkleDelay: `${fixed(-rng.next() * 7)}s`,
      twinkles: rng.chance(config.twinkleChance),
      spike: isBright && rng.chance(config.spikeChance),
      color,
      glow: `0 0 ${config.glow}px rgba(${rgb}, 0.75), 0 0 ${config.glow * 2.4}px rgba(${rgb}, 0.32)`,
    }
  })
}

// Each layer gets its own seed stream so layers stay independent yet stable.
const FAR_STARS = buildLayer(LAYERS[0], createSeededRandom(0x5ace01))
const MID_STARS = buildLayer(LAYERS[1], createSeededRandom(0x5ace02))
const NEAR_STARS = buildLayer(LAYERS[2], createSeededRandom(0x5ace03))

const LAYER_DATA: Array<{ config: LayerConfig; stars: StarSpec[] }> = [
  { config: LAYERS[0], stars: FAR_STARS },
  { config: LAYERS[1], stars: MID_STARS },
  { config: LAYERS[2], stars: NEAR_STARS },
]

function StarLayer({ config, stars }: { config: LayerConfig; stars: StarSpec[] }) {
  return (
    <div
      className={`malik-space-bg__stars malik-space-bg__stars--${config.key}`}
      style={{ zIndex: config.z } as CSSProperties}
    >
      {stars.map((star) => (
        <span
          key={star.id}
          data-twinkle={star.twinkles ? "1" : "0"}
          data-spike={star.spike ? "1" : "0"}
          style={
            {
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              background: star.color,
              boxShadow: star.glow,
              "--op": star.opacity,
              "--tw-dur": star.twinkleDuration,
              "--tw-delay": star.twinkleDelay,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function UltraStarField() {
  return (
    <>
      {LAYER_DATA.map(({ config, stars }) => (
        <StarLayer key={config.key} config={config} stars={stars} />
      ))}

      <style jsx global>{`
        .malik-space-bg__stars {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .malik-space-bg__stars--far {
          opacity: 0.85;
        }

        .malik-space-bg__stars--mid {
          /* Gentle parallax sway for the mid layer to imply depth. */
          will-change: transform;
          animation: malikSpaceStarParallax 46s ease-in-out infinite alternate;
        }

        .malik-space-bg__stars--near {
          will-change: transform;
          animation: malikSpaceStarParallaxNear 38s ease-in-out infinite alternate;
        }

        .malik-space-bg__stars span {
          position: absolute;
          display: block;
          border-radius: 999px;
          opacity: var(--op);
          will-change: opacity, transform;
        }

        .malik-space-bg__stars span[data-twinkle="1"] {
          animation: malikSpaceTwinkle var(--tw-dur) ease-in-out infinite;
          animation-delay: var(--tw-delay);
        }

        /* Four-point diffraction spikes for the brightest near stars. */
        .malik-space-bg__stars span[data-spike="1"]::before,
        .malik-space-bg__stars span[data-spike="1"]::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          background: linear-gradient(
            currentColor,
            transparent 14%,
            transparent 86%,
            currentColor
          );
          opacity: 0.55;
        }

        .malik-space-bg__stars span[data-spike="1"] {
          color: rgba(224, 242, 255, 0.9);
        }

        .malik-space-bg__stars span[data-spike="1"]::before {
          width: 1px;
          height: 900%;
          transform: translate(-50%, -50%);
          background: linear-gradient(
            to bottom,
            transparent,
            rgba(224, 242, 255, 0.7) 50%,
            transparent
          );
        }

        .malik-space-bg__stars span[data-spike="1"]::after {
          height: 1px;
          width: 900%;
          transform: translate(-50%, -50%);
          background: linear-gradient(
            to right,
            transparent,
            rgba(224, 242, 255, 0.7) 50%,
            transparent
          );
        }

        @keyframes malikSpaceTwinkle {
          0%,
          100% {
            opacity: calc(var(--op) * 0.28);
            transform: scale(0.7);
          }
          50% {
            opacity: var(--op);
            transform: scale(1.22);
          }
        }

        @keyframes malikSpaceStarParallax {
          from {
            transform: translate3d(-1.2vw, -0.6vh, 0);
          }
          to {
            transform: translate3d(1.2vw, 0.6vh, 0);
          }
        }

        @keyframes malikSpaceStarParallaxNear {
          from {
            transform: translate3d(1.8vw, 0.8vh, 0);
          }
          to {
            transform: translate3d(-1.8vw, -0.8vh, 0);
          }
        }

        @media (max-width: 768px) {
          .malik-space-bg__stars--mid,
          .malik-space-bg__stars--near {
            animation: none;
          }
          .malik-space-bg__stars span[data-twinkle="1"] {
            animation: none;
            opacity: var(--op);
          }
          /* Spikes are expensive relative to their payoff on tiny screens. */
          .malik-space-bg__stars span[data-spike="1"]::before,
          .malik-space-bg__stars span[data-spike="1"]::after {
            display: none;
          }
        }
      `}</style>
    </>
  )
}

export default UltraStarField
