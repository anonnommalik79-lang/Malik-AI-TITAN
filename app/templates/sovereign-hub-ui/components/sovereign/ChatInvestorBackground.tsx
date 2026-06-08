import { EARTH_BACKGROUND_URL } from "@/lib/brand-assets"

/** Static Earth background for AI chat — single asset, no onError chain, no re-renders. */
export function ChatInvestorBackground() {
  return (
    <div className="malik-chat-legend-bg" aria-hidden="true">
      <img
        src={EARTH_BACKGROUND_URL}
        alt=""
        className="malik-chat-legend-photo"
        draggable={false}
        decoding="sync"
        loading="eager"
        fetchPriority="high"
      />
      <div className="malik-chat-legend-grade" />
    </div>
  )
}
