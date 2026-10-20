import { primaryNonMediaArtifact } from "@/lib/ai/artifact-intent"
import { websiteIntent } from "./engine/intent"
import { explicitlyRequestsPackagedProject } from "@/lib/chat-code-routing"

export function websiteNeedsPackagedBuild(prompt: string) {
  return explicitlyRequestsPackagedProject(prompt)
    || /(?<![\p{L}\p{N}])(?:react|next\.?js|vue|nuxt|angular|svelte|typescript|php|laravel|django|flask|node\.?js|express|vite|astro|backend|бэкенд|бекенд|database|full[- ]?stack|репозитор\p{L}*|github)(?![\p{L}\p{N}])/iu.test(prompt)
}

/** Design decisions, never rendered HTML. The selected model remains the author. */
export function chatArtDirection(prompt: string) {
  const primary = primaryNonMediaArtifact(prompt)
  if (primary && primary !== "website" && primary !== "code") return null
  if (websiteIntent(prompt) !== "create") return null
  const noMedia = /без\s+(?:любых\s+)?(?:медиа|фото|изображени|картин)|(?:no|without)\s+(?:any\s+)?(?:media|photos?|images?)/iu.test(prompt)
  const noMotion = /без\s+(?:(?:фото|видео|картинок|изображений|эффектов)[,\s]*(?:и\s+)?){0,4}(?:анимаци|движени|3d)|(?:no|without)\s+(?:motion|animation|3d)|static\s+only/iu.test(prompt)
  const offline = /без\s+(?:интернета|сети|поиска|внешних\s+запросов)|(?:no|without)\s+(?:web|internet|search)|offline|local\s+only/iu.test(prompt)
  const video = !noMedia && /(?:видео|\bvideo\b)/iu.test(prompt) && !/без\s+видео|(?:no|without)\s+video/iu.test(prompt)
  let profile = "adaptive", composition = "Invent a composition from the exact brief. Choose hierarchy, negative space, subject imagery and a useful interaction before coding; not an interchangeable SaaS card template."
  let interaction = "One complete subject-specific explorer, comparison or detail interaction with keyboard/touch support; ordinary navigation works without animation."
  let queries: string[] = []
  if (/недвижим|вилл|real\s*estate|propert|villas?|luxury\s+homes?/iu.test(prompt)) {
    profile = "property-cinematic"
    composition = "Architecture-led opening: dominant architectural photograph, restrained typography over a readable scrim, warm framed or full-bleed composition; the search bar is a real control, not decoration. Follow with unequal property/editorial sections, not a generic feature grid."
    interaction = "Property location/type/price filters update coherent labelled sample listings; show empty state and reset. Open a real detail panel with focus return. Do not present stock photos as verified available listings."
    queries = ["luxury modern villa exterior architecture sunset", "modern house architecture exterior garden", "contemporary villa interior living room"]
  } else if (/одежд|мод[аыуе]|fashion|wear|apparel|boutique|clothing/iu.test(prompt)) {
    profile = "fashion-editorial"
    composition = "Fashion editorial: art-directed portrait/full-bleed textile imagery, quiet overlay navigation, expressive oversized sans plus restrained italic serif accents when appropriate. Product photography has intentional crops and generous whitespace; avoid dashboard styling."
    interaction = "Working category/size/colour selection and local cart quantity/remove/total/empty states. Label sample products/prices and demo checkout; never pretend an order/payment was submitted."
    queries = ["fashion editorial coat portrait", "black jacket product clothing", "blazer clothing product photography"]
  } else if (/3d|webgl|spline|тр[её]хмер|интерактивн.*дизайн|design\s+platform/iu.test(prompt)) {
    profile = "immersive-product"
    composition = "Original interactive product stage: a controlled procedural CSS/Canvas/WebGL scene with depth/material/lighting and clear oversized type. The scene supports the product story and never obscures the CTA. Do not copy Spline branding, its exact shapes or its mascot; do not substitute unrelated stock photography."
    interaction = "Pointer/touch drag or an accessible control changes an actual scene parameter. Keep a static 2D fallback, cap DPR at 1.5, one RAF loop, pause when hidden, clean up listeners, and honour reduced-motion. No required heavy external 3D dependency."
  } else if (/отел|hotel|resort|ресторан|restaurant|кофейн|coffee|кафе|cafe/iu.test(prompt)) {
    profile = "hospitality-editorial"
    composition = "Immersive subject photography, warm editorial spacing and a restrained display face. Build a recognisable venue narrative with a real menu/room explorer, not identical marketing cards."
    interaction = "Useful room/menu filtering and a labelled local enquiry/booking demonstration; no fake reservation confirmation or fabricated address."
    queries = /отел|hotel|resort/iu.test(prompt) ? ["boutique hotel architecture exterior", "boutique hotel room interior"] : ["restaurant cafe interior", "restaurant food dish photography"]
  } else if (/магазин|shop|commerce|store|каталог/iu.test(prompt)) {
    profile = "commerce-catalog"
    composition = "Lead with the actual product/category and a clear merchandising hierarchy. Use distinct editorial and catalogue rhythms, not three repeated benefit cards."
    interaction = "Search/filter/sort meaningful local sample data, product detail, variant state and working cart totals; honest demo checkout."
    // An unspecified store is not permission to choose unrelated stock products.
  }
  // A fictional/extreme setting changes provenance, not just the colour of
  // an ordinary Earth venue. Never pass unrelated resort stock as its photo.
  const spaceSetting = /\b(?:moon|lunar|mars|martian|orbital|space\s+hotel)\b|лунн|на\s+луне|марсиан|на\s+марсе|орбитальн/iu.test(prompt)
  if (spaceSetting && queries.length) {
    const mars = /mars|martian|марс/iu.test(prompt)
    queries = [mars ? "NASA Mars planet landscape scientific photograph" : "NASA Moon lunar surface Apollo photograph", "space habitat interior architectural concept visualization"]
    composition += " This is a space/concept project: clearly distinguish scientific imagery and architectural concepts from photographs of a real operating venue."
  }
  if (noMedia || offline) queries = []
  const slots = queries.map((query, index) => ({ slot: index ? `detail-${index}` : "hero", kind: "image" as const, query }))
  const mediaQueries: Array<{ slot: string; kind: "image" | "video"; query: string }> = [...slots]
  if (video && queries.length) mediaQueries.push({ slot: "motion", kind: "video", query: queries[0] })
  return { profile, composition, interaction, noMedia, noMotion, offline, spaceSetting, mediaQueries }
}
