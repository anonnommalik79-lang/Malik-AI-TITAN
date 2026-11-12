import { citationName, subjectCitationUrl, type MalikCitation } from "@/lib/ai/citation-names"
import { isAbstractPhotoSubject, latinBrandTopic, referenceSearchTopic, type ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { isPublicReferenceUrl, referenceTitleScore, referenceContextMatches, type MalikVisualImage } from "./reference-catalog"

// A matching article title does not make the site's default OG cover a photo
// of that subject. Reject shared root assets and let the image search continue.
export function isGenericPageCover(path: string): boolean {
  try { path = decodeURIComponent(path) } catch {}
  return /(?:^|[/_.-])(?:logo|icon|favicon|1x1|pixel|spacer|blank|placeholder|default|og[-_]?image|social[-_]?(?:share|image))(?:[/_.-]|$)/iu.test(path)
    || /^(?:\/(?:assets|static|images|img|media))*\/(?:main|home|homepage|share|og|banner)\.(?:jpe?g|png|webp|avif)$/iu.test(path)
}

/** Page pictures are evidence-provided URLs, never model-authored image URLs.
 * The cited page must name the complete subject, including its model number. */
export function sourceReferencePhoto(plan: ReferenceVisualPlan, sources: readonly MalikCitation[] | null | undefined): MalikVisualImage | null {
  return sourceReferencePhotos(plan, sources, 1)[0] || null
}

/**
 * Up to `limit` photos from the articles the answer read, one per site and
 * never the same picture twice. Each links to its article.
 */
export function sourceReferencePhotos(plan: ReferenceVisualPlan, sources: readonly MalikCitation[] | null | undefined, limit = 4): MalikVisualImage[] {
  if (plan.kind === "tutorial" || plan.person || plan.logo || isAbstractPhotoSubject(plan.topic)) return []
  // «хиггсфиелд ии» is matched against articles about Higgsfield AI too.
  const names = [...new Set([plan.topic, referenceSearchTopic(plan.topic), latinBrandTopic(plan.topic) || ""].filter(Boolean))]
  const found: MalikVisualImage[] = []
  const hosts = new Set<string>()
  for (const source of (sources || []).slice(0, 40)) {
    if (found.length >= limit) break
    if (!source.image || /(?:\b(?:vs|versus|comparison|compare|top\s+\d+)\b|сравнени[ея]|сравниваем)/iu.test(source.title || "")) continue
    if (!referenceContextMatches(plan, (source.title || "") + " " + source.image)) continue
    if (!names.some((name) => {
      const url = subjectCitationUrl(name, [source])
      if (!url) return false
      let path = new URL(url).pathname
      try { path = decodeURIComponent(path) } catch {}
      return referenceTitleScore(name, `${source.title || ""} ${path}`) > 0
    })) continue
    try {
      const page = new URL(source.url), image = new URL(source.image)
      if (!isPublicReferenceUrl(page.href) || !isPublicReferenceUrl(image.href) || isGenericPageCover(image.pathname)) continue
      const host = page.hostname.replace(/^www\./u, "")
      if (hosts.has(host) || found.some((item) => item.url === image.href)) continue
      hosts.add(host)
      found.push({ url: image.href, alt: latinBrandTopic(plan.topic) || plan.topic, sourceUrl: page.href, credit: citationName(source) })
    } catch { /* An invalid preview must not hide the answer. */ }
  }
  return found
}
