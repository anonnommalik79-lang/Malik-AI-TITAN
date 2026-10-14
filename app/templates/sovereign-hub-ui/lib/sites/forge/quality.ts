/**
 * Malik Site Forge — the review a site must pass before anyone sees it.
 *
 * Deterministic checks on the finished HTML: every page the menu links to
 * exists, every in-site link lands on a real page, there are no alert()
 * dialogs, placeholders or "lorem", images have descriptions, forms have
 * labels, the phone layout has a menu button, the basket and booking are
 * wired to the code that runs them, and the page is a complete document.
 * It runs on any HTML, so the chat can also review sites the model wrote.
 */

export type QualityIssue = { code: string; message: string }
export type QualityReport = { ok: boolean; score: number; issues: QualityIssue[]; checks: number }

const PLACEHOLDER = /lorem ipsum|placeholder text|заглушк|\bTODO\b|google maps placeholder|карта\s*\(|ваш текст|your text here|coming soon/iu

export function reviewSiteHtml(html: string): QualityReport {
  const issues: QualityIssue[] = []
  let checks = 0
  const check = (ok: boolean, code: string, message: string) => { checks += 1; if (!ok) issues.push({ code, message }) }
  const visible = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "")
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n")

  check(/^<!doctype html>/i.test(html.trim()), "DOCTYPE", "the page must start with <!doctype html>")
  check(/<meta[^>]+name="viewport"/i.test(html), "VIEWPORT", "a mobile viewport is required")
  check(/<html[^>]+lang="/i.test(html), "LANG", "the page language must be declared")
  check(/<title>[^<]{3,}<\/title>/i.test(html), "TITLE", "the page needs a title")
  check(!/\balert\s*\(/.test(scripts.replace(/window\.alert\s*=\s*function/g, "")), "ALERT", "alert() dialogs instead of real feedback")
  check(!PLACEHOLDER.test(visible), "PLACEHOLDER", "placeholder text left on the page")

  const pages = new Set([...html.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]))
  const links = [...html.matchAll(/href="#\/([^"?]*)/g)].map((match) => match[1] || "home")
  check(pages.size >= 4, "PAGES", `only ${pages.size} pages; a full site needs at least four`)
  const broken = [...new Set(links.filter((link) => !pages.has(link)))]
  check(!broken.length, "BROKEN_LINK", `links to pages that do not exist: ${broken.join(", ")}`)
  const anchors = [...new Set([...visible.matchAll(/href="#([a-z][\w-]*)"/gi)].map((match) => match[1]))]
  const missingAnchors = anchors.filter((id) => !new RegExp(`id="${id}"`).test(html))
  check(!missingAnchors.length, "BROKEN_ANCHOR", `links to missing sections: ${missingAnchors.join(", ")}`)
  const dead = [...visible.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]).filter((tag) => /href="#"/.test(tag) && !/data-href=/.test(tag))
  check(!dead.length, "DEAD_LINK", `${dead.length} links that go nowhere`)

  const images = [...visible.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0])
  check(images.every((tag) => /\balt="/.test(tag)), "IMG_ALT", "every image needs a description")
  check(images.every((tag) => !/src="(?:https?:\/\/)?(?:via\.placeholder|placehold|dummyimage)/i.test(tag)), "IMG_PLACEHOLDER", "placeholder image services")

  const inputs = [...visible.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)].filter((match) => !/type="hidden"/.test(match[2]))
  const unlabeled = inputs.filter((match) => {
    const id = /\bid="([^"]+)"/.exec(match[2])?.[1]
    return !/aria-label=/.test(match[2]) && !(id && new RegExp(`for="${id}"`).test(visible))
  })
  check(!unlabeled.length, "FORM_LABEL", `${unlabeled.length} form fields without a label`)

  check(/data-menu-toggle|class="[^"]*burger/.test(visible), "MOBILE_MENU", "no menu button for phones")
  if (/data-add=/.test(visible)) check(/data-cart\b/.test(visible) && /data-checkout-form/.test(visible) && /data-add/.test(scripts), "CART", "add-to-basket buttons without a working basket")
  if (/data-booking\b/.test(visible)) check(/data-booking-done/.test(visible) && /data-booking/.test(scripts), "BOOKING", "a booking form without a confirmation")
  check(!/<iframe[^>]+src="(?!https:\/\/)/i.test(visible), "IFRAME", "embedded frames must be https")
  check(html.length < 400_000, "SIZE", "the page is too heavy")

  const score = Math.round(100 * (checks - issues.length) / Math.max(1, checks))
  return { ok: issues.length === 0, score, issues, checks }
}
