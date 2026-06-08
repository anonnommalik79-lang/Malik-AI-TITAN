"use client"

import { SPACE_Z } from "./types"

/**
 * GalacticCore
 * ============
 * The structured, "designed" geometry behind the hero headline:
 *  - three thin orbital rings rotating at different speeds/directions,
 *  - a slow conic "pulse" sweep (like a radar / accretion disk),
 *  - a soft luminous core,
 *  - a hero glow that lifts the centre of the composition.
 *
 * Kept subtle so it reads as cosmic structure, not UI chrome.
 */
export function GalacticCore() {
  return (
    <>
      <div className="malik-space-bg__orbit malik-space-bg__orbit--one" />
      <div className="malik-space-bg__orbit malik-space-bg__orbit--two" />
      <div className="malik-space-bg__orbit malik-space-bg__orbit--three" />
      <div className="malik-space-bg__hero-glow" />
      <div className="malik-space-bg__pulse" />
      <div className="malik-space-bg__core" />

      <style jsx global>{`
        .malik-space-bg__hero-glow {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: ${SPACE_Z.heroGlow};
          opacity: 0.92;
          background:
            radial-gradient(ellipse 34% 16% at 50% 23%, rgba(219, 234, 254, 0.3), transparent 70%),
            radial-gradient(ellipse 48% 22% at 50% 35%, rgba(56, 189, 248, 0.16), rgba(217, 70, 239, 0.14) 50%, transparent 76%),
            radial-gradient(ellipse 42% 18% at 50% 63%, rgba(59, 130, 246, 0.14), transparent 76%);
          transform: translate3d(0, 0, 0);
          animation: malikSpaceHeroPulse 6.2s ease-in-out infinite alternate;
        }

        .malik-space-bg__orbit {
          position: absolute;
          z-index: ${SPACE_Z.orbits};
          inset: 50% auto auto 50%;
          width: min(72vw, 1040px);
          height: min(72vw, 1040px);
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.1);
          transform: translate3d(-50%, -50%, 0);
          opacity: 0.24;
          pointer-events: none;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 16% 84%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 16% 84%, transparent);
          will-change: transform, opacity;
        }

        .malik-space-bg__orbit--one {
          animation: malikSpaceOrbitOne 30s linear infinite;
        }

        .malik-space-bg__orbit--two {
          width: min(54vw, 800px);
          height: min(54vw, 800px);
          border-color: rgba(216, 180, 254, 0.12);
          animation: malikSpaceOrbitTwo 24s linear infinite reverse;
        }

        .malik-space-bg__orbit--three {
          width: min(86vw, 1180px);
          height: min(38vw, 520px);
          border-color: rgba(96, 165, 250, 0.1);
          animation: malikSpaceOrbitThree 34s linear infinite;
        }

        .malik-space-bg__pulse {
          position: absolute;
          z-index: ${SPACE_Z.pulse};
          width: min(66vw, 980px);
          height: min(66vw, 980px);
          inset: 50% auto auto 50%;
          border-radius: 999px;
          opacity: 0.26;
          pointer-events: none;
          background: conic-gradient(
            from 180deg,
            transparent 0 18deg,
            rgba(56, 189, 248, 0.2) 46deg,
            transparent 88deg,
            rgba(217, 70, 239, 0.18) 136deg,
            transparent 190deg,
            rgba(96, 165, 250, 0.16) 250deg,
            transparent 320deg
          );
          transform: translate3d(-50%, -48%, 0);
          will-change: transform, opacity;
          animation: malikSpacePulseSpin 20s linear infinite;
        }

        .malik-space-bg__core {
          position: absolute;
          z-index: ${SPACE_Z.core};
          inset: 50% auto auto 50%;
          width: min(34vw, 520px);
          height: min(34vw, 520px);
          border-radius: 999px;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 50%, rgba(219, 234, 254, 0.2), transparent 13%),
            radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.12), transparent 36%),
            radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.1), transparent 62%);
          transform: translate3d(-50%, -50%, 0);
          opacity: 0.66;
          animation: malikSpaceCore 6.4s ease-in-out infinite alternate;
        }

        @keyframes malikSpaceHeroPulse {
          from {
            opacity: 0.72;
            transform: translate3d(0, 0.8vh, 0) scale(0.98);
          }
          to {
            opacity: 0.96;
            transform: translate3d(0, -1vh, 0) scale(1.04);
          }
        }

        @keyframes malikSpaceOrbitOne {
          from {
            transform: translate3d(-50%, -50%, 0) rotate(0deg);
          }
          to {
            transform: translate3d(-50%, -50%, 0) rotate(360deg);
          }
        }

        @keyframes malikSpaceOrbitTwo {
          from {
            transform: translate3d(-50%, -50%, 0) rotate(0deg) scale(1.02);
          }
          to {
            transform: translate3d(-50%, -50%, 0) rotate(360deg) scale(1.02);
          }
        }

        @keyframes malikSpaceOrbitThree {
          from {
            transform: translate3d(-50%, -50%, 0) rotate(-6deg);
            opacity: 0.12;
          }
          50% {
            opacity: 0.32;
          }
          to {
            transform: translate3d(-50%, -50%, 0) rotate(354deg);
            opacity: 0.12;
          }
        }

        @keyframes malikSpacePulseSpin {
          from {
            transform: translate3d(-50%, -48%, 0) rotate(0deg) scale(0.96);
            opacity: 0.18;
          }
          50% {
            opacity: 0.34;
          }
          to {
            transform: translate3d(-50%, -48%, 0) rotate(360deg) scale(1.06);
            opacity: 0.18;
          }
        }

        @keyframes malikSpaceCore {
          from {
            opacity: 0.42;
            transform: translate3d(-50%, -50%, 0) scale(0.94);
          }
          to {
            opacity: 0.78;
            transform: translate3d(-50%, -50%, 0) scale(1.06);
          }
        }

        @media (max-width: 768px) {
          .malik-space-bg__orbit,
          .malik-space-bg__pulse {
            opacity: 0.16;
          }
        }
      `}</style>
    </>
  )
}

export default GalacticCore
