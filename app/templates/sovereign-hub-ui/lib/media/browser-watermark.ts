/** Brand a provider image entirely in the browser; original provider URL stays untouched. */
export async function brandImageInBrowser(sourceUrl: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(sourceUrl.split("#")[0], { mode: "cors", credentials: "omit" })
  } catch {
    throw new Error("Источник не разрешает обработку в браузере (CORS). Оригинал можно скачать без водяного знака.")
  }
  if (!response.ok || !String(response.headers.get("content-type") || "").startsWith("image/")) {
    throw new Error("Источник изображения недоступен для водяного знака. Оригинал остаётся доступен.")
  }
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const { width, height } = bitmap
    if (!width || !height || width * height > 80_000_000) {
      throw new Error("Изображение слишком большое для обработки в браузере. Скачайте оригинал без потери качества.")
    }
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Браузер не поддерживает обработку изображения. Скачайте оригинал.")
    context.drawImage(bitmap, 0, 0)
    const fontSize = Math.max(20, Math.round(Math.min(width, height) * 0.032))
    const margin = Math.max(20, Math.round(fontSize * 0.8))
    context.font = `700 ${fontSize}px system-ui, sans-serif`
    context.textAlign = "right"
    context.textBaseline = "bottom"
    context.lineWidth = Math.max(3, fontSize * 0.13)
    context.strokeStyle = "rgba(0,0,0,.9)"
    context.fillStyle = "rgba(255,255,255,.94)"
    context.strokeText("Malik AI", width - margin, height - margin)
    context.fillText("Malik AI", width - margin, height - margin)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Браузер не смог сохранить изображение с водяным знаком."))
    }, "image/png"))
  } finally {
    bitmap.close()
  }
}
