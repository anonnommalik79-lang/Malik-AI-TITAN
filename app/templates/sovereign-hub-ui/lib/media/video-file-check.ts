/**
 * What a finished video file really is, read from a few kilobytes of it.
 * Pure: the server reads the bytes, the browser only gets the verdict.
 */

export type VideoContainer = "mp4" | "webm" | "html" | "json" | "text" | "unknown"
export type VideoCodec = "h264" | "h265" | "av1" | "vp9" | "vp8" | "unknown"

export type VideoProbe = {
  reachable: boolean
  httpStatus?: number
  contentType?: string
  container?: VideoContainer
  codec?: VideoCodec
  sizeBytes?: number
  faststart?: boolean
}

const ascii = (bytes: Uint8Array) => {
  let out = ""
  for (let index = 0; index < bytes.length; index++) out += String.fromCharCode(bytes[index])
  return out
}

/** Container and video codec from the head (and, for an MP4 with its index at the end, the tail). */
export function inspectVideoBytes(head: Uint8Array, tail?: Uint8Array): { container: VideoContainer; codec: VideoCodec; faststart?: boolean } {
  const start = ascii(head.subarray(0, 64))
  const text = ascii(head)
  const all = tail ? `${text}${ascii(tail)}` : text
  let container: VideoContainer = "unknown"
  if (start.slice(4, 8) === "ftyp") container = "mp4"
  else if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) container = "webm"
  else if (/^\s*</u.test(start) && /<(?:!doctype|html|head|body|\?xml|error)/iu.test(text.slice(0, 2048))) container = "html"
  else if (/^\s*[[{]/u.test(start)) container = "json"
  else if (/^[\t\n\r\x20-\x7e]{24}/u.test(start)) container = "text"

  let codec: VideoCodec = "unknown"
  if (container === "mp4") {
    if (/avc1|avc3/u.test(all)) codec = "h264"
    else if (/hvc1|hev1/u.test(all)) codec = "h265"
    else if (/av01/u.test(all)) codec = "av1"
    else if (/vp09/u.test(all)) codec = "vp9"
  } else if (container === "webm") {
    if (/V_VP9/u.test(all)) codec = "vp9"
    else if (/V_VP8/u.test(all)) codec = "vp8"
    else if (/V_AV1/u.test(all)) codec = "av1"
    else if (/V_MPEG4\/ISO\/AVC/u.test(all)) codec = "h264"
  }
  const moov = text.indexOf("moov")
  const mdat = text.indexOf("mdat")
  const faststart = container === "mp4" ? moov >= 0 && (mdat < 0 || moov < mdat) : undefined
  return { container, codec, faststart }
}

export type ProbeVerdict = {
  /** Plain words for the person. */
  message: string
  /** The file itself is fine: playing it through Malik should work. */
  playableThroughMalik: boolean
  /** Waiting and checking again can help (the CDN is still publishing it). */
  retry: boolean
}

/** Why a finished video does not open, in words a person can act on. */
export function videoProbeVerdict(probe: VideoProbe | null | undefined): ProbeVerdict {
  if (!probe) {
    return { message: "Видео создано, но файл пока не открывается. Нажмите «Проверить ещё раз» через минуту.", playableThroughMalik: false, retry: true }
  }
  if (!probe.reachable) {
    const status = probe.httpStatus || 0
    if (status === 401 || status === 403) {
      return { message: `Провайдер закрыл доступ к файлу (HTTP ${status}): ссылка истекла или защищена. Откройте файл по кнопке ниже или создайте видео заново.`, playableThroughMalik: false, retry: false }
    }
    if (status === 404 || status === 410) {
      return { message: "Провайдер ещё не выложил файл или уже удалил его. Нажмите «Проверить ещё раз» через минуту.", playableThroughMalik: false, retry: true }
    }
    return { message: `Сервер провайдера не отдаёт файл${status ? ` (HTTP ${status})` : ""}. Нажмите «Проверить ещё раз» через минуту.`, playableThroughMalik: false, retry: true }
  }
  if (probe.container === "html" || probe.container === "json" || probe.container === "text") {
    return { message: "Вместо видеофайла провайдер вернул страницу с ошибкой. Создайте видео заново или выберите другую модель.", playableThroughMalik: false, retry: false }
  }
  if (probe.codec === "h265") {
    return { message: "Видео сохранено в формате H.265 (HEVC): этот браузер его не показывает. Скачайте файл или откройте его в Safari или Edge.", playableThroughMalik: false, retry: false }
  }
  if (probe.codec === "av1") {
    return { message: "Видео сохранено в формате AV1: этот браузер его не показывает. Обновите браузер или скачайте файл.", playableThroughMalik: false, retry: false }
  }
  if (probe.container === "mp4" || probe.container === "webm") {
    return { message: "Файл в порядке, но браузер не смог загрузить его напрямую. Показываю его через Malik AI.", playableThroughMalik: true, retry: true }
  }
  return { message: "Видео создано, но формат файла не распознан. Откройте файл по кнопке ниже.", playableThroughMalik: false, retry: false }
}
