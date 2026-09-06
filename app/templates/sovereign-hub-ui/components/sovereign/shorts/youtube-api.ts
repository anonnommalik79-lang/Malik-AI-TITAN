export class RequestError extends Error {
  constructor(message: string, public reconnect = false, public code = "") { super(message) }
}
export async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try { response = await fetch(path, { method, cache: "no-store", headers: method === "GET" ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal }) }
  catch (error) {
    if (signal?.aborted) throw error
    throw new RequestError("Нет ответа от сервера. Проверьте соединение; перед повторной публикацией проверьте, не появился ли комментарий в YouTube.")
  }
  const json = await response.json().catch(() => { throw new RequestError("Сервер вернул некорректный ответ. Попробуйте позже.") })
  if (!response.ok) throw new RequestError(json.message || "Не удалось выполнить запрос.", json.reconnect, json.error)
  return json as T
}
export const fmt = (value?: number) => value === undefined ? "—" : new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value)
