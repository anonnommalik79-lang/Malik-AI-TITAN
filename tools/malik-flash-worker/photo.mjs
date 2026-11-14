/**
 * Google AI Mode photo transfer. Works with real Chromium file inputs.
 * No image is reported uploaded unless the browser file chooser accepted it.
 * Never inject fake page events or pretend that a photo was analyzed.
 */
export class PhotoUploadError extends Error {
  constructor(code, message) { super(message); this.name = "PhotoUploadError"; this.code = code }
}

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function normalizePhotos(images) {
  if (!Array.isArray(images)) throw new PhotoUploadError("INVALID_IMAGES", "Некорректный список фотографий.");
  if (images.length > 4) throw new PhotoUploadError("TOO_MANY_IMAGES", "Допускается не более четырёх фотографий.");
  return images.map((raw, index) => {
    if (!raw || typeof raw !== "object" || !TYPES.has(raw.mime) || typeof raw.base64 !== "string")
      throw new PhotoUploadError("INVALID_IMAGE", "Допускаются только PNG, JPEG и WebP.");
    const source = raw.base64.trim();
    if (!source || source.length > 7_000_000 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(source))
      throw new PhotoUploadError("INVALID_IMAGE_DATA", "Повреждённые или слишком большие данные фотографии.");
    const buffer = Buffer.from(source, "base64");
    if (!buffer.length || buffer.length > MAX_BYTES || buffer.toString("base64").replace(/=+$/, "") !== source.replace(/=+$/, ""))
      throw new PhotoUploadError("INVALID_IMAGE_DATA", "Фотография превышает лимит 5 МБ или содержит неверный base64.");
    const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const webp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    if (!(raw.mime === "image/png" && png || raw.mime === "image/jpeg" && jpeg || raw.mime === "image/webp" && webp))
      throw new PhotoUploadError("IMAGE_MIME_MISMATCH", "Тип фотографии не совпадает с содержимым.");
    const ext = raw.mime === "image/jpeg" ? "jpg" : raw.mime.slice(6);
    const label = typeof raw.name === "string" ? raw.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0,70) : "";
    return { name: label || "malikii-photo-" + (index + 1) + "." + ext, mimeType: raw.mime, buffer };
  });
}

async function firstFileInput(page) {
  const input = page.locator('input[type="file"]');
  return await input.count() ? input.first() : null;
}

/**
 * Google AI Mode opens the upload UI from its Image/Upload button. Prefer an
 * actual input[type=file] if already present. Otherwise use Playwright's
 * filechooser event. If Google removes upload, fail with actionable feedback.
 */
export async function uploadPhotosToChrome(page, photos) {
  if (!photos.length) return 0;
  let index = 0;
  while (index < photos.length) {
    const input = await firstFileInput(page);
    if (input) {
      const multiple = await input.getAttribute("multiple") !== null;
      const slice = multiple ? photos.slice(index) : [photos[index]];
      await input.setInputFiles(slice, { timeout: 10000 });
      index += slice.length;
    } else {
      const trigger = page.getByRole("button", {
        name: /^(?:Image|Images|Add image|Upload|Attach|Add files|Фото|Изображение|Добавить|Загрузить|Прикрепить)/i,
      }).first();
      if (await trigger.count() === 0) {
        throw new PhotoUploadError("GOOGLE_IMAGE_BUTTON_NOT_FOUND", "Google AI Mode не показал кнопку загрузки фото. Открой Chrome и проверь доступ к загрузке.");
      }
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 7000 }).catch(() => null);
      await trigger.click({ timeout: 7000 });
      const chooser = await chooserPromise;
      if (chooser) {
        await chooser.setFiles([photos[index]], { timeout: 10000 });
        index += 1;
      } else {
        const revealed = await firstFileInput(page);
        if (!revealed) throw new PhotoUploadError("GOOGLE_IMAGE_INPUT_NOT_FOUND", "Google не открыл поле загрузки. Требуется ручная проверка интерфейса.");
        await revealed.setInputFiles([photos[index]], { timeout: 10000 });
        index += 1;
      }
    }
    if (index < photos.length) await page.waitForTimeout(300);
  }
  return index;
}