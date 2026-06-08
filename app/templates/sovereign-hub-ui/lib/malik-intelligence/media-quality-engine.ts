import type { Storyboard } from "./types"

export type MediaDirectorOptions = {
  kind: "image" | "video"
  prompt: string
  style?: string
  aspectRatio?: "1:1" | "16:9" | "9:16"
  duration?: 5 | 8 | 12
}

export function enhanceMediaPrompt(options: MediaDirectorOptions) {
  const style = options.style || "cinematic, premium, high detail"
  const aspect = options.aspectRatio || (options.kind === "video" ? "16:9" : "1:1")
  const base = options.prompt.trim()
  const camera =
    options.kind === "video"
      ? "smooth camera motion, subject continuity, natural physics, clear beginning middle and ending"
      : "strong composition, crisp subject, professional lighting, clean background"

  return [
    base,
    `Style: ${style}.`,
    `Aspect ratio: ${aspect}.`,
    camera,
    "Avoid blur, broken anatomy, unreadable text, duplicated limbs, random artifacts.",
    "Output should feel like a premium AI creator product demo.",
  ].join(" ")
}

export function buildMediaStoryboard(options: MediaDirectorOptions): Storyboard {
  const duration = options.duration || 5
  return {
    title: options.kind === "video" ? "MALIK Cinema video plan" : "Premium image plan",
    aspectRatio: options.aspectRatio || "16:9",
    duration,
    frames: [
      { time: "00:00", label: "Hook", shot: options.prompt.slice(0, 120), motion: "establish subject and mood" },
      { time: "00:02", label: "Core", shot: "main subject reveal with premium light and detail", motion: "smooth motion / clear composition" },
      { time: `00:${String(duration).padStart(2, "0")}`, label: "Final", shot: "clean final frame ready for preview", motion: "stabilize and finish strong" },
    ],
  }
}

export function mediaNegativePrompt() {
  return [
    "low quality",
    "blurry",
    "distorted",
    "extra fingers",
    "broken anatomy",
    "bad text",
    "watermark",
    "random logo",
    "flicker",
    "jitter",
  ].join(", ")
}

