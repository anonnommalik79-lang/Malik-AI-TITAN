export async function persistChatExchange(input: {
  userEmail: string
  sessionId?: string
  title?: string
  userMessage: string
  assistantMessage: string
  provider?: string
}) {
  return {
    saved: false,
    reason: "client_workspace_persistence",
    sessionId: input.sessionId,
  }
}
