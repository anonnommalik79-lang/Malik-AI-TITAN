import { CHAT_BACKGROUND_URL } from "@/lib/brand-assets"

/** Static restored background for the AI chat surface. */
export function ChatInvestorBackground() {
  return (
    <div className="malik-chat-legend-bg" aria-hidden="true">
      <img
        src={CHAT_BACKGROUND_URL}
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
