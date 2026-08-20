"use client"

import { Check, Clipboard, Play, ShieldCheck, Square, Terminal, Trash2, X } from "lucide-react"
import { useEffect, useState } from "react"

interface MalikCodexTerminalProps {
  logs: string[]
  running?: boolean
  onClear: () => void
  onStop: () => void
}

export function MalikCodexTerminal({ logs, running, onClear, onStop }: MalikCodexTerminalProps) {
  const [copied, setCopied] = useState(false)
  const [localLogs, setLocalLogs] = useState<string[]>([])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setLocalLogs((prev) => [...prev, `$ malik@sovereign-os -> validating step ${prev.length + 1}`].slice(-8))
    }, 1400)
    return () => window.clearInterval(timer)
  }, [running])

  const allLogs = [...logs, ...localLogs]
  const copy = async () => {
    await navigator.clipboard.writeText(allLogs.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="codex-terminal-panel overflow-hidden rounded-[1.35rem] border border-cyan-300/15 bg-[#02040a]/95 shadow-[0_22px_80px_rgba(0,0,0,.45)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3 text-sm font-black text-white">
          <X className="h-4 w-4 text-cyan-200" />
          <Terminal className="h-4 w-4 text-cyan-200" />
          Terminal
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-200">
            <ShieldCheck className="h-3 w-3" />
            {running ? "Running" : "Ready"}
          </span>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={copy} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
            {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onStop} className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-200">
            {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onClear} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid min-h-[174px] gap-4 p-4 md:grid-cols-[minmax(0,1fr)_360px]">
        <pre className="min-h-[145px] overflow-y-auto rounded-2xl bg-black/55 p-4 text-xs leading-6 text-slate-400">
          <code>
            {(allLogs.length ? allLogs : [
              "$ npm run build",
              "> malik-codex build",
              "> python -m build",
              "$ build status: success",
              "$ python compile: success",
              "$ git status: clean",
              "$ backend hook: prepared",
              "",
              "$ malik@sovereign-os ->",
            ]).join("\n")}
          </code>
        </pre>
        <div className="relative hidden overflow-hidden rounded-2xl border border-cyan-300/10 bg-[radial-gradient(circle_at_60%_50%,rgba(228, 187, 94,.22),transparent_30%),radial-gradient(circle_at_44%_58%,rgba(217, 174, 69,.24),transparent_24%),linear-gradient(135deg,#041021,#03050c)] md:block">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(228, 187, 94,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(228, 187, 94,.08)_1px,transparent_1px)] bg-[size:22px_22px] opacity-35" />
          <div className="absolute bottom-[-72px] right-[-28px] h-56 w-56 rounded-full border border-cyan-300/35 bg-[repeating-radial-gradient(circle_at_center,transparent_0_12px,rgba(228, 187, 94,.22)_13px_14px),repeating-linear-gradient(0deg,transparent_0_18px,rgba(217, 174, 69,.22)_19px_20px)] shadow-[0_0_90px_rgba(228, 187, 94,.35)]" />
        </div>
      </div>
    </div>
  )
}

export default MalikCodexTerminal

