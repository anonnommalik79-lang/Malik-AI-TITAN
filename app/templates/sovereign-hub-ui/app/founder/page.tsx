import Link from "next/link"
import { PublicPageShell, PublicSection } from "@/components/public/PublicPageShell"
import { KazakhstanImpactGrid } from "@/components/public/ProofWidgets"
import { FOUNDER_LINE, HONEST_POSITIONING } from "@/lib/ai/safety"

export const metadata = {
  title: "Founder — MALIK AI",
  description: "Founder story for Abdumalik Amangeldy and MALIK AI.",
}

export default function FounderPage() {
  return (
    <PublicPageShell
      activeNav="/founder"
      title="Abdumalik Amangeldy"
      subtitle="16-year-old founder/developer from Kazakhstan building MALIK AI."
    >
      <PublicSection title="Founder story">
        <p>{FOUNDER_LINE}</p>
        <p>
          Abdumalik Amangeldy is building MALIK AI as a practical multi-model command center for chat, code, images,
          video and startup workflows. The product is an early-stage release candidate with global ambition, rooted in
          Kazakhstan and designed for real builders, journalists and students.
        </p>
        <p className="mt-2">{HONEST_POSITIONING}</p>
      </PublicSection>

      <PublicSection title="Kazakhstan impact">
        <KazakhstanImpactGrid />
      </PublicSection>

      <PublicSection title="Honest positioning">
        <p>
          MALIK AI does not claim to be #1, funded, or an official government partner. It is a release candidate platform
          focused on useful AI tooling, provider reliability and clear product narrative for media and investors.
        </p>
      </PublicSection>

      <PublicSection title="Contact">
        <Link href="/contact" className="text-cyan-300 hover:underline">
          Contact / waitlist →
        </Link>
      </PublicSection>
    </PublicPageShell>
  )
}
