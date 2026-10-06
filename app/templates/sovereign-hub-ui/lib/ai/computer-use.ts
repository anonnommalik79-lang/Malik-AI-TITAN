export type ComputerStatus = "running" | "awaiting-confirmation" | "complete" | "failed" | "cancelled" | "handoff"
export type ComputerApproval = { id: string; title: string; detail: string; pageUrl?: string }
export type ComputerReceipt = {
  ok: boolean; sessionId?: string; status: ComputerStatus; summary: string
  steps: Array<{ action: string; status: string; detail?: string }>
  screenshots: Array<{ url: string; label?: string }>
  pageUrl?: string; pageTitle?: string; approval?: ComputerApproval
}
export function isBrowserTask(prompt: string): boolean {
  return /(?:зайди|зайд[иё]|открой|перейди|отправь|опубликуй|заполни|забронируй|браузер|\b(?:navigate|browse|send|publish|open|book)\b)/iu.test(prompt)
    && /(?:сайт|https?:|браузер|письм|почт|email|gmail|репозитор|форм|билет|аккаунт|\b(?:website|browser|email|form|repository)\b)/iu.test(prompt)
}
export function computerImageUrl(value: unknown): string {
  const text = String(value || "")
  if (text.length <= 900_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/u.test(text)) return text
  try { const url = new URL(text); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "" } catch { return "" }
}
export function computerPageUrl(value: unknown): string {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "" } catch { return "" }
}
