"use client"

import type { CSSProperties } from "react"

import { createSeededRandom, fixed } from "./prng"
import { SPACE_Z, type DustSpec } from "./types"

/**
 * CinematicOverlays
 * =================
 * The final colour-grade pass that turns a pile of glowing divs into a frame
 * that looks shot, not rendered:
 *  - DUST: a few slow foreground motes drifting with parallax for depth.
 *  - SCANLINE: a soft light sweep travelling top→bottom on a long loop.
 *  - VIGNETTE: darkens the corners to focus the eye.
 *  - CENTER-CALM: gently darkens the very middle so hero text stays legible
 *    over whatever is glowing behind it.
 *  - GRAIN: subtle animated film grain to kill banding and add texture.
 */

function buildDust(): DustSpec[] {
  const rng = createSeededRandom(0x5ace05)
  return Array.from({ length: 16 }, (_, i) => ({
    id: `dust-${i}`,
    left: `${fixed(rng.range(2, 98))}%`,
    top: `${fixed(rng.range(2, 98))}%`,
    size: `${fixed(rng.range(0.8, 2.4))}px`,
    driftX: `${fixed(rng.range(-3, 3))}vw`,
    driftY: `${fixed(rng.range(-2.4, 2.4))}vh`,
    duration: `${fixed(rng.range(18, 34))}s`,
    delay: `${fixed(-rng.range(0, 18))}s`,
    opacity: fixed(rng.range(0.12, 0.4)),
  }))
}

const DUST = buildDust()

export function CinematicOverlays() {
  return (
    <>
      <div className="malik-space-bg__dust">
        {DUST.map((mote) => (
          <span
            key={mote.id}
            style={
              {
                left: mote.left,
                top: mote.top,
                width: mote.size,
                height: mote.size,
                "--dx": mote.driftX,
                "--dy": mote.driftY,
                "--dur": mote.duration,
                "--delay": mote.delay,
                "--op": mote.opacity,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="malik-space-bg__grade" />
      <div className="malik-space-bg__scanline" />
      <div className="malik-space-bg__vignette" />
      <div className="malik-space-bg__center-calm" />
      <div className="malik-space-bg__grain" />

      <style jsx global>{`
        .malik-space-bg__dust,
        .malik-space-bg__grade,
        .malik-space-bg__scanline,
        .malik-space-bg__vignette,
        .malik-space-bg__center-calm,
        .malik-space-bg__grain {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .malik-space-bg__dust {
          z-index: ${SPACE_Z.dust};
          mix-blend-mode: screen;
        }

        .malik-space-bg__dust span {
          position: absolute;
          display: block;
          border-radius: 999px;
          background: rgba(224, 242, 255, 0.9);
          opacity: var(--op);
          box-shadow: 0 0 6px rgba(248, 229, 172, 0.5);
          will-change: transform, opacity;
          animation: malikSpaceDustDrift var(--dur) ease-in-out infinite alternate;
          animation-delay: var(--delay);
        }

        .malik-space-bg__grade {
          z-index: ${SPACE_Z.vignette - 1};
          background:
            radial-gradient(ellipse 46% 34% at 50% 24%, rgba(230, 244, 255, 0.055), transparent 72%),
            radial-gradient(ellipse 52% 44% at 18% 52%, rgba(0, 150, 220, 0.07), transparent 74%),
            radial-gradient(ellipse 52% 44% at 86% 48%, rgba(150, 70, 230, 0.065), transparent 74%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 28%, rgba(0, 0, 0, 0.16) 100%);
          mix-blend-mode: soft-light;
        }

        .malik-space-bg__scanline {
          z-index: ${SPACE_Z.scanline};
          opacity: 0.045;
          height: 24vh;
          transform: translateY(-26vh);
          background: linear-gradient(to bottom, transparent, rgba(225, 245, 255, 0.1), transparent);
          mix-blend-mode: screen;
          animation: malikSpaceScan 16s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }

        .malik-space-bg__vignette {
          z-index: ${SPACE_Z.vignette};
          background:
            radial-gradient(ellipse 72% 64% at 50% 44%, transparent 0 50%, rgba(0, 0, 0, 0.5) 78%, rgba(0, 0, 0, 0.88) 100%),
            linear-gradient(90deg, rgba(0, 0, 0, 0.64), transparent 22% 78%, rgba(0, 0, 0, 0.64));
        }

        .malik-space-bg__center-calm {
          z-index: ${SPACE_Z.centerCalm};
          background:
            radial-gradient(ellipse 34% 28% at 50% 42%, rgba(1, 4, 13, 0.5), rgba(1, 4, 13, 0.26) 52%, transparent 78%),
            linear-gradient(90deg, transparent 0 17%, rgba(1, 4, 13, 0.1) 36%, rgba(1, 4, 13, 0.1) 64%, transparent 83%);
        }

        .malik-space-bg__grain {
          z-index: ${SPACE_Z.grain};
          opacity: 0.045;
          background-image:
            radial-gradient(circle at 10% 20%, rgba(255, 255, 255, 0.7) 0 1px, transparent 1.5px),
            radial-gradient(circle at 40% 80%, rgba(255, 255, 255, 0.5) 0 1px, transparent 1.5px),
            radial-gradient(circle at 70% 30%, rgba(255, 255, 255, 0.45) 0 1px, transparent 1.5px),
            radial-gradient(circle at 90% 60%, rgba(255, 255, 255, 0.6) 0 1px, transparent 1.5px);
          background-size: 180px 180px, 220px 220px, 260px 260px, 310px 310px;
          animation: malikSpaceGrain 1.2s steps(3) infinite;
        }

        @keyframes malikSpaceDustDrift {
          from {
            transform: translate3d(0, 0, 0);
            opacity: calc(var(--op) * 0.5);
          }
          to {
            transform: translate3d(var(--dx), var(--dy), 0);
            opacity: var(--op);
          }
        }

        @keyframes malikSpaceScan {
          0% {
            transform: translateY(-30vh);
            opacity: 0;
          }
          16% {
            opacity: 0.26;
          }
          52% {
            opacity: 0.14;
          }
          100% {
            transform: translateY(116vh);
            opacity: 0;
          }
        }

        @keyframes malikSpaceGrain {
          0% {
            transform: translate3d(0, 0, 0);
          }
          33% {
            transform: translate3d(-1.5%, 0.8%, 0);
          }
          66% {
            transform: translate3d(1%, -1.2%, 0);
          }
          100% {
            transform: translate3d(0.5%, 1.6%, 0);
          }
        }

        @media (max-width: 768px) {
          .malik-space-bg__center-calm {
            background:
              radial-gradient(ellipse 58% 42% at 50% 42%, rgba(1, 4, 13, 0.66), rgba(1, 4, 13, 0.34) 58%, transparent 84%),
              linear-gradient(90deg, transparent 0 12%, rgba(1, 4, 13, 0.2) 34%, rgba(1, 4, 13, 0.2) 66%, transparent 88%);
          }
          .malik-space-bg__dust {
            display: none;
          }
        }
      `}</style>
    </>
  )
}

export default CinematicOverlays
