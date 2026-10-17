import type { ProjectFile } from "@/lib/work/code/files"

export const MODEL_PROMPT_LIMIT = 128_000
export const SOURCE_CONTEXT_LIMIT = 32_000
export function websiteModelPolicy(prompt: string) {
  const planning = prompt.startsWith("Return JSON only:")
  const repairing = prompt.startsWith("Repair only these proven source errors.")
  return { temperature: planning ? 0.65 : repairing ? 0.15 : 0.3, reasoningEffort: planning || repairing ? "high" as const : "medium" as const }
}

/** Bounded source selection instead of serializing the entire workspace into
 * every request. Focus files are never silently truncated. No global cache. */
export function sourceContext(files: ProjectFile[], focus: string[] = [], limit = SOURCE_CONTEXT_LIMIT) {
  const ordered = [...files].sort((a, b) => Number(focus.includes(b.path)) - Number(focus.includes(a.path)))
  const result: Array<{ path: string; content?: string; summary?: string; omittedChars?: number }> = []
  if (limit < 512) throw new Error("WEBSITE_MODEL_CONTEXT_LIMIT")
  let used = 512 // envelope, omission counters and explanatory note
  for (const file of ordered) {
    const focused = focus.includes(file.path)
    const full = { path: file.path, content: file.content }
    const fullSize = JSON.stringify(full).length + 1
    if (focused && used + fullSize > limit) throw new Error("WEBSITE_FOCUSED_SOURCE_LIMIT")
    if (used + fullSize <= limit - (focused ? 0 : 8000)) { result.push(full); used += fullSize; continue }
    const summary = { path: file.path, summary: file.content.slice(0, 180), omittedChars: Math.max(0, file.content.length - 180) }
    const size = JSON.stringify(summary).length + 1
    if (used + size > limit) break
    result.push(summary); used += size
  }
  return JSON.stringify({ files: result, omittedFiles: files.length - result.length, note: "Summaries are not complete files. Preserve files not explicitly targeted; use the design manifest for public exports/import contracts." })
}

export function boundedPrompt(parts: string[]) {
  const prompt = parts.join("\n\n")
  if (prompt.length > MODEL_PROMPT_LIMIT) throw new Error("WEBSITE_MODEL_CONTEXT_LIMIT")
  return prompt
}
