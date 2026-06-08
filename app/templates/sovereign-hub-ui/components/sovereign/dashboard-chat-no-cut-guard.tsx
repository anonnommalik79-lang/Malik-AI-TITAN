"use client";

import { useEffect } from "react";

function isVisible(rect: DOMRect) {
  return rect.width > 4 && rect.height > 4;
}

function getSidebarRight() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("aside, nav, [class*='sidebar' i], [class*='side' i]")
  );

  let right = 0;

  for (const node of candidates) {
    const rect = node.getBoundingClientRect();

    if (
      isVisible(rect) &&
      rect.left <= 16 &&
      rect.width >= 120 &&
      rect.width <= Math.min(360, width * 0.35) &&
      rect.height >= height * 0.6
    ) {
      right = Math.max(right, rect.right);
    }
  }

  return Math.max(0, Math.round(right));
}

function chatComposerExists() {
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
  return textareas.some((textarea) => {
    const value = `${textarea.placeholder || ""} ${textarea.ariaLabel || ""}`.toLowerCase();
    return (
      value.includes("malik") ||
      value.includes("иде") ||
      value.includes("prompt") ||
      value.includes("опишите")
    );
  });
}

function isInsideSidebar(node: HTMLElement, sidebarRight: number) {
  const rect = node.getBoundingClientRect();
  return rect.right <= sidebarRight + 8;
}

function hardFixChatWidth() {
  if (typeof window === "undefined") return;
  if (!location.pathname.includes("/dashboard")) return;
  if (!chatComposerExists()) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const sidebarRight = getSidebarRight();

  document.body.dataset.malikChatNoCut = "1";
  document.documentElement.style.setProperty("--malik-sidebar-right", `${sidebarRight}px`);

  const nodes = Array.from(document.querySelectorAll<HTMLElement>("body *"));

  const hiddenRightPanels: HTMLElement[] = [];

  for (const node of nodes) {
    if (!node || isInsideSidebar(node, sidebarRight)) continue;

    const rect = node.getBoundingClientRect();
    if (!isVisible(rect)) continue;

    const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();

    const isHugeRightBlank =
      rect.left >= width * 0.57 &&
      rect.width >= width * 0.22 &&
      rect.height >= height * 0.62 &&
      text.length <= 60;

    const isRightBlankAfterChat =
      rect.left >= width * 0.62 &&
      rect.width >= width * 0.16 &&
      rect.height >= height * 0.42 &&
      text.length <= 24;

    if (isHugeRightBlank || isRightBlankAfterChat) {
      node.dataset.malikHiddenRightPanel = "1";
      node.style.setProperty("display", "none", "important");
      node.style.setProperty("width", "0", "important");
      node.style.setProperty("min-width", "0", "important");
      node.style.setProperty("max-width", "0", "important");
      node.style.setProperty("flex", "0 0 0", "important");
      node.style.setProperty("opacity", "0", "important");
      node.style.setProperty("pointer-events", "none", "important");
      node.style.setProperty("overflow", "hidden", "important");
      hiddenRightPanels.push(node);
    }
  }

  for (const panel of hiddenRightPanels) {
    let parent = panel.parentElement;

    for (let i = 0; parent && i < 4; i += 1) {
      const rect = parent.getBoundingClientRect();

      if (isVisible(rect) && rect.width >= width * 0.75 && rect.height >= height * 0.55) {
        parent.dataset.malikFullWidthParent = "1";
        parent.style.setProperty("grid-template-columns", "minmax(0, 1fr)", "important");
        parent.style.setProperty("display", parent.style.display === "grid" ? "grid" : parent.style.display, "important");
        parent.style.setProperty("width", "100vw", "important");
        parent.style.setProperty("max-width", "100vw", "important");
        parent.style.setProperty("min-width", "0", "important");
        parent.style.setProperty("overflow-x", "hidden", "important");
      }

      parent = parent.parentElement;
    }
  }

  const fullWidthTarget = Math.max(320, width - sidebarRight);

  for (const node of nodes) {
    if (!node || isInsideSidebar(node, sidebarRight)) continue;

    const rect = node.getBoundingClientRect();
    if (!isVisible(rect)) continue;

    const isMainChatArea =
      rect.left >= sidebarRight - 8 &&
      rect.left <= Math.max(sidebarRight + 120, width * 0.35) &&
      rect.width >= width * 0.42 &&
      rect.width <= width * 0.78 &&
      rect.height >= height * 0.45;

    const isScrollableChatColumn =
      rect.left >= sidebarRight - 8 &&
      rect.width <= width * 0.76 &&
      rect.height >= height * 0.40 &&
      node.scrollHeight > node.clientHeight + 20;

    if (isMainChatArea || isScrollableChatColumn) {
      node.dataset.malikFullChat = "1";
      node.style.setProperty("width", `calc(100vw - ${sidebarRight}px)`, "important");
      node.style.setProperty("max-width", `${fullWidthTarget}px`, "important");
      node.style.setProperty("min-width", "0", "important");
      node.style.setProperty("grid-column", "1 / -1", "important");
      node.style.setProperty("overflow-x", "hidden", "important");
      node.style.setProperty("margin-right", "0", "important");
    }
  }

  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));

  for (const textarea of textareas) {
    const rect = textarea.getBoundingClientRect();

    if (rect.left >= sidebarRight - 8 && rect.width <= width * 0.70) {
      let parent: HTMLElement | null = textarea.parentElement;

      for (let i = 0; parent && i < 5; i += 1) {
        const parentRect = parent.getBoundingClientRect();

        if (
          isVisible(parentRect) &&
          parentRect.left >= sidebarRight - 8 &&
          parentRect.width <= width * 0.78 &&
          parentRect.height <= height * 0.45
        ) {
          parent.dataset.malikComposerFull = "1";
          parent.style.setProperty("width", `calc(100vw - ${sidebarRight + 24}px)`, "important");
          parent.style.setProperty("max-width", `${Math.max(320, width - sidebarRight - 24)}px`, "important");
          parent.style.setProperty("min-width", "0", "important");
          parent.style.setProperty("margin-right", "12px", "important");
        }

        parent = parent.parentElement;
      }
    }
  }
}

export default function DashboardChatNoCutGuard() {
  useEffect(() => {
    const styleId = "malik-chat-no-cut-guard-style";

    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
      body[data-malik-chat-no-cut="1"] {
        overflow-x: hidden !important;
      }

      body[data-malik-chat-no-cut="1"] [data-malik-hidden-right-panel="1"] {
        display: none !important;
        width: 0 !important;
        min-width: 0 !important;
        max-width: 0 !important;
        flex: 0 0 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
        overflow: hidden !important;
      }

      body[data-malik-chat-no-cut="1"] [data-malik-full-width-parent="1"] {
        grid-template-columns: minmax(0, 1fr) !important;
        width: 100vw !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
      }

      body[data-malik-chat-no-cut="1"] [data-malik-full-chat="1"] {
        min-width: 0 !important;
        overflow-x: hidden !important;
      }

      body[data-malik-chat-no-cut="1"] [data-malik-composer-full="1"] {
        min-width: 0 !important;
        overflow-x: hidden !important;
      }
    `;

    const run = () => {
      window.requestAnimationFrame(() => hardFixChatWidth());
    };

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state", "data-open-view"],
    });

    const events: Array<keyof WindowEventMap> = ["resize", "click", "keydown", "keyup", "pointerup"];
    events.forEach((event) => window.addEventListener(event, run, true));

    const timers = [
      window.setTimeout(run, 80),
      window.setTimeout(run, 300),
      window.setTimeout(run, 800),
      window.setTimeout(run, 1600),
      window.setInterval(run, 1400),
    ];

    run();

    return () => {
      observer.disconnect();
      events.forEach((event) => window.removeEventListener(event, run, true));
      timers.forEach((timer) => window.clearTimeout(timer));
      document.body.removeAttribute("data-malik-chat-no-cut");
    };
  }, []);

  return null;
}
