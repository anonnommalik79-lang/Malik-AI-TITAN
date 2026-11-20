export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

export function presentationFileName(title: string, extension: string, suffix = "") {
  const base = Array.from(title.normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")).slice(0, 60).join("")
  const safe = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(base) ? `presentation-${base}` : base
  return `${safe || "presentation"}${suffix}.${extension}`
}

/** Reject error pages, partial transfers and empty archives before showing a download link. */
export async function makePptxFile(blob: Blob, name: string) {
  if (blob.size < 22 || /(?:text\/|json)/i.test(blob.type)) throw new Error("Сервер не вернул файл PowerPoint.")
  const first = new DataView(await blob.slice(0, 4).arrayBuffer())
  const tail = new DataView(await blob.slice(Math.max(0, blob.size - 65_557)).arrayBuffer())
  if (first.getUint32(0, true) === 0x04034b50) {
    for (let end = tail.byteLength - 22; end >= 0; end -= 1) {
      if (tail.getUint32(end, true) !== 0x06054b50 || end + 22 + tail.getUint16(end + 20, true) !== tail.byteLength) continue
      const directorySize = tail.getUint32(end + 12, true)
      const directoryStart = tail.getUint32(end + 16, true)
      if (tail.getUint16(end + 10, true) > 0 && directorySize > 0 && directoryStart + directorySize === blob.size - tail.byteLength + end) {
        return new File([blob], name, { type: PPTX_MIME })
      }
      break
    }
  }
  throw new Error("Файл PowerPoint получен не полностью. Подготовьте его ещё раз.")
}
