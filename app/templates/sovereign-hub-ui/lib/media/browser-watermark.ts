/** Download the server-branded bytes unchanged. Never apply a second client stamp. */
export async function brandImageInBrowser(sourceUrl: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(sourceUrl.split("#")[0], { mode: "cors", credentials: "omit" })
  } catch {
    throw new Error("Не удалось скачать готовое изображение. Повторите попытку.")
  }
  if (!response.ok || !String(response.headers.get("content-type") || "").startsWith("image/")) {
    throw new Error("Готовое изображение недоступно для скачивания.")
  }
  return response.blob()
}
