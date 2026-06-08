import Link from "next/link"
import { PublicPageShell, PublicSection } from "@/components/public/PublicPageShell"
import { ContactActionGrid } from "@/components/public/ProofWidgets"
import { PROOF_CONTACT_EMAIL } from "@/lib/proof/public-proof"

export const metadata = {
  title: "Contact — MALIK AI",
  description: "Contact MALIK AI — waitlist, demo requests, founder contact and bug reports.",
}

export default function ContactPage() {
  return (
    <PublicPageShell
      activeNav="/contact"
      title="Contact & waitlist"
      subtitle="No backend required — mailto CTAs until a formal waitlist service is configured."
    >
      <PublicSection title="Get in touch">
        <ContactActionGrid />
        <p className="mt-4 text-sm text-slate-400">
          Email:{" "}
          <a href={`mailto:${PROOF_CONTACT_EMAIL}`} className="text-cyan-300 hover:underline">
            {PROOF_CONTACT_EMAIL}
          </a>
        </p>
      </PublicSection>

      <PublicSection title="Other proof pages">
        <div className="flex flex-wrap gap-3">
          <Link href="/press-kit" className="text-cyan-300 hover:underline">
            Press kit
          </Link>
          <Link href="/demo" className="text-cyan-300 hover:underline">
            Demo
          </Link>
          <Link href="/investors" className="text-cyan-300 hover:underline">
            Investors
          </Link>
        </div>
      </PublicSection>
    </PublicPageShell>
  )
}
