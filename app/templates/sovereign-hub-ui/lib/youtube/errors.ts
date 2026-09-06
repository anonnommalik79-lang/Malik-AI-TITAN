export class YouTubeError extends Error {
  constructor(public code: string, public status = 502) { super(code) }
}
const messages: Record<string, string> = {
  AUTH_REQUIRED: "Войдите в Malik AI.",
  YOUTUBE_CONNECT_REQUIRED: "Подключите YouTube.",
  YOUTUBE_RECONNECT_REQUIRED: "Доступ YouTube отозван или истёк. Подключите аккаунт заново.",
  YOUTUBE_CONFIGURATION_REQUIRED: "YouTube OAuth ещё не настроен на сервере.",
  DATABASE_UNAVAILABLE: "Хранилище YouTube недоступно. Попробуйте позже.",
  CHANNEL_REQUIRED: "У этого Google-аккаунта нет доступного YouTube-канала.",
  CHANNEL_SELECTION_REQUIRED: "Выберите нужный канал на экране Google при повторном подключении. Текущий токен неоднозначен.",
  quotaExceeded: "Лимит YouTube API исчерпан. Попробуйте позже.",
  dailyLimitExceeded: "Дневной лимит YouTube API исчерпан.",
  rateLimitExceeded: "Слишком много запросов. Подождите и повторите.",
  commentsDisabled: "Автор отключил комментарии.",
  videoRatingDisabled: "Автор отключил оценки этого видео.",
  subscriptionForbidden: "YouTube не разрешает эту подписку.",
  insufficientPermissions: "Не хватает разрешений YouTube. Подключите аккаунт заново.",
  forbidden: "YouTube не разрешает это действие.",
  videoNotFound: "Видео удалено или недоступно.",
  NOT_FOUND: "Ресурс не найден.",
  INVALID_INPUT: "Проверьте введённые данные.",
  CSRF: "Запрос отклонён. Обновите страницу.",
  BUSY: "Предыдущее действие ещё выполняется. Повторите через несколько секунд.",
  API_UNAVAILABLE: "YouTube временно недоступен. Повторите запрос.",
}
export function publicError(error: unknown) {
  const known = error instanceof YouTubeError
  const code = known ? error.code : "API_UNAVAILABLE"
  return { error: code, message: messages[code] || "YouTube отклонил запрос. Повторите позже.", reconnect: ["YOUTUBE_CONNECT_REQUIRED", "YOUTUBE_RECONNECT_REQUIRED", "insufficientPermissions"].includes(code) }
}
