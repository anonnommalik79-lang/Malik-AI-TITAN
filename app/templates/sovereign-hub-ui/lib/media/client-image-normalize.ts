export type NormalizedClientImage = {
  base64: string
  mime: "image/jpeg" | "image/png" | "image/webp"
  size: number
  width: number
  height: number
  previewUrl: string
  name: string
}

const TARGET_BYTES = 6 * 1024 * 1024
const MAX_LONG_EDGE = 4096

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Не удалось прочитать изображение."))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Не удалось декодировать изображение."))
    image.src = url
  })
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
          context.drawImage(bitmap, 0, 0, width, height)
        },
        close: () => bitmap.close(),
      }
    } catch {
      // Safari/iOS formats can still decode through a normal <img>.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImageElement(objectUrl)
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(image, 0, 0, width, height)
      },
      close: () => undefined,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/webp", quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob?.size ? resolve(blob) : reject(new Error("Не удалось подготовить изображение.")),
      type,
      quality,
    )
  })
}

function safeName(name: string) {
  const base = String(name || "photo").replace(/\.[^.]+$/, "").slice(0, 120) || "photo"
  return base + ".jpg"
}

/**
 * Large camera photos must never be sent to Malik as raw base64.
 * The browser transparently normalizes them to a high-resolution JPEG that
 * stays below the JSON request envelope. The user can therefore select the
 * original large photo without a visible MB cap.
 */
export async function normalizeClientImage(file: File): Promise<NormalizedClientImage> {
  const decoded = await decodeImage(file)
  try {
    if (!decoded.width || !decoded.height) throw new Error("Не удалось определить размер изображения.")

    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(decoded.width, decoded.height))
    let width = Math.max(1, Math.round(decoded.width * scale))
    let height = Math.max(1, Math.round(decoded.height * scale))
    let quality = 0.92
    let blob: Blob | null = null

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext("2d", { alpha: false })
      if (!context) throw new Error("Браузер не смог обработать изображение.")
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = "high"
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, width, height)
      decoded.draw(context, width, height)

      blob = await canvasBlob(canvas, "image/jpeg", quality)
      canvas.width = 1
      canvas.height = 1

      if (blob.size <= TARGET_BYTES) break

      if (quality > 0.72) {
        quality -= 0.08
      } else {
        width = Math.max(1280, Math.round(width * 0.82))
        height = Math.max(1280, Math.round(height * 0.82))
      }
    }

    if (!blob) throw new Error("Не удалось подготовить изображение.")
    if (blob.size > TARGET_BYTES) {
      throw new Error("Фото слишком тяжёлое для обработки на этом устройстве. Попробуйте открыть фото и сохранить копию.")
    }

    const dataUrl = await readFileAsDataUrl(blob)
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] || "" : ""
    if (!base64) throw new Error("Не удалось подготовить изображение.")

    return {
      base64,
      mime: "image/jpeg",
      size: blob.size,
      width,
      height,
      previewUrl: URL.createObjectURL(file),
      name: safeName(file.name),
    }
  } finally {
    decoded.close()
  }
}
