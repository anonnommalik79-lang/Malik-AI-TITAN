import Link from "next/link"
import { PublicPageShell, PublicSection, PlaceholderVisual } from "@/components/public/PublicPageShell"
import { DemoFlowList, KazakhstanImpactGrid, ProofLinksRow } from "@/components/public/ProofWidgets"
import { FOUNDER_LINE, HONEST_POSITIONING, PROFESSIONAL_DISCLAIMER } from "@/lib/ai/safety"
import { MEDIA_CHECKLIST, PRESS_QUOTE, PROOF_CONTACT_EMAIL } from "@/lib/proof/public-proof"

export const metadata = {
  title: "Media — MALIK AI",
  description: "Media-ready overview of MALIK AI, a Kazakhstan-built multi-model AI command center.",
}

export default function MediaPage() {
  return (
    <PublicPageShell
      activeNav="/media"
      title="16-year-old founder from Kazakhstan builds MALIK AI, a multi-model AI command center for chat, code, images, video and startup workflows."
      subtitle="Early-stage release candidate for journalists, creators and ecosystem partners."
      showCapabilities
    >
      <PublicSection title="One-paragraph summary">
        <p>{HONEST_POSITIONING}</p>
      </PublicSection>

      <PublicSection title="Founder">
        <p>{FOUNDER_LINE}</p>
        <p>Focus: practical AI tooling for students, founders, journalists and small businesses in Central Asia and beyond.</p>
      </PublicSection>

      <PublicSection title="What MALIK AI can do">
        <ul className="list-disc space-y-2 pl-5">
          <li>Fast and deep chat with multi-provider fallback</li>
          <li>Pro intelligence mode for long-form strategy drafts</li>
          <li>Malik Codex code and project generation</li>
          <li>AI image and video studios with async job status</li>
          <li>200 practical capabilities registry</li>
          <li>Startup command center workflows</li>
          <li>Multilingual support: Kazakh, Russian and English</li>
        </ul>
      </PublicSection>

      <PublicSection title="Kazakhstan impact">
        <KazakhstanImpactGrid />
      </PublicSection>

      <PublicSection title="60-second demo flow">
        <DemoFlowList />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <PlaceholderVisual label="Chat UI screenshot" />
          <PlaceholderVisual label="Codex / Code panel" />
          <PlaceholderVisual label="Media studio panel" />
        </div>
        <Link href="/demo" className="mt-4 inline-block text-cyan-300 hover:underline">
          Open live demo center →
        </Link>
      </PublicSection>

      <PublicSection title="Press contact">
        <p>Email: {PROOF_CONTACT_EMAIL} (update before publishing)</p>
        <ProofLinksRow />
      </PublicSection>

      <PublicSection title="Press kit checklist">
        <ul className="list-disc space-y-2 pl-5">
          {MEDIA_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link href="/press-kit" className="mt-3 inline-block text-cyan-300 hover:underline">
          Full press kit →
        </Link>
      </PublicSection>

      <PublicSection title="Press quote">
        <blockquote className="border-l-2 border-cyan-300/40 pl-4 italic text-slate-200">{PRESS_QUOTE}</blockquote>
      </PublicSection>

      <p className="text-xs text-slate-500">{PROFESSIONAL_DISCLAIMER}</p>
    </PublicPageShell>
  )
}
