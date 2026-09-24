import type { VideoAspectRatio, VideoProviderId, VideoResolution } from "./types"

export type MalikVideoMode = "text" | "image" | "video"
export type MalikVideoTier = "free" | "pro"

export type MalikVideoCapability = {
  id: VideoProviderId
  label: string
  tier: MalikVideoTier
  modes: readonly MalikVideoMode[]
  durations: readonly (5 | 10)[]
  resolutions: readonly VideoResolution[]
  ratios: readonly VideoAspectRatio[]
  audio: boolean
  watermark: boolean
  note: string
}

const ALL_RATIOS = ["16:9", "9:16", "1:1"] as const

export const DEFAULT_VIDEO_PROVIDER_ID: VideoProviderId = "novai"

export const VIDEO_CAPABILITIES: Record<VideoProviderId, MalikVideoCapability> = {
  novai: {
    id: "novai",
    label: "NovAI · CogVideoX Flash",
    tier: "free",
    modes: ["text"],
    durations: [5],
    resolutions: ["720p"],
    ratios: ALL_RATIOS,
    audio: false,
    watermark: false,
    note: "Быстрый бесплатный Text → Video маршрут.",
  },
  magichour: {
    id: "magichour",
    label: "Magic Hour · LTX",
    tier: "free",
    modes: ["text", "image", "video"],
    durations: [5, 10],
    resolutions: ["480p"],
    ratios: ALL_RATIOS,
    audio: true,
    watermark: false,
    note: "Text / Image / Video → Video; доступ зависит от кредитов аккаунта.",
  },
  pixazo: {
    id: "pixazo",
    label: "Pixazo · LTX Free",
    tier: "free",
    modes: ["text"],
    durations: [5],
    resolutions: ["480p"],
    ratios: ALL_RATIOS,
    audio: false,
    watermark: false,
    note: "Бесплатный preview/fair-use маршрут.",
  },
  cliptaps: {
    id: "cliptaps",
    label: "ClipTaps",
    tier: "free",
    modes: ["text"],
    durations: [5],
    resolutions: ["720p"],
    ratios: ALL_RATIOS,
    audio: true,
    watermark: true,
    note: "Резервный daily-провайдер; результат может содержать watermark.",
  },
  h3: {
    id: "h3",
    label: "MalikVideo 1.0",
    tier: "pro",
    modes: ["text", "image"],
    durations: [5],
    resolutions: ["720p", "1080p", "2k"],
    ratios: ALL_RATIOS,
    audio: false,
    watermark: false,
    note: "Собственный MalikVideo: Text → Video и Image → Video.",
  },
  dashscope: {
    id: "dashscope",
    label: "Wan · DashScope",
    tier: "pro",
    modes: ["text"],
    durations: [5, 10],
    resolutions: ["480p", "720p", "1080p"],
    ratios: ALL_RATIOS,
    audio: false,
    watermark: false,
    note: "Alibaba Wan Text → Video.",
  },
  pollo: {
    id: "pollo",
    label: "Pollo AI",
    tier: "pro",
    modes: ["text"],
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    ratios: ALL_RATIOS,
    audio: false,
    watermark: false,
    note: "Pollo Text → Video.",
  },
  runway: {
    id: "runway",
    label: "Runway",
    tier: "pro",
    modes: ["text", "image", "video"],
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    ratios: ALL_RATIOS,
    audio: true,
    watermark: false,
    note: "Gen-4.5 Text/Image → Video и Omni/Seedance Video → Video.",
  },
  fal: {
    id: "fal",
    label: "fal.ai",
    tier: "pro",
    modes: ["text"],
    durations: [5, 10],
    resolutions: ["720p"],
    ratios: ALL_RATIOS,
    audio: false,
    watermark: false,
    note: "fal queue Text → Video.",
  },
  luma: {
    id: "luma",
    label: "Luma",
    tier: "pro",
    modes: ["text", "image", "video"],
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    ratios: ALL_RATIOS,
    audio: false,
    watermark: false,
    note: "Ray Text/Image → Video и Modify Video.",
  },
  veo: {
    id: "veo",
    label: "Google Veo",
    tier: "pro",
    modes: ["text"],
    durations: [5],
    resolutions: ["720p", "1080p"],
    ratios: ALL_RATIOS,
    audio: true,
    watermark: false,
    note: "Google Veo Text → Video.",
  },
}

export function videoCapability(id: VideoProviderId): MalikVideoCapability {
  return VIDEO_CAPABILITIES[id]
}

export function videoSupportsMode(id: VideoProviderId, mode: MalikVideoMode) {
  return VIDEO_CAPABILITIES[id].modes.includes(mode)
}

export function videoSupportsDuration(id: VideoProviderId, duration: 5 | 10) {
  return VIDEO_CAPABILITIES[id].durations.includes(duration)
}

export function videoSupportsResolution(id: VideoProviderId, resolution: VideoResolution) {
  return VIDEO_CAPABILITIES[id].resolutions.includes(resolution)
}

export function closestVideoDuration(id: VideoProviderId, requested: 5 | 10): 5 | 10 {
  const supported = VIDEO_CAPABILITIES[id].durations
  return supported.includes(requested) ? requested : supported[0]
}

export function closestVideoResolution(id: VideoProviderId, requested: VideoResolution): VideoResolution {
  const supported = VIDEO_CAPABILITIES[id].resolutions
  return supported.includes(requested) ? requested : supported[supported.length - 1]
}
