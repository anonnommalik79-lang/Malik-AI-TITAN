/** Exact brand symbols, verified against Commons metadata on 2026-10-05.
 * No search, generated illustration, stock office or similarly named person.
 * Small raster thumbnails load directly; attribution stays with the answer. */
const BRANDS = [
  { names: ["chatgpt", "openai", "chatgpt — openai", "чатгпт", "чат гпт"], title: "ChatGPT · OpenAI",
    file: "6/66/OpenAI_logo_2025_%28symbol%29.svg/250px-OpenAI_logo_2025_%28symbol%29.svg.png", source: "OpenAI_logo_2025_(symbol).svg" },
  { names: ["claude", "claude ai", "claude (ai)", "claude (language model)", "claude — anthropic", "клод"], title: "Claude · Anthropic",
    file: "b/b0/Claude_AI_symbol.svg/250px-Claude_AI_symbol.svg.png", source: "Claude_AI_symbol.svg" },
  { names: ["github", "гитхаб"], title: "GitHub",
    file: "c/c2/GitHub_Invertocat_Logo.svg/250px-GitHub_Invertocat_Logo.svg.png", source: "GitHub_Invertocat_Logo.svg" },
] as const

export function referenceBrandAsset(topic: string) {
  const name = topic.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase()
  const brand = BRANDS.find((entry) => (entry.names as readonly string[]).includes(name))
  return brand ? { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/" + brand.file,
    alt: brand.title + " · логотип", sourceUrl: "https://commons.wikimedia.org/wiki/File:" + brand.source,
    credit: brand.title + " · Wikimedia Commons", role: "logo" as const } : null
}
