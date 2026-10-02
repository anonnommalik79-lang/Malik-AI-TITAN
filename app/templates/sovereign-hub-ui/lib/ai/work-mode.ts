import { buildChatArtifactSkillPrompt } from "./chat-artifact-skills"

export type WorkspaceMode = "chat" | "work"
export const WORKSPACE_MODE_KEY = "malik_workspace_mode_v1"

export function resolveWorkspaceMode(value: unknown): WorkspaceMode {
  return value === "work" ? "work" : "chat"
}

/** Work changes the deliverable contract, never the user's visible prompt. */
export function workModeInstruction(prompt: string, mode: WorkspaceMode): string {
  if (mode !== "work") return ""
  return [
    "[MALIK_WORK_MODE]",
    "Complete the user's task through to a reviewable result. Use the supplied files and conversation context; follow the requested language, format and constraints.",
    "For substantial tasks, give a brief practical plan, then produce the finished deliverable. For simple questions, answer directly without an artificial plan or unnecessary file.",
    "Do the authorized work instead of offering to do it later. Ask only for missing information that blocks the requested result; state reasonable assumptions.",
    "Use available tools only when they help this task. Report sources, actions and checks only when they actually happened. Never claim to run code, access an account, schedule a task or publish a file without a successful tool result.",
    "For requested downloadable text, code or data, return complete fenced files using ```language filename=relative/path.ext. Use Markdown/HTML for documents and CSV for tables unless an available tool can produce the requested binary format. Never rename text to .docx, .xlsx or .pptx.",
    "Check the deliverable against all explicit requirements. End with a concise result and any real unresolved limitation. Do not reveal private reasoning or fabricate progress.",
    buildChatArtifactSkillPrompt(prompt),
  ].filter(Boolean).join("\n")
}
