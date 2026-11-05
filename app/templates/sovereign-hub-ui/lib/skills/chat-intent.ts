import { skillInvocation } from "./registry"

export function skillChatRequest(body: Record<string, unknown>) {
  const prompt = String(body?.originalQuestion || body?.question || body?.prompt || body?.message || "").trim()
  const invocation = skillInvocation(prompt, body?.skillId || body?.selectedSkillId)
  const resume = /^(?:продолжи\s+задачу|resume\s+task|тапсырманы\s+жалғастыр)\s+(skill_[a-f0-9]{32})[.!]?$/iu.exec(prompt)
  if (!invocation && !resume) return null
  const history = Array.isArray(body?.history) ? body.history : Array.isArray(body?.messages) ? body.messages : []
  const previous = history.filter((m): m is { role: string; content: string } => Boolean(m && typeof m === "object" && (m as { role?: unknown }).role === "assistant" && typeof (m as { content?: unknown }).content === "string")).at(-1)?.content
  return { ...invocation, resumeId: resume?.[1], target: invocation?.skill === "malik.verify" ? invocation.prompt || previous : undefined }
}
