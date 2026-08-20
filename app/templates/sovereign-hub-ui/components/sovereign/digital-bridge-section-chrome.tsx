"use client"

import type { ReactNode } from "react"

type SectionTone = "cyan" | "violet" | "emerald" | "amber" | "rose" | "blue"

type SectionConfig = {
  title: string
  eyebrow: string
  subtitle: string
  tone: SectionTone
  metrics: Array<[string, string]>
  features: Array<[string, string]>
  shots: Array<[string, string]>
  primaryAction: string
  secondaryAction: string
  primaryView: string
}

const fallbackConfig: SectionConfig = {
  title: "MALIK AI",
  eyebrow: "AI & Digital Bridge 2026",
  subtitle: "Exhibition-ready cockpit with live engines, safe fallback and investor demo flow.",
  tone: "violet",
  metrics: [["Ready", "Live"], ["Fallback", "On"], ["Demo", "Expo"]],
  features: [
    ["Live engine routing", "Works with configured API keys and switches to backup when a provider fails."],
    ["Canvas handoff", "Every artifact can move into preview without reopening the split-panel bug."],
    ["Investor mode", "Clear screens, explainable modules and visual proof for booth demos."],
  ],
  shots: [["Product screen", "Premium glass UI"], ["AI flow", "Routing + fallback"], ["Launch", "Digital Bridge ready"]],
  primaryAction: "Open generator",
  secondaryAction: "Open Codex",
  primaryView: "ai-generator",
}

const sectionConfigs: Record<string, SectionConfig> = {
  "final-intelligence": {
    title: "Final Intelligence",
    eyebrow: "AI Brain + Launch Cockpit",
    subtitle: "The main intelligence layer for routing prompts, choosing engines, creating artifacts and explaining the product story in front of investors.",
    tone: "cyan",
    metrics: [["Intent", "99%"], ["Engines", "Multi"], ["Launch", "Ready"]],
    features: [
      ["Intent router", "Understands chat, code, website, media and project creation requests."],
      ["Provider brain", "Chooses the strongest configured model lane without exposing raw provider names."],
      ["Demo script", "Built for a founder walkthrough: ask, generate, preview, explain, close."],
    ],
    shots: [["AI map", "Reasoning lanes"], ["Prompt brain", "Task classifier"], ["Launch deck", "Investor story"]],
    primaryAction: "Create product",
    secondaryAction: "Open Codex",
    primaryView: "website-generation",
  },
  "unbreakable-ai": {
    title: "Unbreakable AI",
    eyebrow: "Fallback + Safety Guard",
    subtitle: "A resilient operating layer for retries, backup responses, rate limits, provider health and safe demo behavior under pressure.",
    tone: "emerald",
    metrics: [["Guard", "Live"], ["Fallback", "Auto"], ["Risk", "Low"]],
    features: [
      ["Retry shield", "Provider failures are contained so the interface keeps moving."],
      ["Public privacy", "Debug/provider details stay hidden unless admin debug is enabled."],
      ["Demo continuity", "If live APIs are busy, the booth still has a polished fallback path."],
    ],
    shots: [["Health grid", "Runtime signals"], ["Shield map", "Safety layer"], ["Recovery", "Backup path"]],
    primaryAction: "Open status",
    secondaryAction: "Open Codex",
    primaryView: "features",
  },
  "command-center": {
    title: "Command Center",
    eyebrow: "Founder Control Room",
    subtitle: "A mission board for agents, tasks, launch actions, automation cards and demo handoffs across the whole MALIK AI OS.",
    tone: "amber",
    metrics: [["Agents", "18"], ["Missions", "24"], ["Flow", "On"]],
    features: [
      ["Mission control", "Click through agents, project actions, canvas and deploy-oriented flows."],
      ["Live telemetry", "Shows task flow, queues, execution health and product readiness."],
      ["Booth command", "A clean screen for explaining what the system does without digging into code."],
    ],
    shots: [["Agent map", "Mission graph"], ["Telemetry", "Live feed"], ["Deploy", "Action strip"]],
    primaryAction: "Open mission",
    secondaryAction: "Open Codex",
    primaryView: "dashboard-generation",
  },
  search: {
    title: "Global Search",
    eyebrow: "Command + Knowledge Router",
    subtitle: "One search surface for projects, chats, tools, files, templates and launch actions.",
    tone: "blue",
    metrics: [["Index", "Full"], ["Latency", "Fast"], ["Routes", "All"]],
    features: [
      ["Command palette", "Routes directly into generators, templates, projects and Codex."],
      ["Knowledge mode", "Surfaces demo artifacts, chat history and system modules."],
      ["Founder speed", "Use it as a fast tour launcher during investor conversations."],
    ],
    shots: [["Search rail", "Ctrl+K"], ["Results", "Project memory"], ["Actions", "Direct route"]],
    primaryAction: "Open projects",
    secondaryAction: "Open Codex",
    primaryView: "projects",
  },
  "ai-generator": {
    title: "AI Generator",
    eyebrow: "Unified Creator Engine",
    subtitle: "Text, code, image, video and presentation generation in one working flow with API-ready routing and fallback mode.",
    tone: "violet",
    metrics: [["Modes", "6"], ["Queue", "Fast"], ["API", "Ready"]],
    features: [
      ["Multi-format creation", "One prompt can become text, code, photo, video or pitch content."],
      ["API activation", "Configured keys turn demo mode into live model calls."],
      ["Canvas export", "Generated artifacts can be sent into preview for a clean walkthrough."],
    ],
    shots: [["Creator tabs", "6 modes"], ["Prompt lab", "Enhance + generate"], ["History", "Saved outputs"]],
    primaryAction: "Create image",
    secondaryAction: "Open Codex",
    primaryView: "photo-generation",
  },
  "photo-generation": {
    title: "Photo Generation",
    eyebrow: "MALIK Vision Studio",
    subtitle: "Premium visual generation with style controls, ratio controls, seeded gallery and live image providers when keys are configured.",
    tone: "cyan",
    metrics: [["Vision", "XL"], ["Styles", "34"], ["Gallery", "Live"]],
    features: [
      ["New image wall", "Seeded visual gallery plus real provider output when API keys exist."],
      ["Prompt controls", "Style, lighting, ratio, seed and guidance panels are ready for demos."],
      ["Canvas handoff", "Generated photo previews can become artifact pages instantly."],
    ],
    shots: [["Gallery", "Generated shots"], ["Style lab", "Photo controls"], ["Vision", "Image engine"]],
    primaryAction: "Generate video",
    secondaryAction: "Open Codex",
    primaryView: "video-generation",
  },
  "video-generation": {
    title: "Video Generation",
    eyebrow: "MALIK Cinema Pipeline",
    subtitle: "Storyboard, motion prompt, async render queue and server-side polling for real providers after keys are configured.",
    tone: "rose",
    metrics: [["Render", "Queue"], ["Ratio", "16:9"], ["Poll", "Live"]],
    features: [
      ["Async video jobs", "Runway, Luma, FAL and Veo can return queued jobs and local status polling."],
      ["Scene builder", "Storyboard panels make the demo useful even before final video returns."],
      ["White-label status", "Public UI sees MALIK Cinema, not raw provider internals."],
    ],
    shots: [["Storyboard", "Scene beats"], ["Motion", "Render queue"], ["Cinema", "Video output"]],
    primaryAction: "Build website",
    secondaryAction: "Open Codex",
    primaryView: "website-generation",
  },
  "website-generation": {
    title: "Website Builder",
    eyebrow: "Full Product Website Flow",
    subtitle: "Landing pages, SaaS websites, dashboards and product pages generated from one prompt and pushed to Canvas.",
    tone: "emerald",
    metrics: [["Sections", "12+"], ["Preview", "Canvas"], ["Export", "HTML"]],
    features: [
      ["Full-page artifacts", "Generates standalone HTML/project-style outputs from the live router."],
      ["Investor proof", "Perfect for showing a website created in seconds from a prompt."],
      ["Safe fallback", "If providers are not configured, it still returns a polished demo artifact."],
    ],
    shots: [["Hero", "SaaS page"], ["Pricing", "Conversion"], ["Preview", "Canvas"]],
    primaryAction: "Generate code",
    secondaryAction: "Open Codex",
    primaryView: "code-generation",
  },
  "code-generation": {
    title: "Code Generator",
    eyebrow: "MALIK Codex Files",
    subtitle: "Code artifacts, TSX components, dashboards, documents and app modules with canvas transfer.",
    tone: "amber",
    metrics: [["Languages", "300+"], ["Tokens", "Max"], ["Canvas", "Ready"]],
    features: [
      ["Code output", "OpenAI/Kimi/Claude/Gemini/Grok routes are ready when configured."],
      ["Safe artifacts", "Generated code moves to Canvas only when a real artifact exists."],
      ["Demo terminal", "The code section reads like a founder-grade builder cockpit."],
    ],
    shots: [["Editor", "TSX"], ["Files", "Project tree"], ["Terminal", "Build flow"]],
    primaryAction: "Open projects",
    secondaryAction: "Open Codex",
    primaryView: "projects",
  },
  projects: {
    title: "Projects",
    eyebrow: "Workspace Memory",
    subtitle: "Chat history, generated artifacts, statuses and project cards for a Cursor-like founder workspace.",
    tone: "blue",
    metrics: [["Projects", "Live"], ["History", "Saved"], ["Status", "Tracked"]],
    features: [
      ["Project cards", "Every generated idea can become a project-style record."],
      ["Searchable memory", "Find old chats, artifacts and build states quickly."],
      ["Demo continuity", "Use this section to show that MALIK AI is more than a one-shot chatbot."],
    ],
    shots: [["Project grid", "History"], ["Artifacts", "Saved code"], ["Status", "Draft/ready"]],
    primaryAction: "Open search",
    secondaryAction: "Open Codex",
    primaryView: "search",
  },
  chats: {
    title: "Neuro Dialogues",
    eyebrow: "Conversation Memory",
    subtitle: "Clean chat history and generated project continuity for booth walkthroughs.",
    tone: "violet",
    metrics: [["Dialogs", "Live"], ["Memory", "On"], ["Flow", "Chat"]],
    features: [
      ["Fast switching", "Jump between chats without losing generated project context."],
      ["Chat-first demo", "Show normal prompts without accidentally opening the right canvas."],
      ["Clear story", "Every chat can lead into a generator, project or canvas artifact."],
    ],
    shots: [["Timeline", "Messages"], ["Memory", "History"], ["Prompt", "Assistant"]],
    primaryAction: "New product",
    secondaryAction: "Open Codex",
    primaryView: "home",
  },
  design: {
    title: "Design System",
    eyebrow: "Sovereign Visual Identity",
    subtitle: "Color tokens, component cards, motion language and premium dark AI SaaS styling.",
    tone: "cyan",
    metrics: [["Tokens", "8"], ["Motion", "Smooth"], ["Theme", "Dark"]],
    features: [
      ["Brand system", "A consistent visual language across all product modules."],
      ["Demo polish", "Glass surfaces, animated grids and premium section framing."],
      ["Fast iteration", "Good enough for booth screens without rebuilding every component."],
    ],
    shots: [["Tokens", "Color"], ["Cards", "Components"], ["Motion", "Animation"]],
    primaryAction: "Open templates",
    secondaryAction: "Open Codex",
    primaryView: "templates",
  },
  templates: {
    title: "Templates",
    eyebrow: "Launch Library",
    subtitle: "Reusable prompts, SaaS templates, dashboards, landing pages and project starters.",
    tone: "emerald",
    metrics: [["Templates", "100+"], ["Categories", "Full"], ["Launch", "Fast"]],
    features: [
      ["Starter library", "Use templates to start investor demos from strong examples."],
      ["Canvas ready", "Templates can move into preview as artifacts."],
      ["Product range", "SaaS, projects, dashboards, media and developer modules."],
    ],
    shots: [["Cards", "Template grid"], ["SaaS", "Landing"], ["Dashboard", "Preview"]],
    primaryAction: "Build landing",
    secondaryAction: "Open Codex",
    primaryView: "landing-generation",
  },
  billing: {
    title: "Billing",
    eyebrow: "Plans + Investor Commerce",
    subtitle: "Plan cards, limits and payment readiness for a product that can be sold, not only shown.",
    tone: "amber",
    metrics: [["Plans", "Ready"], ["Limits", "On"], ["Checkout", "Set"]],
    features: [
      ["Plan story", "Shows business model and access levels clearly."],
      ["Usage limits", "Generation limits are tied into the product flow."],
      ["Admin approval", "Billing routes are prepared for controlled demo operations."],
    ],
    shots: [["Plans", "Pricing"], ["Usage", "Limits"], ["Checkout", "Payment"]],
    primaryAction: "Open generator",
    secondaryAction: "Open Codex",
    primaryView: "ai-generator",
  },
  settings: {
    title: "Settings",
    eyebrow: "Sovereign Profile",
    subtitle: "Account, access and profile controls for a complete product presentation.",
    tone: "violet",
    metrics: [["Profile", "Ready"], ["Auth", "Safe"], ["Access", "Role"]],
    features: [
      ["Profile controls", "Show that this is a real app shell with user/session behavior."],
      ["OAuth readiness", "Supabase flags stay separate from frontend secrets."],
      ["Admin debug", "Provider debug remains gated behind admin settings."],
    ],
    shots: [["Account", "Profile"], ["Access", "Roles"], ["Security", "Session"]],
    primaryAction: "Open billing",
    secondaryAction: "Open Codex",
    primaryView: "billing",
  },
  support: {
    title: "Support",
    eyebrow: "Operations Desk",
    subtitle: "Status, help, limits and support messaging for a complete SaaS demo.",
    tone: "emerald",
    metrics: [["Status", "Online"], ["Help", "24/7"], ["Ops", "Ready"]],
    features: [
      ["Status surface", "A clear place to explain provider fallback and runtime status."],
      ["Demo confidence", "Investors see product operations, not just a frontend."],
      ["Escalation path", "Support, limits and admin flow fit the commercial product story."],
    ],
    shots: [["Status", "Runtime"], ["Help", "Support"], ["Ops", "Signals"]],
    primaryAction: "Open status",
    secondaryAction: "Open Codex",
    primaryView: "features",
  },
  features: {
    title: "Feature Center",
    eyebrow: "Product Capability Map",
    subtitle: "All connected modules, launch powers and working routes in one capability center.",
    tone: "blue",
    metrics: [["Modules", "Live"], ["Routes", "On"], ["Demo", "Full"]],
    features: [
      ["Capability map", "Shows the breadth of the product clearly during a booth pitch."],
      ["Working routes", "Cards route into real sections instead of dead screens."],
      ["API story", "Provider readiness can be explained without exposing raw secrets."],
    ],
    shots: [["Modules", "Cards"], ["Routes", "Actions"], ["Readiness", "Signals"]],
    primaryAction: "Open command",
    secondaryAction: "Open Codex",
    primaryView: "command-center",
  },
}

function configFor(view: string) {
  if (sectionConfigs[view]) return sectionConfigs[view]
  if (view.includes("landing")) return sectionConfigs["website-generation"]
  if (view.includes("dashboard")) return sectionConfigs["website-generation"]
  if (view.includes("document") || view.includes("presentation") || view.includes("template")) return sectionConfigs.templates
  if (view.includes("component")) return sectionConfigs["code-generation"]
  if (view === "profile") return sectionConfigs.settings
  return fallbackConfig
}

type DigitalBridgeSectionChromeProps = {
  activeView: string
  children: ReactNode
  onViewChange?: (view: string) => void
  onOpenCodex?: () => void
}

export function DigitalBridgeSectionChrome({
  activeView,
  children,
  onViewChange,
  onOpenCodex,
}: DigitalBridgeSectionChromeProps) {
  const config = configFor(activeView)

  return (
    <div className={`digital-bridge-section-chrome digital-bridge-section-chrome--${config.tone}`} data-view={activeView}>
      <div className="db-chrome-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <section className="db-chrome-hero">
        <div className="db-chrome-copy">
          <div className="db-chrome-kicker">
            <span>AI & Digital Bridge 2026</span>
            <i>{config.eyebrow}</i>
          </div>
          <h1>{config.title}</h1>
          <p>{config.subtitle}</p>
          <div className="db-chrome-actions">
            <button type="button" onClick={() => onViewChange?.(config.primaryView)}>{config.primaryAction}</button>
            <button type="button" onClick={() => onOpenCodex?.()}>{config.secondaryAction}</button>
          </div>
        </div>

        <div className="db-chrome-visual" aria-label={`${config.title} demo visuals`}>
          <div className="db-chrome-orbit" />
          {config.shots.map(([title, note], index) => (
            <article key={`${title}-${note}`} className={`db-chrome-shot db-chrome-shot-${index + 1}`}>
              <div className="db-shot-image">
                <span />
                <span />
                <span />
              </div>
              <strong>{title}</strong>
              <em>{note}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="db-chrome-metrics" aria-label={`${config.title} demo metrics`}>
        {config.metrics.map(([label, value]) => (
          <article key={`${label}-${value}`}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="db-chrome-features" aria-label={`${config.title} demo features`}>
        {config.features.map(([title, text], index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{title}</strong>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <div className="db-chrome-content">
        {children}
      </div>

      <style jsx global>{`
        .digital-bridge-section-chrome {
          position: relative;
          isolation: isolate;
          min-height: 100%;
          width: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(16px, 2vw, 28px);
          background:
            radial-gradient(ellipse 48% 30% at 50% 0%, rgba(228, 187, 94, .18), transparent 70%),
            radial-gradient(ellipse 38% 42% at 6% 42%, rgba(228, 187, 94, .19), transparent 72%),
            radial-gradient(ellipse 38% 42% at 96% 40%, rgba(217, 174, 69, .16), transparent 72%),
            linear-gradient(180deg, rgba(2, 6, 23, .98), rgba(2, 3, 10, .99));
        }

        .digital-bridge-section-chrome--emerald { --db-accent: #6ee7b7; --db-accent-2: #e4bb5e; }
        .digital-bridge-section-chrome--cyan { --db-accent: #f0d288; --db-accent-2: #e4bb5e; }
        .digital-bridge-section-chrome--violet { --db-accent: #e8c56a; --db-accent-2: #f3de96; }
        .digital-bridge-section-chrome--amber { --db-accent: #fbbf24; --db-accent-2: #fb7185; }
        .digital-bridge-section-chrome--rose { --db-accent: #fb7185; --db-accent-2: #f3de96; }
        .digital-bridge-section-chrome--blue { --db-accent: #e4bb5e; --db-accent-2: #f0d288; }

        .db-chrome-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          opacity: .86;
        }

        .db-chrome-bg::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 12% 18%, rgba(255,255,255,.72) 0 1px, transparent 2px),
            radial-gradient(circle at 84% 24%, rgba(255,255,255,.48) 0 1px, transparent 2px),
            radial-gradient(circle at 50% 84%, rgba(255,255,255,.32) 0 1px, transparent 2px),
            linear-gradient(rgba(148, 163, 184, .05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, .045) 1px, transparent 1px);
          background-size: 420px 280px, 520px 340px, 360px 240px, 52px 52px, 52px 52px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,.72), rgba(0,0,0,.28) 68%, transparent 100%);
        }

        .db-chrome-bg span {
          position: absolute;
          width: 60vw;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, var(--db-accent), var(--db-accent-2), transparent);
          box-shadow: 0 0 30px color-mix(in srgb, var(--db-accent) 48%, transparent);
          opacity: .48;
          animation: dbChromeBeam 9s ease-in-out infinite;
        }

        .db-chrome-bg span:nth-child(1) { left: -18vw; top: 22%; transform: rotate(-9deg); }
        .db-chrome-bg span:nth-child(2) { right: -22vw; top: 36%; transform: rotate(8deg); animation-delay: -3s; }
        .db-chrome-bg span:nth-child(3) { left: 18vw; bottom: 12%; transform: rotate(2deg); animation-delay: -6s; }

        .db-chrome-hero,
        .db-chrome-metrics,
        .db-chrome-features,
        .db-chrome-content {
          position: relative;
          z-index: 2;
          margin-inline: auto;
          width: min(100%, 1640px);
        }

        .db-chrome-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr);
          gap: clamp(18px, 2.5vw, 34px);
          align-items: stretch;
          min-height: 340px;
          border: 1px solid rgba(148, 163, 184, .18);
          border-radius: 34px;
          padding: clamp(22px, 3vw, 42px);
          background:
            linear-gradient(135deg, rgba(15, 23, 42, .82), rgba(2, 6, 23, .58)),
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--db-accent) 20%, transparent), transparent 34%),
            radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--db-accent-2) 18%, transparent), transparent 34%);
          box-shadow: 0 26px 110px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06);
          overflow: hidden;
          backdrop-filter: blur(20px);
        }

        .db-chrome-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,.08) 48%, transparent 72%);
          transform: translateX(-140%);
          animation: dbChromeShine 8s ease-in-out infinite;
          pointer-events: none;
        }

        .db-chrome-copy {
          position: relative;
          z-index: 2;
          display: flex;
          min-height: 100%;
          flex-direction: column;
          justify-content: center;
        }

        .db-chrome-kicker {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          margin-bottom: 18px;
        }

        .db-chrome-kicker span,
        .db-chrome-kicker i {
          border: 1px solid rgba(148, 163, 184, .18);
          border-radius: 999px;
          background: rgba(15, 23, 42, .64);
          color: rgba(226, 232, 240, .9);
          padding: 8px 11px;
          font-size: 10px;
          font-style: normal;
          font-weight: 900;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .db-chrome-kicker i {
          color: var(--db-accent);
        }

        .db-chrome-copy h1 {
          margin: 0;
          max-width: 900px;
          background: linear-gradient(92deg, #fff 0%, #e0f2fe 34%, var(--db-accent) 62%, var(--db-accent-2) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-size: clamp(42px, 5.2vw, 86px);
          font-weight: 1000;
          letter-spacing: -.06em;
          line-height: .9;
        }

        .db-chrome-copy p {
          margin: 18px 0 0;
          max-width: 760px;
          color: rgba(203, 213, 225, .82);
          font-size: clamp(15px, 1.2vw, 18px);
          line-height: 1.75;
        }

        .db-chrome-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 26px;
        }

        .db-chrome-actions button {
          border: 1px solid rgba(148, 163, 184, .2);
          border-radius: 18px;
          background: rgba(15, 23, 42, .7);
          color: white;
          padding: 13px 18px;
          font-weight: 950;
          transition: transform .18s ease, border-color .18s ease, background .18s ease;
        }

        .db-chrome-actions button:first-child {
          border-color: color-mix(in srgb, var(--db-accent) 42%, transparent);
          background: linear-gradient(135deg, color-mix(in srgb, var(--db-accent) 24%, #0f172a), color-mix(in srgb, var(--db-accent-2) 18%, #111827));
          box-shadow: 0 18px 60px color-mix(in srgb, var(--db-accent) 18%, transparent);
        }

        .db-chrome-actions button:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--db-accent) 46%, transparent);
        }

        .db-chrome-visual {
          position: relative;
          min-height: 310px;
          border-radius: 28px;
          border: 1px solid rgba(148, 163, 184, .16);
          background:
            radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--db-accent) 20%, transparent), transparent 44%),
            radial-gradient(circle at 74% 70%, color-mix(in srgb, var(--db-accent-2) 18%, transparent), transparent 48%),
            rgba(2, 6, 23, .52);
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
        }

        .db-chrome-orbit {
          position: absolute;
          inset: 10%;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--db-accent) 26%, transparent);
          box-shadow: 0 0 80px color-mix(in srgb, var(--db-accent) 20%, transparent), inset 0 0 70px color-mix(in srgb, var(--db-accent-2) 13%, transparent);
          animation: dbChromeOrbit 16s linear infinite;
        }

        .db-chrome-orbit::before,
        .db-chrome-orbit::after {
          content: "";
          position: absolute;
          inset: 18%;
          border-radius: inherit;
          border: 1px dashed color-mix(in srgb, var(--db-accent-2) 24%, transparent);
        }

        .db-chrome-orbit::after {
          inset: 34%;
          border-style: solid;
          opacity: .7;
        }

        .db-chrome-shot {
          position: absolute;
          width: 46%;
          min-width: 180px;
          border: 1px solid rgba(148, 163, 184, .18);
          border-radius: 24px;
          background: rgba(15, 23, 42, .68);
          padding: 12px;
          box-shadow: 0 22px 70px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.06);
          backdrop-filter: blur(18px);
        }

        .db-chrome-shot-1 { left: 7%; top: 12%; transform: rotate(-4deg); }
        .db-chrome-shot-2 { right: 7%; top: 26%; transform: rotate(4deg); }
        .db-chrome-shot-3 { left: 26%; bottom: 9%; transform: rotate(-1deg); }

        .db-shot-image {
          position: relative;
          height: 108px;
          overflow: hidden;
          border-radius: 18px;
          background:
            radial-gradient(circle at 24% 26%, color-mix(in srgb, var(--db-accent) 58%, transparent), transparent 34%),
            radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--db-accent-2) 46%, transparent), transparent 38%),
            linear-gradient(140deg, #020617, #111827 48%, #020617);
        }

        .db-shot-image span {
          position: absolute;
          display: block;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent);
          opacity: .7;
        }

        .db-shot-image span:nth-child(1) { left: 12%; right: 18%; top: 32%; transform: rotate(-8deg); }
        .db-shot-image span:nth-child(2) { left: 18%; right: 10%; top: 52%; transform: rotate(5deg); opacity: .48; }
        .db-shot-image span:nth-child(3) { left: 30%; right: 28%; top: 70%; transform: rotate(-2deg); opacity: .34; }

        .db-chrome-shot strong,
        .db-chrome-shot em {
          display: block;
          margin-top: 10px;
        }

        .db-chrome-shot strong {
          color: white;
          font-size: 14px;
          font-weight: 950;
        }

        .db-chrome-shot em {
          color: rgba(203, 213, 225, .66);
          font-size: 11px;
          font-style: normal;
          font-weight: 800;
        }

        .db-chrome-metrics,
        .db-chrome-features {
          display: grid;
          gap: 14px;
          margin-top: 16px;
        }

        .db-chrome-metrics {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .db-chrome-metrics article,
        .db-chrome-features article {
          border: 1px solid rgba(148, 163, 184, .16);
          border-radius: 24px;
          background:
            linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
            radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--db-accent) 13%, transparent), transparent 42%);
          box-shadow: 0 18px 60px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05);
        }

        .db-chrome-metrics article {
          padding: 18px;
        }

        .db-chrome-metrics span,
        .db-chrome-features span {
          display: block;
          color: rgba(148, 163, 184, .86);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .db-chrome-metrics strong {
          display: block;
          margin-top: 7px;
          color: white;
          font-size: clamp(24px, 3vw, 42px);
          font-weight: 1000;
          letter-spacing: -.04em;
        }

        .db-chrome-features {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .db-chrome-features article {
          padding: 20px;
        }

        .db-chrome-features strong {
          display: block;
          margin-top: 12px;
          color: white;
          font-size: 17px;
          font-weight: 950;
        }

        .db-chrome-features p {
          margin: 9px 0 0;
          color: rgba(203, 213, 225, .72);
          font-size: 13px;
          line-height: 1.65;
        }

        .db-chrome-content {
          margin-top: 18px;
        }

        .db-chrome-content > .studio-shell,
        .db-chrome-content > .final-intelligence-home,
        .db-chrome-content > .unbreakable-home,
        .db-chrome-content > .command-center-home,
        .db-chrome-content > .digital-bridge-section {
          min-height: 760px;
          border: 1px solid rgba(148, 163, 184, .14);
          border-radius: 32px;
          box-shadow: 0 28px 110px rgba(0,0,0,.42);
        }

        .db-chrome-content > .studio-shell,
        .db-chrome-content > .final-intelligence-home,
        .db-chrome-content > .unbreakable-home,
        .db-chrome-content > .command-center-home {
          overflow: hidden;
        }

        @keyframes dbChromeBeam {
          from { opacity: .26; filter: saturate(1); }
          50% { opacity: .78; filter: saturate(1.5); }
          to { opacity: .34; filter: saturate(1.15); }
        }

        @keyframes dbChromeShine {
          0%, 46% { transform: translateX(-140%); }
          74%, 100% { transform: translateX(140%); }
        }

        @keyframes dbChromeOrbit {
          from { transform: rotate(0deg) scale(.98); }
          to { transform: rotate(360deg) scale(1.02); }
        }

        @media (max-width: 1100px) {
          .db-chrome-hero {
            grid-template-columns: 1fr;
          }

          .db-chrome-visual {
            min-height: 280px;
          }

          .db-chrome-features,
          .db-chrome-metrics {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .digital-bridge-section-chrome {
            padding: 12px;
          }

          .db-chrome-hero {
            border-radius: 24px;
            padding: 18px;
          }

          .db-chrome-copy h1 {
            font-size: 40px;
          }

          .db-chrome-visual {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .db-chrome-bg span,
          .db-chrome-hero::after,
          .db-chrome-orbit {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default DigitalBridgeSectionChrome
