export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.MALIK_MODEL_HEALTH_RUN_ON_BOOT !== "true") return

  const { MALIK_MODELS } = await import("@/lib/ai/malik-models")
  const { runStrictMalikModel } = await import("@/lib/server/malik-model-router")
  const { runMalikCoderOrchestrator } = await import("@/lib/server/malik-coder-orchestrator")

  setTimeout(() => {
    void (async () => {
      console.info("[MALIK_HEALTH_PROBE]", JSON.stringify({ stage: "start", count: MALIK_MODELS.length }))

      for (const model of MALIK_MODELS) {
        const started = Date.now()
        let primaryOk = false
        let userPathOk = false
        let primaryProvider: string = model.provider
        let primaryModel: string = model.providerModel
        let primaryError = ""
        let userPathProvider = ""
        let userPathModel = ""
        let userPathError = ""

        try {
          if (model.id === "malik-coder-32b") {
            const result = await runMalikCoderOrchestrator({
              prompt: "Reply with exactly OK.",
              systemPrompt: "Health probe. Reply with exactly OK.",
              maxTokens: 512,
              temperature: 0,
            })
            primaryOk = Boolean(result.content.trim())
            userPathOk = primaryOk
            primaryProvider = result.provider
            primaryModel = result.model
            userPathProvider = result.provider
            userPathModel = result.model
          } else {
            const result = await runStrictMalikModel({
              modelId: model.id,
              prompt: "Reply with exactly OK.",
              systemPrompt: "Health probe. Reply with exactly OK.",
              maxTokens: 512,
              temperature: 0,
            }, { allowFallback: false })
            primaryOk = Boolean(result.content.trim())
            userPathOk = primaryOk
            primaryProvider = result.provider
            primaryModel = result.model
            userPathProvider = result.provider
            userPathModel = result.model
          }
        } catch (error) {
          primaryError = error instanceof Error ? error.message : String(error)
        }

        if (!userPathOk && model.id !== "malik-coder-32b") {
          try {
            const result = await runStrictMalikModel({
              modelId: model.id,
              prompt: "Reply with exactly OK.",
              systemPrompt: "Health probe. Reply with exactly OK.",
              maxTokens: 512,
              temperature: 0,
            })
            userPathOk = Boolean(result.content.trim())
            userPathProvider = result.provider
            userPathModel = result.model
          } catch (error) {
            userPathError = error instanceof Error ? error.message : String(error)
          }
        }

        console.info("[MALIK_HEALTH_PROBE]", JSON.stringify({
          stage: "model",
          id: model.id,
          label: model.label,
          primaryOk,
          primaryProvider,
          primaryModel,
          primaryError: primaryError.slice(0, 220),
          userPathOk,
          userPathProvider,
          userPathModel,
          userPathError: userPathError.slice(0, 220),
          tookMs: Date.now() - started,
        }))

        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      console.info("[MALIK_HEALTH_PROBE]", JSON.stringify({ stage: "done" }))
    })().catch((error) => {
      console.error("[MALIK_HEALTH_PROBE]", JSON.stringify({ stage: "fatal", error: error instanceof Error ? error.message : String(error) }))
    })
  }, 3500)
}
