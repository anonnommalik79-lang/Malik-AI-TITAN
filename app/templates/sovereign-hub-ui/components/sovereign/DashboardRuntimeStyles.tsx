"use client"

import { useEffect } from "react"

const STYLE_ID = "malik-dashboard-runtime-css"

export function DashboardRuntimeStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement("style")
    el.id = STYLE_ID
    el.textContent = DASHBOARD_RUNTIME_CSS
    document.head.appendChild(el)
  }, [])
  return null
}

const DASHBOARD_RUNTIME_CSS = `
/* MALIK_TERMINATOR_CHAT_HOST_V1 */
.malik-terminator-chat-host {
  position: relative;
  isolation: isolate;
  overflow: hidden !important;
  background:
    radial-gradient(ellipse 72% 30% at 50% 88%, rgba(217, 174, 69, 0.34), transparent 60%),
    radial-gradient(ellipse 90% 50% at 50% 110%, rgba(211, 162, 62, 0.18), transparent 65%),
    radial-gradient(circle at 18% 12%, rgba(228, 187, 94, 0.10), transparent 26%),
    radial-gradient(circle at 82% 14%, rgba(217, 174, 69, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(3, 7, 20, 0.98), rgba(4, 8, 24, 0.98) 55%, rgba(2, 5, 18, 1));
}
.malik-terminator-chat-host::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 8% 18%, rgba(255,255,255,0.65) 0 1.2px, transparent 1.9px),
    radial-gradient(circle at 76% 22%, rgba(255,255,255,0.48) 0 1.1px, transparent 1.8px),
    radial-gradient(circle at 58% 30%, rgba(255,255,255,0.22) 0 1px, transparent 1.6px),
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px);
  background-size: 300px 220px, 420px 280px, 520px 380px, 36px 36px, 36px 36px;
  opacity: .68;
  mask-image: linear-gradient(to bottom, rgba(0,0,0,.95), rgba(0,0,0,.90) 50%, rgba(0,0,0,.35));
}
.malik-terminator-chat-host::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 82px;
  transform: translateX(-50%);
  width: min(1400px, 97%);
  height: 220px;
  z-index: 0;
  pointer-events: none;
  border-radius: 50% 50% 0 0;
  border-top: 1px solid rgba(232, 197, 106, 0.58);
  background:
    radial-gradient(ellipse at center, rgba(217, 174, 69,.30), rgba(211, 162, 62,.12) 45%, transparent 72%);
  box-shadow:
    0 -1px 26px rgba(217, 174, 69,.55),
    0 -14px 72px rgba(211, 162, 62,.18),
    0 -24px 120px rgba(211, 162, 62,.16);
  opacity: .98;
}
.malik-terminator-chat-host > * {
  position: relative;
  z-index: 2;
}

/* generic chat card boost */
.malik-terminator-chat-host [class*="rounded"][class*="border"],
.malik-terminator-chat-host [class*="backdrop-blur"] {
  box-shadow: 0 10px 40px rgba(87, 64, 15, 0.16);
}

.malik-terminator-chat-host textarea {
  background: rgba(5, 11, 30, 0.60) !important;
  border-color: rgba(211, 162, 62,0.28) !important;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.03),
    0 0 0 1px rgba(168, 124, 34,0.10),
    0 14px 44px rgba(15,23,42,0.45) !important;
}

.malik-terminator-chat-host button {
  backdrop-filter: blur(14px);
}

@media (prefers-reduced-motion: no-preference) {
  .malik-terminator-chat-host::after {
    animation: malikTerminatorGlow 7s ease-in-out infinite;
  }
  @keyframes malikTerminatorGlow {
    0%,100% { opacity: .86; transform: translateX(-50%) scaleX(.985); }
    50% { opacity: 1; transform: translateX(-50%) scaleX(1.02); }
  }
}
/* END_MALIK_TERMINATOR_CHAT_HOST_V1 */

/* MALIK_CHAT_AI_BACKGROUND — lightweight full-bleed shell for AI chat */
.malik-ai-chat-bg {
  position: relative;
  overflow: hidden !important;
  background: #030818;
}

.malik-ai-chat-bg > .malik-chat-fullwidth {
  position: relative;
  z-index: 2;
}

.malik-ai-chat-bg textarea {
  background: rgba(3, 9, 25, 0.56) !important;
}

.malik-ai-chat-bg [class*="bg-[#030303]"],
.malik-ai-chat-bg [class*="bg-black"] {
  background-color: transparent !important;
}
/* END_MALIK_CHAT_AI_BACKGROUND_V2 */
/* MALIK_PREMIUM_CHAT_HOST_CSS_V3 */
.malik-premium-chat-host {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: transparent;
}
.malik-premium-chat-host > * {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
}
.malik-premium-chat-host textarea {
  width: 100% !important;
  max-width: 100% !important;
}
.malik-dashboard-shell header,
.malik-dashboard-shell header > div {
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}
.malik-dashboard-shell header * {
  min-width: 0;
}
.malik-dashboard-shell header button,
.malik-dashboard-shell header label,
.malik-dashboard-shell header select,
.malik-dashboard-shell header span,
.malik-dashboard-shell header svg {
  flex-shrink: 0;
}
.malik-dashboard-shell header button,
.malik-dashboard-shell header label {
  white-space: nowrap;
  max-width: 100%;
}
.malik-dashboard-shell header > div:nth-of-type(2),
.malik-dashboard-shell header > div:nth-of-type(3) {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  overflow-y: visible;
  white-space: nowrap;
  scrollbar-width: none;
  contain: inline-size;
}
.malik-dashboard-shell header > div:nth-of-type(2)::-webkit-scrollbar,
.malik-dashboard-shell header > div:nth-of-type(3)::-webkit-scrollbar {
  display: none;
}
.malik-dashboard-shell header > div:nth-of-type(2) > *,
.malik-dashboard-shell header > div:nth-of-type(3) > * {
  flex-shrink: 0 !important;
  min-width: max-content;
}
.malik-dashboard-shell header > div:nth-of-type(3) button,
.malik-dashboard-shell header > div:nth-of-type(3) label {
  min-height: 38px;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(210px, 22vw);
}
.malik-dashboard-shell header > div:nth-of-type(3) button span,
.malik-dashboard-shell header > div:nth-of-type(3) label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.malik-dashboard-shell header > div:nth-of-type(3) select {
  max-width: 150px;
}
.malik-dashboard-shell header > div:nth-of-type(3) > div {
  position: relative;
  max-width: min(260px, 24vw);
  overflow: hidden;
}
.malik-dashboard-shell header > div:nth-of-type(3) > div:last-child {
  display: none !important;
}
@media (min-width: 768px) {
  .malik-dashboard-shell header > div:nth-of-type(2) {
    display: none !important;
  }
}
@media (max-width: 767px) {
  .malik-dashboard-shell header > div:nth-of-type(3) {
    display: none !important;
  }
}
@media (min-width: 1280px) {
  .malik-dashboard-shell header > div:nth-of-type(3) > div:last-child {
    display: block;
    min-width: 220px;
    max-width: min(360px, 22vw);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .malik-dashboard-shell header > div:nth-of-type(3) > div:last-child * {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
`
