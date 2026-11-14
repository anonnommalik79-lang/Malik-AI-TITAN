export type ChatArchive = { archived: boolean; changedAt: number }

export function readChatArchive(value: unknown): ChatArchive | undefined {
  if (!value || typeof value !== "object") return undefined
  const { archived, changedAt } = value as Partial<ChatArchive>
  return typeof archived === "boolean" && typeof changedAt === "number" && Number.isSafeInteger(changedAt) && changedAt > 0
    ? { archived, changedAt } : undefined
}
