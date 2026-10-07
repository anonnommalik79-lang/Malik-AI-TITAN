import { citationName, subjectCitationUrl, type MalikCitation } from "@/lib/ai/citation-names"
import { isAbstractPhotoSubject, referenceSearchTopic, type ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { referenceTitleScore, type MalikVisualImage } from "./reference-catalog"

/** Page pictures are evidence-provided URLs, never model-authored image URLs.
 * The cited page must name the complete subject, including its model number. */
export function sourceReferencePhoto(plan: ReferenceVisualPlan, sources: readonly MalikCitation[] | null | undefined): MalikVisualImage | null {
  if (plan.kind === "tutorial" || plan.person || plan.logo || isAbstractPhotoSubject(plan.topic)) return null
  const names = [...new Set([plan.topic, referenceSearchTopic(plan.topic)])]
  for (const source of (sources || []).slice(0, 40)) {
    if (!source.image || /(?:\b(?:vs|versus|comparison|compare|top\s+\d+)\b|сравнени[ея]|сравниваем)/iu.test(source.title || "")) continue
    if (!names.some((name) => {
      const url = subjectCitationUrl(name, [source])
      if (!url) return false
      let path = new URL(url).pathname
      try { path = decodeURIComponent(path) } catch {}
      return referenceTitleScore(name, `${source.title || ""} ${path}`) > 0
    })) continue
    try {
      const page = new URL(source.url), image = new URL(source.image)
      const host = image.hostname.toLowerCase()
      if (page.protocol !== "https:" || image.protocol !== "https:" || image.username || image.password || page.username || page.password
        || image.href.length > 1500 || image.port && image.port !== "443"
        || !host.includes(".") || /^[\d.]+$/u.test(host) || host.includes(":")
        || /(?:^|\.)(?:localhost|local|internal|lan)$/u.test(host)
        || /(?:^|[/_.-])(?:logo|icon|favicon|1x1|pixel|spacer|blank)(?:[/_.-]|$)/iu.test(image.pathname)) continue
      return { url: image.href, alt: plan.topic, sourceUrl: page.href, credit: citationName(source) }
    } catch { /* An invalid preview must not hide the answer. */ }
  }
  return null
}
