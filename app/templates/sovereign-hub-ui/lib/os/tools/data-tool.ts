import { parseCsv, profileMarkdown, profileTable, toTable } from "../data/table"
import { OsToolError } from "../failures"
import type { ToolDefinition } from "./contract"
import { LANGUAGE_NAME, clip, languageOf } from "./shared"

/**
 * Data analyst: reads a dataset artifact (a CSV or spreadsheet the person
 * uploaded), computes its statistics exactly, and asks the model to explain
 * only those numbers. Without a model the computed report is still returned,
 * marked as such.
 */
export const dataTool: ToolDefinition = {
  name: "data.analyze",
  label: "Анализирую данные",
  sideEffect: "none",
  timeoutMs: 180_000,
  async run(context) {
    const dataset = context.inputs.find((artifact) => artifact.kind === "dataset" && artifact.content)
    if (!dataset?.content) throw new OsToolError("NO_DATASET", "Нет файла с данными для анализа. Прикрепите CSV или XLSX.", { retryable: false })
    context.activity(`Читаю «${dataset.title}»`, 0.1)
    const table = toTable(parseCsv(dataset.content))
    if (!table.rows.length) throw new OsToolError("EMPTY_DATASET", "В файле нет строк с данными.", { retryable: false })
    context.activity(`Считаю статистику: ${table.rows.length} строк`, 0.35)
    const profile = profileTable(table)
    const computed = profileMarkdown(profile)
    const question = clip(String(context.task.input.question || context.flow.goal || ""), 1_500)
    const language = languageOf(question || dataset.title)
    let insights = ""
    let provider = "computed"
    try {
      context.activity("Объясняю, что показывают цифры", 0.6)
      const result = await context.deps.text({
        system: [
          "Ты — аналитик данных Malik AI. Тебе дали статистику, посчитанную программой точно.",
          "Объясни, что она показывает: главные выводы, аномалии, пропуски, связи, что проверить дальше.",
          "Используй ТОЛЬКО эти числа и названия столбцов. Ничего не досчитывай и не придумывай. Если данных для вывода мало — так и скажи.",
          `Язык — ${LANGUAGE_NAME[language]}. Markdown, разделы ## Главное, ## Детали, ## Что проверить.`,
        ].join(" "),
        prompt: `${question ? `ВОПРОС ПОЛЬЗОВАТЕЛЯ: ${question}\n\n` : ""}ФАЙЛ: ${dataset.title}\n\nСТАТИСТИКА:\n${computed}`,
        maxTokens: 2_500,
        temperature: 0.2,
        reasoningEffort: "medium",
        signal: context.signal,
      })
      insights = String(result.content || "").trim()
      provider = `${result.provider}/${result.model}`
    } catch (error) {
      if (context.signal.aborted) throw error
      insights = ""
    }
    const content = [
      `# Анализ: ${dataset.title}`,
      insights || "_Выводы модели сейчас недоступны — ниже точная статистика, посчитанная по файлу._",
      "## Статистика",
      computed,
    ].join("\n\n")
    return {
      provider,
      artifacts: [{
        projectId: context.project.id,
        kind: "analysis",
        title: `Анализ данных · ${clip(dataset.title, 80)}`,
        sourceTool: "data.analyze",
        sourceTask: context.task.id,
        content,
        summary: `${profile.rows} строк · ${profile.columns} столбцов`,
        links: [{ relation: "derived-from", artifactId: dataset.id }],
        metadata: { role: "data", profile, fallback: insights ? undefined : "computed-only" },
      }],
    }
  },
}
