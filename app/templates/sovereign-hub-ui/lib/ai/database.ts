export type DatabaseStatus = {
  configured: boolean
  mode: "postgres" | "supabase" | "memory"
  message: string
}

export type DbUser = {
  id: string
  email: string
  name?: string
  plan: "free" | "pro" | "ultra" | "owner"
  createdAt: string
}

export type DbChat = {
  id: string
  userId: string
  title: string
  createdAt: string
}

export type DbMessage = {
  id: string
  chatId: string
  role: "system" | "user" | "assistant"
  content: string
  provider?: string
  model?: string
  createdAt: string
}

const memory = {
  users: new Map<string, DbUser>(),
  chats: new Map<string, DbChat>(),
  messages: new Map<string, DbMessage[]>(),
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function databaseStatus(): DatabaseStatus {
  const databaseUrl = Boolean(process.env.DATABASE_URL?.trim())
  const supabaseUrl = Boolean(process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())
  const serviceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())

  if (databaseUrl) return { configured: true, mode: "postgres", message: "DATABASE_URL configured." }
  if (supabaseUrl) return { configured: serviceRole, mode: "supabase", message: serviceRole ? "Supabase server runtime configured." : "Identity URL configured. Service role is still required on the server for persistent admin operations." }
  return { configured: false, mode: "memory", message: "DATABASE_URL missing. Using safe in-memory dev mode." }
}

export function upsertMemoryUser(email: string, name?: string, plan: DbUser["plan"] = "free") {
  const normalized = email.trim().toLowerCase() || "guest"
  const existing = memory.users.get(normalized)
  const next: DbUser = existing || {
    id: id("user"),
    email: normalized,
    name,
    plan,
    createdAt: new Date().toISOString(),
  }
  next.name = name || next.name
  next.plan = plan || next.plan
  memory.users.set(normalized, next)
  return next
}

export function createMemoryChat(userId: string, title = "New chat") {
  const chat: DbChat = { id: id("chat"), userId, title, createdAt: new Date().toISOString() }
  memory.chats.set(chat.id, chat)
  return chat
}

export function saveMemoryMessage(input: Omit<DbMessage, "id" | "createdAt">) {
  const message: DbMessage = { ...input, id: id("msg"), createdAt: new Date().toISOString() }
  const list = memory.messages.get(input.chatId) || []
  list.push(message)
  memory.messages.set(input.chatId, list.slice(-200))
  return message
}

export function getMemoryMessages(chatId: string, limit = 50) {
  return (memory.messages.get(chatId) || []).slice(-limit)
}

export function listMemoryChats(userId: string) {
  return [...memory.chats.values()].filter((chat) => chat.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

