import { EARTH_BACKGROUND_URL } from "@/lib/brand-assets"

/** Static ISS Earth on creator home — same URL as chat, never swaps. */
export function WelcomeEarthBackground() {
  return (
    <div className="malik-welcome-earth-stage" aria-hidden="true">
      <div className="malik-welcome-earth-spin">
        <img
          className="malik-welcome-earth-photo"
          src={EARTH_BACKGROUND_URL}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
      </div>
      <div className="malik-welcome-earth-satellite">
        <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="20" y="28" width="24" height="10" rx="2" fill="#c8d4e8" />
          <rect x="8" y="30" width="10" height="6" rx="1" fill="#7dd3fc" opacity="0.9" />
          <rect x="46" y="30" width="10" height="6" rx="1" fill="#7dd3fc" opacity="0.9" />
          <circle cx="32" cy="33" r="4" fill="#e2e8f0" />
          <path d="M32 18 L34 28 L30 28 Z" fill="#94a3b8" />
        </svg>
      </div>
    </div>
  )
}
