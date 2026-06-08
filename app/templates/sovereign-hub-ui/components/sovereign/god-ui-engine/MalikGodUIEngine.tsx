"use client";

import { useEffect } from "react";

type ModuleInfo = {
  title: string;
  subtitle: string;
  accent: string;
  icon: string;
  actions: string[];
};

const MODULES: Record<string, ModuleInfo> = {
  final: {
    title: "Final Intelligence Cockpit",
    subtitle: "Reasoning, planning, memory, routing and launch-control are active.",
    accent: "violet",
    icon: "вњЈ",
    actions: ["Open Reasoning", "Memory Sync", "Planner Boost"],
  },
  unbreakable: {
    title: "Unbreakable AI Guard",
    subtitle: "Security, guardrails, rate limits, role access and fallback protection are online.",
    accent: "emerald",
    icon: "вЊ¬",
    actions: ["Run Audit", "Check Guardrails", "Open Risk Map"],
  },
  command: {
    title: "Command Center",
    subtitle: "Mission control for agents, workflow automation, queues and live telemetry.",
    accent: "amber",
    icon: "вЊ",
    actions: ["Create Agent", "Start Mission", "Open Telemetry"],
  },
  search: {
    title: "Global Search",
    subtitle: "Projects, files, chats, tools, docs and knowledge search router.",
    accent: "sky",
    icon: "вЊ•",
    actions: ["Search Projects", "Search Files", "Save Search"],
  },
  ai: {
    title: "AI Generator",
    subtitle: "Unified text, prompt, code, image, video and presentation generation entrypoint.",
    accent: "violet",
    icon: "вљЎ",
    actions: ["Generate Text", "Enhance Prompt", "Route Model"],
  },
  photo: {
    title: "Photo Generation",
    subtitle: "Image studio with prompt enhancer, gallery, provider routing and canvas handoff.",
    accent: "cyan",
    icon: "в—§",
    actions: ["Generate Image", "Open Gallery", "Send to Canvas"],
  },
  video: {
    title: "Video Generation",
    subtitle: "Cinematic storyboard, scene control, duration, render queue and provider routing.",
    accent: "rose",
    icon: "в–»",
    actions: ["Create Video", "Import Storyboard", "Render Queue"],
  },
  website: {
    title: "Website Builder",
    subtitle: "One prompt to landing page, sections, copy, responsive layout and preview.",
    accent: "emerald",
    icon: "в—Ћ",
    actions: ["Generate Site", "Open Preview", "Publish"],
  },
  code: {
    title: "Code Generator",
    subtitle: "File-aware code generation, live preview, patches, debug and build-safe refactor.",
    accent: "yellow",
    icon: "</>",
    actions: ["Generate Code", "Fix Error", "Run Build Check"],
  },
  projects: {
    title: "Projects Workspace",
    subtitle: "All generated artifacts, sites, code, images, videos and versions in one place.",
    accent: "sky",
    icon: "в–Ј",
    actions: ["Open Project", "New Version", "Export"],
  },
  default: {
    title: "Sovereign Action Engine",
    subtitle: "Interactive UI engine is active. Click any module or button to open live controls.",
    accent: "cyan",
    icon: "в—†",
    actions: ["Open Module", "Run Action", "Create Flow"],
  },
};

function norm(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function moduleFromText(text: string) {
  const t = norm(text);

  if (t.includes("final intelligence")) return "final";
  if (t.includes("unbreakable ai")) return "unbreakable";
  if (t.includes("command center")) return "command";
  if (t.includes("РіР»РѕР±Р°Р»СЊРЅС‹Р№ РїРѕРёСЃРє") || t.includes("global search") || t.includes("ctrl+k")) return "search";
  if (t.includes("ai РіРµРЅРµСЂР°С‚РѕСЂ") || t.includes("ai generator")) return "ai";
  if (t.includes("photo generation") || t.includes("image")) return "photo";
  if (t.includes("video generation") || t.includes("video")) return "video";
  if (t.includes("website builder") || t.includes("landing")) return "website";
  if (t.includes("code generator") || t.includes("code")) return "code";
  if (t.includes("РїСЂРѕРµРєС‚С‹") || t.includes("projects")) return "projects";
  if (t.includes("РЅРµР№СЂРѕ") || t.includes("dialog")) return "final";
  if (t.includes("РґРёР·Р°Р№РЅ")) return "website";
  if (t.includes("С€Р°Р±Р»РѕРЅ")) return "website";
  if (t.includes("РЅР°СЃС‚СЂРѕР№РєРё")) return "default";
  if (t.includes("РїРѕРґРїРёСЃРєР°")) return "default";
  if (t.includes("РїРѕРґРґРµСЂР¶РєР°")) return "default";
  if (t.includes("malik codex")) return "code";

  return "default";
}

function safeText(el: Element | null) {
  return (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260);
}

function getPageTitle() {
  const h1 = document.querySelector("h1");
  const h2 = document.querySelector("h2");
  const text = safeText(h1 || h2);
  return text || "MALIK AI";
}

function findActionTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;

  let node: HTMLElement | null = target;

  for (let i = 0; node && i < 7; i += 1) {
    if (node.id === "malik-god-ui-root") return null;
    if (node.closest("#malik-god-ui-root")) return null;

    const tag = node.tagName.toLowerCase();
    const text = safeText(node);

    const clickable =
      tag === "button" ||
      tag === "a" ||
      node.getAttribute("role") === "button" ||
      node.dataset.mgxModule ||
      node.classList.contains("mgx-action");

    if (clickable && text.length > 0 && text.length < 220) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

function addClass(el: Element, cls: string) {
  if (!el.classList.contains(cls)) el.classList.add(cls);
}

function createLog(text: string) {
  try {
    const key = "malik.ui.actions";
    const old = JSON.parse(window.localStorage.getItem(key) || "[]");
    old.unshift({ text, at: new Date().toISOString() });
    window.localStorage.setItem(key, JSON.stringify(old.slice(0, 25)));
  } catch {
    // ignore
  }
}

function getLogs() {
  try {
    return JSON.parse(window.localStorage.getItem("malik.ui.actions") || "[]") as Array<{ text: string; at: string }>;
  } catch {
    return [];
  }
}

function injectStyle() {
  if (document.getElementById("malik-god-ui-style")) return;

  const style = document.createElement("style");
  style.id = "malik-god-ui-style";
  style.textContent = `
/* MALIK AI вЂ” REAL WORKING UI ENGINE GOD PATCH V2 */

html[data-malik-god-ui="on"] body {
  --mgx-cyan: #22d3ee;
  --mgx-sky: #38bdf8;
  --mgx-violet: #8b5cf6;
  --mgx-purple: #a855f7;
  --mgx-emerald: #34d399;
  --mgx-amber: #f59e0b;
  --mgx-rose: #fb7185;
}

/* Stronger global card upgrade */
.mgx-card {
  position: relative !important;
  overflow: hidden !important;
  border-color: rgba(125, 211, 252, 0.18) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.06),
    0 18px 54px rgba(0,0,0,.28),
    0 0 42px rgba(99,102,241,.045) !important;
  transition:
    transform .22s ease,
    border-color .22s ease,
    box-shadow .22s ease,
    filter .22s ease !important;
}

.mgx-card:hover {
  transform: translateY(-2px) !important;
  border-color: rgba(125, 211, 252, 0.38) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.10),
    0 26px 70px rgba(0,0,0,.36),
    0 0 58px rgba(34,211,238,.10) !important;
  filter: saturate(1.12) !important;
}

.mgx-card::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  background:
    radial-gradient(circle at 14% 0%, rgba(34,211,238,.12), transparent 34%),
    radial-gradient(circle at 100% 0%, rgba(168,85,247,.10), transparent 34%) !important;
  opacity: .82 !important;
}

.mgx-card::after {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,.075) 44%, transparent 59%) !important;
  transform: translateX(-120%) !important;
  opacity: 0 !important;
}

.mgx-card:hover::after {
  animation: mgxShine 1.1s ease both !important;
}

.mgx-page-title {
  color: transparent !important;
  background: linear-gradient(90deg, #ffffff, #bdefff 35%, #d8b4fe 72%, #ffffff) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  text-shadow: 0 0 38px rgba(125,211,252,.14) !important;
  letter-spacing: -0.045em !important;
}

.mgx-action {
  position: relative !important;
  cursor: pointer !important;
  overflow: hidden !important;
  transition:
    transform .18s ease,
    border-color .18s ease,
    box-shadow .18s ease,
    background .18s ease !important;
}

.mgx-action:hover {
  transform: translateY(-1px) !important;
  border-color: rgba(34,211,238,.40) !important;
  box-shadow:
    0 14px 34px rgba(0,0,0,.26),
    0 0 30px rgba(34,211,238,.11),
    inset 0 1px 0 rgba(255,255,255,.10) !important;
}

.mgx-side {
  position: relative !important;
  border-color: rgba(148, 163, 184, 0.12) !important;
}

.mgx-side::before {
  content: "" !important;
  position: absolute !important;
  left: 0 !important;
  top: 18% !important;
  bottom: 18% !important;
  width: 3px !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, var(--mgx-cyan), var(--mgx-violet)) !important;
  opacity: .0 !important;
  transform: scaleY(.4) !important;
  transition: opacity .18s ease, transform .18s ease !important;
}

.mgx-side:hover::before,
.mgx-side.mgx-side-active::before {
  opacity: 1 !important;
  transform: scaleY(1) !important;
}

.mgx-live-badge {
  position: absolute !important;
  right: 12px !important;
  top: 12px !important;
  z-index: 8 !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 5px 8px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(52,211,153,.22) !important;
  background: rgba(6, 78, 59, .16) !important;
  color: #bbf7d0 !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  letter-spacing: .04em !important;
  text-transform: uppercase !important;
  pointer-events: none !important;
}

.mgx-live-badge::before {
  content: "" !important;
  width: 6px !important;
  height: 6px !important;
  border-radius: 999px !important;
  background: #34d399 !important;
  box-shadow: 0 0 12px rgba(52,211,153,.9) !important;
}

.mgx-ai-thumb {
  position: absolute !important;
  right: 14px !important;
  bottom: 14px !important;
  z-index: 6 !important;
  width: 46px !important;
  height: 46px !important;
  border-radius: 16px !important;
  opacity: .82 !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  background:
    radial-gradient(circle at 35% 30%, rgba(255,255,255,.78), transparent 12%),
    radial-gradient(circle at 55% 55%, rgba(34,211,238,.70), transparent 24%),
    conic-gradient(from 180deg, rgba(139,92,246,.7), rgba(34,211,238,.7), rgba(52,211,153,.55), rgba(139,92,246,.7)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.16),
    0 0 30px rgba(34,211,238,.16) !important;
  pointer-events: none !important;
}

.mgx-ai-thumb::after {
  content: "" !important;
  position: absolute !important;
  inset: 9px !important;
  border-radius: 11px !important;
  border: 1px solid rgba(255,255,255,.18) !important;
  background: rgba(2,6,23,.38) !important;
}

/* Visible fixed engine HUD */
#malik-god-ui-root {
  position: fixed !important;
  right: 22px !important;
  bottom: 22px !important;
  z-index: 2147483600 !important;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  color: #f8fafc !important;
  pointer-events: none !important;
}

#malik-god-ui-root * {
  box-sizing: border-box !important;
}

.mgx-hud {
  width: min(430px, calc(100vw - 32px)) !important;
  border: 1px solid rgba(125, 211, 252, 0.22) !important;
  border-radius: 26px !important;
  overflow: hidden !important;
  pointer-events: auto !important;
  background:
    radial-gradient(circle at 0% 0%, rgba(34,211,238,.17), transparent 34%),
    radial-gradient(circle at 100% 0%, rgba(168,85,247,.18), transparent 34%),
    linear-gradient(135deg, rgba(3,7,18,.94), rgba(8,12,30,.92)) !important;
  box-shadow:
    0 34px 130px rgba(0,0,0,.58),
    inset 0 1px 0 rgba(255,255,255,.08),
    0 0 70px rgba(99,102,241,.18) !important;
  backdrop-filter: blur(22px) saturate(1.25) !important;
  transform-origin: bottom right !important;
  animation: mgxPanelIn .24s ease both !important;
}

.mgx-hud[data-collapsed="1"] {
  width: auto !important;
}

.mgx-hud[data-collapsed="1"] .mgx-body,
.mgx-hud[data-collapsed="1"] .mgx-head-text,
.mgx-hud[data-collapsed="1"] .mgx-status-row {
  display: none !important;
}

.mgx-head {
  position: relative !important;
  padding: 16px 16px 14px !important;
  border-bottom: 1px solid rgba(148,163,184,.13) !important;
}

.mgx-head-main {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding-right: 74px !important;
}

.mgx-icon {
  width: 48px !important;
  height: 48px !important;
  flex: 0 0 auto !important;
  border-radius: 17px !important;
  display: grid !important;
  place-items: center !important;
  color: white !important;
  font-weight: 950 !important;
  border: 1px solid rgba(255,255,255,.16) !important;
  background:
    linear-gradient(135deg, rgba(34,211,238,.32), rgba(139,92,246,.36)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.18),
    0 0 32px rgba(34,211,238,.18) !important;
}

.mgx-title {
  margin: 0 !important;
  color: #f8fbff !important;
  font-size: 18px !important;
  line-height: 1.08 !important;
  letter-spacing: -0.035em !important;
  font-weight: 950 !important;
}

.mgx-subtitle {
  margin: 6px 0 0 !important;
  color: rgba(209,223,255,.68) !important;
  font-size: 12px !important;
  line-height: 1.38 !important;
}

.mgx-controls {
  position: absolute !important;
  right: 12px !important;
  top: 12px !important;
  display: flex !important;
  gap: 7px !important;
}

.mgx-control {
  width: 29px !important;
  height: 29px !important;
  border-radius: 10px !important;
  border: 1px solid rgba(255,255,255,.12) !important;
  color: rgba(226,232,240,.88) !important;
  background: rgba(15,23,42,.70) !important;
  cursor: pointer !important;
}

.mgx-status-row {
  margin-top: 14px !important;
  display: flex !important;
  justify-content: space-between !important;
  gap: 10px !important;
  padding: 10px 12px !important;
  border-radius: 16px !important;
  border: 1px solid rgba(52,211,153,.18) !important;
  background: rgba(6,78,59,.12) !important;
}

.mgx-status {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  color: #bbf7d0 !important;
  font-size: 11px !important;
  font-weight: 900 !important;
}

.mgx-dot {
  width: 8px !important;
  height: 8px !important;
  border-radius: 999px !important;
  background: #34d399 !important;
  box-shadow: 0 0 14px rgba(52,211,153,.95) !important;
}

.mgx-hotkey {
  border: 1px solid rgba(125,211,252,.18) !important;
  border-radius: 9px !important;
  padding: 4px 7px !important;
  color: rgba(186,230,253,.82) !important;
  font-size: 10px !important;
  font-weight: 800 !important;
}

.mgx-body {
  padding: 14px 16px 16px !important;
}

.mgx-grid {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin-bottom: 12px !important;
}

.mgx-chip {
  min-height: 54px !important;
  border: 1px solid rgba(148,163,184,.13) !important;
  border-radius: 14px !important;
  background: rgba(15,23,42,.54) !important;
  padding: 9px !important;
  color: rgba(226,232,240,.90) !important;
  font-size: 11px !important;
  line-height: 1.22 !important;
  font-weight: 800 !important;
}

.mgx-progress {
  position: relative !important;
  height: 10px !important;
  border-radius: 999px !important;
  overflow: hidden !important;
  background: rgba(15,23,42,.82) !important;
  border: 1px solid rgba(148,163,184,.14) !important;
  margin: 6px 0 12px !important;
}

.mgx-progress span {
  position: absolute !important;
  inset: 0 auto 0 0 !important;
  width: 76% !important;
  border-radius: inherit !important;
  background: linear-gradient(90deg, #22d3ee, #8b5cf6, #34d399) !important;
  box-shadow: 0 0 22px rgba(34,211,238,.34) !important;
  animation: mgxProgress 2.4s ease-in-out infinite alternate !important;
}

.mgx-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 9px !important;
}

.mgx-btn {
  min-height: 40px !important;
  border-radius: 14px !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  color: #f8fafc !important;
  font-weight: 950 !important;
  cursor: pointer !important;
  background: rgba(15,23,42,.64) !important;
}

.mgx-btn-primary {
  grid-column: span 2 !important;
  background: linear-gradient(135deg, rgba(79,70,229,.96), rgba(14,165,233,.88)) !important;
  box-shadow: 0 18px 34px rgba(59,130,246,.20), inset 0 1px 0 rgba(255,255,255,.18) !important;
}

.mgx-log {
  max-height: 88px !important;
  overflow: auto !important;
  margin-top: 12px !important;
  display: grid !important;
  gap: 6px !important;
}

.mgx-log-item {
  padding: 7px 9px !important;
  border-radius: 11px !important;
  background: rgba(2,6,23,.44) !important;
  border: 1px solid rgba(148,163,184,.10) !important;
  color: rgba(203,213,225,.70) !important;
  font-size: 10px !important;
  line-height: 1.25 !important;
}

.mgx-palette {
  position: fixed !important;
  left: 50% !important;
  top: 80px !important;
  z-index: 2147483601 !important;
  transform: translateX(-50%) !important;
  width: min(760px, calc(100vw - 28px)) !important;
  max-height: min(620px, calc(100vh - 120px)) !important;
  overflow: hidden !important;
  border: 1px solid rgba(125,211,252,.24) !important;
  border-radius: 26px !important;
  background:
    radial-gradient(circle at 0% 0%, rgba(34,211,238,.18), transparent 34%),
    radial-gradient(circle at 100% 0%, rgba(168,85,247,.18), transparent 34%),
    linear-gradient(135deg, rgba(3,7,18,.96), rgba(8,12,30,.94)) !important;
  box-shadow: 0 34px 130px rgba(0,0,0,.60), 0 0 80px rgba(99,102,241,.20) !important;
  backdrop-filter: blur(22px) saturate(1.25) !important;
  pointer-events: auto !important;
  animation: mgxPaletteIn .22s ease both !important;
}

.mgx-palette[hidden] {
  display: none !important;
}

.mgx-search {
  width: 100% !important;
  height: 52px !important;
  border: 0 !important;
  border-bottom: 1px solid rgba(148,163,184,.14) !important;
  background: rgba(2,6,23,.42) !important;
  color: white !important;
  outline: none !important;
  padding: 0 18px !important;
  font-size: 15px !important;
  font-weight: 800 !important;
}

.mgx-palette-list {
  padding: 10px !important;
  max-height: 520px !important;
  overflow: auto !important;
}

.mgx-palette-item {
  width: 100% !important;
  display: grid !important;
  grid-template-columns: 44px 1fr auto !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 12px !important;
  border-radius: 17px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: #f8fafc !important;
  text-align: left !important;
  cursor: pointer !important;
}

.mgx-palette-item:hover {
  background: rgba(15,23,42,.72) !important;
  border-color: rgba(125,211,252,.20) !important;
}

.mgx-palette-ico {
  width: 42px !important;
  height: 42px !important;
  border-radius: 14px !important;
  display: grid !important;
  place-items: center !important;
  background: linear-gradient(135deg, rgba(34,211,238,.18), rgba(139,92,246,.18)) !important;
  border: 1px solid rgba(255,255,255,.10) !important;
  font-weight: 950 !important;
}

.mgx-toast {
  position: fixed !important;
  right: 22px !important;
  top: 22px !important;
  z-index: 2147483602 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  max-width: min(440px, calc(100vw - 32px)) !important;
  padding: 13px 16px !important;
  border-radius: 16px !important;
  border: 1px solid rgba(125,211,252,.24) !important;
  background: rgba(2,6,23,.90) !important;
  color: #f8fafc !important;
  box-shadow: 0 20px 70px rgba(0,0,0,.46), 0 0 34px rgba(34,211,238,.13) !important;
  backdrop-filter: blur(18px) !important;
  animation: mgxToastIn .22s ease both !important;
  pointer-events: none !important;
  font-weight: 900 !important;
  font-size: 12px !important;
}

.mgx-toast::before {
  content: "" !important;
  width: 8px !important;
  height: 8px !important;
  border-radius: 999px !important;
  background: #22d3ee !important;
  box-shadow: 0 0 14px rgba(34,211,238,.95) !important;
}

@keyframes mgxShine {
  0% { opacity: 0; transform: translateX(-120%); }
  24% { opacity: 1; }
  100% { opacity: 0; transform: translateX(120%); }
}

@keyframes mgxPanelIn {
  from { opacity: 0; transform: translate3d(0, 14px, 0) scale(.985); }
  to { opacity: 1; transform: translate3d(0,0,0) scale(1); }
}

@keyframes mgxPaletteIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(.985); }
  to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

@keyframes mgxToastIn {
  from { opacity: 0; transform: translateY(-10px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes mgxProgress {
  from { width: 58%; filter: saturate(1); }
  to { width: 94%; filter: saturate(1.25); }
}

@media (max-width: 760px) {
  #malik-god-ui-root {
    right: 12px !important;
    bottom: 12px !important;
  }

  .mgx-hud {
    width: calc(100vw - 24px) !important;
  }

  .mgx-grid {
    grid-template-columns: 1fr !important;
  }
}
  `;
  document.head.appendChild(style);
}

function createRoot() {
  let root = document.getElementById("malik-god-ui-root");
  if (root) return root;

  root = document.createElement("div");
  root.id = "malik-god-ui-root";
  root.innerHTML = `
    <div class="mgx-hud" data-collapsed="0">
      <div class="mgx-head">
        <div class="mgx-controls">
          <button class="mgx-control" data-mgx="palette" title="Ctrl+K">вЊ</button>
          <button class="mgx-control" data-mgx="collapse" title="Collapse">в€’</button>
        </div>
        <div class="mgx-head-main">
          <div class="mgx-icon">в—†</div>
          <div class="mgx-head-text">
            <h3 class="mgx-title">Sovereign Action Engine</h3>
            <p class="mgx-subtitle">Interactive UI engine is active. Click any module or button.</p>
          </div>
        </div>
        <div class="mgx-status-row">
          <span class="mgx-status"><span class="mgx-dot"></span> UI actions online</span>
          <span class="mgx-hotkey">Ctrl + K</span>
        </div>
      </div>
      <div class="mgx-body">
        <div class="mgx-grid">
          <div class="mgx-chip">Route module</div>
          <div class="mgx-chip">Open panel</div>
          <div class="mgx-chip">Log action</div>
        </div>
        <div class="mgx-progress"><span></span></div>
        <div class="mgx-actions">
          <button class="mgx-btn mgx-btn-primary" data-mgx="run">Run selected action</button>
          <button class="mgx-btn" data-mgx="palette">Command palette</button>
          <button class="mgx-btn" data-mgx="logs">Action logs</button>
        </div>
        <div class="mgx-log"></div>
      </div>
    </div>

    <div class="mgx-palette" hidden>
      <input class="mgx-search" placeholder="Search module: Final, Unbreakable, Video, Website, Code..." />
      <div class="mgx-palette-list"></div>
    </div>
  `;

  document.body.appendChild(root);
  return root;
}

function setHud(moduleKey: string, reason?: string) {
  const root = createRoot();
  const mod = MODULES[moduleKey] || MODULES.default;

  const icon = root.querySelector(".mgx-icon");
  const title = root.querySelector(".mgx-title");
  const sub = root.querySelector(".mgx-subtitle");
  const chips = Array.from(root.querySelectorAll(".mgx-chip"));
  const log = root.querySelector(".mgx-log");

  if (icon) icon.textContent = mod.icon;
  if (title) title.textContent = mod.title;
  if (sub) sub.textContent = reason || mod.subtitle;

  chips.forEach((chip, index) => {
    chip.textContent = mod.actions[index] || mod.actions[0];
  });

  if (log) {
    const logs = getLogs().slice(0, 4);
    log.innerHTML = logs.length
      ? logs.map((item) => `<div class="mgx-log-item">${item.text}</div>`).join("")
      : `<div class="mgx-log-item">Ready. Click any sidebar item or button.</div>`;
  }

  try {
    window.localStorage.setItem("malik.activeModule", moduleKey);
    window.localStorage.setItem("malik.activeModuleTitle", mod.title);
  } catch {
    // ignore
  }
}

function showToast(text: string) {
  const old = document.querySelector(".mgx-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.className = "mgx-toast";
  toast.textContent = text;
  document.body.appendChild(toast);

  window.setTimeout(() => toast.remove(), 2300);
}

function openPalette() {
  const root = createRoot();
  const palette = root.querySelector<HTMLElement>(".mgx-palette");
  const input = root.querySelector<HTMLInputElement>(".mgx-search");
  const list = root.querySelector<HTMLElement>(".mgx-palette-list");

  if (!palette || !input || !list) return;

  const items = Object.entries(MODULES)
    .filter(([key]) => key !== "default")
    .map(([key, mod]) => ({ key, ...mod }));

  const render = () => {
    const q = norm(input.value);
    const filtered = items.filter((item) => norm(`${item.title} ${item.subtitle} ${item.actions.join(" ")}`).includes(q));

    list.innerHTML = filtered
      .map(
        (item) => `
          <button class="mgx-palette-item" data-module="${item.key}">
            <span class="mgx-palette-ico">${item.icon}</span>
            <span>
              <strong>${item.title}</strong><br />
              <small>${item.subtitle}</small>
            </span>
            <span class="mgx-hotkey">Open</span>
          </button>
        `
      )
      .join("");
  };

  input.oninput = render;
  list.onclick = (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(".mgx-palette-item");
    if (!item) return;

    const key = item.dataset.module || "default";
    palette.hidden = true;
    const mod = MODULES[key] || MODULES.default;
    createLog(`${mod.title} opened from command palette`);
    setHud(key);
    showToast(`${mod.title} activated`);
  };

  render();
  palette.hidden = false;
  window.setTimeout(() => input.focus(), 20);
}

function closePalette() {
  const palette = document.querySelector<HTMLElement>("#malik-god-ui-root .mgx-palette");
  if (palette) palette.hidden = true;
}

function enhanceDom() {
  document.documentElement.dataset.malikGodUi = "on";

  document.querySelectorAll("h1").forEach((h) => addClass(h, "mgx-page-title"));

  const maybeCards = Array.from(document.querySelectorAll<HTMLElement>("main div, main section, main article, [class*='card'], [class*='rounded']"));
  maybeCards.forEach((el) => {
    if (el.closest("#malik-god-ui-root")) return;

    const rect = el.getBoundingClientRect();
    const text = safeText(el);
    if (rect.width < 140 || rect.height < 48) return;
    if (text.length < 5 || text.length > 1200) return;

    const style = window.getComputedStyle(el);
    const hasBorder = parseFloat(style.borderTopWidth || "0") > 0;
    const hasBg = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
    const rounded = parseFloat(style.borderTopLeftRadius || "0") > 8;

    if ((hasBorder || hasBg || rounded) && rect.top > 42) {
      addClass(el, "mgx-card");

      if (!el.querySelector(":scope > .mgx-live-badge") && rect.width > 210 && rect.height > 76) {
        const badge = document.createElement("span");
        badge.className = "mgx-live-badge";
        badge.textContent = "active";
        el.appendChild(badge);
      }

      const cardText = norm(text);
      if (
        !el.querySelector(":scope > .mgx-ai-thumb") &&
        rect.width > 230 &&
        rect.height > 110 &&
        (cardText.includes("ai") ||
          cardText.includes("generation") ||
          cardText.includes("РіРµРЅРµСЂР°") ||
          cardText.includes("security") ||
          cardText.includes("guard") ||
          cardText.includes("builder") ||
          cardText.includes("code") ||
          cardText.includes("РјРѕРґРµР»СЊ"))
      ) {
        const thumb = document.createElement("span");
        thumb.className = "mgx-ai-thumb";
        el.appendChild(thumb);
      }
    }
  });

  const clickable = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']"));
  clickable.forEach((el) => {
    if (el.closest("#malik-god-ui-root")) return;
    const text = safeText(el);
    if (!text || text.length > 180) return;
    addClass(el, "mgx-action");
  });

  const side = Array.from(document.querySelectorAll<HTMLElement>("aside button, aside a, aside [role='button'], aside div, nav button, nav a"));
  side.forEach((el) => {
    if (el.closest("#malik-god-ui-root")) return;
    const text = safeText(el);
    if (!text || text.length > 170) return;
    const key = moduleFromText(text);
    if (key !== "default" || text.length < 80) {
      addClass(el, "mgx-side");
      el.dataset.mgxModule = key;
    }
  });
}

export default function MalikGodUIEngine() {
  useEffect(() => {
    injectStyle();
    createRoot();
    setHud(moduleFromText(getPageTitle()), "Real working UI action layer is now visible and active.");
    enhanceDom();

    const interval = window.setInterval(() => {
      enhanceDom();
      const pageKey = moduleFromText(getPageTitle());
      document.querySelectorAll(".mgx-side-active").forEach((el) => el.classList.remove("mgx-side-active"));
      document.querySelectorAll<HTMLElement>(`[data-mgx-module="${pageKey}"]`).forEach((el) => addClass(el, "mgx-side-active"));
    }, 900);

    const root = document.getElementById("malik-god-ui-root");

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("#malik-god-ui-root")) {
        const btn = target.closest<HTMLElement>("[data-mgx]");
        if (!btn) return;

        const action = btn.dataset.mgx;

        if (action === "palette") {
          openPalette();
          return;
        }

        if (action === "collapse") {
          const hud = root?.querySelector<HTMLElement>(".mgx-hud");
          if (hud) {
            const collapsed = hud.dataset.collapsed === "1";
            hud.dataset.collapsed = collapsed ? "0" : "1";
            btn.textContent = collapsed ? "в€’" : "+";
          }
          return;
        }

        if (action === "run") {
          const title = root?.querySelector(".mgx-title")?.textContent || "Sovereign Action";
          createLog(`${title}: action executed`);
          setHud(moduleFromText(title));
          showToast(`${title}: action executed`);
          return;
        }

        if (action === "logs") {
          createLog("Action logs opened");
          setHud("default", "Recent local action logs updated.");
          showToast("Action logs refreshed");
          return;
        }
      }

      const actionTarget = findActionTarget(event.target);
      if (!actionTarget) return;

      const text = safeText(actionTarget);
      const key = actionTarget.dataset.mgxModule || moduleFromText(text);
      const mod = MODULES[key] || MODULES.default;

      createLog(`${mod.title}: ${text || "module clicked"}`);
      setHud(key, `${text || mod.title} is ready. Action panel opened.`);
      showToast(`${mod.title} ready`);

      // Do NOT prevent default. Existing page routing keeps working.
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        openPalette();
        showToast("Command palette opened");
      }

      if (event.key === "Escape") {
        closePalette();
      }

      if (event.altKey) {
        const map: Record<string, string> = {
          f: "final",
          u: "unbreakable",
          c: "command",
          s: "search",
          a: "ai",
          p: "photo",
          v: "video",
          w: "website",
          k: "code",
        };

        const moduleKey = map[key];
        if (moduleKey) {
          event.preventDefault();
          const mod = MODULES[moduleKey];
          createLog(`${mod.title}: opened by Alt+${key.toUpperCase()}`);
          setHud(moduleKey);
          showToast(`${mod.title} activated`);
        }
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);

    const observer = new MutationObserver(enhanceDom);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown);
      observer.disconnect();
    };
  }, []);

  return null;
}