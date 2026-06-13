"use client";

import type { MalikResearchSource, MalikResearchStep } from "../../hooks/useMalikResearch";

type Props = {
  active: boolean;
  steps: MalikResearchStep[];
  sources: MalikResearchSource[];
  webSourceCount: number;
  cached?: boolean;
};

export function LiveResearchActivity({
  active,
  steps,
  sources,
  webSourceCount,
  cached,
}: Props) {
  const visibleSteps = steps.slice(-10).reverse();
  const visibleSources = sources.slice(0, 10);

  return (
    <aside className="w-full rounded-3xl border border-white/10 bg-black/80 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl lg:max-w-[390px]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Activity</div>
          <div className="text-xs text-white/45">
            {active ? "MALIK World AI Research running" : "Research status"}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
          <span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-white" : "bg-white/30"}`} />
          {active ? "Live" : "Done"}
        </div>
      </div>

      {cached && (
        <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-100">
          Cache hit. No repeated spending.
        </div>
      )}

      <div className="mb-4 space-y-2">
        {visibleSteps.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/45">
            No actions yet. Run a query.
          </div>
        ) : (
          visibleSteps.map((step, index) => (
            <div key={`${step.at}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-sm leading-snug text-white/85">{step.text}</div>
              {step.domain && (
                <div className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/55">
                  {step.domain}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-xs text-white/45">Web sources</div>
          <div className="mt-1 text-2xl font-bold">{webSourceCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-xs text-white/45">Read</div>
          <div className="mt-1 text-2xl font-bold">{sources.length}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-white/80">Sources</div>

        {visibleSources.length === 0 ? (
          <div className="text-xs text-white/40">No final sources yet.</div>
        ) : (
          visibleSources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.07]"
            >
              <div className="text-xs text-white/45">
                {source.domain}{source.provider ? ` / ${source.provider}` : ""}
              </div>
              <div className="mt-1 text-sm font-medium text-white/90">{source.title}</div>
            </a>
          ))
        )}
      </div>
    </aside>
  );
}
