"use client";

import { useEffect } from "react";

type ModelMeta = {
  label: string;
  slug: string;
  icon: string;
  title: string;
  subtitle: string;
};

const MODELS: ModelMeta[] = [
  {
    label: "GPT-4o",
    slug: "gpt4o",
    icon: "4o",
    title: "Reasoning Core",
    subtitle: "Сильные ответы, стратегия и продуктовые решения",
  },
  {
    label: "Vision Model",
    slug: "vision",
    icon: "◉",
    title: "Vision Intelligence",
    subtitle: "Анализ изображений, UI, скринов и визуальных данных",
  },
  {
    label: "Code Interpreter",
    slug: "code",
    icon: "</>",
    title: "Code Engine",
    subtitle: "Код, debug, архитектура, сборка и рефакторинг",
  },
  {
    label: "Web Search",
    slug: "web",
    icon: "⌕",
    title: "Live Web Layer",
    subtitle: "Свежие данные, поиск, проверка фактов и источники",
  },
  {
    label: "Memory Layer",
    slug: "memory",
    icon: "▣",
    title: "Knowledge Memory",
    subtitle: "Контекст проекта, история, решения и долгосрочная память",
  },
  {
    label: "Smart Routing",
    slug: "routing",
    icon: "↯",
    title: "Sovereign Router",
    subtitle: "Автоматически выбирает лучший режим и модель",
  },
];

const METRIC_LABELS = ["Активные модели", "Точность", "Сессии", "Скорость ответа"];

function findBestAncestor(start: Element, mustContain: string[]) {
  let node: Element | null = start;

  for (let i = 0; node && i < 9; i += 1) {
    const text = node.textContent || "";
    const ok = mustContain.every((item) => text.includes(item));
    if (ok) return node;
    node = node.parentElement;
  }

  return start.parentElement || start;
}

function findSmallestCard(section: Element, label: string) {
  const nodes = Array.from(section.querySelectorAll("div, article, button, li"));

  const candidates = nodes
    .filter((node) => {
      const text = node.textContent || "";
      if (!text.includes(label)) return false;
      if (text.length > 260) return false;
      return true;
    })
    .sort((a, b) => {
      const at = (a.textContent || "").length;
      const bt = (b.textContent || "").length;
      return at - bt;
    });

  return candidates[0] as HTMLElement | undefined;
}

function makeEl(tag: string, className: string, html?: string) {
  const el = document.createElement(tag);
  el.className = className;
  if (html) el.innerHTML = html;
  return el;
}

function enhanceFinalIntelligence() {
  const all = Array.from(document.querySelectorAll("h1,h2,h3,h4,div,section,article"));
  const heading = all.find((el) => {
    const text = (el.textContent || "").trim();
    return text === "Final Intelligence" || text.startsWith("Final Intelligence");
  }) as HTMLElement | undefined;

  if (!heading) return;

  const section = findBestAncestor(heading, ["GPT-4o", "Vision Model", "Smart Routing"]) as HTMLElement;
  if (!section || section.dataset.fiUltra === "1") return;

  section.dataset.fiUltra = "1";
  section.classList.add("fi-ultra-section");

  heading.classList.add("fi-ultra-title");

  const next = heading.nextElementSibling as HTMLElement | null;
  if (next && (next.textContent || "").length < 140) {
    next.classList.add("fi-ultra-subtitle");
    next.textContent =
      "ИИ-оркестратор Sovereign: reasoning, vision, code, web, memory и routing работают как единый мозг продукта.";
  }

  if (!section.querySelector(".fi-ultra-command-badge")) {
    const badge = makeEl(
      "div",
      "fi-ultra-command-badge",
      `
        <span class="fi-command-dot"></span>
        <span>SOVEREIGN ORCHESTRATOR ONLINE</span>
      `
    );
    section.appendChild(badge);
  }

  if (!section.querySelector(".fi-ultra-backlight")) {
    section.appendChild(makeEl("div", "fi-ultra-backlight"));
    section.appendChild(makeEl("div", "fi-ultra-grid"));
    section.appendChild(makeEl("div", "fi-ultra-orbit fi-ultra-orbit-a"));
    section.appendChild(makeEl("div", "fi-ultra-orbit fi-ultra-orbit-b"));
  }

  MODELS.forEach((model) => {
    const card = findSmallestCard(section, model.label);
    if (!card) return;

    card.classList.add("fi-model-card", `fi-model-${model.slug}`);

    if (!card.querySelector(".fi-ai-orb")) {
      const orb = makeEl(
        "div",
        `fi-ai-orb fi-ai-orb-${model.slug}`,
        `<span>${model.icon}</span>`
      );
      card.insertBefore(orb, card.firstChild);
    }

    if (!card.querySelector(".fi-model-caption")) {
      const caption = makeEl(
        "div",
        "fi-model-caption",
        `<strong>${model.title}</strong><small>${model.subtitle}</small>`
      );
      card.appendChild(caption);
    }

    if (!card.querySelector(".fi-active-pulse")) {
      card.appendChild(makeEl("span", "fi-active-pulse"));
    }
  });

  METRIC_LABELS.forEach((label) => {
    const card = findSmallestCard(section, label);
    if (!card) return;
    card.classList.add("fi-metric-card");

    if (!card.querySelector(".fi-metric-shine")) {
      card.appendChild(makeEl("span", "fi-metric-shine"));
    }
  });
}

export default function FinalIntelligenceUpgrade() {
  useEffect(() => {
    let raf = 0;
    let timer: number | undefined;

    const run = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(enhanceFinalIntelligence);
    };

    run();
    timer = window.setInterval(run, 1200);

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (timer) window.clearInterval(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
/* MALIK AI вЂ” FINAL INTELLIGENCE GOD UPGRADE */

.fi-ultra-section {
  position: relative !important;
  overflow: hidden !important;
  isolation: isolate !important;
  border-radius: 28px !important;
  border: 1px solid rgba(148, 163, 255, 0.24) !important;
  background:
    radial-gradient(circle at 50% 20%, rgba(124, 92, 255, 0.18), transparent 32%),
    radial-gradient(circle at 12% 58%, rgba(34, 211, 238, 0.12), transparent 24%),
    linear-gradient(135deg, rgba(4, 8, 22, 0.94), rgba(9, 9, 31, 0.92) 48%, rgba(20, 12, 44, 0.86)) !important;
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 0 42px rgba(99, 102, 241, 0.08) !important;
}

.fi-ultra-section > * {
  position: relative;
  z-index: 4;
}

.fi-ultra-backlight {
  position: absolute !important;
  inset: -40% -22% auto auto !important;
  width: 520px !important;
  height: 520px !important;
  z-index: 0 !important;
  border-radius: 999px !important;
  background:
    radial-gradient(circle, rgba(124, 92, 255, 0.34), rgba(45, 212, 255, 0.12) 36%, transparent 70%) !important;
  filter: blur(20px) !important;
  animation: fiBacklight 12s ease-in-out infinite alternate !important;
}

.fi-ultra-grid {
  position: absolute !important;
  inset: 0 !important;
  z-index: 0 !important;
  opacity: 0.22 !important;
  background-image:
    linear-gradient(rgba(125, 211, 252, 0.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(168, 85, 247, 0.10) 1px, transparent 1px) !important;
  background-size: 34px 34px !important;
  mask-image: radial-gradient(circle at 50% 42%, black 0 52%, transparent 82%) !important;
}

.fi-ultra-orbit {
  position: absolute !important;
  z-index: 1 !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  border-radius: 999px !important;
  border: 1px solid rgba(125, 211, 252, 0.12) !important;
  pointer-events: none !important;
}

.fi-ultra-orbit-a {
  width: 420px !important;
  height: 120px !important;
  animation: fiOrbitA 18s ease-in-out infinite alternate !important;
}

.fi-ultra-orbit-b {
  width: 520px !important;
  height: 150px !important;
  border-color: rgba(168, 85, 247, 0.10) !important;
  animation: fiOrbitB 23s ease-in-out infinite alternate !important;
}

.fi-ultra-title {
  letter-spacing: -0.035em !important;
  color: transparent !important;
  background: linear-gradient(90deg, #ffffff, #bfe8ff 34%, #d8b4fe 72%, #ffffff) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  text-shadow: 0 0 34px rgba(125, 211, 252, 0.20) !important;
}

.fi-ultra-subtitle {
  color: rgba(218, 232, 255, 0.74) !important;
  text-shadow: 0 1px 0 rgba(0,0,0,.25) !important;
}

.fi-ultra-command-badge {
  position: absolute !important;
  top: 18px !important;
  right: 18px !important;
  z-index: 8 !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 8px 12px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(52, 211, 153, 0.32) !important;
  background: rgba(5, 16, 18, 0.72) !important;
  color: #b8ffe7 !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  box-shadow: 0 0 28px rgba(16, 185, 129, 0.13) !important;
}

.fi-command-dot {
  width: 8px !important;
  height: 8px !important;
  border-radius: 999px !important;
  background: #34d399 !important;
  box-shadow: 0 0 14px rgba(52, 211, 153, 0.95) !important;
}

.fi-model-card {
  position: relative !important;
  min-height: 78px !important;
  padding: 14px 16px 14px 76px !important;
  border-radius: 18px !important;
  border: 1px solid rgba(148, 163, 255, 0.18) !important;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(17, 24, 39, 0.40)),
    radial-gradient(circle at 0% 0%, rgba(96, 165, 250, 0.10), transparent 42%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.06),
    0 18px 38px rgba(0,0,0,.22) !important;
  transition:
    transform .24s ease,
    border-color .24s ease,
    box-shadow .24s ease,
    background .24s ease !important;
}

.fi-model-card:hover {
  transform: translateY(-2px) !important;
  border-color: rgba(125, 211, 252, 0.36) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.08),
    0 24px 54px rgba(0,0,0,.30),
    0 0 36px rgba(99, 102, 241, 0.14) !important;
}

.fi-ai-orb {
  position: absolute !important;
  left: 16px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 44px !important;
  height: 44px !important;
  border-radius: 15px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,.16) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.16),
    0 0 26px rgba(125, 211, 252, 0.18) !important;
}

.fi-ai-orb::before {
  content: "" !important;
  position: absolute !important;
  inset: -30% !important;
  background:
    conic-gradient(from 180deg, transparent, rgba(255,255,255,.55), transparent, rgba(125,211,252,.44), transparent) !important;
  animation: fiOrbSpin 7s linear infinite !important;
}

.fi-ai-orb span {
  position: relative !important;
  z-index: 2 !important;
  width: 34px !important;
  height: 34px !important;
  border-radius: 12px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(2, 6, 23, 0.74) !important;
  color: white !important;
  font-size: 12px !important;
  font-weight: 900 !important;
  letter-spacing: -0.04em !important;
}

.fi-ai-orb-gpt4o { background: linear-gradient(135deg, #7c3aed, #06b6d4) !important; }
.fi-ai-orb-vision { background: linear-gradient(135deg, #2563eb, #22d3ee) !important; }
.fi-ai-orb-code { background: linear-gradient(135deg, #0f172a, #10b981) !important; }
.fi-ai-orb-web { background: linear-gradient(135deg, #0ea5e9, #6366f1) !important; }
.fi-ai-orb-memory { background: linear-gradient(135deg, #a855f7, #f472b6) !important; }
.fi-ai-orb-routing { background: linear-gradient(135deg, #f59e0b, #8b5cf6) !important; }

.fi-model-caption {
  margin-top: 6px !important;
  display: grid !important;
  gap: 2px !important;
}

.fi-model-caption strong {
  color: rgba(237, 246, 255, 0.92) !important;
  font-size: 12px !important;
  font-weight: 900 !important;
  letter-spacing: -0.01em !important;
}

.fi-model-caption small {
  color: rgba(174, 195, 235, 0.64) !important;
  font-size: 11px !important;
  line-height: 1.35 !important;
}

.fi-active-pulse {
  position: absolute !important;
  right: 14px !important;
  top: 14px !important;
  width: 8px !important;
  height: 8px !important;
  border-radius: 999px !important;
  background: #34d399 !important;
  box-shadow: 0 0 14px rgba(52, 211, 153, 0.95) !important;
}

.fi-active-pulse::after {
  content: "" !important;
  position: absolute !important;
  inset: -7px !important;
  border-radius: inherit !important;
  border: 1px solid rgba(52, 211, 153, 0.38) !important;
  animation: fiPulse 1.9s ease-out infinite !important;
}

.fi-metric-card {
  position: relative !important;
  overflow: hidden !important;
  border-radius: 22px !important;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(30, 27, 75, 0.50)),
    radial-gradient(circle at 86% 0%, rgba(124, 58, 237, 0.14), transparent 36%) !important;
  border-color: rgba(148, 163, 255, 0.24) !important;
}

.fi-metric-shine {
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,.10) 42%, transparent 60%) !important;
  transform: translateX(-120%) !important;
  animation: fiMetricShine 5.8s ease-in-out infinite !important;
}

@keyframes fiBacklight {
  from { transform: translate3d(0,0,0) scale(1); opacity: .58; }
  to { transform: translate3d(-12%,12%,0) scale(1.08); opacity: .82; }
}

@keyframes fiOrbitA {
  from { transform: translate(-50%, -50%) rotate(-4deg) scale(1); opacity: .42; }
  to { transform: translate(-50%, -50%) rotate(5deg) scale(1.05); opacity: .66; }
}

@keyframes fiOrbitB {
  from { transform: translate(-50%, -50%) rotate(7deg) scale(1); opacity: .30; }
  to { transform: translate(-50%, -50%) rotate(-6deg) scale(1.06); opacity: .54; }
}

@keyframes fiOrbSpin {
  to { transform: rotate(360deg); }
}

@keyframes fiPulse {
  from { transform: scale(.7); opacity: .72; }
  to { transform: scale(1.8); opacity: 0; }
}

@keyframes fiMetricShine {
  0%, 45% { transform: translateX(-120%); opacity: 0; }
  55% { opacity: 1; }
  72%, 100% { transform: translateX(120%); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .fi-ultra-backlight,
  .fi-ultra-orbit,
  .fi-ai-orb::before,
  .fi-active-pulse::after,
  .fi-metric-shine {
    animation: none !important;
  }
}

@media (max-width: 900px) {
  .fi-ultra-command-badge {
    position: relative !important;
    top: auto !important;
    right: auto !important;
    margin-top: 12px !important;
  }

  .fi-model-card {
    padding-left: 70px !important;
  }
}
        `,
      }}
    />
  );
}
