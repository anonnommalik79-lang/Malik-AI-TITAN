"use client"

import { SPACE_Z } from "./types"

/**
 * AuroraVeil
 * ==========
 * Soft, slow chromatic veils sweeping in from the left and right edges plus
 * two restrained "energy" gradients. These give the frame colour and motion
 * without ever touching the centre (kept dark for readability).
 *
 * Tuned DOWN on purpose for the open-space brief: the void and the stars are
 * the stars of the show; these glows are atmosphere, not neon.
 */
export function AuroraVeil() {
  return (
    <>
      <div className="malik-space-bg__aurora malik-space-bg__aurora--left" />
      <div className="malik-space-bg__aurora malik-space-bg__aurora--right" />
      <div className="malik-space-bg__energy malik-space-bg__energy--left" />
      <div className="malik-space-bg__energy malik-space-bg__energy--right" />

      <style jsx global>{`
        .malik-space-bg__aurora,
        .malik-space-bg__energy {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          mix-blend-mode: screen;
          will-change: transform, opacity;
          transform: translate3d(0, 0, 0);
        }

        .malik-space-bg__aurora {
          z-index: ${SPACE_Z.auroraLeft};
          opacity: 0.66;
          filter: saturate(1.18);
        }

        .malik-space-bg__aurora--left {
          background:
            radial-gradient(ellipse 30% 72% at 0% 40%, rgba(240, 210, 136, 0.28), transparent 72%),
            linear-gradient(104deg, rgba(228, 187, 94, 0.1), transparent 46%);
          animation: malikSpaceAuroraLeft 11s ease-in-out infinite alternate;
        }

        .malik-space-bg__aurora--right {
          background:
            radial-gradient(ellipse 30% 72% at 100% 42%, rgba(244, 114, 182, 0.2), transparent 72%),
            linear-gradient(256deg, rgba(217, 174, 69, 0.12), transparent 46%);
          animation: malikSpaceAuroraRight 12s ease-in-out infinite alternate;
        }

        .malik-space-bg__energy {
          z-index: ${SPACE_Z.energy};
          width: 58%;
          filter: brightness(0.62);
        }

        .malik-space-bg__energy--left {
          right: auto;
          background:
            radial-gradient(ellipse 72% 30% at 0% 42%, rgba(240, 210, 136, 0.5), rgba(228, 187, 94, 0.2) 42%, transparent 74%),
            radial-gradient(ellipse 52% 16% at 18% 62%, rgba(211, 162, 62, 0.34), transparent 74%),
            linear-gradient(100deg, rgba(8, 47, 73, 0.18), transparent 72%);
          -webkit-mask-image: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.82) 42%, transparent 100%);
          mask-image: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.82) 42%, transparent 100%);
          animation: malikSpaceEnergyLeft 8s ease-in-out infinite alternate;
        }

        .malik-space-bg__energy--right {
          left: auto;
          background:
            radial-gradient(ellipse 72% 30% at 100% 42%, rgba(245, 208, 254, 0.48), rgba(217, 174, 69, 0.2) 42%, transparent 74%),
            radial-gradient(ellipse 52% 16% at 82% 62%, rgba(201, 152, 47, 0.36), transparent 74%),
            linear-gradient(260deg, rgba(87, 64, 15, 0.2), transparent 72%);
          -webkit-mask-image: linear-gradient(270deg, #000 0%, rgba(0, 0, 0, 0.82) 42%, transparent 100%);
          mask-image: linear-gradient(270deg, #000 0%, rgba(0, 0, 0, 0.82) 42%, transparent 100%);
          animation: malikSpaceEnergyRight 8.5s ease-in-out infinite alternate;
        }

        @keyframes malikSpaceAuroraLeft {
          from {
            opacity: 0.5;
            transform: translate3d(-5vw, 1vh, 0) scaleX(0.92) skewY(-1deg);
          }
          50% {
            opacity: 0.82;
            transform: translate3d(1vw, -1.4vh, 0) scaleX(1.04) skewY(0.6deg);
          }
          to {
            opacity: 0.66;
            transform: translate3d(4vw, 0.5vh, 0) scaleX(1) skewY(-0.4deg);
          }
        }

        @keyframes malikSpaceAuroraRight {
          from {
            opacity: 0.5;
            transform: translate3d(5vw, 1vh, 0) scaleX(0.92) skewY(1deg);
          }
          50% {
            opacity: 0.84;
            transform: translate3d(-1vw, -1.4vh, 0) scaleX(1.04) skewY(-0.6deg);
          }
          to {
            opacity: 0.66;
            transform: translate3d(-4vw, 0.5vh, 0) scaleX(1) skewY(0.4deg);
          }
        }

        @keyframes malikSpaceEnergyLeft {
          from {
            opacity: 0.62;
            transform: translate3d(-4vw, 1vh, 0) scaleX(0.96);
          }
          50% {
            opacity: 0.9;
            transform: translate3d(1.2vw, -1vh, 0) scaleX(1.04);
          }
          to {
            opacity: 0.76;
            transform: translate3d(3.4vw, 0.4vh, 0) scaleX(1.01);
          }
        }

        @keyframes malikSpaceEnergyRight {
          from {
            opacity: 0.62;
            transform: translate3d(4vw, 1vh, 0) scaleX(0.96);
          }
          50% {
            opacity: 0.9;
            transform: translate3d(-1.2vw, -1vh, 0) scaleX(1.04);
          }
          to {
            opacity: 0.76;
            transform: translate3d(-3.4vw, 0.4vh, 0) scaleX(1.01);
          }
        }

        @media (max-width: 768px) {
          .malik-space-bg__aurora {
            opacity: 0.5;
          }
        }
      `}</style>
    </>
  )
}

export default AuroraVeil
