import { createMemoryChat, getMemoryMessages, saveMemoryMessage, upsertMemoryUser } from "./database"
import type { AIMessage } from "./types"
import { readGenerationHistory, upsertGenerationHistory, type GenerationHistoryItem } from "./history"

export type ProjectMemory = {
  projectId: string
  userId?: string
  title: string
  summary: string
  files?: string[]
  updatedAt: string
}

const projectMemory = new Map<string, ProjectMemory>()

export async function saveMessage(input: {
  userEmail?: string
  chatId?: string
  role: "system" | "user" | "assistant"
  content: string
  provider?: string
  model?: string
}) {
  const user = upsertMemoryUser(input.userEmail || "guest")
  const chat = input.chatId ? { id: input.chatId } : createMemoryChat(user.id, input.content.slice(0, 64) || "New chat")
  return saveMemoryMessage({
    chatId: chat.id,
    role: input.role,
    content: input.content,
    provider: input.provider,
    model: input.model,
  })
}

export async function getChatHistory(chatId: string, limit = 50): Promise<AIMessage[]> {
  return getMemoryMessages(chatId, limit).map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

export async function saveProjectMemory(input: ProjectMemory) {
  const next = { ...input, updatedAt: new Date().toISOString() }
  projectMemory.set(input.projectId, next)
  return next
}

export async function getProjectMemory(projectId: string) {
  return projectMemory.get(projectId) || null
}

export async function saveGeneration(item: GenerationHistoryItem) {
  // localStorage on browser, in-memory noop on server
  try {
    return upsertGenerationHistory(item)
  } catch {
    return [item]
  }
}

export async function getGenerationHistory() {
  try {
    return readGenerationHistory()
  } catch {
    return []
  }
}

export async function searchRelevantMemory(query: string, options?: { projectId?: string; limit?: number }) {
  const limit = options?.limit || 8
  const q = query.toLowerCase()
  const projects = [...projectMemory.values()]
    .filter((item) => !options?.projectId || item.projectId === options.projectId)
    .filter((item) => item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q))
    .slice(0, limit)

  return {
    query,
    results: projects.map((item) => ({
      type: "project",
      id: item.projectId,
      title: item.title,
      summary: item.summary,
      updatedAt: item.updatedAt,
    })),
  }
}

