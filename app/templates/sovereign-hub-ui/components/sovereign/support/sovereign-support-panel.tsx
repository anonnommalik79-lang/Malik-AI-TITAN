"use client"

import { Bug, CreditCard, LifeBuoy, MessageCircle, Rocket, ShieldCheck, TerminalSquare } from "lucide-react"
import { PremiumActionCard, PremiumCss, PremiumHero, resolvePremiumKind } from "../../ui/premium-components"

const supportItems = [
  { title: "Technical Support", icon: LifeBuoy },
  { title: "Billing Support", icon: CreditCard },
  { title: "API Support", icon: TerminalSquare },
  { title: "Malik Codex Support", icon: ShieldCheck },
  { title: "Render Deploy Help", icon: Rocket },
  { title: "Bug Report", icon: Bug },
]

const telegramUrl = "https://t.me/Sovereign_Hub"

export function SovereignSupportPanel() {
  const contactSupport = () => {
    const opened = window.open(telegramUrl, "_blank", "noopener,noreferrer")

    if (!opened) {
      window.location.href = telegramUrl
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#050507]/90 shadow-2xl shadow-black/30 backdrop-blur-2xl">
      <PremiumCss />
      <div className="relative overflow-hidden border-b border-white/10 p-6">
        <PremiumHero
          eyebrow="Online 24/7"
          title="Sovereign Support"
          subtitle="Telegram direct support for Malik AI, Codex, billing, API setup, Render deploy and bug reports."
          kind="support"
          metrics={[
            { label: "Channel", value: "Telegram" },
            { label: "Status", value: "Online" },
            { label: "Deploy", value: "Help" },
          ]}
          action={
            <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={contactSupport}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-100"
            >
              <MessageCircle className="h-4 w-4" />
              Contact Support
            </button>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.09]"
            >
              Telegram direct support
            </a>
          </div>
          }
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {supportItems.map((item) => {
            const Icon = item.icon

            return (
              <PremiumActionCard
                key={item.title}
                kind={resolvePremiumKind(item.title)}
                title={item.title}
                description="Open Telegram support and continue with a live helper."
                status="online"
                meta="@Sovereign_Hub"
                icon={<Icon className="h-5 w-5" />}
                onClick={contactSupport}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default SovereignSupportPanel

