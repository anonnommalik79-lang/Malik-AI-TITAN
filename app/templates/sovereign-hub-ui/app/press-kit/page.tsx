import Link from "next/link"
import { PublicPageShell, PublicSection, PlaceholderVisual } from "@/components/public/PublicPageShell"
import { ProofLinksRow } from "@/components/public/ProofWidgets"
import { FOUNDER_LINE, HONEST_POSITIONING, PROFESSIONAL_DISCLAIMER } from "@/lib/ai/safety"
import { MEDIA_CHECKLIST, PRESS_QUOTE, PROOF_CONTACT_EMAIL } from "@/lib/proof/public-proof"

export const metadata = {
  title: "Press kit — MALIK AI",
  description: "Press kit for MALIK AI — Kazakhstan-built multi-model AI command center.",
}

export default function PressKitPage() {
  return (
    <PublicPageShell
      activeNav="/press-kit"
      title="Press kit"
      subtitle="Materials for journalists, Astana Hub, Digital Bridge and ecosystem partners."
    >
      <PublicSection title="Product description">
        <p>{HONEST_POSITIONING}</p>
      </PublicSection>

      <PublicSection title="Founder bio">
        <p>{FOUNDER_LINE}</p>
        <p>
          Abdumalik Amangeldy is building MALIK AI as a practical command center for students, founders, journalists and small businesses.
          The product is an early-stage release candidate with global ambition, rooted in Kazakhstan.
        </p>
      </PublicSection>

      <PublicSection title="Kazakhstan-built AI positioning">
        <p>
          MALIK AI is designed for Kazakhstan and Central Asia builders first — multilingual support, document workflows,
          startup tooling and honest public proof pages — without claiming #1 status or fake partnerships.
        </p>
      </PublicSection>

      <PublicSection title="Demo links">
        <ProofLinksRow />
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/demo" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300/30">
            60-second demo
          </Link>
          <Link href="/status" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300/30">
            Public status
          </Link>
          <Link href="/benchmarks" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300/30">
            Benchmarks
          </Link>
        </div>
      </PublicSection>

      <PublicSection title="Screenshot placeholders">
        <div className="grid gap-3 md:grid-cols-3">
          <PlaceholderVisual label="Dashboard / chat" />
          <PlaceholderVisual label="Capabilities engine" />
          <PlaceholderVisual label="Media studio" />
        </div>
      </PublicSection>

      <PublicSection title="Press quote">
        <blockquote className="border-l-2 border-cyan-300/40 pl-4 text-base italic text-slate-200">{PRESS_QUOTE}</blockquote>
      </PublicSection>

      <PublicSection title="Contact block">
        <p>Email: {PROOF_CONTACT_EMAIL} (update before external outreach)</p>
        <p>Demo requests: /contact · Live app: /dashboard</p>
      </PublicSection>

      <PublicSection title="Media checklist">
        <ul className="list-disc space-y-2 pl-5">
          {MEDIA_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </PublicSection>

      <p className="text-xs text-slate-500">{PROFESSIONAL_DISCLAIMER}</p>
    </PublicPageShell>
  )
}
