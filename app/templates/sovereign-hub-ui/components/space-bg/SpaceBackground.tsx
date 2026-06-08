"use client"

import { AtmosphereHorizon } from "./AtmosphereHorizon"
import { AuroraVeil } from "./AuroraVeil"
import { DeepSpaceBase } from "./DeepSpaceBase"
import { GalacticCore } from "./GalacticCore"

/**
 * SpaceBackground — the composer
 * ==============================
 * Stacks every feature layer in the correct order inside one fixed root.
 *
 * Layer order (painted back → front), each lives in its own file:
 *   DeepSpaceBase ........ void + nebula + Milky Way        (z 0–2)
 *   AuroraVeil ........... edge auroras + energy            (z 5–6)
 *   GalacticCore ......... orbits + pulse + core + hero glow(z 7–10)
 *   UltraStarField ....... 3 parallax star layers           (z 11–13)
 *   CinematicOverlays .... dust (z14) ... + grade overlays  (z 14, 19–22)
 *   ShootingStars ........ meteors near/far                 (z 15–16)
 *   AtmosphereHorizon .... planet limb + rim                (z 17–18)
 *
 * The root keeps the legacy `malik-ai-background` class in addition to the
 * new `malik-space-bg` class. This is intentional: existing global CSS (in
 * the dashboard, legendary-aurora.css, creator-clone-safe.css, etc.) keys
 * off `.malik-ai-background` to suppress competing `body::before/::after`
 * backgrounds and force shells transparent. Keeping the class means the new
 * system drops in without touching any of that wiring.
 *
 * Performance: every layer animates only `opacity`/`transform`/`filter`,
 * the root uses `contain: strict` to isolate paints, and heavy pieces are
 * dialled back or disabled under `max-width: 768px` and
 * `prefers-reduced-motion: reduce`.
 */
export function SpaceBackground() {
  return (
    <div className="malik-ai-background malik-space-bg" aria-hidden="true">
      <DeepSpaceBase />
      <AuroraVeil />
      <GalacticCore />
      <AtmosphereHorizon />

      <style jsx global>{`
        .malik-space-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          contain: strict;
          isolation: isolate;
          background: #000004;
          color-scheme: dark;
        }

        /* Suppress competing global backgrounds while this layer is mounted. */
        body:has(.malik-space-bg)::before,
        body:has(.malik-space-bg)::after,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) main::before,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) main::after {
          content: none !important;
          display: none !important;
        }

        #malik-root .malik-dashboard-shell:has(.malik-space-bg),
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) > main,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) > main > section,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .creator-home-shell,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .malik-welcome-earth-shell,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .malik-force-video-root,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) [data-malik-chat-fullwidth="1"] {
          background-color: transparent !important;
          background-image: none !important;
        }

        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .malik-video-bg,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .malik-nasa-smooth-bg {
          display: none !important;
          opacity: 0 !important;
        }

        /* Home uses WelcomeEarthBackground — hide the global space layer entirely. */
        #malik-root .malik-dashboard-shell:has(.malik-welcome-earth-shell) .malik-space-bg {
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Home keeps the photo earth layer; hide the duplicate CSS planet arc. */
        #malik-root .malik-dashboard-shell:has(.malik-welcome-earth-shell) .malik-space-bg__planet-disc,
        #malik-root .malik-dashboard-shell:has(.malik-welcome-earth-shell) .malik-space-bg__planet-night,
        #malik-root .malik-dashboard-shell:has(.malik-welcome-earth-shell) .malik-space-bg__horizon,
        #malik-root .malik-dashboard-shell:has(.malik-welcome-earth-shell) .malik-space-bg__horizon-rim {
          display: none !important;
          opacity: 0 !important;
        }

        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .digital-bridge-demo-polish,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .digital-bridge-demo-polish::before,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .digital-bridge-demo-polish::after {
          display: none !important;
          opacity: 0 !important;
        }

        #malik-root .malik-dashboard-shell:has(.malik-space-bg) .creator-home-shell > *,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) main > *,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) aside,
        #malik-root .malik-dashboard-shell:has(.malik-space-bg) header {
          position: relative;
        }

        @media (prefers-reduced-motion: reduce) {
          .malik-space-bg *,
          .malik-space-bg {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default SpaceBackground
