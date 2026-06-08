"use client"

import type { CSSProperties } from "react"

import { createSeededRandom, fixed } from "./prng"
import { SPACE_Z, type ShootingStarSpec } from "./types"

/**
 * ShootingStars
 * =============
 * Meteors / falling stars streaking across the void.
 *
 * Realism notes:
 *  - Two populations: NEAR (bright, longer, faster, warm-white head + tail)
 *    and FAR (thin, dim, slow — barely-there streaks deep in the distance).
 *  - They enter from several different angles and screen positions, never in
 *    a synchronised salvo: each has a long cycle with a randomised head-start
 *    so the streak itself is only visible for a brief slice (~12%) of the
 *    loop, exactly like the real, sporadic thing.
 *  - The head is a glowing point; the tail is a tapering gradient. Built from
 *    a single element + ::after, animated purely with transform/opacity.
 */

const HUES = ["210", "190", "265", "320"] // blue, cyan, violet, magenta-ish

function buildShootingStars(): ShootingStarSpec[] {
  const rng = createSeededRandom(0x5ace04)
  const total = 10
  return Array.from({ length: total }, (_, i) => {
    const far = i % 3 === 0 // roughly a third are distant
    return {
      id: `shoot-${i}`,
      top: `${fixed(rng.range(2, 58))}%`,
      left: `${fixed(rng.range(4, 88))}%`,
      length: far ? `${fixed(rng.range(90, 170))}px` : `${fixed(rng.range(220, 360))}px`,
      rotate: `${fixed(rng.range(12, 46))}deg`,
      duration: far ? `${fixed(rng.range(16, 24))}s` : `${fixed(rng.range(9, 16))}s`,
      delay: `${fixed(-rng.range(0, 22))}s`,
      far,
      hue: rng.pick(HUES),
    }
  })
}

const SHOOTING_STARS = buildShootingStars()

export function ShootingStars() {
  return (
    <>
      <div className="malik-space-bg__shooting">
        {SHOOTING_STARS.map((meteor) => (
          <span
            key={meteor.id}
            data-far={meteor.far ? "1" : "0"}
            style={
              {
                top: meteor.top,
                left: meteor.left,
                width: meteor.length,
                zIndex: meteor.far ? SPACE_Z.shootingFar : SPACE_Z.shootingNear,
                "--rotate": meteor.rotate,
                "--duration": meteor.duration,
                "--delay": meteor.delay,
                "--hue": meteor.hue,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <style jsx global>{`
        .malik-space-bg__shooting {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          overflow: hidden;
          mix-blend-mode: screen;
        }

        .malik-space-bg__shooting span {
          position: absolute;
          height: 2px;
          border-radius: 999px;
          opacity: 0;
          transform-origin: left center;
          background: linear-gradient(
            90deg,
            transparent 0%,
            hsla(var(--hue), 100%, 85%, 0.35) 55%,
            hsla(var(--hue), 100%, 92%, 0.95) 90%,
            #ffffff 100%
          );
          box-shadow: 0 0 10px hsla(var(--hue), 100%, 85%, 0.8),
            0 0 22px hsla(var(--hue), 100%, 70%, 0.4);
          will-change: transform, opacity;
          animation: malikSpaceMeteor var(--duration) ease-in infinite;
          animation-delay: var(--delay);
        }

        .malik-space-bg__shooting span::after {
          content: "";
          position: absolute;
          right: -3px;
          top: 50%;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          transform: translateY(-50%);
          background: #ffffff;
          box-shadow: 0 0 12px rgba(224, 242, 255, 0.95),
            0 0 26px hsla(var(--hue), 100%, 75%, 0.6);
        }

        .malik-space-bg__shooting span[data-far="1"] {
          height: 1px;
          filter: brightness(0.78);
        }

        .malik-space-bg__shooting span[data-far="1"]::after {
          width: 3px;
          height: 3px;
          box-shadow: 0 0 8px rgba(224, 242, 255, 0.8),
            0 0 16px hsla(var(--hue), 100%, 70%, 0.45);
        }

        @keyframes malikSpaceMeteor {
          0% {
            opacity: 0;
            transform: rotate(var(--rotate)) translate3d(-12vw, -12vh, 0) scaleX(0.2);
          }
          4% {
            opacity: 0;
          }
          7% {
            opacity: 1;
            transform: rotate(var(--rotate)) translate3d(-4vw, -4vh, 0) scaleX(0.7);
          }
          15% {
            opacity: 1;
            transform: rotate(var(--rotate)) translate3d(22vw, 22vh, 0) scaleX(1);
          }
          20% {
            opacity: 0;
            transform: rotate(var(--rotate)) translate3d(32vw, 32vh, 0) scaleX(0.5);
          }
          100% {
            opacity: 0;
            transform: rotate(var(--rotate)) translate3d(32vw, 32vh, 0) scaleX(0.5);
          }
        }

        @media (max-width: 768px) {
          .malik-space-bg__shooting {
            display: none;
          }
        }
      `}</style>
    </>
  )
}

export default ShootingStars
