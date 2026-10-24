import type { ClaimLedger } from "@/lib/ai/claim-ledger"

/** Mounted only when the existing fact-audit disclosure is opened. */
export function ClaimLedgerPanel({ ledger }: { ledger: ClaimLedger }) {
  return (
    <div className="border-t border-white/10 px-3.5 py-3 text-xs" data-malik-claim-ledger="true">
      <p className="mb-2 text-zinc-500">{ledger.counts.VERIFIED} проверено · {ledger.counts.SUPPORTED} с опорой · {ledger.counts.UNCERTAIN} неопределённо · {ledger.counts.UNVERIFIED} не проверено</p>
      <ul className="space-y-3">
        {ledger.claims.map(claim => (
          <li key={claim.id} className="break-words">
            <span className="text-zinc-400">{claim.status} · {claim.origin}</span>
            <p className="mt-1 text-zinc-200">{claim.text}</p>
            {claim.evidence.map((evidence, index) => (
              <p key={index} className="mt-1 text-zinc-500">
                {evidence.url ? <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="underline">Источник</a> : evidence.method}
                {evidence.observedAt ? ` · ${evidence.observedAt}` : ""}
                {evidence.excerpt ? ` — ${evidence.excerpt}` : ""}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-zinc-500">{ledger.limits.join(". ")}</p>
    </div>
  )
}
