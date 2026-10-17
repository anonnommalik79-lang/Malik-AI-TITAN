import type { ProjectFile } from "@/lib/work/code/files"
import type { Asset, Design } from "./types"
import { stripMediaPolicy } from "./resources"

export type ExperienceIssue = { file: string; code: string; message: string }
const isSource = (path: string) => /\.(?:html?|[jt]sx?|css)$/.test(path)
function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:["']([^"']*)["']|\\{\\s*["']([^"']*)["']\\s*\\})`, "i"))
  return match ? match[1] ?? match[2] : undefined
}

/** Cheap source evidence, NOT a subjective design score or browser test. Every
 * error names a concrete file and repairable defect. No generated code runs. */
export function auditExperience(files: ProjectFile[], assets: Asset[], design?: Design) {
  const errors: ExperienceIssue[] = [], observations: string[] = []
  const source = files.filter(file => isSource(file.path))
  const joined = source.map(file => stripMediaPolicy(file.content)).join("\n")
  const known = new Set(assets.flatMap(asset => [asset.url, asset.poster].filter((url): url is string => Boolean(url))))
  const issue = (file: string, code: string, message: string) => { if (errors.length < 24) errors.push({ file, code, message }) }
  let autoplay = 0, mediaElements = 0, controls = 0
  for (const file of source) {
    const text = stripMediaPolicy(file.content).replace(/<!--[\s\S]*?-->/g, "")
    if (/\.(?:html?|[jt]sx?)$/.test(file.path)) {
      if (/\.html?$/.test(file.path) && !/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(text)) issue(file.path, "MOBILE_VIEWPORT_MISSING", "Add a device-width viewport for this real document; do not hide overflow to conceal a broken layout.")
      for (const match of text.matchAll(/<(?:img|Image|video|source)\b[^>]*>/g)) {
        const tag = match[0], video = /^<video\b/i.test(tag)
        if (!/^<source\b/i.test(tag)) mediaElements++
        for (const name of ["src", "poster"]) {
          const url = attribute(tag, name)
          if (url && /^(?:https?:)?\/\//i.test(url) && !known.has(url.replace(/&amp;/g, "&"))) issue(file.path, "UNVERIFIED_RENDERED_MEDIA", `Use an exact verified asset URL for ${name}, not a fabricated/unverified remote URL: ${url.slice(0, 180)}`)
          if (url && /^data:(?:image|video)\//i.test(url) && url.length > 4096) issue(file.path, "EMBEDDED_MEDIA_BUDGET", "Do not embed large base64 media in source; use verified external CDN assets.")
        }
        if (/^<(?:img|Image)\b/.test(tag) && !/\balt\s*=/.test(tag)) issue(file.path, "IMAGE_ALT_MISSING", "Provide meaningful alt text, or empty alt for an explicitly decorative image.")
        if (video) {
          if (/\bautoplay(?:\s|=|\/?>)/i.test(tag) && !/\bautoplay\s*=\s*(?:["']false["']|\{false\})/i.test(tag)) {
            autoplay++
            if (!/\bmuted\b/i.test(tag) || /\bmuted\s*=\s*\{false\}/i.test(tag) || !/\bplaysinline\b/i.test(tag) || /\bplaysinline\s*=\s*\{false\}/i.test(tag)) issue(file.path, "UNSAFE_VIDEO_AUTOPLAY", "Autoplay must be muted and playsInline, with an ordinary user-play fallback.")
          }
          const preload = attribute(tag, "preload")
          if (!preload || !/^(?:none|metadata)$/i.test(preload)) issue(file.path, "VIDEO_EAGER_DOWNLOAD", "Use preload=none or metadata; load/play on intent or visibility, never eagerly load every video.")
        }
      }
      for (const match of text.matchAll(/<a\b[^>]*>/gi)) if (attribute(match[0], "href") === "#" && !/\bonclick\s*=/i.test(match[0])) issue(file.path, "DEAD_PRIMARY_LINK", "Replace href=# with an actual section/page or a working button; do not invent a destination.")
      controls += [...text.matchAll(/<(?:button|input|select|textarea)\b/gi)].length
    }
    if (/lorem ipsum|your (?:company|brand) name|insert (?:your )?(?:content|image) here/i.test(text)) issue(file.path, "GENERIC_PLACEHOLDER_COPY", "Replace starter copy with concrete content from the user brief; do not invent customers or evidence.")
    if (/\.css$/.test(file.path)) for (const match of text.matchAll(/(?:background(?:-image)?|mask(?:-image)?)\s*:[^;{}]*?url\(\s*["']?((?:https?:)?\/\/[^\s)"']+)/g)) if (!known.has(match[1])) issue(file.path, "UNVERIFIED_CSS_MEDIA", `Use verified media in CSS: ${match[1].slice(0, 180)}`)
  }
  if (autoplay > 1) issue(source.find(file => /<video\b/i.test(file.content))!.path, "TOO_MANY_AUTOPLAY_VIDEOS", "Allow at most one autoplay hero; other videos need intent/visibility-based loading.")
  const animated = source.find(file => /@keyframes|requestAnimationFrame\s*\(|animation\s*:\s*[^;]*(?:infinite|\d+m?s)/i.test(stripMediaPolicy(file.content)))
  if (animated && !/prefers-reduced-motion/.test(joined)) issue(animated.path, "REDUCED_MOTION_MISSING", "Provide prefers-reduced-motion handling with a still, usable fallback.")
  if (/requestAnimationFrame\s*\(/.test(joined)) {
    const path = source.find(file => /requestAnimationFrame\s*\(/.test(file.content))!.path
    if (!/cancelAnimationFrame\s*\(/.test(joined)) issue(path, "RAF_CLEANUP_MISSING", "Cancel the animation loop on teardown; do not create accumulating loops.")
    if (!/visibilitychange|IntersectionObserver/.test(joined)) issue(path, "HIDDEN_ANIMATION_RUNNING", "Pause/resume the loop when hidden/offscreen, preserving ordinary interaction.")
  }
  if (design?.interactions.length && !controls && !/<a\b/.test(joined)) observations.push("No native control/link found for the planned interactions; requires browser verification.")
  if (design?.mediaQueries.length) {
    const file = source.find(file => /\.(?:html?|[jt]sx?)$/.test(file.path))?.path || "project"
    if (assets.some(asset => asset.kind === "image") && !/<(?:img|Image)\b|background(?:Image|-image)|background\s*:[^;{}]*url\(|createElement\s*\(\s*["']img/.test(joined)) issue(file, "PLANNED_PHOTO_NOT_RENDERED", "Verified photographs exist but no image/background render surface was found. Render them in the requested sections; an unrelated SVG/canvas is not a photograph.")
    if (assets.some(asset => asset.kind === "video") && !/<video\b|createElement\s*\(\s*["']video/.test(joined)) issue(file, "PLANNED_VIDEO_NOT_RENDERED", "Verified video exists but no video render surface was found. Add the requested real video with a poster and user playback, not just its source link.")
  }
  observations.push(`Static evidence: ${mediaElements} media elements, ${controls} native controls. Dynamic behavior, visual quality, contrast and mobile overflow require browser verification, not a source PASS.`)
  return { errors, observations }
}
