"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { ChevronDown, Clipboard, ExternalLink, Rocket, ShieldCheck } from "lucide-react"

interface DeployMenuProps {
  onOpenDeployGuide?: () => void
  onStatus?: (message: string) => void
}

const buildCommand = "npm run build"

export function DeployMenu({ onOpenDeployGuide, onStatus }: DeployMenuProps) {
  const [open, setOpen] = useState(false)
  const [localStatus, setLocalStatus] = useState("Render Guard ready")

  const setStatus = (message: string) => {
    setLocalStatus(message)
    onStatus?.(message)
  }

  const copyBuildCommand = async () => {
    await navigator.clipboard.writeText(buildCommand)
    setStatus("Build command copied")
    setOpen(false)
  }

  const guide = (message: string) => {
    setStatus(message)
    onOpenDeployGuide?.()
    setOpen(false)
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 hover:bg-cyan-300/15"
      >
        <Rocket className="h-4 w-4" />
        Deploy
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,330px)] overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] text-white shadow-2xl shadow-black/50">
          <div className="border-b border-white/10 p-4">
            <h3 className="font-black">Deploy guide</h3>
            <p className="mt-1 text-xs text-zinc-500">{localStatus}</p>
          </div>
          <div className="grid gap-1 p-2">
            <DeployItem label="Export ZIP" onClick={() => guide("ZIP export guide prepared")} />
            <DeployItem label="Deploy to Render" onClick={() => guide("Run npm build, push to GitHub, then Render deploy latest commit")} />
            <DeployItem label="Deploy to Vercel" onClick={() => guide("Vercel guide prepared, no fake deploy API called")} />
            <DeployItem label="Copy build command" onClick={copyBuildCommand} icon={<Clipboard className="h-4 w-4" />} />
            <DeployItem label="Check errors" onClick={() => guide("Render Guard: run npm build first")} />
            <DeployItem label="Open Deploy Guide" onClick={() => guide("Deploy guide opened")} icon={<ExternalLink className="h-4 w-4" />} />
          </div>
          <div className="flex items-start gap-2 border-t border-white/10 p-3 text-xs leading-5 text-amber-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Safe mode: this menu never pushes code or spends API credits.
          </div>
        </div>
      )}
    </div>
  )
}

function DeployItem({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-bold text-zinc-200 hover:bg-white/10">
      <span>{label}</span>
      {icon}
    </button>
  )
}

export default DeployMenu

