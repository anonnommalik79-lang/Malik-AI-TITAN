export type ComputerStatus = "running" | "awaiting-confirmation" | "complete" | "failed" | "cancelled" | "handoff"
export type ComputerApproval = { id: string; title: string; detail: string; pageUrl?: string }
export type ComputerReceipt = {
  ok: boolean; sessionId?: string; status: ComputerStatus; summary: string
  steps: Array<{ action: string; status: string; detail?: string }>
  screenshots: Array<{ url: string; label?: string }>
  pageUrl?: string; pageTitle?: string; approval?: ComputerApproval
}
export function isBrowserTask(prompt: string): boolean {
  const text = prompt.trim()
  // Advice, drafting, web research and quoted instructions do not need a
  // computer session. A concrete request to act on a site/account does.
  if (!text || text.length > 8000 || /(?:не\s+(?:открывай|открыть|запускай|используй|отправляй|отправь|отправить|публикуй|опубликуй|нажимай|заполняй)|без\s+браузера|do\s+not\s+(?:open|use|launch|send|publish|submit|click|fill)|don't\s+(?:open|use|launch|send|publish|submit|click|fill)|without\s+(?:a\s+)?browser)/iu.test(text)) return false
  const command = text.replace(/^(?:пожалуйста[,\s]+|please[,\s]+)/iu, "")
  if (/^(?:как|зачем|почему|что\s+такое|объясни|расскажи|напиши|составь|создай\s+(?:текст|код)|how|why|what|explain|tell\s+me|write|draft|қалай|түсіндір)(?![\p{L}\p{N}_])/iu.test(command)) return false
  if (/(?:покажи\s+как|объясни(?:ть)?\s+как|инструкци[яю]\s+(?:как|по)|show\s+(?:me\s+)?how|explain\s+how)/iu.test(command)) return false
  const action = /(?:^|[^\p{L}\p{N}_])(?:открой|открыть|зайди|зайд[иё]|зайти|перейди|перейти|нажми|заполни|заполнить|отправь|отправить|опубликуй|опубликовать|забронируй|забронировать|оформи|запусти\s+браузер|сайтқа\s+кір|сайтты\s+аш)(?![\p{L}\p{N}_])/iu.test(command)
    || /^(?:(?:can|could|would)\s+you\s+|i\s+want\s+you\s+to\s+)?(?:navigate|browse|send|publish|open|book|submit|click|fill)\b/iu.test(command)
  const target = /(?:сайт|https?:\/\/|\b[\p{L}\d-]+\.(?:com|org|net|io|ai|kz|world)(?:[/\s]|$)|браузер|письм|почт|email|gmail|репозитор|форм|билет|аккаунт|\b(?:website|browser|email|form|repository|account)\b)/iu.test(command)
  return action && target || /(?:найди|прочитай|проверь|find|read|check).{0,50}(?:в\s+(?:моей\s+)?почте|gmail|my\s+(?:email|inbox))/iu.test(command)
}

export function shouldUseDigitalBrowser(task: string, workMode: boolean): boolean {
  return workMode && isBrowserTask(task)
}
export function computerImageUrl(value: unknown): string {
  const text = String(value || "")
  if (text.length <= 900_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/u.test(text)) return text
  try { const url = new URL(text); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "" } catch { return "" }
}
export function computerPageUrl(value: unknown): string {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "" } catch { return "" }
}
