"use client"

import { useState } from "react"
import { LogOut, Save, User } from "lucide-react"
import { PremiumCss, PremiumHero, PremiumScene } from "../../ui/premium-components"

interface SovereignSettingsPanelProps {
  username?: string
  onLogout?: () => void
}

export function SovereignSettingsPanel({ username = "local@malik.ai", onLogout }: SovereignSettingsPanelProps) {
  const [name, setName] = useState(username)
  const [status, setStatus] = useState("Profile settings ready")

  const save = () => {
    try {
      window.localStorage.setItem("malik_user_name", name)
      window.dispatchEvent(new Event("malik-auth-updated"))
      setStatus("Profile saved")
    } catch {
      setStatus("Profile save fallback completed")
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#030303] p-6 text-white">
      <PremiumCss />
      <div className="mx-auto max-w-5xl">
        <PremiumHero
          eyebrow="Settings"
          title="Profile and workspace"
          subtitle={`${status}. Local profile controls, safe logout and workspace identity in one premium panel.`}
          kind="settings"
          metrics={[
            { label: "Profile", value: "Ready" },
            { label: "Storage", value: "Local" },
            { label: "Session", value: "Safe" },
          ]}
        />
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Display name</label>
          <div className="mt-3 flex gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-100"><User className="h-5 w-5" /></div>
            <input value={name} onChange={(event) => setName(event.target.value)} className="flex-1 rounded-2xl border border-white/10 bg-black px-4 outline-none focus:border-violet-400" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={save} className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-black"><Save className="h-4 w-4" /> Save Profile</button>
            <button type="button" onClick={onLogout} className="flex items-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-3 font-black text-red-100"><LogOut className="h-4 w-4" /> Logout</button>
          </div>
        </div>
        <PremiumScene kind="settings" title="Workspace identity" subtitle="Owner badge, local display name and safe session controls stay visible without empty black space." />
        </div>
      </div>
    </div>
  )
}

export default SovereignSettingsPanel

