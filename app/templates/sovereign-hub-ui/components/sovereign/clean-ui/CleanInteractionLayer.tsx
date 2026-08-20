"use client";

import { useEffect } from "react";
import { debounce, throttle } from "@/lib/perf-scheduler";

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getText(el: Element | null) {
  return (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function toast(message: string) {
  const old = document.querySelector(".mclean-toast");
  old?.remove();

  const el = document.createElement("div");
  el.className = "mclean-toast";
  el.textContent = message;
  document.body.appendChild(el);

  window.setTimeout(() => {
    el.classList.add("mclean-toast-hide");
    window.setTimeout(() => el.remove(), 260);
  }, 1300);
}

function saveAction(message: string) {
  try {
    const key = "malik.clean.actions";
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    list.unshift({ message, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
  } catch {
    // ignore
  }
}

function focusMainInput() {
  const input =
    document.querySelector<HTMLTextAreaElement>("textarea") ||
    document.querySelector<HTMLInputElement>("input[placeholder*='Опиши' i]") ||
    document.querySelector<HTMLInputElement>("input[placeholder*='prompt' i]") ||
    document.querySelector<HTMLInputElement>("input[placeholder*='иде' i]") ||
    document.querySelector<HTMLInputElement>("input[type='search']");

  if (input) {
    input.focus();
    return true;
  }

  return false;
}

function inferAction(text: string) {
  const t = normalize(text);

  if (t.includes("создать") || t.includes("generate") || t.includes("сгенер")) return "Generation ready";
  if (t.includes("отправить") || t.includes("send")) return "Request sent";
  if (t.includes("улучшить промпт") || t.includes("enhance")) return "Prompt enhancer ready";
  if (t.includes("открыть") || t.includes("open")) return "Section opened";
  if (t.includes("сохранить") || t.includes("save")) return "Save ready";
  if (t.includes("deploy")) return "Deploy check ready";
  if (t.includes("codex")) return "Malik Codex ready";
  if (t.includes("final intelligence")) return "Final Intelligence ready";
  if (t.includes("unbreakable")) return "Unbreakable AI ready";
  if (t.includes("command center")) return "Command Center ready";
  if (t.includes("photo")) return "Photo Studio ready";
  if (t.includes("video")) return "Video Studio ready";
  if (t.includes("website")) return "Website Builder ready";
  if (t.includes("code")) return "Code Generator ready";

  return "Action ready";
}

function forEachMatch(root: ParentNode, selector: string, visit: (element: HTMLElement) => void) {
  if (root instanceof HTMLElement && root.matches(selector)) {
    visit(root);
  }
  root.querySelectorAll<HTMLElement>(selector).forEach(visit);
}

function applyCleanDesign(root: ParentNode = document.body) {
  document.documentElement.dataset.malikCleanUi = "on";

  forEachMatch(root, "h1", (h1) => {
    h1.classList.add("mclean-title");
  });

  forEachMatch(root, "button, a, [role='button']", (el) => {
    if (el.closest(".mclean-toast")) return;
    const text = getText(el);
    if (!text || text.length > 180) return;
    el.classList.add("mclean-action");
  });

  forEachMatch(root, "aside button, aside a, aside [role='button'], aside div", (el) => {
      const text = getText(el);
      if (!text || text.length > 170) return;

      const t = normalize(text);
      if (
        t.includes("панель") ||
        t.includes("final") ||
        t.includes("unbreakable") ||
        t.includes("command") ||
        t.includes("поиск") ||
        t.includes("generation") ||
        t.includes("builder") ||
        t.includes("generator") ||
        t.includes("проекты") ||
        t.includes("диалог") ||
        t.includes("дизайн") ||
        t.includes("шаблон") ||
        t.includes("профил") ||
        t.includes("подпис") ||
        t.includes("поддерж") ||
        t.includes("codex")
      ) {
        el.classList.add("mclean-side-item");
      }
  });

  forEachMatch(root, "main div, main section, main article", (el) => {
    if (el.closest(".mclean-toast")) return;
    if (el.closest("[data-malik-overlay]")) return;

    const rect = el.getBoundingClientRect();
    const text = getText(el);
    if (rect.width < 180 || rect.height < 54) return;
    if (!text || text.length > 900) return;

    const style = window.getComputedStyle(el);
    const hasBorder = parseFloat(style.borderTopWidth || "0") > 0;
    const hasRadius = parseFloat(style.borderTopLeftRadius || "0") > 10;
    const hasBg = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";

    if ((hasBorder || hasRadius || hasBg) && rect.top > 50) {
      el.classList.add("mclean-card");
    }
  });
}

function createRipple(target: HTMLElement, event: MouseEvent) {
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const ripple = document.createElement("span");
  ripple.className = "mclean-ripple";
  ripple.style.left = `${event.clientX - rect.left}px`;
  ripple.style.top = `${event.clientY - rect.top}px`;

  target.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 650);
}

function isHomeLite() {
  return Boolean(document.querySelector("#malik-root .malik-home-lite"));
}

function isStreamingActive() {
  return document.getElementById("malik-root")?.getAttribute("data-streaming") === "true";
}

function shouldSkipHeavyCleanUi() {
  return document.hidden || isHomeLite() || isStreamingActive();
}

const CLEAN_STYLE = `
html[data-malik-clean-ui="on"] body {
  --mclean-cyan: #e4bb5e;
  --mclean-violet: #d9ae45;
  --mclean-emerald: #34d399;
  --mclean-border: rgba(240, 210, 136, 0.18);
}

#malik-god-ui-root,
.sbx-panel,
.sbx-palette,
.sbx-toast,
.mgx-toast,
.mgx-palette {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.mclean-title {
  color: transparent !important;
  background: linear-gradient(90deg, #ffffff, #b9efff 38%, #f3de96 74%, #ffffff) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  letter-spacing: -0.045em !important;
  text-shadow: 0 0 34px rgba(240, 210, 136, .13) !important;
}

.mclean-card {
  position: relative !important;
  overflow: hidden !important;
  border-color: rgba(240, 210, 136, 0.16) !important;
  box-shadow: 0 14px 36px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.055) !important;
  transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, filter .18s ease !important;
}

.mclean-card:hover {
  transform: translateY(-1px) !important;
  border-color: rgba(240, 210, 136, 0.30) !important;
  box-shadow: 0 18px 42px rgba(0,0,0,.28), 0 0 20px rgba(228, 187, 94,.05) !important;
  filter: saturate(1.06) !important;
}

.mclean-card::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  background:
    radial-gradient(circle at 14% 0%, rgba(228, 187, 94,.075), transparent 32%),
    radial-gradient(circle at 100% 0%, rgba(217, 174, 69,.065), transparent 34%) !important;
  opacity: .9 !important;
}

.mclean-action {
  position: relative !important;
  overflow: hidden !important;
  cursor: pointer !important;
  transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease !important;
}

.mclean-action:hover {
  transform: translateY(-1px) !important;
  border-color: rgba(240, 210, 136, .34) !important;
  box-shadow: 0 10px 24px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.09) !important;
}

.mclean-side-item {
  position: relative !important;
  overflow: hidden !important;
  cursor: pointer !important;
  transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease !important;
}

.mclean-side-item:hover {
  transform: translateX(3px) !important;
  border-color: rgba(240, 210, 136,.26) !important;
  background:
    linear-gradient(135deg, rgba(15,23,42,.82), rgba(30,27,75,.48)),
    radial-gradient(circle at 0% 50%, rgba(228, 187, 94,.11), transparent 38%) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 12px 26px rgba(0,0,0,.20) !important;
}

.mclean-side-item::before {
  content: "" !important;
  position: absolute !important;
  inset: 18% auto 18% 0 !important;
  width: 3px !important;
  border-radius: 999px !important;
  opacity: .0 !important;
  transform: scaleY(.35) !important;
  background: linear-gradient(180deg, var(--mclean-cyan), var(--mclean-violet)) !important;
  transition: opacity .16s ease, transform .16s ease !important;
}

.mclean-side-item:hover::before {
  opacity: 1 !important;
  transform: scaleY(1) !important;
}

.mclean-ripple {
  position: absolute !important;
  z-index: 999 !important;
  width: 12px !important;
  height: 12px !important;
  border-radius: 999px !important;
  transform: translate(-50%, -50%) scale(1) !important;
  background: rgba(240, 210, 136, .35) !important;
  pointer-events: none !important;
  animation: mcleanRipple .62s ease-out forwards !important;
}

.mclean-toast {
  position: fixed !important;
  right: 18px !important;
  top: 18px !important;
  z-index: 2147483640 !important;
  min-width: 210px !important;
  max-width: min(340px, calc(100vw - 32px)) !important;
  padding: 12px 16px 12px 36px !important;
  border-radius: 18px !important;
  border: 1px solid rgba(240, 210, 136,.22) !important;
  background: linear-gradient(135deg, rgba(8,15,35,.95), rgba(25,18,55,.92)) !important;
  color: #eaf7ff !important;
  font-size: 13px !important;
  line-height: 1.35 !important;
  font-weight: 850 !important;
  letter-spacing: .01em !important;
  overflow-wrap: anywhere !important;
  box-shadow: 0 18px 48px rgba(0,0,0,.34), 0 0 28px rgba(228, 187, 94,.10) !important;
  backdrop-filter: blur(16px) !important;
  animation: mcleanToastIn .18s ease both !important;
}

.mclean-toast::before {
  content: "" !important;
  position: absolute !important;
  left: 14px !important;
  top: 50% !important;
  width: 7px !important;
  height: 7px !important;
  border-radius: 999px !important;
  transform: translateY(-50%) !important;
  background: #34d399 !important;
  box-shadow: 0 0 12px rgba(52,211,153,.95) !important;
}

.mclean-toast-hide {
  animation: mcleanToastOut .24s ease both !important;
}

@keyframes mcleanRipple {
  from { opacity: .7; transform: translate(-50%, -50%) scale(1); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(28); }
}

@keyframes mcleanToastIn {
  from { opacity: 0; transform: translateY(-8px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes mcleanToastOut {
  to { opacity: 0; transform: translateY(-7px) scale(.98); }
}

@media (prefers-reduced-motion: reduce) {
  .mclean-action,
  .mclean-card,
  .mclean-side-item {
    transition: none !important;
  }
}
`;

export default function CleanInteractionLayer() {
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "malik-clean-ui-style";
    style.textContent = CLEAN_STYLE;
    document.head.appendChild(style);

    const runCleanDesign = debounce((root?: ParentNode) => {
      if (shouldSkipHeavyCleanUi()) return;
      applyCleanDesign(root || document.body);
    }, 480);

    if (!isHomeLite()) {
      applyCleanDesign(document.body);
    }

    // Route switches stay instant — no full-body DOM scan on malik-view-open.

    const showActionToast = throttle((message: string) => {
      if (isStreamingActive()) return;
      toast(message);
    }, 900);

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const clickable = target.closest<HTMLElement>("button, a, [role='button']");
      if (!clickable) return;
      if (clickable.closest(".mclean-toast")) return;

      if (!isStreamingActive()) {
        createRipple(clickable, event);
      }

      const text = getText(clickable);
      const message = inferAction(text);

      saveAction(message + (text ? `: ${text}` : ""));
      showActionToast(message);

      const t = normalize(text);
      if (
        t.includes("создать") ||
        t.includes("generate") ||
        t.includes("сгенер") ||
        t.includes("prompt") ||
        t.includes("промпт")
      ) {
        window.setTimeout(focusMainInput, 80);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const ok = focusMainInput();
        toast(ok ? "Input focused" : "Input field not found");
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);

    return () => {
      runCleanDesign.cancel();
      showActionToast.cancel();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      style.remove();
    };
  }, []);

  return null;
}
