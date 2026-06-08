"use client"

import { architectCode } from "@/lib/malik-unbreakable-ai"

export function CodeMatrixPreview({ prompt = "Создай React dashboard" }: { prompt?: string }) {
  const plan = architectCode(prompt, "react", "react")
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200/70">Code Matrix</p>
      <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-black/70 p-4 text-xs text-cyan-50"><code>{plan.systemPrompt}</code></pre>
    </div>
  )
}

