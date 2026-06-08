"use client";

import { useEffect, useMemo, useState } from "react";

type ModuleKey =
  | "home"
  | "final"
  | "unbreakable"
  | "command"
  | "search"
  | "ai"
  | "photo"
  | "video"
  | "website"
  | "code"
  | "projects"
  | "chats"
  | "design"
  | "templates"
  | "profile"
  | "billing"
  | "support"
  | "codex"
  | "logout";

type ModuleDef = {
  key: ModuleKey;
  label: string;
  title: string;
  subtitle: string;
  status: string;
  accent: string;
  icon: string;
  hotkey?: string;
  bullets: string[];
  cta: string;
};

const MODULES: Record<ModuleKey, ModuleDef> = {
  home: {
    key: "home",
    label: "РџР°РЅРµР»СЊ СѓРїСЂР°РІР»РµРЅРёСЏ",
    title: "Sovereign Home",
    subtitle: "Р“Р»Р°РІРЅС‹Р№ cockpit: Р±С‹СЃС‚СЂС‹Р№ РѕР±Р·РѕСЂ AI, СЃС‚Р°С‚СѓСЃР°, РѕС‡РµСЂРµРґРµР№, РїСЂРѕРµРєС‚РѕРІ Рё РіРµРЅРµСЂР°С†РёР№.",
    status: "Home online",
    accent: "cyan",
    icon: "вЊ‚",
    hotkey: "H",
    bullets: ["Live overview", "AI status", "Project launch"],
    cta: "РћС‚РєСЂС‹С‚СЊ РїР°РЅРµР»СЊ",
  },
  final: {
    key: "final",
    label: "Final Intelligence",
    title: "Final Intelligence Cockpit",
    subtitle: "РњРѕР·Рі MALIK AI: planning, reasoning, memory, routing Рё launch-control РІ РѕРґРЅРѕРј СЂР°Р·РґРµР»Рµ.",
    status: "Brain active",
    accent: "violet",
    icon: "вњЈ",
    hotkey: "F",
    bullets: ["AI orchestration", "Reasoning modes", "Memory context"],
    cta: "РћС‚РєСЂС‹С‚СЊ РёРЅС‚РµР»Р»РµРєС‚",
  },
  unbreakable: {
    key: "unbreakable",
    label: "Unbreakable AI",
    title: "Unbreakable Security Layer",
    subtitle: "Р—Р°С‰РёС‚Р°, guardrails, fallback, retry, РґРѕСЃС‚СѓРїС‹, Р»РёРјРёС‚С‹ Рё РєРѕРЅС‚СЂРѕР»СЊ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё.",
    status: "Guard live",
    accent: "emerald",
    icon: "вЊ¬",
    hotkey: "U",
    bullets: ["Guardrails", "Fraud detection", "Rate limits"],
    cta: "РћС‚РєСЂС‹С‚СЊ Р·Р°С‰РёС‚Сѓ",
  },
  command: {
    key: "command",
    label: "Command Center",
    title: "Command Center",
    subtitle: "Р¦РµРЅС‚СЂ РґРµР№СЃС‚РІРёР№: Р·Р°РїСѓСЃРє Р·Р°РґР°С‡, РјРѕРґСѓР»РµР№, Р°РІС‚РѕРјР°С‚РёР·Р°С†РёР№ Рё СѓРїСЂР°РІР»СЏРµРјС‹С… AI workflows.",
    status: "Control ready",
    accent: "amber",
    icon: "вЊ",
    hotkey: "C",
    bullets: ["Actions", "Automations", "Operator mode"],
    cta: "РћС‚РєСЂС‹С‚СЊ РєРѕРјР°РЅРґС‹",
  },
  search: {
    key: "search",
    label: "Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ РїРѕРёСЃРє",
    title: "Global Search Router",
    subtitle: "Ctrl+K РїРѕРёСЃРє РїРѕ РїСЂРѕРµРєС‚Р°Рј, РґРёР°Р»РѕРіР°Рј, С„Р°Р№Р»Р°Рј, РјРѕРґРµР»СЏРј Рё Р±СѓРґСѓС‰РёРј AI-РёРЅСЃС‚СЂСѓРјРµРЅС‚Р°Рј.",
    status: "Index ready",
    accent: "sky",
    icon: "вЊ•",
    hotkey: "Ctrl K",
    bullets: ["Projects", "Chats", "Files"],
    cta: "РћС‚РєСЂС‹С‚СЊ РїРѕРёСЃРє",
  },
  ai: {
    key: "ai",
    label: "AI Р“РµРЅРµСЂР°С‚РѕСЂ",
    title: "Unified AI Generator",
    subtitle: "Р•РґРёРЅС‹Р№ РіРµРЅРµСЂР°С‚РѕСЂ РґР»СЏ С‚РµРєСЃС‚Р°, РёРґРµР№, РїСЂРѕРјРїС‚РѕРІ, Р»РѕРіРёРєРё, СЃС‚СЂСѓРєС‚СѓСЂС‹ Рё РїР»Р°РЅРѕРІ.",
    status: "Queue ready",
    accent: "violet",
    icon: "вљЎ",
    hotkey: "A",
    bullets: ["Text generation", "Prompt engine", "Task router"],
    cta: "Р—Р°РїСѓСЃС‚РёС‚СЊ AI",
  },
  photo: {
    key: "photo",
    label: "Photo Generation",
    title: "Photo Generation Studio",
    subtitle: "Р“РµРЅРµСЂР°С†РёСЏ РёР·РѕР±СЂР°Р¶РµРЅРёР№: styles, aspect ratio, prompt enhancer, history Рё preview.",
    status: "Media slot ready",
    accent: "cyan",
    icon: "в—§",
    hotkey: "P",
    bullets: ["Image flow", "Prompt enhancer", "Gallery"],
    cta: "РЎРѕР·РґР°С‚СЊ С„РѕС‚Рѕ",
  },
  video: {
    key: "video",
    label: "Video Generation",
    title: "Video Generation Studio",
    subtitle: "Video pipeline: storyboard, cinematic prompt, duration, provider queue Рё render status.",
    status: "Render lane ready",
    accent: "rose",
    icon: "в–»",
    hotkey: "V",
    bullets: ["Storyboard", "Cinematic prompt", "Render queue"],
    cta: "РЎРѕР·РґР°С‚СЊ РІРёРґРµРѕ",
  },
  website: {
    key: "website",
    label: "Website Builder",
    title: "Website Builder",
    subtitle: "One prompt в†’ landing, sections, copy, preview, export Рё production-ready UI.",
    status: "Builder online",
    accent: "emerald",
    icon: "в—Ћ",
    hotkey: "W",
    bullets: ["Landing", "Preview", "Export"],
    cta: "РЎРѕР·РґР°С‚СЊ СЃР°Р№С‚",
  },
  code: {
    key: "code",
    label: "Code Generator",
    title: "Code Generator",
    subtitle: "Claude-style files: code output, patches, debug, architecture, canvas Рё build-safe changes.",
    status: "Code engine online",
    accent: "yellow",
    icon: "</>",
    hotkey: "K",
    bullets: ["Files", "Diffs", "Debug"],
    cta: "РћС‚РєСЂС‹С‚СЊ РєРѕРґ",
  },
  projects: {
    key: "projects",
    label: "РџСЂРѕРµРєС‚С‹",
    title: "Projects Workspace",
    subtitle: "Р’СЃРµ РїСЂРѕРґСѓРєС‚С‹, Р°СЂС‚РµС„Р°РєС‚С‹, СЃР°Р№С‚С‹, РіРµРЅРµСЂР°С†РёРё Рё СЂР°Р±РѕС‡РёРµ РІРµСЂСЃРёРё РІ РѕРґРЅРѕРј РјРµСЃС‚Рµ.",
    status: "3 active",
    accent: "sky",
    icon: "в–Ј",
    bullets: ["Artifacts", "History", "Versions"],
    cta: "РћС‚РєСЂС‹С‚СЊ РїСЂРѕРµРєС‚С‹",
  },
  chats: {
    key: "chats",
    label: "РќРµР№СЂРѕ-РґРёР°Р»РѕРіРё",
    title: "Neuro Dialogs",
    subtitle: "РСЃС‚РѕСЂРёСЏ РґРёР°Р»РѕРіРѕРІ, РєРѕРЅС‚РµРєСЃС‚, РїР°РјСЏС‚СЊ, Р±С‹СЃС‚СЂС‹Рµ РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ Рё СЂРµР¶РёРјС‹ РѕР±С‰РµРЅРёСЏ.",
    status: "12 threads",
    accent: "violet",
    icon: "в–Ў",
    bullets: ["Chat memory", "Context", "Threads"],
    cta: "РћС‚РєСЂС‹С‚СЊ РґРёР°Р»РѕРіРё",
  },
  design: {
    key: "design",
    label: "Р”РёР·Р°Р№РЅ СЃРёСЃС‚РµРјС‹",
    title: "Design System",
    subtitle: "РљРѕРјРїРѕРЅРµРЅС‚С‹, С‚РѕРєРµРЅС‹, С†РІРµС‚Р°, spacing, responsive patterns Рё РїСЂРµРјРёСѓРј UI rules.",
    status: "System ready",
    accent: "cyan",
    icon: "в–¤",
    bullets: ["Tokens", "Components", "Layouts"],
    cta: "РћС‚РєСЂС‹С‚СЊ РґРёР·Р°Р№РЅ",
  },
  templates: {
    key: "templates",
    label: "Р‘РёР±Р»РёРѕС‚РµРєР° С€Р°Р±Р»РѕРЅРѕРІ",
    title: "Template Library",
    subtitle: "РЁР°Р±Р»РѕРЅС‹ landing, dashboard, auth, media cards, pricing Рё startup pages.",
    status: "Library ready",
    accent: "emerald",
    icon: "в–¦",
    bullets: ["Landing kits", "Dashboard kits", "Auth kits"],
    cta: "РћС‚РєСЂС‹С‚СЊ С€Р°Р±Р»РѕРЅС‹",
  },
  profile: {
    key: "profile",
    label: "РќР°СЃС‚СЂРѕР№РєРё РїСЂРѕС„РёР»СЏ",
    title: "Profile Settings",
    subtitle: "РђРєРєР°СѓРЅС‚, РґРѕСЃС‚СѓРї, РёРјСЏ, email, avatar, session status Рё personalization.",
    status: "Account secure",
    accent: "violet",
    icon: "вљ™",
    bullets: ["Profile", "Security", "Access"],
    cta: "РћС‚РєСЂС‹С‚СЊ РїСЂРѕС„РёР»СЊ",
  },
  billing: {
    key: "billing",
    label: "РџРѕРґРїРёСЃРєР° Рё Р±РёР»Р»РёРЅРі",
    title: "Billing & Plan",
    subtitle: "РўР°СЂРёС„, Р»РёРјРёС‚С‹, usage, invoices, payment status Рё РґРѕСЃС‚СѓРї Рє pro-С„СѓРЅРєС†РёСЏРј.",
    status: "Plan active",
    accent: "sky",
    icon: "в–­",
    bullets: ["Plan", "Limits", "Usage"],
    cta: "РћС‚РєСЂС‹С‚СЊ Р±РёР»Р»РёРЅРі",
  },
  support: {
    key: "support",
    label: "РџРѕРґРґРµСЂР¶РєР° 24/7",
    title: "Support Center",
    subtitle: "РџРѕРјРѕС‰СЊ, СЃС‚Р°С‚СѓСЃС‹, FAQ, Р±Р°Рі-СЂРµРїРѕСЂС‚С‹ Рё СЃРІСЏР·СЊ СЃ РєРѕРјР°РЅРґРѕР№ Sovereign Hub.",
    status: "Support online",
    accent: "emerald",
    icon: "?",
    bullets: ["FAQ", "Status", "Bug reports"],
    cta: "РћС‚РєСЂС‹С‚СЊ РїРѕРґРґРµСЂР¶РєСѓ",
  },
  codex: {
    key: "codex",
    label: "Malik Codex",
    title: "Malik Codex",
    subtitle: "Agent cockpit РґР»СЏ РєРѕРґР°: С„Р°Р№Р»С‹, РїР°С‚С‡Рё, build errors, deploy checks Рё safe refactor.",
    status: "Codex ready",
    accent: "cyan",
    icon: "</>",
    bullets: ["Patch mode", "Build check", "Safe refactor"],
    cta: "РћС‚РєСЂС‹С‚СЊ Codex",
  },
  logout: {
    key: "logout",
    label: "Р—Р°РІРµСЂС€РёС‚СЊ СЃРµР°РЅСЃ",
    title: "Secure Logout",
    subtitle: "Р‘РµР·РѕРїР°СЃРЅРѕРµ Р·Р°РІРµСЂС€РµРЅРёРµ СЃРµСЃСЃРёРё. РџРµСЂРµРґ РІС‹С…РѕРґРѕРј РјРѕР¶РЅРѕ СЃРѕС…СЂР°РЅРёС‚СЊ С‚РµРєСѓС‰РёР№ workspace.",
    status: "Session active",
    accent: "rose",
    icon: "в†Є",
    bullets: ["Save state", "Clear session", "Return home"],
    cta: "Р—Р°РІРµСЂС€РёС‚СЊ",
  },
};

const MATCHERS: Array<[ModuleKey, string[]]> = [
  ["home", ["РїР°РЅРµР»СЊ СѓРїСЂР°РІР»РµРЅРёСЏ", "dashboard"]],
  ["final", ["final intelligence"]],
  ["unbreakable", ["unbreakable ai"]],
  ["command", ["command center"]],
  ["search", ["РіР»РѕР±Р°Р»СЊРЅС‹Р№ РїРѕРёСЃРє", "ctrl+k", "ctrl-k"]],
  ["ai", ["ai РіРµРЅРµСЂР°С‚РѕСЂ", "ai generator"]],
  ["photo", ["photo generation"]],
  ["video", ["video generation"]],
  ["website", ["website builder"]],
  ["code", ["code generator"]],
  ["projects", ["РїСЂРѕРµРєС‚С‹"]],
  ["chats", ["РЅРµР№СЂРѕ-РґРёР°Р»РѕРіРё", "РЅРµР№СЂРѕ РґРёР°Р»РѕРіРё"]],
  ["design", ["РґРёР·Р°Р№РЅ СЃРёСЃС‚РµРјС‹"]],
  ["templates", ["Р±РёР±Р»РёРѕС‚РµРєР° С€Р°Р±Р»РѕРЅРѕРІ"]],
  ["profile", ["РЅР°СЃС‚СЂРѕР№РєРё РїСЂРѕС„РёР»СЏ"]],
  ["billing", ["РїРѕРґРїРёСЃРєР° Рё Р±РёР»Р»РёРЅРі"]],
  ["support", ["РїРѕРґРґРµСЂР¶РєР° 24/7", "РїРѕРґРґРµСЂР¶РєР°"]],
  ["codex", ["malik codex"]],
  ["logout", ["Р·Р°РІРµСЂС€РёС‚СЊ СЃРµР°РЅСЃ"]],
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[вЂ“вЂ”]/g, "-")
    .trim();
}

function getModuleFromText(text: string): ModuleKey | null {
  const clean = normalize(text);
  for (const [key, tokens] of MATCHERS) {
    if (tokens.some((token) => clean.includes(token))) return key;
  }
  return null;
}

function getText(el: Element | null) {
  return normalize((el?.textContent || "").slice(0, 280));
}

function findActionElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;

  let node: HTMLElement | null = target;

  for (let i = 0; node && i < 8; i += 1) {
    const text = getText(node);
    const key = getModuleFromText(text);

    if (key && text.length <= 170) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

function createToast(message: string, accent = "cyan") {
  const old = document.querySelector(".sbx-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.className = `sbx-toast sbx-accent-${accent}`;
  toast.innerHTML = `
    <span class="sbx-toast-dot"></span>
    <strong>${message}</strong>
  `;

  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("sbx-toast-out");
    window.setTimeout(() => toast.remove(), 420);
  }, 2200);
}

function dispatchModule(module: ModuleDef) {
  window.localStorage.setItem("malik.activeModule", module.key);
  window.localStorage.setItem("malik.activeModuleTitle", module.title);
  window.localStorage.setItem("malik.lastActionAt", new Date().toISOString());

  document.documentElement.dataset.malikModule = module.key;
  window.dispatchEvent(
    new CustomEvent("malik:module", {
      detail: module,
    })
  );
}

function enhanceSidebarDom() {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(
      "aside a, aside button, aside [role='button'], aside div, nav a, nav button, nav [role='button']"
    )
  );

  nodes.forEach((node) => {
    const text = getText(node);
    const key = getModuleFromText(text);
    if (!key) return;
    if (text.length > 180) return;

    node.classList.add("sbx-action-item", `sbx-item-${MODULES[key].accent}`);
    node.dataset.sbxModule = key;

    if (!node.querySelector(":scope > .sbx-live-dot")) {
      const dot = document.createElement("span");
      dot.className = "sbx-live-dot";
      node.appendChild(dot);
    }

    if (!node.querySelector(":scope > .sbx-action-spark")) {
      const spark = document.createElement("span");
      spark.className = "sbx-action-spark";
      node.appendChild(spark);
    }
  });
}

function runLogoutPreview(open: (m: ModuleDef) => void) {
  const module = MODULES.logout;
  open(module);
  createToast("Secure logout panel opened", module.accent);
}

function focusSearchInput() {
  const input =
    document.querySelector<HTMLInputElement>("input[type='search']") ||
    document.querySelector<HTMLInputElement>("input[placeholder*='РїРѕРёСЃРє' i]") ||
    document.querySelector<HTMLInputElement>("input[placeholder*='search' i]") ||
    document.querySelector<HTMLInputElement>("textarea");

  if (input) {
    input.focus();
    return true;
  }

  return false;
}

export default function SidebarActionsUpgrade() {
  const [active, setActive] = useState<ModuleDef | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");

  const modules = useMemo(() => Object.values(MODULES), []);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return modules;
    return modules.filter((module) =>
      normalize(`${module.title} ${module.label} ${module.subtitle} ${module.bullets.join(" ")}`).includes(q)
    );
  }, [modules, query]);

  useEffect(() => {
    const openModule = (module: ModuleDef) => {
      setActive(module);
      setPaletteOpen(false);
      dispatchModule(module);
      createToast(`${module.title} activated`, module.accent);

      if (module.key === "search") {
        window.setTimeout(() => {
          if (!focusSearchInput()) setPaletteOpen(true);
        }, 80);
      }
    };

    const onClick = (event: MouseEvent) => {
      const item = findActionElement(event.target);
      if (!item) return;

      const key = getModuleFromText(getText(item));
      if (!key) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === "logout") {
        runLogoutPreview(openModule);
        return;
      }

      openModule(MODULES[key]);
    };

    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        createToast("Global command router opened", "sky");
        return;
      }

      if (event.key === "Escape") {
        setPaletteOpen(false);
        setActive(null);
        return;
      }

      if (event.altKey) {
        const match = modules.find((module) => module.hotkey?.toLowerCase() === key);
        if (match) {
          event.preventDefault();
          openModule(match);
        }
      }
    };

    enhanceSidebarDom();

    const observer = new MutationObserver(() => enhanceSidebarDom());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
    };
  }, [modules]);

  const confirmLogout = () => {
    const keys = [
      "malik_user",
      "malik_auth_mode",
      "sovereign_user",
      "sovereign_v7_auth",
      "malik.activeModule",
      "malik.activeModuleTitle",
    ];

    keys.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });

    createToast("Session cleared locally", "rose");
    setActive(null);
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
/* MALIK AI вЂ” SIDEBAR ACTIONS GOD UPGRADE */

.sbx-action-item {
  position: relative !important;
  overflow: hidden !important;
  cursor: pointer !important;
  border: 1px solid rgba(148, 163, 184, 0.10) !important;
  transition:
    transform .22s ease,
    border-color .22s ease,
    background .22s ease,
    box-shadow .22s ease,
    filter .22s ease !important;
}

.sbx-action-item:hover {
  transform: translateX(4px) translateY(-1px) !important;
  border-color: rgba(125, 211, 252, 0.34) !important;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(30, 27, 75, 0.58)),
    radial-gradient(circle at 0% 50%, rgba(34, 211, 238, 0.16), transparent 38%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.07),
    0 16px 36px rgba(0,0,0,.28),
    0 0 30px rgba(34, 211, 238, 0.10) !important;
  filter: saturate(1.08) !important;
}

.sbx-action-item::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 auto 0 0 !important;
  width: 3px !important;
  background: linear-gradient(180deg, #22d3ee, #8b5cf6) !important;
  opacity: 0 !important;
  transform: scaleY(.4) !important;
  transition: opacity .22s ease, transform .22s ease !important;
}

.sbx-action-item:hover::before {
  opacity: 1 !important;
  transform: scaleY(1) !important;
}

.sbx-action-spark {
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,.10) 42%, transparent 58%) !important;
  transform: translateX(-130%) !important;
  opacity: 0 !important;
}

.sbx-action-item:hover .sbx-action-spark {
  animation: sbxActionShine 1.15s ease both !important;
}

.sbx-live-dot {
  position: absolute !important;
  right: 13px !important;
  top: 50% !important;
  width: 6px !important;
  height: 6px !important;
  border-radius: 999px !important;
  background: #22d3ee !important;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.9) !important;
  opacity: 0 !important;
  transform: translateY(-50%) scale(.6) !important;
  transition: opacity .22s ease, transform .22s ease !important;
}

.sbx-action-item:hover .sbx-live-dot {
  opacity: 1 !important;
  transform: translateY(-50%) scale(1) !important;
}

.sbx-item-emerald:hover { border-color: rgba(52, 211, 153, .36) !important; box-shadow: 0 0 30px rgba(52,211,153,.10), inset 0 1px 0 rgba(255,255,255,.07) !important; }
.sbx-item-rose:hover { border-color: rgba(244, 63, 94, .34) !important; box-shadow: 0 0 30px rgba(244,63,94,.10), inset 0 1px 0 rgba(255,255,255,.07) !important; }
.sbx-item-violet:hover { border-color: rgba(168, 85, 247, .36) !important; box-shadow: 0 0 30px rgba(168,85,247,.12), inset 0 1px 0 rgba(255,255,255,.07) !important; }
.sbx-item-amber:hover { border-color: rgba(245, 158, 11, .36) !important; box-shadow: 0 0 30px rgba(245,158,11,.10), inset 0 1px 0 rgba(255,255,255,.07) !important; }
.sbx-item-yellow:hover { border-color: rgba(234, 179, 8, .36) !important; box-shadow: 0 0 30px rgba(234,179,8,.10), inset 0 1px 0 rgba(255,255,255,.07) !important; }

.sbx-panel,
.sbx-palette {
  position: fixed !important;
  z-index: 999999 !important;
  border: 1px solid rgba(148, 163, 255, 0.22) !important;
  background:
    radial-gradient(circle at 0% 0%, rgba(34, 211, 238, 0.16), transparent 34%),
    radial-gradient(circle at 100% 0%, rgba(168, 85, 247, 0.16), transparent 34%),
    linear-gradient(135deg, rgba(3, 7, 18, 0.96), rgba(8, 12, 30, 0.94)) !important;
  box-shadow:
    0 34px 120px rgba(0, 0, 0, 0.58),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 70px rgba(99, 102, 241, 0.18) !important;
  backdrop-filter: blur(22px) saturate(1.25) !important;
}

.sbx-panel {
  right: 24px !important;
  bottom: 24px !important;
  width: min(440px, calc(100vw - 32px)) !important;
  border-radius: 28px !important;
  overflow: hidden !important;
  animation: sbxPanelIn .24s ease both !important;
}

.sbx-panel-head {
  position: relative !important;
  padding: 20px 20px 16px 20px !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14) !important;
}

.sbx-panel-top {
  display: flex !important;
  align-items: center !important;
  gap: 13px !important;
}

.sbx-panel-icon {
  width: 48px !important;
  height: 48px !important;
  border-radius: 17px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: white !important;
  font-weight: 900 !important;
  background:
    linear-gradient(135deg, rgba(34,211,238,.30), rgba(139,92,246,.34)) !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 0 28px rgba(34,211,238,.15) !important;
}

.sbx-panel-title {
  margin: 0 !important;
  font-size: 20px !important;
  line-height: 1.08 !important;
  letter-spacing: -0.035em !important;
  color: #f8fbff !important;
}

.sbx-panel-subtitle {
  margin: 6px 0 0 !important;
  color: rgba(209, 223, 255, 0.68) !important;
  font-size: 13px !important;
  line-height: 1.45 !important;
}

.sbx-close {
  position: absolute !important;
  right: 14px !important;
  top: 14px !important;
  width: 30px !important;
  height: 30px !important;
  border-radius: 10px !important;
  border: 1px solid rgba(255,255,255,.12) !important;
  background: rgba(15,23,42,.72) !important;
  color: rgba(226,232,240,.84) !important;
  cursor: pointer !important;
}

.sbx-status-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  margin-top: 16px !important;
  padding: 10px 12px !important;
  border-radius: 16px !important;
  border: 1px solid rgba(52, 211, 153, .18) !important;
  background: rgba(6, 78, 59, .12) !important;
}

.sbx-status-left {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  color: #bbf7d0 !important;
  font-size: 12px !important;
  font-weight: 800 !important;
}

.sbx-status-pulse {
  width: 8px !important;
  height: 8px !important;
  border-radius: 999px !important;
  background: #34d399 !important;
  box-shadow: 0 0 16px rgba(52, 211, 153, 0.92) !important;
}

.sbx-panel-body {
  padding: 16px 20px 20px !important;
}

.sbx-bullets {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin-bottom: 14px !important;
}

.sbx-bullet {
  min-height: 58px !important;
  padding: 10px !important;
  border-radius: 15px !important;
  border: 1px solid rgba(148, 163, 184, .14) !important;
  background: rgba(15, 23, 42, .50) !important;
  color: rgba(226,232,240,.86) !important;
  font-size: 11px !important;
  line-height: 1.25 !important;
}

.sbx-progress {
  position: relative !important;
  height: 10px !important;
  border-radius: 999px !important;
  overflow: hidden !important;
  background: rgba(15,23,42,.80) !important;
  border: 1px solid rgba(148,163,184,.14) !important;
  margin: 8px 0 16px !important;
}

.sbx-progress span {
  position: absolute !important;
  inset: 0 auto 0 0 !important;
  width: 78% !important;
  border-radius: inherit !important;
  background: linear-gradient(90deg, #22d3ee, #8b5cf6, #34d399) !important;
  box-shadow: 0 0 20px rgba(34, 211, 238, .35) !important;
  animation: sbxProgressBreath 2.6s ease-in-out infinite alternate !important;
}

.sbx-actions {
  display: flex !important;
  gap: 10px !important;
}

.sbx-primary,
.sbx-secondary {
  height: 42px !important;
  border-radius: 14px !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  padding: 0 14px !important;
  cursor: pointer !important;
  font-weight: 900 !important;
}

.sbx-primary {
  flex: 1 !important;
  color: white !important;
  background: linear-gradient(135deg, rgba(79,70,229,.95), rgba(14,165,233,.88)) !important;
  box-shadow: 0 18px 34px rgba(59,130,246,.20), inset 0 1px 0 rgba(255,255,255,.18) !important;
}

.sbx-secondary {
  color: rgba(226,232,240,.86) !important;
  background: rgba(15,23,42,.64) !important;
}

.sbx-palette {
  left: 50% !important;
  top: 90px !important;
  transform: translateX(-50%) !important;
  width: min(720px, calc(100vw - 28px)) !important;
  border-radius: 26px !important;
  overflow: hidden !important;
  animation: sbxPaletteIn .20s ease both !important;
}

.sbx-palette-head {
  padding: 16px !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14) !important;
}

.sbx-palette-input {
  width: 100% !important;
  height: 48px !important;
  border-radius: 16px !important;
  border: 1px solid rgba(125, 211, 252, 0.20) !important;
  background: rgba(2, 6, 23, 0.74) !important;
  color: #f8fafc !important;
  padding: 0 16px !important;
  outline: none !important;
  font-size: 14px !important;
}

.sbx-palette-list {
  max-height: 420px !important;
  overflow: auto !important;
  padding: 10px !important;
}

.sbx-palette-item {
  width: 100% !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: #f8fafc !important;
  border-radius: 18px !important;
  padding: 13px !important;
  display: grid !important;
  grid-template-columns: 44px 1fr auto !important;
  gap: 12px !important;
  align-items: center !important;
  text-align: left !important;
  cursor: pointer !important;
}

.sbx-palette-item:hover {
  border-color: rgba(125,211,252,.22) !important;
  background: rgba(15, 23, 42, .72) !important;
}

.sbx-palette-icon {
  width: 42px !important;
  height: 42px !important;
  border-radius: 14px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: linear-gradient(135deg, rgba(34,211,238,.18), rgba(139,92,246,.18)) !important;
  border: 1px solid rgba(255,255,255,.10) !important;
}

.sbx-palette-title {
  font-weight: 900 !important;
  font-size: 14px !important;
}

.sbx-palette-sub {
  margin-top: 3px !important;
  color: rgba(203,213,225,.58) !important;
  font-size: 12px !important;
}

.sbx-hotkey {
  color: rgba(186, 230, 253, .78) !important;
  font-size: 11px !important;
  border: 1px solid rgba(125,211,252,.18) !important;
  border-radius: 10px !important;
  padding: 5px 8px !important;
}

.sbx-toast {
  position: fixed !important;
  right: 24px !important;
  top: 24px !important;
  z-index: 1000000 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  max-width: min(420px, calc(100vw - 32px)) !important;
  padding: 13px 16px !important;
  border-radius: 16px !important;
  border: 1px solid rgba(125, 211, 252, .24) !important;
  background: rgba(2,6,23,.88) !important;
  color: #f8fafc !important;
  box-shadow: 0 20px 60px rgba(0,0,0,.42), 0 0 32px rgba(34,211,238,.12) !important;
  backdrop-filter: blur(18px) !important;
  animation: sbxToastIn .22s ease both !important;
}

.sbx-toast-dot {
  width: 8px !important;
  height: 8px !important;
  border-radius: 999px !important;
  background: #22d3ee !important;
  box-shadow: 0 0 14px rgba(34,211,238,.95) !important;
}

.sbx-toast-out {
  animation: sbxToastOut .36s ease both !important;
}

.sbx-accent-emerald .sbx-toast-dot { background: #34d399 !important; box-shadow: 0 0 14px rgba(52,211,153,.95) !important; }
.sbx-accent-violet .sbx-toast-dot { background: #a855f7 !important; box-shadow: 0 0 14px rgba(168,85,247,.95) !important; }
.sbx-accent-rose .sbx-toast-dot { background: #fb7185 !important; box-shadow: 0 0 14px rgba(251,113,133,.95) !important; }
.sbx-accent-amber .sbx-toast-dot { background: #f59e0b !important; box-shadow: 0 0 14px rgba(245,158,11,.95) !important; }

@keyframes sbxActionShine {
  0% { opacity: 0; transform: translateX(-130%); }
  22% { opacity: 1; }
  100% { opacity: 0; transform: translateX(130%); }
}

@keyframes sbxPanelIn {
  from { opacity: 0; transform: translate3d(0, 14px, 0) scale(.98); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

@keyframes sbxPaletteIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(.98); }
  to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

@keyframes sbxToastIn {
  from { opacity: 0; transform: translateY(-10px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes sbxToastOut {
  to { opacity: 0; transform: translateY(-8px) scale(.98); }
}

@keyframes sbxProgressBreath {
  from { width: 64%; filter: saturate(1); }
  to { width: 92%; filter: saturate(1.25); }
}

@media (max-width: 760px) {
  .sbx-panel {
    left: 14px !important;
    right: 14px !important;
    bottom: 14px !important;
    width: auto !important;
  }

  .sbx-bullets {
    grid-template-columns: 1fr !important;
  }
}
          `,
        }}
      />

      {paletteOpen ? (
        <div className="sbx-palette" role="dialog" aria-label="Malik AI command palette">
          <div className="sbx-palette-head">
            <input
              autoFocus
              className="sbx-palette-input"
              placeholder="РС‰Рё РјРѕРґСѓР»СЊ, РґРµР№СЃС‚РІРёРµ, РіРµРЅРµСЂР°С‚РѕСЂ, РїСЂРѕРµРєС‚..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="sbx-palette-list">
            {filtered.map((module) => (
              <button
                key={module.key}
                className="sbx-palette-item"
                onClick={() => {
                  setActive(module);
                  setPaletteOpen(false);
                  dispatchModule(module);
                  createToast(`${module.title} activated`, module.accent);
                }}
              >
                <span className="sbx-palette-icon">{module.icon}</span>
                <span>
                  <span className="sbx-palette-title">{module.title}</span>
                  <span className="sbx-palette-sub">{module.subtitle}</span>
                </span>
                <span className="sbx-hotkey">{module.hotkey || "Open"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {active ? (
        <div className={`sbx-panel sbx-accent-${active.accent}`} role="dialog" aria-label={active.title}>
          <div className="sbx-panel-head">
            <button className="sbx-close" onClick={() => setActive(null)} aria-label="Close">
              Г—
            </button>
            <div className="sbx-panel-top">
              <div className="sbx-panel-icon">{active.icon}</div>
              <div>
                <h3 className="sbx-panel-title">{active.title}</h3>
                <p className="sbx-panel-subtitle">{active.subtitle}</p>
              </div>
            </div>
            <div className="sbx-status-row">
              <span className="sbx-status-left">
                <span className="sbx-status-pulse" />
                {active.status}
              </span>
              <span className="sbx-hotkey">{active.hotkey ? `Alt + ${active.hotkey}` : "Ready"}</span>
            </div>
          </div>

          <div className="sbx-panel-body">
            <div className="sbx-bullets">
              {active.bullets.map((item) => (
                <div key={item} className="sbx-bullet">
                  {item}
                </div>
              ))}
            </div>

            <div className="sbx-progress">
              <span />
            </div>

            <div className="sbx-actions">
              <button
                className="sbx-primary"
                onClick={() => {
                  if (active.key === "logout") {
                    confirmLogout();
                    return;
                  }
                  dispatchModule(active);
                  createToast(`${active.cta}: ready`, active.accent);
                }}
              >
                {active.cta}
              </button>
              <button className="sbx-secondary" onClick={() => setPaletteOpen(true)}>
                Ctrl+K
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}