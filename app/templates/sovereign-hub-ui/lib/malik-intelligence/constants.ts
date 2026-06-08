import type { LaunchMetric } from "./types"

export const MALIK_FINAL_VERSION = "MALIK AI v1 Sovereign Final"

export const DEFAULT_HISTORY_WINDOW = 12
export const DEFAULT_TEXT_TIMEOUT_MS = 45_000
export const DEFAULT_IMAGE_TIMEOUT_MS = 95_000
export const DEFAULT_VIDEO_TIMEOUT_MS = 190_000
export const DEFAULT_CODE_TIMEOUT_MS = 90_000

export const LAUNCH_METRICS: LaunchMetric[] = [
  { label: "Creator Core", value: "Live", tone: "cyan" },
  { label: "Media Bridge", value: "Ready", tone: "violet" },
  { label: "Code Matrix", value: "2000+ targets", tone: "emerald" },
  { label: "Render Guard", value: "Safe", tone: "amber" },
]

export const SAFE_HISTORY_KEYS = {
  tasks: "malik_final_tasks_v1",
  generations: "malik_final_generations_v1",
  projects: "malik_final_projects_v1",
  artifacts: "malik_final_artifacts_v1",
}

