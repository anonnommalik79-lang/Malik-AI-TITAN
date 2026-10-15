/**
 * Shared quality contract for model-generated site artifacts.
 * These are instructions for the generator, not claims about runtime QA.
 * Applied in both the dedicated Sites studio and the generic artifact lane.
 */
export const SITE_VISUAL_QUALITY_RULES = [
  "VISUAL DESIGN QUALITY CONTRACT — prioritize a distinctive, finished product over generic templates.",
  "First identify the actual business category, product, audience, visual identity and requested locale. Honor explicit user design decisions; do not force a dark theme onto every site.",
  "DESKTOP HEADER: one intentional row with brand, up to 4–5 concise primary links and one primary CTA. Use flex/grid, gap, min-width:0 and white-space:nowrap for nav labels. Never let desktop navigation wrap into two or more rows; move overflow items into a real More/menu control instead.",
  "MOBILE HEADER: below the real available width switch to a working accessible menu button (aria-expanded, correct controls, keyboard and escape handling). Test mentally at widths 320, 375, 768 and 1440px; no sideways page scrolling or cropped CTAs.",
  "HERO: a specific H1 with a clear customer benefit, one concise supporting paragraph, one prominent CTA and optional meaningful secondary action. Give the text breathing room with a deliberate grid and consistent spacing.",
  "AI / SaaS / developer products: showcase the product itself with a well-designed CSS/SVG interface mock, dashboard, code/editor, flow visualization or clearly labeled conceptual product preview. Do not use generic office meetings, random people, skyscrapers, abstract stock brains or unrelated nature photos in the hero.",
  "Real-world venues such as salons, clinics, hotels or restaurants: use imagery depicting the actual service or environment; if no verified licensed image is available, create a tasteful CSS/SVG visual or labeled placeholder rather than linking to an arbitrary stock image or unreliable image endpoint.",
  "VISUAL SYSTEM: coherent colors (including contrast), typography with responsive clamp sizes, strong content hierarchy, 8px-based spacing, intentional section rhythm, restrained motion respecting prefers-reduced-motion, polished hover/focus states and accessible controls.",
  "CONTENT INTEGRITY: never invent prices, testimonials, customers, certifications, investors, response speeds, addresses, phone numbers or technical guarantees. When required data is missing, omit the claim or use an explicitly labeled editable example; avoid example.com, pretend locations and fake contact links presented as real.",
  "FUNCTIONALITY: every nav anchor must target a real section or route, every displayed button must do something meaningful, and forms should not pretend to submit without a real endpoint. Avoid decorative clickable elements that do nothing.",
  "Before returning HTML, privately self-review the header, hero relevance, image reliability, contrast, viewport, spacing, mobile navigation, CTAs and claims. Fix obvious issues in the HTML before finalizing. Output only the requested artifact, with no review commentary.",
].join("\n")
