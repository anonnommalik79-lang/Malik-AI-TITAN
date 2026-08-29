"use client"

import { VideoGenerationStudio } from "@/components/sovereign/video-generation/VideoGenerationStudio"

export default function VisualVideoClient() {
  return (
    <main style={{ minHeight: "100dvh", background: "#000" }}>
      <VideoGenerationStudio
        username="Owner"
        onViewChange={() => {}}
        onOpenCodex={() => {}}
        onOpenCanvas={() => {}}
        onNewChat={() => {}}
      />
    </main>
  )
}
