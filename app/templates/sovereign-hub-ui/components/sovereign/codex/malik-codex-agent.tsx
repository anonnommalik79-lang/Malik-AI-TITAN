"use client"

import { Check, Clipboard, Loader2, Play, Send, ShieldAlert, Square, Terminal, Trash2, Wand2 } from "lucide-react"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"

export type CodexMode = "audit" | "fix-bugs" | "generate-feature" | "refactor" | "create-ui" | "connect-backend" | "render-deploy" | "full-boss"

export const codexModes: { id: CodexMode; label: string; hint: string }[] = [
  { id: "audit", label: "Audit Project", hint: "Project health" },
  { id: "fix-bugs", label: "Fix Bugs", hint: "Repair errors" },
  { id: "generate-feature", label: "Generate Feature", hint: "New product feature" },
  { id: "refactor", label: "Refactor Files", hint: "Clean safely" },
  { id: "create-ui", label: "Create UI", hint: "Vercel-style screens" },
  { id: "connect-backend", label: "Connect Backend", hint: "API contracts" },
  { id: "render-deploy", label: "Render Deploy Fix", hint: "Build + deploy" },
  { id: "full-boss", label: "Full Boss Mode", hint: "Confirm first" },
]

interface MalikCodexAgentProps {
  selectedFiles: string[]
  provider: string
  onPlan: (plan: any) => void
  onResult: (result: string) => void
  onLogs: (logs: string[]) => void
  onRunning: (running: boolean) => void
  onOpenSettings: () => void
  onSendToCanvas: (code: string) => void
}

export function MalikCodexAgent({ selectedFiles, provider, onPlan, onResult, onLogs, onRunning, onOpenSettings, onSendToCanvas }: MalikCodexAgentProps) {
  const [mode, setMode] = useState<CodexMode>("audit")
  const [prompt, setPrompt] = useState("Audit this Malik AI project and connect the next product feature safely.")
  const [result, setResult] = useState("")
  const [loading, setLoading] = useState(false)
  const [requiresConfirmation, setRequiresConfirmation] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const activeMode = useMemo(() => codexModes.find((item) => item.id === mode) || codexModes[0], [mode])
  const buildBossPrompt = () => [
    "MALIK CODEX 1.0 BOSS PROMPT",
    `Mode: ${activeMode.label}`,
    `Engine: ${provider}`,
    `Files: ${selectedFiles.join(", ") || "auto scan"}`,
    `Task: ${prompt}`,
    "Safety: no hardcoded API keys, no git push, no destructive writes without confirmation, keep backend contracts stable.",
    "Output: plan, patch summary, test commands, deploy checklist.",
  ].join("\n")

  const start = async (confirmed = false) => {
    setLoading(true)
    onRunning(true)
    onLogs([`$ malik-codex run --mode=${mode} --engine=${provider}`, "$ runtime credentials: server-side only", "$ safety: destructive writes require confirmation"])
    try {
      const response = await fetch("/api/codex/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, prompt, files: selectedFiles, engine: provider, confirmed }),
      })
      const data = await response.json()
      if (data.requiresConfirmation) {
        setRequiresConfirmation(true)
        setResult(data.warning)
        onResult(data.warning)
        onPlan({ steps: ["Confirm Full Boss Mode before running"], issues: [data.warning] })
        return
      }
      const text = data.prompt || data.message || "Safe local plan generated."
      setRequiresConfirmation(false)
      setResult(text)
      onResult(text)
      onPlan(data.plan || {})
      onLogs(["$ backend /api/codex/run ok", `$ mode: ${data.mode || mode}`, "$ MALIK runtime ready"])
    } catch (error) {
      const fallback = buildBossPrompt()
      setResult(fallback)
      onResult(fallback)
      onPlan({
        steps: ["Backend unavailable", "Use local boss prompt", "Review selected files", "Run build before applying"],
        issues: [String(error)],
      })
      onLogs(["$ backend unavailable", "$ local fallback boss prompt generated", "$ configure runtime credentials on the server to enable live execution"])
    } finally {
      setLoading(false)
      onRunning(false)
    }
  }

  const stop = () => {
    setLoading(false)
    onRunning(false)
    onLogs(["$ malik-codex stop", "$ generation stopped by user"])
  }

  const clear = () => {
    setResult("")
    onResult("")
    onPlan({})
    onLogs(["$ cleared codex session"])
  }

  const copy = async (kind: "prompt" | "result") => {
    await navigator.clipboard.writeText(kind === "prompt" ? buildBossPrompt() : result)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1400)
  }

  const sendCanvas = () => {
    const content = result || buildBossPrompt()
    onSendToCanvas(`<!doctype html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-[#02040a] text-white"><main class="min-h-screen p-8"><h1 class="text-6xl font-black bg-gradient-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-transparent">Malik Codex Result</h1><pre class="mt-8 whitespace-pre-wrap rounded-3xl border border-white/10 bg-black/70 p-6 text-sm leading-6">${content.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char))}</pre></main></body></html>`)
  }

  return (
    <div className="codex-agent-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-cyan-300/12 bg-[#050814]/88 shadow-[0_28px_90px_rgba(0,0,0,.45)]">
      <div className="codex-mode-row flex shrink-0 flex-wrap gap-2 border-b border-white/10 p-3">
        {codexModes.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            className={`rounded-xl border px-4 py-2 text-xs font-black transition ${mode === item.id ? "border-cyan-300/45 bg-cyan-300/12 text-white shadow-[0_0_28px_rgba(34,211,238,.18)]" : "border-white/8 bg-white/[0.045] text-zinc-400 hover:border-white/15 hover:text-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="codex-hero mb-4 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_50%_78%,rgba(139,92,246,.34),transparent_26%),radial-gradient(circle_at_48%_58%,rgba(34,211,238,.16),transparent_28%),linear-gradient(180deg,rgba(7,13,30,.94),rgba(3,5,12,.92))] p-7 text-center">
          <div className="mx-auto mb-5 h-24 max-w-[560px] rounded-full border border-cyan-300/20 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,.24),transparent_22%),repeating-radial-gradient(ellipse_at_center,rgba(139,92,246,.28)_0_1px,transparent_1px_18px)] shadow-[0_0_70px_rgba(139,92,246,.22)]" />
          <h1 className="bg-gradient-to-r from-cyan-300 via-sky-200 to-violet-400 bg-clip-text text-4xl font-black tracking-tight text-transparent md:text-5xl">Malik Codex 1.0</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300">Audit, plan, generate and connect product features with safe project context.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100/80">
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1">Local / API Ready</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Engine: {provider}</span>
            <button type="button" onClick={onOpenSettings} className="rounded-full border border-violet-300/25 bg-violet-400/10 px-3 py-1 text-violet-100">Runtime readiness</button>
          </div>
        </section>

        {requiresConfirmation && (
          <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            <div className="mb-2 flex items-center gap-2 font-black"><ShieldAlert className="h-4 w-4" /> Full Boss Mode warning</div>
            This task can be expensive. Confirm before running engine execution.
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="h-28 w-full resize-none rounded-2xl border border-cyan-300/16 bg-black/55 p-4 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-300/45"
          placeholder="Describe exactly what Malik Codex should build, fix or connect..."
        />

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <CodexButton primary onClick={() => start(false)} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Start Task</CodexButton>
          <CodexButton danger onClick={stop}><Square className="h-4 w-4" />Stop</CodexButton>
          <CodexButton onClick={clear}><Trash2 className="h-4 w-4" />Clear</CodexButton>
          <CodexButton onClick={() => copy("prompt")}>{copied === "prompt" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}Copy Prompt</CodexButton>
          <CodexButton onClick={() => copy("result")}>{copied === "result" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}Copy Result</CodexButton>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {requiresConfirmation && <CodexButton primary onClick={() => start(true)}><Send className="h-4 w-4" />Confirm Full Boss</CodexButton>}
          <CodexButton violet onClick={() => { const boss = buildBossPrompt(); setResult(boss); onResult(boss) }}><Wand2 className="h-4 w-4" />Generate Boss Prompt</CodexButton>
          <CodexButton cyan onClick={sendCanvas}><Terminal className="h-4 w-4" />Send to Canvas</CodexButton>
          <CodexButton onClick={onOpenSettings}>Open Settings</CodexButton>
        </div>

        <div className="mt-4 rounded-[1.15rem] border border-white/10 bg-black/60 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-black text-white">Agent result will appear here.</p>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black text-cyan-100">{activeMode.hint}</span>
          </div>
          <pre className="min-h-[112px] whitespace-pre-wrap text-xs leading-6 text-slate-300">{result || "Safe local mode is active. Configure runtime credentials on the server to enable live execution."}</pre>
        </div>
      </div>
    </div>
  )
}

function CodexButton({ children, onClick, primary, danger, violet, cyan, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; violet?: boolean; cyan?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black transition disabled:opacity-50 ${
        primary
          ? "border-cyan-300/35 bg-cyan-300/14 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,.12)]"
          : danger
            ? "border-red-400/25 bg-red-500/10 text-red-100"
            : violet
              ? "border-violet-300/25 bg-violet-500/10 text-violet-100"
              : cyan
                ? "border-cyan-300/25 bg-cyan-500/10 text-cyan-100"
                : "border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  )
}

export default MalikCodexAgent

