"use client"

import { useState } from "react"
import { Check, Loader2, Sparkles } from "lucide-react"
import { PremiumCss, PremiumHero, PremiumScene } from "../../ui/premium-components"
import { getStoredAuthSnapshot } from "@/lib/supabase"

export function SovereignBillingPanel() {
  const [status, setStatus] = useState("Billing safe mode ready")
  const [loading, setLoading] = useState(false)

  const upgrade = async (plan: string) => {
    if (plan === "Free") return setStatus("Free plan is active")
    setLoading(true)
    setStatus(`Opening ${plan} upgrade...`)
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: getStoredAuthSnapshot()?.email || "guest@malik.ai", plan: plan === "Max" ? "ultra" : plan.toLowerCase() }),
      })
      const data = await response.json()
      setStatus(data.wallet ? `${data.message} Wallet: ${data.wallet}` : data.message || `${plan} upgrade request prepared`)
      if (data.checkoutUrl) window.open(data.checkoutUrl, "_blank", "noopener,noreferrer")
    } catch {
      setStatus(`${plan} upgrade prepared in local fallback`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#030303] p-6 text-white">
      <PremiumCss />
      <div className="mx-auto max-w-6xl">
        <PremiumHero
          eyebrow="Billing"
          title="Upgrade Malik AI"
          subtitle={`${status}. Free, Pro and Max use verified activation only.`}
          kind="billing"
          metrics={[
            { label: "Free", value: "15 chat" },
            { label: "Pro", value: "300 chat" },
            { label: "Max", value: "1000 chat" },
          ]}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {["Free", "Pro", "Max"].map((plan, index) => (
            <div key={plan} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/30">
              <PremiumScene kind={index === 0 ? "settings" : index === 1 ? "billing" : "codex"} compact />
              <div className="p-2">
              <Sparkles className="h-6 w-6 text-violet-300" />
              <h2 className="mt-5 text-3xl font-black">{plan}</h2>
              <p className="mt-2 text-zinc-500">{index === 0 ? "15 chat / 1 image / 0 video" : index === 1 ? "300 chat / 25 image / 5 video" : "1000 chat / 100 image / 20 video"}</p>
              <div className="mt-5 space-y-2 text-sm text-zinc-300">
                {["Chat", "Canvas", "Generators", "Codex settings"].map((item) => (
                  <div key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />{item}</div>
                ))}
              </div>
              <button type="button" onClick={() => upgrade(plan)} disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-black text-black disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Choose {plan}
              </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SovereignBillingPanel

