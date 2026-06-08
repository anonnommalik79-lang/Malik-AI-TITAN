"use client"

import { SPACE_Z } from "./types"

/**
 * DeepSpaceBase
 * =============
 * The void itself. This is the bottom-most layer of the entire background:
 *
 *  1. A near-pure-black canvas (open intergalactic space — almost no light).
 *  2. Extremely faint coloured "deep field" glows hugging the edges so the
 *     centre stays dark and readable while the frame feels infinite.
 *  3. A soft drifting nebula (emission-cloud look) built from layered radial
 *     gradients and heavy blur — colour without hard edges.
 *  4. A subtle Milky Way band cutting diagonally with its own embedded dust
 *     stars, masked so it only shows along the galactic plane.
 *
 * Everything here is paint-only (no per-frame layout), animated purely with
 * `opacity`/`transform`, so it is effectively free on the GPU.
 */
export function DeepSpaceBase() {
  return (
    <>
      <div className="malik-space-bg__void" />
      <div className="malik-space-bg__nebula" />
      <div className="malik-space-bg__milkyway" />
      <div className="malik-space-bg__deep-field" />

      <style jsx global>{`
        .malik-space-bg__void,
        .malik-space-bg__nebula,
        .malik-space-bg__milkyway,
        .malik-space-bg__deep-field {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        /* 1 + 2 — the void and its deep-field edge glows */
        .malik-space-bg__void {
          z-index: ${SPACE_Z.base};
          background:
            radial-gradient(ellipse 42% 24% at 50% 14%, rgba(214, 230, 255, 0.1), transparent 72%),
            radial-gradient(ellipse 50% 46% at 50% 22%, rgba(40, 64, 200, 0.12), transparent 70%),
            radial-gradient(ellipse 60% 80% at -18% 46%, rgba(0, 140, 205, 0.16), rgba(18, 56, 150, 0.08) 44%, transparent 80%),
            radial-gradient(ellipse 60% 80% at 118% 46%, rgba(150, 50, 200, 0.16), rgba(78, 38, 150, 0.08) 44%, transparent 80%),
            radial-gradient(ellipse 80% 40% at 50% 122%, rgba(22, 66, 165, 0.18), rgba(86, 38, 145, 0.07) 48%, transparent 82%),
            radial-gradient(circle at 50% 44%, rgba(0, 0, 0, 0) 28%, rgba(0, 0, 0, 0.6) 76%, rgba(0, 0, 0, 0.88) 100%),
            linear-gradient(180deg, #000004 0%, #00010a 36%, #010210 64%, #000003 100%);
        }

        /* 3 — drifting emission nebula */
        .malik-space-bg__nebula {
          z-index: ${SPACE_Z.nebula};
          opacity: 0.5;
          mix-blend-mode: screen;
          filter: blur(48px) saturate(1.12);
          background:
            radial-gradient(ellipse 38% 34% at 22% 30%, rgba(56, 189, 248, 0.24), transparent 72%),
            radial-gradient(ellipse 42% 38% at 79% 34%, rgba(168, 85, 247, 0.22), transparent 74%),
            radial-gradient(ellipse 50% 28% at 52% 82%, rgba(37, 99, 235, 0.2), transparent 76%),
            radial-gradient(ellipse 26% 22% at 64% 16%, rgba(244, 114, 182, 0.14), transparent 74%),
            radial-gradient(ellipse 30% 30% at 40% 58%, rgba(45, 212, 191, 0.1), transparent 76%);
          will-change: transform, opacity;
          transform: translate3d(0, 0, 0);
          animation: malikSpaceNebulaDrift 32s ease-in-out infinite alternate;
        }

        /* 4 — Milky Way galactic band */
        .malik-space-bg__milkyway {
          z-index: ${SPACE_Z.milkyway};
          opacity: 0.5;
          mix-blend-mode: screen;
          filter: blur(2px);
          background:
            linear-gradient(
              118deg,
              transparent 35%,
              rgba(120, 150, 220, 0.05) 43%,
              rgba(190, 205, 255, 0.12) 48.5%,
              rgba(228, 234, 255, 0.17) 50.5%,
              rgba(190, 205, 255, 0.12) 52.5%,
              rgba(120, 150, 220, 0.05) 58%,
              transparent 65%
            ),
            repeating-linear-gradient(118deg, transparent 0 3px, rgba(224, 242, 255, 0.05) 3px 3.6px),
            radial-gradient(circle at 30% 70%, rgba(224, 242, 255, 0.55) 0 0.6px, transparent 1.2px),
            radial-gradient(circle at 58% 48%, rgba(224, 242, 255, 0.5) 0 0.6px, transparent 1.2px),
            radial-gradient(circle at 72% 34%, rgba(224, 242, 255, 0.55) 0 0.6px, transparent 1.2px),
            radial-gradient(circle at 44% 60%, rgba(224, 242, 255, 0.42) 0 0.5px, transparent 1.1px);
          background-size: 100% 100%, 100% 100%, 70px 70px, 90px 90px, 60px 60px, 50px 50px;
          -webkit-mask-image: linear-gradient(118deg, transparent 35%, #000 47%, #000 53%, transparent 65%);
          mask-image: linear-gradient(118deg, transparent 35%, #000 47%, #000 53%, transparent 65%);
          will-change: opacity;
          animation: malikSpaceBandBreathe 16s ease-in-out infinite alternate;
        }

        .malik-space-bg__deep-field {
          z-index: ${SPACE_Z.starsFar - 1};
          opacity: 0.74;
          mix-blend-mode: screen;
          background:
            radial-gradient(circle at 6% 18%, rgba(224, 242, 255, 0.52) 0 0.45px, transparent 1px),
            radial-gradient(circle at 11% 76%, rgba(147, 197, 253, 0.38) 0 0.42px, transparent 1px),
            radial-gradient(circle at 22% 42%, rgba(224, 242, 255, 0.5) 0 0.5px, transparent 1.1px),
            radial-gradient(circle at 34% 12%, rgba(216, 180, 254, 0.38) 0 0.45px, transparent 1px),
            radial-gradient(circle at 47% 68%, rgba(224, 242, 255, 0.46) 0 0.45px, transparent 1px),
            radial-gradient(circle at 59% 28%, rgba(186, 230, 253, 0.44) 0 0.48px, transparent 1.1px),
            radial-gradient(circle at 72% 82%, rgba(224, 242, 255, 0.5) 0 0.48px, transparent 1.1px),
            radial-gradient(circle at 84% 38%, rgba(216, 180, 254, 0.42) 0 0.45px, transparent 1px),
            radial-gradient(circle at 94% 14%, rgba(224, 242, 255, 0.48) 0 0.5px, transparent 1.1px);
          background-size:
            137px 109px,
            173px 151px,
            211px 173px,
            257px 199px,
            293px 229px,
            331px 251px,
            383px 293px,
            431px 337px,
            479px 367px;
          filter: drop-shadow(0 0 2px rgba(224, 242, 255, 0.16));
          will-change: transform, opacity;
          animation: malikSpaceDeepFieldDrift 72s linear infinite alternate;
        }

        @keyframes malikSpaceNebulaDrift {
          from {
            opacity: 0.42;
            transform: translate3d(-2.6vw, 1.4vh, 0) scale(1.02);
          }
          50% {
            opacity: 0.62;
            transform: translate3d(1.6vw, -1vh, 0) scale(1.06);
          }
          to {
            opacity: 0.5;
            transform: translate3d(3vw, 0.6vh, 0) scale(1.03);
          }
        }

        @keyframes malikSpaceBandBreathe {
          from {
            opacity: 0.38;
          }
          to {
            opacity: 0.6;
          }
        }

        @keyframes malikSpaceDeepFieldDrift {
          from {
            transform: translate3d(-0.8vw, -0.4vh, 0);
          }
          to {
            transform: translate3d(0.8vw, 0.4vh, 0);
          }
        }

        @media (max-width: 768px) {
          .malik-space-bg__nebula {
            filter: blur(30px) saturate(1.06);
            opacity: 0.4;
          }
          .malik-space-bg__milkyway {
            opacity: 0.32;
          }
        }
      `}</style>
    </>
  )
}

export default DeepSpaceBase
