"use client"

import { useMemo, useState } from "react"
import { Search, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { FEATURE_CATEGORIES, FEATURE_STATS, SOVEREIGN_FEATURES } from "../core/feature-registry"
import { PremiumActionCard, PremiumCss, PremiumHero, PremiumStatGrid, resolvePremiumKind } from "../../ui/premium-components"
import { cn } from "@/lib/utils"

export function FeatureCenter() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("All")
  const [status, setStatus] = useState("Ready")

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return SOVEREIGN_FEATURES.filter((feature) => {
      const categoryOk = category === "All" || feature.category === category
      const textOk = !q || `${feature.id} ${feature.title} ${feature.category} ${feature.description} ${feature.tags.join(" ")}`.toLowerCase().includes(q)
      return categoryOk && textOk && feature.isVisible
    })
  }, [category, query])

  const handleFeature = (title: string, hook: string) => {
    setStatus(`${title} prepared. Backend hook: ${hook}`)
  }

  return (
    <div className="h-full overflow-y-auto bg-[#030303] p-6 text-white">
      <PremiumCss />
      <div className="mx-auto max-w-7xl">
        <PremiumHero
          eyebrow="Sovereign Feature Registry"
          title="300+ connected modules"
          subtitle="Product-scale registry for chat, photo, video, code, websites, canvas, billing, teams, analytics, deploy and Malik Codex. Each module has a clear visual domain and safe action."
          kind="templates"
          metrics={[
            { label: "Current status", value: status },
            { label: "Visible", value: String(filtered.length) },
            { label: "Safe hooks", value: "On" },
          ]}
        />

        <div className="mt-8">
          <PremiumStatGrid
            items={[
              { label: "Total", value: String(FEATURE_STATS.total), icon: <Zap className="h-5 w-5" /> },
              { label: "Connected", value: String(FEATURE_STATS.connected), icon: <Sparkles className="h-5 w-5" /> },
              { label: "Safe fallback", value: String(FEATURE_STATS.safeFallback), icon: <ShieldCheck className="h-5 w-5" /> },
              { label: "Premium", value: String(FEATURE_STATS.premium), icon: <Zap className="h-5 w-5" /> },
            ]}
          />
        </div>

        <div className="mt-8 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search features, hooks, tags..."
              className="w-full rounded-2xl border border-white/10 bg-black px-11 py-4 text-sm outline-none focus:border-violet-400"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-sm outline-none focus:border-violet-400"
          >
            <option value="All">All categories</option>
            {FEATURE_CATEGORIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(0, 120).map((feature) => (
            <PremiumActionCard
              key={feature.id}
              kind={resolvePremiumKind(`${feature.title} ${feature.category} ${feature.tags.join(" ")}`)}
              title={feature.title}
              description={feature.description}
              status={feature.status}
              meta={feature.backendHook}
              onClick={() => handleFeature(feature.title, feature.backendHook)}
              className={cn(
                feature.status === "connected"
                  ? "border-violet-400/25"
                  : "border-white/10",
              )}
            />
          ))}
        </div>

        <div className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm leading-6 text-emerald-100">
          <div className="mb-2 flex items-center gap-2 font-black"><ShieldCheck className="h-5 w-5" /> Safety contract</div>
          Registry actions are connected through panel/modal/api contracts. Planned modules use safe fallback instead of dead buttons.
        </div>
      </div>
    </div>
  )
}

export default FeatureCenter

