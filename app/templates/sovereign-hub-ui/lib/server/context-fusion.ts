import "server-only"

import { runMalikPlugin, type MalikPluginExecution, type MalikPluginSource } from "@/lib/server/plugin-runtime"

type FusionSource = MalikPluginSource

type ConnectorSpec = {
  id: string
  match: RegExp
}

const CONNECTORS: readonly ConnectorSpec[] = [
  { id: "github", match: /\bgithub\b|репозитор|repository|pull request|\bpr\b/iu },
  { id: "gitlab", match: /\bgitlab\b/iu },
  { id: "googledrive", match: /google\s*drive|гугл\s*драйв|\bdrive\b/iu },
  { id: "gmail", match: /\bgmail\b|почт|email|inbox|письм/iu },
  { id: "googlecalendar", match: /google\s*calendar|календар|calendar|meeting|встреч/iu },
  { id: "notion", match: /\bnotion\b/iu },
  { id: "slack", match: /\bslack\b/iu },
  { id: "teams", match: /microsoft\s*teams|\bteams\b/iu },
  { id: "outlook", match: /\boutlook\b/iu },
  { id: "onedrive", match: /\bonedrive\b|one\s*drive/iu },
  { id: "dropbox", match: /\bdropbox\b/iu },
  { id: "figma", match: /\bfigma\b/iu },
  { id: "asana", match: /\basana\b/iu },
  { id: "linear", match: /\blinear\b/iu },
  { id: "jira", match: /\bjira\b/iu },
  { id: "airtable", match: /\bairtable\b/iu },
]

function cleanPrompt(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2_000)
}

export function requestedFusionConnectors(promptValue: string) {
  const prompt = cleanPrompt(promptValue)
  return CONNECTORS
    .filter((item) => item.match.test(prompt))
    .map((item) => item.id)
    .slice(0, 4)
}

export async function collectMalikConnectedContext(promptValue: string) {
  const prompt = cleanPrompt(promptValue)
  const connectorIds = requestedFusionConnectors(prompt)
  if (!connectorIds.length) {
    return {
      requested: false,
      connectorIds: [] as string[],
      context: "",
      sources: [] as FusionSource[],
      executions: [] as MalikPluginExecution[],
    }
  }

  const executions = await Promise.all(
    connectorIds.map((id) => runMalikPlugin(id, prompt).catch((error): MalikPluginExecution => ({
      content: "### " + id + "\nConnected source failed: " + (error instanceof Error ? error.message : String(error)),
      provider: "plugin:" + id,
      model: "malik-plugin-runtime-v1.1",
      usedWeb: false,
      sources: [],
      attempts: [{ provider: id, model: "live-api", ok: false, error: error instanceof Error ? error.message : String(error) }],
      pluginId: id,
      pluginName: id,
    }))),
  )

  const usable = executions.filter((item) => item.connected !== false && item.content.trim())
  const sources = usable.flatMap((item) => item.sources || []).slice(0, 24)
  const context = usable.length
    ? [
        "[MALIK_CONNECTED_CONTEXT]",
        "This is private connected-account context explicitly requested by the user. Treat it as separate from open-web evidence.",
        ...usable.map((item) => [
          "SOURCE: " + item.pluginName + " (" + item.pluginId + ")",
          item.content.slice(0, 8_000),
        ].join("\n")),
        "[/MALIK_CONNECTED_CONTEXT]",
      ].join("\n\n").slice(0, 28_000)
    : ""

  return { requested: true, connectorIds, context, sources, executions }
}
