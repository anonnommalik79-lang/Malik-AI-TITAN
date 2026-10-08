/**
 * The «+» menu of both composers (chat and home): what it offers, how it is
 * grouped, what each connection's state means, and how a chosen connection
 * changes the message that is sent. Pure - the menu, the composers and the
 * tests share it.
 */

export type ComposerToolId = "upload" | "folder" | "library" | "draw" | "image" | "web" | "deep" | "github" | "gmail"
export type ConnectorId = "github" | "gmail"
export type ResearchMode = "off" | "web" | "deep"
/** Mirrors /api/plugins/status, plus the two states the browser adds. */
export type ConnectorState = "loading" | "error" | "connected" | "available" | "reauthorize" | "sign_in" | "unavailable"
export type ConnectorInfo = { state: ConnectorState; account?: string | null }

export const CONNECTORS: ConnectorId[] = ["github", "gmail"]

export const TOOL_GROUPS: Array<{ id: string; label: string; items: ComposerToolId[] }> = [
  { id: "add", label: "Добавить", items: ["upload", "folder", "library", "draw"] },
  { id: "create", label: "Создать", items: ["image"] },
  { id: "mode", label: "Режим ответа", items: ["web", "deep"] },
  { id: "connect", label: "Подключения", items: ["github", "gmail"] },
]

export const TOOL_TEXT: Record<ComposerToolId, { label: string; description: string }> = {
  upload: { label: "Фото и файлы", description: "Фото, PDF, документы, код, видео до 10 с" },
  folder: { label: "Папка", description: "Код и тексты соберутся в один документ" },
  library: { label: "Из библиотеки", description: "Ваши сохранённые изображения Malik AI" },
  draw: { label: "Нарисовать", description: "Набросок или пометки поверх фото" },
  image: { label: "Создать изображение", description: "Студия: стиль, формат и качество" },
  web: { label: "Поиск в сети", description: "Свежие данные с источниками" },
  deep: { label: "Глубокое исследование", description: "Много источников и подробный отчёт" },
  github: { label: "GitHub", description: "Репозитории, pull requests, issues и CI" },
  gmail: { label: "Gmail", description: "Поиск и разбор ваших писем" },
}

export const CONNECTOR_NAME: Record<ConnectorId, string> = { github: "GitHub", gmail: "Gmail" }

export function isConnectorId(value: unknown): value is ConnectorId {
  return value === "github" || value === "gmail"
}

/** The short status shown at the right of a connection row. */
export function connectorBadge(info: ConnectorInfo | undefined): { text: string; tone: "ok" | "action" | "warn" | "muted"; disabled: boolean; hint: string } {
  const state = info?.state || "loading"
  if (state === "connected") return { text: "Подключено", tone: "ok", disabled: false, hint: info?.account ? `Аккаунт: ${info.account}` : "Аккаунт подключён" }
  if (state === "reauthorize") return { text: "Переподключить", tone: "warn", disabled: false, hint: "Доступ истёк — подключите заново" }
  if (state === "sign_in") return { text: "Войдите", tone: "action", disabled: false, hint: "Подключения доступны после входа в аккаунт" }
  if (state === "unavailable") return { text: "Не настроено", tone: "muted", disabled: true, hint: "Подключение ещё не включено на сервере Malik AI" }
  if (state === "loading") return { text: "…", tone: "muted", disabled: false, hint: "Проверяю подключение" }
  if (state === "error") return { text: "Подключить", tone: "action", disabled: false, hint: "Статус не получен — можно подключить заново" }
  return { text: "Подключить", tone: "action", disabled: false, hint: "Вход через официальный OAuth, без пароля" }
}

/** What choosing a connection row does in its current state. */
export function connectorAction(info: ConnectorInfo | undefined): "activate" | "connect" | "sign-in" | "none" {
  const state = info?.state || "loading"
  if (state === "connected") return "activate"
  if (state === "sign_in") return "sign-in"
  if (state === "unavailable") return "none"
  return "connect"
}

/** Is this row a switch (it has an on/off state) right now? */
export function toolChecked(id: ComposerToolId, research: ResearchMode, connector: ConnectorId | null): boolean | null {
  if (id === "web") return research === "web"
  if (id === "deep") return research === "deep"
  if (id === "github" || id === "gmail") return connector === id
  return null
}

// ---- keyboard ---------------------------------------------------------

/** Arrow keys, Home and End over the enabled rows; arrows wrap round. */
export function moveFocus(current: number, key: string, disabled: boolean[]): number {
  const count = disabled.length
  const enabled = disabled.map((off, index) => off ? -1 : index).filter((index) => index >= 0)
  if (!enabled.length) return -1
  if (key === "Home") return enabled[0]
  if (key === "End") return enabled[enabled.length - 1]
  const step = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0
  if (!step) return current
  for (let offset = 1; offset <= count; offset++) {
    const index = ((current < 0 ? (step > 0 ? -1 : count) : current) + step * offset + count * 2) % count
    if (!disabled[index]) return index
  }
  return current
}

/** First enabled row after `from` whose label starts with the typed letters. */
export function typeahead(labels: string[], disabled: boolean[], from: number, typed: string): number {
  const needle = typed.toLocaleLowerCase("ru-RU")
  if (!needle) return -1
  for (let offset = 1; offset <= labels.length; offset++) {
    const index = (from + offset + labels.length) % labels.length
    if (!disabled[index] && labels[index].toLocaleLowerCase("ru-RU").startsWith(needle)) return index
  }
  return -1
}

// ---- connections in the message ----------------------------------------

/** The plugin runtime answers a message that starts with this command. */
export function withConnector(text: string, connector: ConnectorId | null) {
  const clean = String(text || "").trim()
  if (!connector || /^\/plugin\s/iu.test(clean)) return clean
  return clean ? `/plugin ${connector} ${clean}` : `/plugin ${connector}`
}

/** «/plugin github мои PR» → the plugin and the words, for showing a sent message. */
export function splitPluginCommand(text: string): { plugin: string; rest: string } | null {
  const match = /^\/plugin\s+([a-z0-9_-]+)(?:\s+([\s\S]*))?$/iu.exec(String(text || "").trim())
  return match ? { plugin: match[1].toLowerCase(), rest: (match[2] || "").trim() } : null
}

export function composerPlaceholder(base: string, research: ResearchMode, connector: ConnectorId | null) {
  if (connector === "github") return "Спросите про репозитории, PR, issues или CI…"
  if (connector === "gmail") return "Что найти или разобрать в почте?"
  if (research === "deep") return "Какую тему исследовать подробно?"
  if (research === "web") return "Что найти в интернете?"
  return base
}

export const CONNECTOR_SUGGESTIONS: Record<ConnectorId, string[]> = {
  github: ["Мои последние репозитории", "Открытые PR и issues в owner/repo", "Почему упал CI в owner/repo"],
  gmail: ["Важные письма за неделю", "Письма от банка за месяц", "Кто ждёт моего ответа"],
}

// ---- returning from OAuth ----------------------------------------------

export const CONNECTOR_PENDING_KEY = "malik.composer.connector.pending"

/**
 * After the provider's consent screen the app comes back with
 * ?plugin=<id>&plugin_status=connected|error. Only the connection this tab
 * asked for is switched on; the URL is left to the code that owns it.
 */
export function readConnectorReturn(href: string, pending: string | null): { connector: ConnectorId; ok: boolean } | null {
  if (!isConnectorId(pending)) return null
  let url: URL
  try { url = new URL(href) } catch { return null }
  if (url.searchParams.get("plugin") !== pending) return null
  const status = url.searchParams.get("plugin_status")
  if (status !== "connected" && status !== "error") return null
  return { connector: pending, ok: status === "connected" }
}
