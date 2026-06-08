"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

/**
 * FinalIntelligenceLab
 * ====================
 * A from-scratch redesign of the "Final Intelligence" screen.
 *
 * Goal: a clean, premium, *working* cognitive console instead of a static
 * marketing layout. The operator types an intent, the request is routed to
 * the real `/api/ai/chat` endpoint, a live pipeline visualises the routing
 * stages, and the result can be pushed straight to the Canvas or opened in
 * Codex.
 *
 * It keeps the same prop contract the dashboard already provides so it drops
 * straight into the existing wiring.
 */

export type FinalIntelligenceLabProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type Intent = {
  id: string
  label: string
  hint: string
  prompt: string
  badge: string
}

type PipelineStage = {
  id: string
  title: string
  note: string
}

type CognitiveModule = {
  id: string
  title: string
  body: string
}

const INTENTS: Intent[] = [
  {
    id: "chat",
    label: "Ask / Reason",
    hint: "Conversational reasoning",
    badge: "CHAT",
    prompt: "Explain, like a founder pitching investors, why Malik AI is a category-defining product.",
  },
  {
    id: "website",
    label: "Build a site",
    hint: "Full landing page",
    badge: "WEB",
    prompt: "Design a launch-ready landing page for an AI product called Malik AI. Hero, features, pricing, CTA.",
  },
  {
    id: "code",
    label: "Write code",
    hint: "Production snippet",
    badge: "CODE",
    prompt: "Write a clean React component for an animated pricing card with hover glow.",
  },
  {
    id: "image",
    label: "Imagine",
    hint: "Visual concept brief",
    badge: "MEDIA",
    prompt: "Describe a cinematic key visual for a sovereign AI brand: deep space, neon core, premium.",
  },
  {
    id: "plan",
    label: "Plan launch",
    hint: "Go-to-market",
    badge: "PLAN",
    prompt: "Draft a 7-day launch plan for an AI SaaS, day by day, with channels and goals.",
  },
]

const PIPELINE: PipelineStage[] = [
  { id: "ask", title: "Ask", note: "Operator intent captured" },
  { id: "route", title: "Route", note: "Best engine selected" },
  { id: "reason", title: "Reason", note: "Model orchestration" },
  { id: "create", title: "Create", note: "Artifact produced" },
]

const MODULES: CognitiveModule[] = [
  { id: "router", title: "Intent router", body: "Classifies chat, site, code, image and plan requests, then picks a lane." },
  { id: "orchestra", title: "Model orchestra", body: "Calls the configured providers behind one identity — keys never leak to the UI." },
  { id: "memory", title: "Context memory", body: "Carries operator, engine and the last artifact so follow-ups stay coherent." },
  { id: "cockpit", title: "Launch cockpit", body: "Turns any result into a booth-ready story you can present live." },
]

type Template = {
  id: string
  title: string
  desc: string
  category: string
  gradient: string
  image: string
  prompt: string
  intent: string
}

/**
 * Curated starter templates (v0-style gallery). Each card carries a real
 * preview photo (Unsplash CDN) layered over a premium gradient — if the photo
 * ever fails to load, the gradient + label still reads as a designed thumbnail,
 * so the wall never looks broken or cheap.
 */
const TEMPLATES: Template[] = [
  {
    id: "saas",
    title: "SaaS Analytics Dashboard",
    desc: "Charts, KPIs, dark admin UI",
    category: "Dashboard",
    gradient: "linear-gradient(135deg,#0ea5e9,#6366f1)",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=640&q=70",
    intent: "website",
    prompt: "Build a premium SaaS analytics dashboard: sidebar, KPI cards, charts, dark glassmorphism UI.",
  },
  {
    id: "ai-chat",
    title: "AI Chat Product",
    desc: "Conversational app landing",
    category: "AI",
    gradient: "linear-gradient(135deg,#22d3ee,#a855f7)",
    image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=640&q=70",
    intent: "website",
    prompt: "Design a landing page for an AI chat assistant product with hero, demo, features and pricing.",
  },
  {
    id: "ecommerce",
    title: "E-commerce Storefront",
    desc: "Product grid + cart",
    category: "Shop",
    gradient: "linear-gradient(135deg,#f59e0b,#ef4444)",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=640&q=70",
    intent: "website",
    prompt: "Build a modern e-commerce storefront: hero banner, product grid, filters and a cart drawer.",
  },
  {
    id: "portfolio",
    title: "Developer Portfolio",
    desc: "Projects, about, contact",
    category: "Portfolio",
    gradient: "linear-gradient(135deg,#8b5cf6,#ec4899)",
    image: "https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?auto=format&fit=crop&w=640&q=70",
    intent: "code",
    prompt: "Create a sleek developer portfolio site: animated hero, project cards, skills and contact form.",
  },
  {
    id: "crypto",
    title: "Crypto / Finance App",
    desc: "Wallet, prices, charts",
    category: "Fintech",
    gradient: "linear-gradient(135deg,#10b981,#0ea5e9)",
    image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=640&q=70",
    intent: "website",
    prompt: "Design a crypto finance dashboard: portfolio balance, live price cards, candlestick charts.",
  },
  {
    id: "video",
    title: "Video Studio",
    desc: "Cinematic media creator",
    category: "Media",
    gradient: "linear-gradient(135deg,#6366f1,#ec4899)",
    image: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=640&q=70",
    intent: "image",
    prompt: "Describe a cinematic video studio landing: dark theme, reels grid, timeline editor preview.",
  },
  {
    id: "mobile",
    title: "Mobile App Landing",
    desc: "App store style page",
    category: "Mobile",
    gradient: "linear-gradient(135deg,#0ea5e9,#22d3ee)",
    image: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=640&q=70",
    intent: "website",
    prompt: "Build a mobile app landing page: phone mockups, feature highlights, app store buttons.",
  },
  {
    id: "docs",
    title: "Docs & Blog",
    desc: "Knowledge base layout",
    category: "Content",
    gradient: "linear-gradient(135deg,#64748b,#0ea5e9)",
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=640&q=70",
    intent: "website",
    prompt: "Create a documentation and blog site: sidebar nav, search, article layout, code blocks.",
  },
]

/** Pull a human-readable string out of whatever shape the API returns. */
function textFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const p = payload as Record<string, unknown>
  const candidates = [p.text, p.message, p.reply, p.answer, p.output, p.content, p.result, p.completion]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim()
  }
  // OpenAI-style nesting: choices[0].message.content
  const choices = p.choices as Array<Record<string, unknown>> | undefined
  if (Array.isArray(choices) && choices[0]) {
    const msg = choices[0].message as Record<string, unknown> | undefined
    if (msg && typeof msg.content === "string") return msg.content.trim()
    if (typeof choices[0].text === "string") return (choices[0].text as string).trim()
  }
  return ""
}

function fallbackOutput(prompt: string, operator: string): string {
  return [
    `Final Intelligence • backup reasoning (offline-safe)`,
    ``,
    `Operator: ${operator}`,
    `Intent: ${prompt}`,
    ``,
    `1. Route — request classified and sent to the best available lane.`,
    `2. Reason — model orchestration drafted a structured answer.`,
    `3. Create — a presentable artifact is ready for Canvas.`,
    ``,
    `Live keys are not reachable right now, so this is a deterministic preview.`,
    `Add a provider key and press Run again for a real response.`,
  ].join("\n")
}

/** Wrap text output in a minimal, presentable HTML artifact for the Canvas. */
function artifactFromOutput(prompt: string, output: string): string {
  const safe = (output || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safePrompt = prompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Final Intelligence Artifact</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: radial-gradient(120% 90% at 50% -10%, #0b1430, #04050d 70%); color: #e8eeff; min-height: 100vh; padding: 48px 20px; }
  .wrap { max-width: 820px; margin: 0 auto; }
  .tag { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #7dd3fc; border: 1px solid rgba(125,211,252,.3); border-radius: 999px; padding: 6px 14px; }
  h1 { font-size: 34px; margin: 18px 0 6px; background: linear-gradient(100deg,#38bdf8,#818cf8 50%,#c084fc); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .prompt { color: #9fb0d0; margin: 0 0 26px; font-size: 15px; }
  pre { white-space: pre-wrap; word-break: break-word; background: rgba(10,16,34,.7); border: 1px solid rgba(125,211,252,.18); border-radius: 18px; padding: 22px; font-size: 14px; line-height: 1.7; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
</style></head>
<body><div class="wrap">
  <span class="tag">Final Intelligence • Artifact</span>
  <h1>Reasoning result</h1>
  <p class="prompt">Intent: ${safePrompt}</p>
  <pre>${safe}</pre>
</div></body></html>`
}

const cssVar = (vars: Record<string, string | number>) => vars as CSSProperties

export function FinalIntelligenceLab({
  username,
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: FinalIntelligenceLabProps) {
  const operator = username && username.trim() ? username.trim() : "guest@malik.ai"

  const [activeIntent, setActiveIntent] = useState<Intent>(INTENTS[0])
  const [prompt, setPrompt] = useState(INTENTS[0].prompt)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Idle — ready for a live route")
  const [output, setOutput] = useState("")
  const [stage, setStage] = useState(-1)
  const [runs, setRuns] = useState(0)

  const seqRef = useRef(0)
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const consoleRef = useRef<HTMLElement | null>(null)

  const applyTemplate = (tpl: Template) => {
    const intent = INTENTS.find((i) => i.id === tpl.intent) || INTENTS[0]
    setActiveIntent(intent)
    setPrompt(tpl.prompt)
    setOutput("")
    setStage(-1)
    setStatus(`Loaded template · ${tpl.title}`)
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        ;(consoleRef.current as HTMLElement | null)?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
    }
  }

  useEffect(() => {
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current)
    }
  }, [])

  const charge = useMemo(() => Math.min(100, Math.max(4, Math.round(prompt.trim().length / 4))), [prompt])

  const pickIntent = (intent: Intent) => {
    setActiveIntent(intent)
    setPrompt(intent.prompt)
    setStatus(`Loaded "${intent.label}" intent`)
  }

  const startPipeline = () => {
    setStage(0)
    if (stageTimer.current) clearInterval(stageTimer.current)
    stageTimer.current = setInterval(() => {
      setStage((prev) => {
        if (prev >= PIPELINE.length - 1) return prev
        return prev + 1
      })
    }, 520)
  }

  const stopPipeline = (final: boolean) => {
    if (stageTimer.current) {
      clearInterval(stageTimer.current)
      stageTimer.current = null
    }
    setStage(final ? PIPELINE.length - 1 : -1)
  }

  const runLive = async () => {
    const text = prompt.trim()
    if (!text || loading) return
    const seq = seqRef.current + 1
    seqRef.current = seq
    const current = () => seqRef.current === seq

    setLoading(true)
    setOutput("")
    setStatus("Routing intent to live engine…")
    startPipeline()

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 95_000)
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          message: text,
          kind: activeIntent.id === "chat" ? "chat" : activeIntent.id,
          userEmail: operator,
          style: "Final Intelligence cockpit",
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          (payload && (payload.publicError || payload.message)) || `Route returned ${res.status}`
        throw new Error(msg)
      }
      const next = textFromPayload(payload)
      if (!current()) return
      setOutput(next || fallbackOutput(text, operator))
      setStatus(payload?.fallback || payload?.fallbackUsed ? "Safe fallback output ready" : "Live route completed")
      stopPipeline(true)
    } catch {
      if (!current()) return
      setOutput(fallbackOutput(text, operator))
      setStatus("Backup mode active — add a provider key for live output")
      stopPipeline(true)
    } finally {
      if (current()) {
        setLoading(false)
        setRuns((r) => r + 1)
      }
    }
  }

  const sendCanvas = () => {
    const body = output || fallbackOutput(prompt.trim() || activeIntent.prompt, operator)
    onOpenCanvas?.(artifactFromOutput(prompt.trim() || activeIntent.prompt, body))
    setStatus("Artifact sent to Canvas")
  }

  const startNew = () => {
    onNewChat?.()
    setOutput("")
    setStage(-1)
    setStatus("Fresh session — pick an intent")
  }

  return (
    <main className="fil" data-view="final-intelligence">
      <div className="fil__bg" aria-hidden="true" />

      {/* Header */}
      <header className="fil__head">
        <div className="fil__brand">
          <span className="fil__mark">FI</span>
          <div>
            <p className="fil__eyebrow">Malik AI · cognitive cockpit</p>
            <h1 className="fil__title">Final Intelligence</h1>
          </div>
        </div>
        <div className="fil__head-meta">
          <span className={`fil__status ${loading ? "is-live" : ""}`}>
            <i />
            {status}
          </span>
          <span className="fil__operator">{operator}</span>
        </div>
      </header>

      {/* Intent chips */}
      <nav className="fil__intents" aria-label="Intent lanes">
        {INTENTS.map((intent) => (
          <button
            key={intent.id}
            type="button"
            data-active={activeIntent.id === intent.id ? "1" : "0"}
            onClick={() => pickIntent(intent)}
          >
            <strong>{intent.label}</strong>
            <em>{intent.hint}</em>
            <span className="fil__chip-badge">{intent.badge}</span>
          </button>
        ))}
      </nav>

      <div className="fil__grid">
        {/* Console */}
        <section className="fil__console" ref={consoleRef}>
          <div className="fil__console-top">
            <span className="fil__panel-label">Reasoning console</span>
            <span className="fil__runs">{runs} run{runs === 1 ? "" : "s"}</span>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                runLive()
              }
            }}
            spellCheck={false}
            placeholder="Describe what Final Intelligence should think through…"
            className="fil__textarea"
          />

          <div className="fil__charge" aria-hidden="true">
            <i style={cssVar({ "--w": `${charge}%` })} />
          </div>

          <div className="fil__actions">
            <button type="button" className="fil__run" onClick={runLive} disabled={loading || !prompt.trim()}>
              {loading ? "Routing…" : "Run live route"}
              <kbd>⌘⏎</kbd>
            </button>
            <button type="button" className="fil__ghost" onClick={sendCanvas}>
              Send to Canvas
            </button>
            <button type="button" className="fil__ghost" onClick={onOpenCodex}>
              Open Codex
            </button>
            <button type="button" className="fil__ghost" onClick={startNew}>
              New session
            </button>
            <button
              type="button"
              className="fil__ghost fil__ghost--next"
              onClick={() => onViewChange("website-generation")}
            >
              Next: Website →
            </button>
          </div>

          <div className="fil__output" data-empty={output ? "0" : "1"}>
            {output ? (
              <pre>{output}</pre>
            ) : (
              <div className="fil__output-empty">
                <span className="fil__output-dot" />
                Output appears here. Pick an intent, edit the prompt, and run a live route.
              </div>
            )}
          </div>
        </section>

        {/* Side rail */}
        <aside className="fil__rail">
          <div className="fil__pipeline">
            <span className="fil__panel-label">Live pipeline</span>
            <ol>
              {PIPELINE.map((step, i) => (
                <li key={step.id} data-state={stage < 0 ? "idle" : i < stage ? "done" : i === stage ? "active" : "idle"}>
                  <span className="fil__pipe-dot">{i + 1}</span>
                  <span className="fil__pipe-copy">
                    <strong>{step.title}</strong>
                    <em>{step.note}</em>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="fil__stats">
            {[
              ["Intent lanes", String(INTENTS.length)],
              ["Engine", "Auto-router"],
              ["Operator", operator.split("@")[0]],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Cognitive modules */}
      <section className="fil__modules" aria-label="Cognitive modules">
        <span className="fil__panel-label">Cognitive modules</span>
        <div className="fil__module-grid">
          {MODULES.map((mod, i) => (
            <article key={mod.id}>
              <span className="fil__module-no">{String(i + 1).padStart(2, "0")}</span>
              <strong>{mod.title}</strong>
              <p>{mod.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Templates gallery (v0-style) */}
      <section className="fil__templates" aria-label="Starter templates">
        <div className="fil__templates-head">
          <div>
            <span className="fil__panel-label">Start from a template</span>
            <p className="fil__templates-sub">Pick a starting point — it loads straight into the console, ready to run.</p>
          </div>
          <button type="button" className="fil__ghost" onClick={() => onViewChange("website-generation")}>
            Browse all →
          </button>
        </div>

        <div className="fil__tpl-grid">
          {TEMPLATES.map((tpl) => (
            <button key={tpl.id} type="button" className="fil__tpl" onClick={() => applyTemplate(tpl)}>
              <span className="fil__tpl-thumb" style={{ background: tpl.gradient }}>
                <img
                  src={tpl.image}
                  alt={tpl.title}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
                <span className="fil__tpl-cat">{tpl.category}</span>
                <span className="fil__tpl-use">Use template</span>
              </span>
              <span className="fil__tpl-meta">
                <strong>{tpl.title}</strong>
                <em>{tpl.desc}</em>
              </span>
            </button>
          ))}
        </div>
      </section>

      <style jsx>{`
        .fil {
          position: relative;
          width: 100%;
          min-height: 100%;
          padding: 28px clamp(16px, 3vw, 40px) 56px;
          color: #e8eeff;
          font-feature-settings: "ss01";
        }
        .fil__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(60% 40% at 12% 0%, rgba(56, 189, 248, 0.12), transparent 60%),
            radial-gradient(60% 46% at 92% 8%, rgba(168, 85, 247, 0.12), transparent 62%);
        }
        .fil > * {
          position: relative;
          z-index: 1;
        }

        /* Header */
        .fil__head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        .fil__brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .fil__mark {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          border-radius: 16px;
          font-weight: 900;
          font-size: 18px;
          letter-spacing: 0.04em;
          color: #03060f;
          background: linear-gradient(135deg, #67e8f9, #818cf8 55%, #c084fc);
          box-shadow: 0 0 32px rgba(125, 211, 252, 0.4);
        }
        .fil__eyebrow {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.26em;
          text-transform: uppercase;
          color: #7dd3fc;
        }
        .fil__title {
          margin: 2px 0 0;
          font-size: clamp(26px, 3.4vw, 40px);
          font-weight: 900;
          line-height: 1.04;
          background: linear-gradient(100deg, #e6f1ff, #93c5fd 45%, #c4b5fd);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .fil__head-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        .fil__status {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-size: 12.5px;
          font-weight: 700;
          color: #c9d6f5;
          border: 1px solid rgba(125, 211, 252, 0.2);
          background: rgba(8, 15, 33, 0.6);
          border-radius: 999px;
          padding: 8px 14px;
        }
        .fil__status i {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #64748b;
          box-shadow: 0 0 0 0 rgba(125, 211, 252, 0.5);
        }
        .fil__status.is-live i {
          background: #34d399;
          animation: filPulse 1.1s ease-in-out infinite;
        }
        .fil__operator {
          font-size: 12px;
          color: #8aa0c6;
        }

        /* Intent chips */
        .fil__intents {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }
        .fil__intents button {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          text-align: left;
          padding: 13px 14px;
          border-radius: 15px;
          border: 1px solid rgba(125, 211, 252, 0.14);
          background: rgba(8, 14, 30, 0.55);
          color: #cbd6f0;
          cursor: pointer;
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        }
        .fil__intents button:hover {
          transform: translateY(-2px);
          border-color: rgba(167, 139, 250, 0.4);
          background: rgba(15, 23, 42, 0.72);
        }
        .fil__intents button[data-active="1"] {
          border-color: rgba(103, 232, 249, 0.55);
          background: linear-gradient(120deg, rgba(34, 211, 238, 0.16), rgba(124, 58, 237, 0.14));
          box-shadow: 0 14px 40px rgba(8, 47, 73, 0.5);
        }
        .fil__intents strong {
          font-size: 14px;
          font-weight: 800;
          color: #fff;
        }
        .fil__intents em {
          font-style: normal;
          font-size: 11.5px;
          color: #8294b8;
        }
        .fil__chip-badge {
          position: absolute;
          top: 11px;
          right: 12px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
          color: #7dd3fc;
          opacity: 0.7;
        }

        /* Grid */
        .fil__grid {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 960px) {
          .fil__grid {
            grid-template-columns: 1fr;
          }
        }

        .fil__panel-label {
          display: block;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #6f86ad;
          margin-bottom: 12px;
        }

        /* Console */
        .fil__console {
          border-radius: 22px;
          border: 1px solid rgba(125, 211, 252, 0.16);
          background:
            radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.08), transparent 42%),
            rgba(5, 10, 24, 0.72);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 80px rgba(0, 0, 0, 0.4);
          padding: 18px;
          backdrop-filter: blur(14px);
        }
        .fil__console-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .fil__runs {
          font-size: 11px;
          color: #6f86ad;
        }
        .fil__textarea {
          width: 100%;
          min-height: 116px;
          resize: vertical;
          background: rgba(2, 6, 18, 0.6);
          border: 1px solid rgba(125, 211, 252, 0.14);
          border-radius: 16px;
          padding: 14px 16px;
          color: #eaf1ff;
          font-size: 15px;
          line-height: 1.6;
          outline: none;
          font-family: inherit;
          transition: border-color 0.16s ease;
        }
        .fil__textarea:focus {
          border-color: rgba(103, 232, 249, 0.5);
        }
        .fil__charge {
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          overflow: hidden;
          margin: 12px 0 14px;
        }
        .fil__charge i {
          display: block;
          height: 100%;
          width: var(--w);
          border-radius: 999px;
          background: linear-gradient(90deg, #22d3ee, #8b5cf6 60%, #f472b6);
          transition: width 0.4s ease;
        }
        .fil__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }
        .fil__run {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border: 1px solid rgba(216, 180, 254, 0.4);
          background: radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.22), transparent 32%),
            linear-gradient(135deg, #7c3aed, #2563eb 55%, #06b6d4);
          color: #fff;
          font-weight: 800;
          font-size: 13.5px;
          padding: 11px 18px;
          border-radius: 13px;
          cursor: pointer;
          box-shadow: 0 0 26px rgba(124, 58, 237, 0.4);
          transition: transform 0.16s ease, opacity 0.16s ease;
        }
        .fil__run:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        .fil__run:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .fil__run kbd {
          font-size: 10px;
          font-family: inherit;
          opacity: 0.8;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 6px;
          padding: 1px 5px;
        }
        .fil__ghost {
          border: 1px solid rgba(125, 211, 252, 0.16);
          background: rgba(8, 15, 33, 0.6);
          color: #cdd9f2;
          font-weight: 700;
          font-size: 13px;
          padding: 11px 15px;
          border-radius: 13px;
          cursor: pointer;
          transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
        }
        .fil__ghost:hover {
          border-color: rgba(167, 139, 250, 0.42);
          color: #fff;
          background: rgba(15, 23, 42, 0.75);
        }
        .fil__ghost--next {
          margin-left: auto;
        }
        .fil__output {
          margin-top: 16px;
          border-radius: 16px;
          border: 1px solid rgba(125, 211, 252, 0.12);
          background: rgba(2, 6, 18, 0.55);
          min-height: 150px;
          max-height: 360px;
          overflow: auto;
        }
        .fil__output pre {
          margin: 0;
          padding: 16px 18px;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 13.5px;
          line-height: 1.7;
          color: #d7e3ff;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .fil__output-empty {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 24px 18px;
          color: #6f86ad;
          font-size: 13px;
        }
        .fil__output-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #38bdf8;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.7);
        }

        /* Rail */
        .fil__rail {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .fil__pipeline,
        .fil__stats {
          border-radius: 20px;
          border: 1px solid rgba(125, 211, 252, 0.14);
          background: rgba(6, 11, 26, 0.66);
          padding: 18px;
          backdrop-filter: blur(12px);
        }
        .fil__pipeline ol {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .fil__pipeline li {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 13px;
          border: 1px solid transparent;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .fil__pipeline li[data-state="active"] {
          border-color: rgba(103, 232, 249, 0.45);
          background: rgba(34, 211, 238, 0.1);
        }
        .fil__pipeline li[data-state="done"] {
          border-color: rgba(52, 211, 153, 0.28);
          background: rgba(16, 185, 129, 0.08);
        }
        .fil__pipe-dot {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          color: #cdd9f2;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .fil__pipeline li[data-state="active"] .fil__pipe-dot {
          color: #03060f;
          background: #67e8f9;
        }
        .fil__pipeline li[data-state="done"] .fil__pipe-dot {
          color: #03060f;
          background: #34d399;
        }
        .fil__pipe-copy {
          display: flex;
          flex-direction: column;
        }
        .fil__pipe-copy strong {
          font-size: 13.5px;
          color: #fff;
        }
        .fil__pipe-copy em {
          font-style: normal;
          font-size: 11.5px;
          color: #8294b8;
        }
        .fil__stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .fil__stats div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .fil__stats span {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #6f86ad;
        }
        .fil__stats strong {
          font-size: 15px;
          color: #fff;
        }

        /* Modules */
        .fil__modules {
          margin-top: 20px;
        }
        .fil__module-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .fil__module-grid article {
          position: relative;
          border-radius: 18px;
          border: 1px solid rgba(125, 211, 252, 0.13);
          background: rgba(6, 11, 26, 0.62);
          padding: 18px;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .fil__module-grid article:hover {
          transform: translateY(-3px);
          border-color: rgba(167, 139, 250, 0.36);
        }
        .fil__module-no {
          font-size: 12px;
          font-weight: 900;
          color: #7dd3fc;
          opacity: 0.7;
        }
        .fil__module-grid strong {
          display: block;
          margin: 8px 0 6px;
          font-size: 15px;
          color: #fff;
        }
        .fil__module-grid p {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.6;
          color: #8aa0c6;
        }

        /* Templates gallery */
        .fil__templates {
          margin-top: 26px;
        }
        .fil__templates-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
        }
        .fil__templates-sub {
          margin: 2px 0 0;
          font-size: 12.5px;
          color: #8aa0c6;
        }
        .fil__tpl-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 14px;
        }
        .fil__tpl {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 0;
          text-align: left;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(125, 211, 252, 0.14);
          background: rgba(6, 11, 26, 0.62);
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .fil__tpl:hover {
          transform: translateY(-4px);
          border-color: rgba(167, 139, 250, 0.45);
          box-shadow: 0 26px 70px rgba(0, 0, 0, 0.5);
        }
        .fil__tpl-thumb {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 16 / 10;
          overflow: hidden;
        }
        .fil__tpl-thumb img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.92;
          transition: transform 0.4s ease, opacity 0.2s ease;
        }
        .fil__tpl:hover .fil__tpl-thumb img {
          transform: scale(1.06);
          opacity: 1;
        }
        .fil__tpl-cat {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 2;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #eaf2ff;
          background: rgba(3, 7, 18, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          padding: 4px 10px;
          backdrop-filter: blur(6px);
        }
        .fil__tpl-use {
          position: absolute;
          bottom: 10px;
          left: 10px;
          z-index: 2;
          font-size: 11.5px;
          font-weight: 800;
          color: #03060f;
          background: #67e8f9;
          border-radius: 999px;
          padding: 6px 12px;
          opacity: 0;
          transform: translateY(6px);
          transition: opacity 0.18s ease, transform 0.18s ease;
          box-shadow: 0 8px 24px rgba(34, 211, 238, 0.4);
        }
        .fil__tpl:hover .fil__tpl-use {
          opacity: 1;
          transform: translateY(0);
        }
        .fil__tpl-thumb::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(180deg, rgba(2, 6, 18, 0) 38%, rgba(2, 6, 18, 0.55) 100%);
        }
        .fil__tpl-meta {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 13px 14px 15px;
        }
        .fil__tpl-meta strong {
          font-size: 14px;
          color: #fff;
        }
        .fil__tpl-meta em {
          font-style: normal;
          font-size: 12px;
          color: #8aa0c6;
        }

        @keyframes filPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(52, 211, 153, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .fil__status.is-live i {
            animation: none;
          }
        }
      `}</style>
    </main>
  )
}

export default FinalIntelligenceLab
