"use client"

import { directImage, directVideo } from "@/lib/malik-unbreakable-ai"

export function MediaQualityPreview({ prompt = "Создай видео где играют футбол" }: { prompt?: string }) {
  const video = directVideo(prompt)
  const image = directImage(prompt)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[["Video", video.enhancedPrompt], ["Image", image.enhancedPrompt]].map(([title, text]) => (
        <div key={title} className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/70">{title} Director</p>
          <p className="mt-3 text-sm text-white/60">{text}</p>
        </div>
      ))}
    </div>
  )
}

