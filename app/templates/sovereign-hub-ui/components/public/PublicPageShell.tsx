import Link from "next/link"
import type { ReactNode } from "react"
import { CAPABILITY_CARDS } from "@/lib/ai/capabilities"
import { FOUNDER_LINE, HONEST_POSITIONING, PROFESSIONAL_DISCLAIMER, STAGE_LINE } from "@/lib/ai/safety"
import { ProofNavStrip } from "@/components/public/ProofWidgets"

export function PublicPageShell({
  title,
  subtitle,
  children,
  showCapabilities = false,
  activeNav,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  showCapabilities?: boolean
  activeNav?: string
}) {
  return (
    <main className="min-h-screen bg-[#02050d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,.08),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(139,92,246,.1),transparent_28%)]" />
      <div className="relative mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-sm font-black tracking-wide text-cyan-200">
            MALIK AI
          </Link>
          <ProofNavStrip active={activeNav} />
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-xl md:p-10">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Kazakhstan-built · Release candidate</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">{title}</h1>
          {subtitle ? <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400 md:text-lg">{subtitle}</p> : null}
          <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-500">{HONEST_POSITIONING}</p>
          <p className="mt-2 text-sm text-slate-500">{FOUNDER_LINE}</p>
          <p className="mt-2 text-sm text-amber-200/80">{STAGE_LINE}</p>
        </section>

        <div className="mt-8 space-y-6">{children}</div>

        {showCapabilities ? (
          <section className="mt-10 grid gap-3 md:grid-cols-2">
            {CAPABILITY_CARDS.map((card) => (
              <article key={card.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-sm font-black text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
              </article>
            ))}
          </section>
        ) : null}

        <footer className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-500">
          <p>Press / partnership inquiries: hello@malik.ai (placeholder — update before external outreach)</p>
          <p className="mt-2">{PROFESSIONAL_DISCLAIMER}</p>
        </footer>
      </div>
    </main>
  )
}

export function PublicSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#060914]/90 p-5 md:p-6">
      <h2 className="text-xl font-black text-white">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  )
}

export function PlaceholderVisual({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-cyan-400/25 bg-cyan-500/[0.04] text-xs font-bold uppercase tracking-[0.18em] text-cyan-200/70">
      {label}
    </div>
  )
}
