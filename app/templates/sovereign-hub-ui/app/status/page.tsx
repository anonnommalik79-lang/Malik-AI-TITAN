import { PublicPageShell, PublicSection } from "@/components/public/PublicPageShell"
import { ProofLinksRow, StatusBooleanGrid } from "@/components/public/ProofWidgets"
import { getPublicProofStatus } from "@/lib/proof/public-proof"

export const metadata = {
  title: "Status — MALIK AI",
  description: "Public safe status for MALIK AI provider configuration and build readiness.",
}

export default function StatusPage() {
  const status = getPublicProofStatus()

  return (
    <PublicPageShell
      activeNav="/status"
      title="Public status"
      subtitle="Safe booleans only — no API keys, tokens or secret values are exposed on this page."
    >
      <PublicSection title="Provider & build readiness">
        <StatusBooleanGrid />
        <p className="mt-4 text-xs text-slate-500">
          Capabilities registry: {status.capabilitiesCount} entries · Region: {status.region || "not set"} · Stage: {status.stage}
        </p>
      </PublicSection>

      <PublicSection title="Machine-readable status">
        <ProofLinksRow>
          <span className="text-slate-400">JSON endpoint for journalists and integrators:</span>
        </ProofLinksRow>
      </PublicSection>
    </PublicPageShell>
  )
}
