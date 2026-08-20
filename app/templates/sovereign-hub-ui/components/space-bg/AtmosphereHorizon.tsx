"use client"

import { SPACE_Z } from "./types"

/**
 * AtmosphereHorizon
 * =================
 * The signature "edge of a planet seen from orbit" arc at the bottom of the
 * frame. Two stacked pieces:
 *  - a huge soft disc whose top edge becomes a bright atmospheric limb,
 *  - a razor-thin rim-light sitting exactly on that limb for the crisp
 *    "sunlit atmosphere" highlight.
 *
 * Kept restrained so it grounds the composition without stealing the void.
 */
export function AtmosphereHorizon() {
  return (
    <>
      <div className="malik-space-bg__planet-disc" />
      <div className="malik-space-bg__planet-night" />
      <div className="malik-space-bg__horizon" />
      <div className="malik-space-bg__horizon-rim" />

      <style jsx global>{`
        .malik-space-bg__planet-disc,
        .malik-space-bg__planet-night,
        .malik-space-bg__horizon,
        .malik-space-bg__horizon-rim {
          position: absolute;
          pointer-events: none;
          top: auto;
          bottom: -86%;
          left: 50%;
          width: 214%;
          height: 170%;
          border-radius: 50%;
          transform: translate3d(-50%, 0, 0);
        }

        .malik-space-bg__planet-disc {
          z-index: ${SPACE_Z.horizon - 2};
          opacity: 0.78;
          background:
            radial-gradient(ellipse 88% 52% at 42% 10%, rgba(215, 236, 255, 0.22), transparent 30%),
            radial-gradient(ellipse 74% 38% at 34% 21%, rgba(77, 198, 238, 0.2), transparent 44%),
            radial-gradient(ellipse 80% 44% at 64% 26%, rgba(141, 102, 226, 0.16), transparent 46%),
            radial-gradient(ellipse 16% 8% at 38% 19%, rgba(236, 252, 255, 0.16), transparent 62%),
            radial-gradient(ellipse 22% 9% at 55% 25%, rgba(240, 210, 136, 0.14), transparent 64%),
            radial-gradient(ellipse 18% 7% at 70% 31%, rgba(243, 222, 150, 0.13), transparent 64%),
            repeating-linear-gradient(7deg, rgba(255, 255, 255, 0.055) 0 1px, transparent 1px 9px),
            radial-gradient(closest-side, rgba(18, 38, 75, 0.64) 0 62%, rgba(8, 18, 44, 0.82) 78%, rgba(3, 8, 24, 0.98) 100%);
          box-shadow:
            inset 0 58px 120px rgba(255, 255, 255, 0.08),
            inset 0 -140px 220px rgba(0, 0, 0, 0.82),
            0 -28px 120px rgba(240, 210, 136, 0.14);
          filter: saturate(0.95) contrast(1.05);
          -webkit-mask-image: radial-gradient(closest-side, #000 0 99%, transparent 100%);
          mask-image: radial-gradient(closest-side, #000 0 99%, transparent 100%);
        }

        .malik-space-bg__planet-night {
          z-index: ${SPACE_Z.horizon - 1};
          opacity: 0.9;
          background:
            radial-gradient(ellipse 58% 42% at 35% 10%, transparent 0 42%, rgba(0, 0, 0, 0.24) 62%, rgba(0, 0, 0, 0.72) 100%),
            linear-gradient(92deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.54) 62%, rgba(0, 0, 0, 0.84));
          -webkit-mask-image: radial-gradient(closest-side, #000 0 99%, transparent 100%);
          mask-image: radial-gradient(closest-side, #000 0 99%, transparent 100%);
        }

        .malik-space-bg__horizon,
        .malik-space-bg__horizon-rim {
          mix-blend-mode: screen;
          will-change: opacity;
        }

        .malik-space-bg__horizon {
          z-index: ${SPACE_Z.horizon};
          opacity: 0.72;
          background: radial-gradient(
            closest-side,
            rgba(2, 6, 20, 0) 71%,
            rgba(177, 132, 44, 0.1) 82%,
            rgba(228, 187, 94, 0.26) 91%,
            rgba(240, 210, 136, 0.62) 96.5%,
            rgba(244, 250, 255, 0.98) 99.15%,
            transparent 100%
          );
          animation: malikSpaceHorizonGlow 9s ease-in-out infinite alternate;
        }

        .malik-space-bg__horizon-rim {
          z-index: ${SPACE_Z.horizonRim};
          opacity: 0.68;
          background: transparent;
          box-shadow: 0 -1px 0 rgba(248, 252, 255, 0.88) inset,
            0 -4px 24px rgba(224, 242, 255, 0.42),
            0 -28px 100px rgba(228, 187, 94, 0.24),
            0 -10px 54px rgba(240, 210, 136, 0.3);
          animation: malikSpaceHorizonGlow 9s ease-in-out 0.4s infinite alternate;
        }

        @media (max-width: 768px) {
          .malik-space-bg__planet-disc,
          .malik-space-bg__planet-night,
          .malik-space-bg__horizon,
          .malik-space-bg__horizon-rim {
            bottom: -88%;
            width: 220%;
            height: 172%;
          }
        }

        @keyframes malikSpaceHorizonGlow {
          from {
            opacity: 0.46;
          }
          to {
            opacity: 0.78;
          }
        }
      `}</style>
    </>
  )
}

export default AtmosphereHorizon
