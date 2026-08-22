/**
 * Flat black backdrop for the AI chat surface.
 *
 * This used to paint a full-bleed space photo behind the conversation. The
 * photo competed with the answers, so the chat now reads like every other
 * mainstream assistant: plain black, nothing behind the text.
 *
 * The empty wrapper is deliberate. A large amount of layout CSS in
 * chat-layout-fix.css keys off `:has(.malik-chat-legend-bg)` to make the
 * shell full-bleed, drop the root's ::before/::after glows and stretch the
 * composer. Removing the element would silently switch all of that off, so
 * the marker stays and only the imagery is gone.
 */
export function ChatInvestorBackground() {
  return <div className="malik-chat-legend-bg" aria-hidden="true" />
}
