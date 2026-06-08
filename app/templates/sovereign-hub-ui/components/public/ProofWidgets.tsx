import Link from "next/link"
import type { ReactNode } from "react"
import {
  CONTACT_ACTIONS,
  DEMO_FLOW_STEPS,
  KAZAKHSTAN_IMPACT,
  PROOF_NAV,
  TRUST_POINTS,
  getHonestBenchmarks,
  getPublicProofStatus,
} from "@/lib/proof/public-proof"

export function ProofNavStrip({ active }: { active?: string }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {PROOF_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
            active === item.href
              ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
              : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function StatusBooleanGrid() {
  const status = getPublicProofStatus()
  const rows = [
    ["Groq configured", status.groqConfigured],
    ["Bedrock primary configured", status.bedrockPrimaryConfigured],
    ["Bedrock backup configured", status.bedrockBackupConfigured],
    ["Azure configured", status.azureConfigured],
    ["Photo model configured", status.photoModelConfigured],
    ["Video model configured", status.videoModelConfigured],
    ["Capabilities loaded", status.capabilitiesLoaded],
    ["Build ready", status.buildReady],
  ] as const

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-sm text-slate-300">{label}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${value ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-100"}`}>
            {value ? "yes" : "no"}
          </span>
        </div>
      ))}
    </div>
  )
}

export function BenchmarkTable() {
  const rows = getHonestBenchmarks()
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="px-4 py-3">Metric</th>
            <th className="px-4 py-3">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-white/10">
              <td className="px-4 py-3 text-slate-300">{row.label}</td>
              <td className="px-4 py-3 font-mono text-cyan-100">
                {row.value}
                {"unit" in row && row.value !== "not measured yet" ? ` ${row.unit}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function KazakhstanImpactGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {KAZAKHSTAN_IMPACT.map((item) => (
        <article key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-black text-white">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
        </article>
      ))}
    </div>
  )
}

export function DemoFlowList() {
  return (
    <ol className="space-y-3">
      {DEMO_FLOW_STEPS.map((step, index) => (
        <li key={step.mode} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
            {index + 1}. {step.mode}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            <span className="text-slate-500">Idea:</span> {step.idea}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            <span className="text-slate-500">Outcome:</span> {step.outcome}
          </p>
        </li>
      ))}
    </ol>
  )
}

export function TrustSecurityList() {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
      {TRUST_POINTS.map((point) => (
        <li key={point}>{point}</li>
      ))}
      <li>
        Privacy / terms pages are not published yet — contact hello@malik.ai for data questions.
      </li>
    </ul>
  )
}

export function ContactActionGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CONTACT_ACTIONS.map((action) => (
        <a
          key={action.id}
          href={action.href}
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-4 text-sm font-black text-white transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
        >
          {action.label}
        </a>
      ))}
    </div>
  )
}

export function ProofLinksRow({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {children}
      <Link href="/api/ai/status" className="text-cyan-300 hover:underline">
        Status API
      </Link>
      <Link href="/api/ai/capabilities" className="text-cyan-300 hover:underline">
        Capabilities API
      </Link>
      <Link href="/dashboard" className="text-cyan-300 hover:underline">
        Live app
      </Link>
    </div>
  )
}
