import type { AIRequest } from "./types"

/**
 * The native OpenAI/Anthropic adapters must use the correct protocol for the
 * selected model. This module is pure: no credentials, I/O, tools or billing.
 * The main /api/stream model router is intentionally not modified here.
 */
const EFFORT = new Set(["low", "medium", "high", "xhigh", "max"])

function effortFrom(input: AIRequest): string | undefined {
  const value = input.metadata?.reasoningEffort
  return typeof value === "string" && EFFORT.has(value) ? value : undefined
}

function messagesFor(input: AIRequest) {
  return input.messages?.length ? input.messages : [{ role: "user" as const, content: input.prompt }]
}

export function usesOpenAIResponses(model: string): boolean {
  // GPT-5/6 reasoning and tool-capable models work best through Responses.
  // Do not route an older GPT-4.x chat model through a different API.
  return /^gpt-(?:5|6)(?:[.\-]|$)/i.test(model)
}

export function openAINativeRequest(input: AIRequest, model: string) {
  const messages = messagesFor(input)
  const maxTokens = input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600)
  if (usesOpenAIResponses(model)) {
    const effort = effortFrom(input)
    return {
      endpoint: "https://api.openai.com/v1/responses",
      body: {
        model,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: maxTokens,
        store: false, // Chat history already belongs to Malik; do not enable OpenAI storage.
        ...(effort ? { reasoning: { effort } } : {}),
      },
    }
  }
  return {
    endpoint: "https://api.openai.com/v1/chat/completions",
    body: {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: input.temperature ?? 0.35,
    },
  }
}

export function openAINativeOutput(payload: any, responses: boolean): string {
  if (responses) {
    if (payload?.status === "incomplete") {
      throw new Error(`OpenAI response incomplete: ${payload?.incomplete_details?.reason || "unknown"}`)
    }
    const direct = typeof payload?.output_text === "string" ? payload.output_text : ""
    const blocks = Array.isArray(payload?.output) ? payload.output : []
    const extracted = blocks.flatMap((item: any) => item?.type === "message" && Array.isArray(item?.content)
      ? item.content.filter((part: any) => part?.type === "output_text" && typeof part?.text === "string")
        .map((part: any) => part.text)
      : []).join("")
    const result = direct || extracted
    if (!result.trim()) throw new Error("OpenAI returned no visible text; tool-only and empty responses are not complete answers.")
    return result
  }
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== "string" || !content.trim()) throw new Error("OpenAI returned an empty chat answer.")
  if (payload?.choices?.[0]?.finish_reason === "length") throw new Error("OpenAI chat response exceeded the output limit.")
  return content
}

export function claudeNativeRequest(input: AIRequest, model: string) {
  const messages = messagesFor(input)
  // Anthropic accepts one top-level system field. Never lose later system instructions.
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n")
  const dialogue = messages.filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
  const modern = /^claude-(?:opus|sonnet|haiku|fable|mythos)-5(?:[.\-]|$)/i.test(model)
  const effort = effortFrom(input)
  return {
    model,
    ...(system ? { system } : {}),
    messages: dialogue.length ? dialogue : [{ role: "user", content: input.prompt }],
    max_tokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
    ...(modern ? { thinking: { type: "adaptive" } } : { temperature: input.temperature ?? 0.35 }),
    ...(modern && effort ? { output_config: { effort } } : {}),
  }
}

export function claudeNativeOutput(payload: any): string {
  if (payload?.stop_reason === "tool_use") {
    throw new Error("Claude requested a tool, but this native text adapter has no tool executor.")
  }
  if (payload?.stop_reason === "max_tokens") {
    throw new Error("Claude response exceeded the output limit; do not display it as complete.")
  }
  const content = Array.isArray(payload?.content) ? payload.content : []
  const text = content.filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text).join("")
  if (!text.trim()) throw new Error("Claude returned an empty text answer.")
  return text
}
