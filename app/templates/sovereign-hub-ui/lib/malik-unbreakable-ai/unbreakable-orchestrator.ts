import { promptFirewall } from "./prompt-firewall"
import { directImage } from "./image-director"
import { directVideo } from "./video-director"
import { architectCode } from "./code-architect"
import { smartFallback } from "./smart-fallback"

export function orchestrateUnbreakable(prompt: string, kind: "chat" | "image" | "video" | "code" | "website" = "chat") {
  const firewall = promptFirewall(prompt)
  if (!firewall.ok) return smartFallback(kind, prompt, "Prompt blocked by firewall.")

  if (kind === "image") return { ok: true, kind, plan: directImage(firewall.clean), warnings: firewall.warnings }
  if (kind === "video") return { ok: true, kind, plan: directVideo(firewall.clean), warnings: firewall.warnings }
  if (kind === "code" || kind === "website") return { ok: true, kind, plan: architectCode(firewall.clean), warnings: firewall.warnings }

  return { ok: true, kind, answerPlan: firewall.clean, warnings: firewall.warnings }
}

