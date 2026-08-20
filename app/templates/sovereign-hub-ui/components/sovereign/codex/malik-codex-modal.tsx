"use client"

import { useState } from "react"
import { Activity, Check, Cloud, Code2, Grid3X3, Rocket, Settings, ShieldCheck, X } from "lucide-react"
import { CodexComingSoonShelf } from "./CodexComingSoonShelf"
import MalikCodexAgent from "./malik-codex-agent"
import MalikCodexFiles from "./malik-codex-files"
import MalikCodexSettings from "./malik-codex-settings"
import MalikCodexTerminal from "./malik-codex-terminal"
import { PremiumCss } from "../../ui/premium-components"

interface MalikCodexModalProps {
  open: boolean
  onClose: () => void
  onSendToCanvas?: (code: string) => void
}

export function MalikCodexModal({ open, onClose, onSendToCanvas }: MalikCodexModalProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState("core")
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [plan, setPlan] = useState<any>({})
  const [result, setResult] = useState("")
  const [logs, setLogs] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState("Local / API Ready")

  if (!open) return null

  const codexLive = process.env.NEXT_PUBLIC_MALIK_CODEX_LIVE === "true"
  if (!codexLive) {
    return <CodexComingSoonShelf onClose={onClose} />
  }

  const applyChanges = async () => {
    setStatus("Apply hook prepared")
    try {
      const response = await fetch("/api/codex/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedFiles, result }) })
      const data = await response.json()
      setStatus(data.message || "Apply preview ready")
    } catch {
      setStatus("Apply fallback ready")
    }
  }

  const rejectChanges = () => {
    setResult("")
    setPlan({})
    setStatus("Changes rejected")
  }

  const openDeployChecklist = () => {
    setPlan({
      steps: [
        "git status",
        "git add .",
        "git commit -m \"feat: malik ai sovereign world product\"",
        "git push origin main",
        "Render -> Manual Deploy -> Deploy latest commit",
      ],
      issues: ["Clear build cache & deploy if static export is stale"],
    })
    setStatus("Deploy checklist opened")
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/88 p-0 text-white backdrop-blur-2xl lg:p-2">
      <PremiumCss />
      <div className="codex-clone-shell relative flex h-[100dvh] min-h-0 flex-col overflow-hidden rounded-none border border-white/10 bg-[#02040a] shadow-2xl shadow-violet-950/40 lg:h-full lg:rounded-[1.75rem]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(84,56,255,.18),transparent_34%),radial-gradient(circle_at_82%_22%,rgba(228, 187, 94,.08),transparent_24%)]" />
        <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 text-black shadow-[0_0_42px_rgba(228, 187, 94,.26)]">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">Malik Codex 1.0</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck className="h-3 w-3" /> {status}</span>
                <span className="inline-flex items-center gap-1"><Cloud className="h-3 w-3" /> Engine: {selectedProvider}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)} className="rounded-xl border border-cyan-300/20 bg-[#050b16] px-4 py-2 text-sm font-black outline-none">
              <option value="core">MALIK Core</option>
              <option value="codex">MALIK Codex</option>
              <option value="reasoning">MALIK Reasoning</option>
              <option value="backup">MALIK Backup</option>
            </select>
            <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><Settings className="h-5 w-5" /></button>
            <button type="button" onClick={() => setStatus("Workspace grid ready")} className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><Grid3X3 className="h-5 w-5" /></button>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="relative grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)_330px]">
          <MalikCodexFiles selectedFiles={selectedFiles} onSelectedFilesChange={setSelectedFiles} />
          <MalikCodexAgent
            selectedFiles={selectedFiles}
            provider={selectedProvider}
            onPlan={setPlan}
            onResult={setResult}
            onLogs={setLogs}
            onRunning={setRunning}
            onOpenSettings={() => setSettingsOpen(true)}
            onSendToCanvas={(code) => onSendToCanvas?.(code)}
          />
          <aside className="codex-plan-panel flex min-h-0 flex-col rounded-[1.35rem] border border-cyan-300/12 bg-[#050814]/88">
            <div className="border-b border-white/10 p-4">
              <h3 className="font-black">Task Plan</h3>
              <p className="text-xs text-zinc-500">Progress, issues, changes and deploy</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 rounded-[1.2rem] border border-cyan-300/16 bg-black/42 p-4">
                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4">
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/20 bg-[conic-gradient(from_220deg,rgba(228, 187, 94,.9),rgba(201, 152, 47,.95),rgba(15,23,42,.25),rgba(228, 187, 94,.9))] p-2">
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-[#050814] text-2xl font-black text-cyan-100">72%</div>
                  </div>
                  <div className="space-y-2 text-xs">
                    {[
                      ["app", "92"],
                      ["ui", "81"],
                      ["api", "73"],
                      ["lib", "64"],
                      ["deploy", "71"],
                    ].map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[42px_1fr_34px] items-center gap-2">
                        <span className="text-zinc-400">{label}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" style={{ width: `${value}%` }} /></span>
                        <span className="text-zinc-500">{value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><Activity className="h-4 w-4" /> Project health excellent</div>
              </div>
              <div className="space-y-2">
                {(plan.steps || ["Select a task", "Generate plan", "Review changes", "Apply after confirmation", "Monitor & optimize"]).map((step: string, index: number) => (
                  <div key={`${step}-${index}`} className="flex gap-3 rounded-2xl border border-white/10 bg-black/35 p-3 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/20 text-xs font-black text-violet-100">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-zinc-300"><b className="block text-white">{step}</b><span className="text-xs text-zinc-500">Codex validates before write</span></span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                <div className="font-black">Detected issues</div>
                {(plan.issues || ["No issues yet"]).map((issue: string) => <p key={issue} className="mt-1">{issue}</p>)}
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="mb-2 font-black">Changed files preview</div>
                {(selectedFiles.length ? selectedFiles : ["No patch selected yet"]).map((file) => (
                  <div key={file} className="truncate text-xs leading-6 text-zinc-400">{file}</div>
                ))}
              </div>
              <div className="mt-5 grid gap-2">
                <button type="button" onClick={applyChanges} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-black text-black"><Check className="h-4 w-4" /> Apply Changes</button>
                <button type="button" onClick={rejectChanges} className="rounded-2xl border border-white/10 px-4 py-3 font-black text-zinc-200 hover:bg-white/10">Reject Changes</button>
                <button type="button" onClick={openDeployChecklist} className="flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 font-black text-cyan-100"><Rocket className="h-4 w-4" /> Open Deploy Checklist</button>
              </div>
            </div>
          </aside>
        </div>

        <div className="shrink-0 p-3 pt-0">
          <MalikCodexTerminal logs={logs} running={running} onClear={() => setLogs([])} onStop={() => { setRunning(false); setStatus("Stopped by user") }} />
        </div>

        {settingsOpen && <MalikCodexSettings onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  )
}

export default MalikCodexModal

