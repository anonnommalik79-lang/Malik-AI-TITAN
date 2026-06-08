"use client"

import { useState } from "react"
import { LIVE_DEMO_ACTIONS } from "@/lib/proof/public-proof"

type DemoResult = {
  ok: boolean
  summary: string
  ms: number
}

export function LiveDemoCenter() {
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, DemoResult>>({})

  const runDemo = async (action: (typeof LIVE_DEMO_ACTIONS)[number]) => {
    setRunning(action.id)
    const started = performance.now()
    try {
      const response = await fetch(action.api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body),
      })
      const data = await response.json().catch(() => ({}))
      const ms = Math.round(performance.now() - started)
      const text = String(
        data?.content ||
          data?.output ||
          data?.message ||
          data?.publicError ||
          data?.error ||
          (response.ok ? "Request completed." : "Request failed."),
      ).slice(0, 280)

      setResults((prev) => ({
        ...prev,
        [action.id]: { ok: response.ok && Boolean(data?.ok ?? data?.content ?? data?.output ?? response.ok), summary: text, ms },
      }))
    } catch (error) {
      const ms = Math.round(performance.now() - started)
      setResults((prev) => ({
        ...prev,
        [action.id]: {
          ok: false,
          summary: error instanceof Error ? error.message : "Demo request failed.",
          ms,
        },
      }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {LIVE_DEMO_ACTIONS.map((action) => {
        const result = results[action.id]
        return (
          <article key={action.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-white">{action.label} demo</h3>
              <button
                type="button"
                disabled={running === action.id}
                onClick={() => runDemo(action)}
                className="rounded-xl bg-white px-3 py-2 text-xs font-black text-black disabled:opacity-60"
              >
                {running === action.id ? "Running..." : "Run"}
              </button>
            </div>
            <p className="mt-2 font-mono text-[11px] text-slate-500">{action.api}</p>
            {result ? (
              <div className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${result.ok ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50" : "border-amber-300/20 bg-amber-300/10 text-amber-50"}`}>
                <p>{result.summary}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.14em] opacity-80">{result.ms} ms</p>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
