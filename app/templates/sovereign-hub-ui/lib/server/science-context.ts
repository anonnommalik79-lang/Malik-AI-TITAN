import "server-only"

import { runMalikPlugin, type MalikPluginSource } from "@/lib/server/plugin-runtime"

const SCIENCE_SOURCES = ["arxiv", "pubmed", "semanticscholar", "openalex", "crossref"] as const

export async function collectMalikScienceContext(promptValue: string) {
  const prompt = String(promptValue || "").replace(/\s+/g, " ").trim().slice(0, 2_000)
  if (!prompt) return { context: "", sources: [] as MalikPluginSource[], providers: [] as string[] }

  const executions = await Promise.all(
    SCIENCE_SOURCES.map(async (id) => {
      try {
        return await runMalikPlugin(id, prompt)
      } catch {
        return null
      }
    }),
  )

  const usable = executions.filter((item): item is NonNullable<typeof item> => Boolean(item && item.content))
  const sources = usable.flatMap((item) => item.sources || []).slice(0, 32)
  const blocks = usable
    .filter((item) => item.content && !/Не удалось выполнить живой запрос/i.test(item.content))
    .map((item) => "SOURCE " + item.pluginName + ":\n" + item.content.slice(0, 6_000))

  const context = blocks.length
    ? [
        "[MALIK_SCIENCE_EVIDENCE]",
        "Scholarly discovery results. Distinguish preprints from peer-reviewed evidence and preserve study limitations.",
        ...blocks,
        "[/MALIK_SCIENCE_EVIDENCE]",
      ].join("\n\n").slice(0, 28_000)
    : ""

  return {
    context,
    sources,
    providers: usable.map((item) => item.pluginId),
  }
}
