export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.MALIK_MODEL_HEALTH_RUN_ON_BOOT !== "true") return

  const { MALIK_MODELS } = await import("@/lib/ai/malik-models")
  const { runStrictMalikModel } = await import("@/lib/server/malik-model-router")
  const { runMalikCoderOrchestrator } = await import("@/lib/server/malik-coder-orchestrator")

  const prompt = [
    "Write a complete single-file HTML app.",
    "Requirements: accessible counter UI, increment/decrement/reset buttons, keyboard shortcuts, localStorage persistence, responsive CSS, no external libraries.",
    "Return the complete runnable HTML code. Do not use TODOs or placeholders.",
  ].join(" ")

  setTimeout(() => {
    void (async () => {
      console.info("[MALIK_CODE_PROBE]", JSON.stringify({ stage: "start", count: MALIK_MODELS.length }))
      for (const model of MALIK_MODELS) {
        const started = Date.now()
        try {
          const result = model.id === "malik-coder-32b"
            ? await runMalikCoderOrchestrator({
                prompt,
                systemPrompt: "Production code stress probe. Finish the requested runnable code.",
                maxTokens: 1800,
                temperature: 0.05,
              })
            : await runStrictMalikModel({
                modelId: model.id,
                prompt,
                systemPrompt: "Production code stress probe. Finish the requested runnable code.",
                maxTokens: 1800,
                temperature: 0.05,
              })

          const text = String(result.content || "")
          const htmlClosed = /<\/html>/i.test(text)
          const hasScript = /<script[\s>]/i.test(text) && /<\/script>/i.test(text)
          const hasLocalStorage = /localStorage/i.test(text)
          const noTodo = !/\bTODO\b|placeholder|rest omitted/i.test(text)
          const complete = Boolean(text.trim()) && htmlClosed && hasScript && hasLocalStorage && noTodo
          console.info("[MALIK_CODE_PROBE]", JSON.stringify({
            stage: "model",
            id: model.id,
            ok: Boolean(text.trim()),
            complete,
            provider: result.provider,
            providerModel: result.model,
            length: text.length,
            htmlClosed,
            hasScript,
            hasLocalStorage,
            noTodo,
            tookMs: Date.now() - started,
          }))
        } catch (error) {
          console.error("[MALIK_CODE_PROBE]", JSON.stringify({
            stage: "model",
            id: model.id,
            ok: false,
            complete: false,
            error: error instanceof Error ? error.message : String(error),
            tookMs: Date.now() - started,
          }))
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      console.info("[MALIK_CODE_PROBE]", JSON.stringify({ stage: "done" }))
    })().catch((error) => console.error("[MALIK_CODE_PROBE]", JSON.stringify({ stage: "fatal", error: error instanceof Error ? error.message : String(error) })))
  }, 4000)
}
