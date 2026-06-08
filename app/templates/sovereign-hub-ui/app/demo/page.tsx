import Link from "next/link"
import { LiveDemoCenter } from "@/components/public/LiveDemoCenter"
import { PublicPageShell, PublicSection } from "@/components/public/PublicPageShell"
import { DemoFlowList, KazakhstanImpactGrid } from "@/components/public/ProofWidgets"

export const metadata = {
  title: "Demo — MALIK AI",
  description: "60-second MALIK AI demo flow for investors and journalists.",
}

export default function DemoPage() {
  return (
    <PublicPageShell
      activeNav="/demo"
      title="60-second MALIK AI demo"
      subtitle="Walkthrough for investors, journalists, Astana Hub / Digital Bridge audiences, founders and developers."
    >
      <PublicSection title="Live Demo Center">
        <p>Run safe server-side demo actions. Results depend on configured providers — no secrets are shown.</p>
        <div className="mt-4">
          <LiveDemoCenter />
        </div>
      </PublicSection>

      <PublicSection title="60-second demo flow">
        <DemoFlowList />
      </PublicSection>

      <PublicSection title="Kazakhstan impact">
        <KazakhstanImpactGrid />
      </PublicSection>

      <PublicSection title="Live app">
        <p>Use the full product UI for the visual demo.</p>
        <Link href="/dashboard" className="mt-3 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-black text-black">
          Open MALIK AI dashboard
        </Link>
      </PublicSection>
    </PublicPageShell>
  )
}
