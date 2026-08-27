"use client"

type RailChat = {
  id: string
  title: string
  timestamp: Date
}

export interface RightRailProps {
  chats: RailChat[]
  onSelectChat: (id: string) => void
  onSeeAll: () => void
  projectName?: string
  modeLabel?: string
  contextTexts?: string[]
  onOpenBilling?: () => void
}

/**
 * The desktop right rail was intentionally retired.
 *
 * Chat history already lives in the left sidebar, while context/status/promo
 * cards were duplicating information and stealing horizontal space from the
 * actual Malik AI workspace. Keeping the component as a null renderer avoids
 * churn in dashboard wiring while removing the rail, its metrics polling and
 * every visual artifact from the product.
 */
export function RightRail(_props: RightRailProps) {
  return null
}

export default RightRail
