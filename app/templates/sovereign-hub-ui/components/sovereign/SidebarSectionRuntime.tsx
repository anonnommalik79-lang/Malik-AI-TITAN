"use client"

/**
 * The sidebar now owns its reference structure directly in sidebar.tsx.
 *
 * Older builds injected section labels and reordered DOM nodes from this runtime.
 * Keeping that mutation layer after the sidebar became explicit caused duplicate
 * labels, unstable heights and history jumping above the tools block. This file
 * intentionally keeps only defensive CSS for stale/injected legacy nodes.
 */
export function SidebarSectionRuntime() {
  return (
    <style jsx global>{`
      .malik-sidebar[data-collapsed="false"] [data-malik-sidebar-section],
      .malik-sidebar[data-collapsed="false"] [data-malik-sidebar-history-title],
      .malik-sidebar[data-collapsed="false"] .malik-sidebar-runtime-section-label,
      .malik-sidebar[data-collapsed="false"] .malik-sidebar-runtime-history-title,
      .malik-sidebar[data-collapsed="false"] .malik-sidebar-tools {
        display: none !important;
      }

      .malik-sidebar[data-collapsed="false"] {
        position: sticky !important;
        top: 0 !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
      }

      .malik-sidebar[data-collapsed="false"] .malik-sidebar-history {
        order: initial !important;
        min-height: 92px !important;
      }

      .malik-sidebar[data-collapsed="false"] .malik-founder-nav,
      .malik-sidebar[data-collapsed="false"] [data-action-id="newsroom"] {
        display: none !important;
      }
    `}</style>
  )
}

export default SidebarSectionRuntime
