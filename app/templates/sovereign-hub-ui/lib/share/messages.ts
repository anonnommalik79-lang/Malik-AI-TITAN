/** What a person reads when a share request cannot be completed. One place, so the API and the dialog agree. */
export const SHARE_ERROR_TEXT: Record<string, string> = {
  AUTH_REQUIRED: "Войдите в аккаунт, чтобы создать публичную ссылку.",
  TOO_FREQUENT: "Слишком много запросов за минуту. Попробуйте чуть позже.",
  STORAGE_UNAVAILABLE: "Публичные ссылки сейчас недоступны: хранилище не отвечает. Попробуйте позже.",
  ACCOUNT_LIMIT: "У аккаунта уже 300 публичных ссылок. Удалите старые на их страницах и попробуйте снова.",
  DAILY_LIMIT: "Лимит новых ссылок на сегодня исчерпан. Завтра можно будет поделиться снова.",
  CONFLICT: "Ссылку изменили одновременно в другой вкладке. Попробуйте ещё раз.",
  NOT_FOUND: "Ссылка уже удалена или не существует.",
  FORBIDDEN: "Изменять эту ссылку может только её автор.",
  INVALID_BODY: "Не удалось прочитать ответ для публикации.",
  INVALID_MESSAGE: "Этот ответ нельзя опубликовать.",
  EMPTY_ANSWER: "Ответ пустой — публиковать нечего.",
  ANSWER_TOO_LARGE: "Ответ слишком большой для публичной страницы (больше 256 КБ).",
  BODY_TOO_LARGE: "Ответ слишком большой для публичной страницы (больше 256 КБ).",
  INVALID_JSON: "Не удалось прочитать запрос.",
}

export function shareErrorText(code: unknown) {
  return SHARE_ERROR_TEXT[String(code || "")] || "Не удалось выполнить действие со ссылкой. Попробуйте ещё раз."
}
