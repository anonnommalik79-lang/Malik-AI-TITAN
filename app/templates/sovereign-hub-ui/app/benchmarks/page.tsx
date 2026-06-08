import { PublicPageShell, PublicSection } from "@/components/public/PublicPageShell"
import { BenchmarkTable } from "@/components/public/ProofWidgets"

export const metadata = {
  title: "Benchmarks — MALIK AI",
  description: "Honest benchmark and test status for MALIK AI modes.",
}

export default function BenchmarksPage() {
  return (
    <PublicPageShell
      activeNav="/benchmarks"
      title="Benchmarks & test status"
      subtitle="No fabricated metrics. Values appear only when measured and stored in deployment env vars."
    >
      <PublicSection title="Measured values">
        <BenchmarkTable />
        <p className="mt-4 text-xs text-slate-500">
          Optional env keys: MALIK_BENCH_FAST_MS, MALIK_BENCH_DEEP_STATUS, MALIK_BENCH_CODE_STATUS, MALIK_BENCH_FALLBACK_STATUS, MALIK_BUILD_STATUS.
        </p>
      </PublicSection>
    </PublicPageShell>
  )
}
