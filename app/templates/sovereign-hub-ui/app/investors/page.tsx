import Link from "next/link"
import { PublicPageShell, PublicSection } from "@/components/public/PublicPageShell"
import { BenchmarkTable, KazakhstanImpactGrid, StatusBooleanGrid } from "@/components/public/ProofWidgets"
import { FOUNDER_LINE, HONEST_POSITIONING } from "@/lib/ai/safety"

export const metadata = {
  title: "Investors — MALIK AI",
  description: "Investor-readable overview of MALIK AI product, stack and roadmap.",
}

export default function InvestorsPage() {
  return (
    <PublicPageShell
      activeNav="/investors"
      title="MALIK AI — creator and startup intelligence platform"
      subtitle="Honest early-stage overview for investors, accelerators and ecosystem partners."
    >
      <PublicSection title="Product positioning">
        <p>{HONEST_POSITIONING}</p>
        <p className="mt-2 text-amber-200/90">{FOUNDER_LINE}</p>
      </PublicSection>

      <PublicSection title="Problem">
        <p>
          Founders, journalists and small teams in Kazakhstan and emerging markets need one workspace for chat, code,
          media generation and planning — without juggling many disconnected AI tools and unreliable single-provider APIs.
        </p>
      </PublicSection>

      <PublicSection title="Solution">
        <p>
          MALIK AI is a Kazakhstan-built multi-model AI command center with Fast, Deep, Pro, Code, Photo and Video modes,
          unified UI, provider fallback and startup-oriented workflows.
        </p>
      </PublicSection>

      <PublicSection title="Product capabilities">
        <p>Fast chat, deep reasoning, pro intelligence, Malik Codex, image/video studios, memory/embeddings, command center, 200 practical capabilities.</p>
        <Link href="/api/ai/capabilities" className="inline-block text-cyan-300 hover:underline">
          View live capabilities JSON →
        </Link>
        <Link href="/capabilities" className="ml-4 inline-block text-cyan-300 hover:underline">
          Capabilities UI →
        </Link>
      </PublicSection>

      <PublicSection title="Kazakhstan impact">
        <KazakhstanImpactGrid />
      </PublicSection>

      <PublicSection title="Public status (safe booleans)">
        <StatusBooleanGrid />
        <Link href="/status" className="mt-3 inline-block text-cyan-300 hover:underline">
          Full status page →
        </Link>
      </PublicSection>

      <PublicSection title="Benchmarks">
        <BenchmarkTable />
        <Link href="/benchmarks" className="mt-3 inline-block text-cyan-300 hover:underline">
          Full benchmarks page →
        </Link>
      </PublicSection>

      <PublicSection title="Technology stack">
        <ul className="list-disc space-y-2 pl-5">
          <li>Next.js app router (Sovereign Hub UI)</li>
          <li>Server-side provider routing (Groq + AWS Bedrock + fallbacks)</li>
          <li>Render deployment with environment-driven model map</li>
          <li>Safe status/capabilities APIs (no secrets exposed)</li>
        </ul>
        <Link href="/security" className="mt-3 inline-block text-cyan-300 hover:underline">
          Trust & security →
        </Link>
      </PublicSection>

      <PublicSection title="Target users">
        <ul className="list-disc space-y-2 pl-5">
          <li>Startup founders and indie builders</li>
          <li>Journalists and media teams</li>
          <li>Students and educators</li>
          <li>SMB operators needing multilingual AI assistance</li>
          <li>Developers prototyping apps and content pipelines</li>
        </ul>
      </PublicSection>

      <PublicSection title="Roadmap (honest)">
        <ul className="list-disc space-y-2 pl-5">
          <li>Release candidate hardening and Render auto-deploy</li>
          <li>Full Nova Reel async video pipeline</li>
          <li>Memory / semantic search productization</li>
          <li>Kazakhstan impact templates for education and SMB</li>
          <li>Billing and team workspaces</li>
        </ul>
      </PublicSection>

      <PublicSection title="Current stage">
        <p>Early-stage AI platform · release candidate · not claiming funding, revenue, or official government partnership.</p>
      </PublicSection>

      <PublicSection title="Demo CTA">
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className="inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-black text-black">
            Open 60-second demo flow
          </Link>
          <Link href="/contact" className="inline-flex rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white hover:border-cyan-300/30">
            Request demo
          </Link>
        </div>
      </PublicSection>
    </PublicPageShell>
  )
}
