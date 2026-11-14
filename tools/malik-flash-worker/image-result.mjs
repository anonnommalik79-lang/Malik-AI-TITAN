import { setTimeout as sleep } from "node:timers/promises";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GENERATED = '[data-generated-image="true"], [data-image-origin="generated"], [data-result-type="generated-image"]';

export class BrowserImageError extends Error {
  constructor(code) {
    super(code);
    this.name = "BrowserImageError";
    this.code = code;
    this.status = 503;
  }
}

export function imageSignature(candidate) {
  return [candidate?.src, candidate?.naturalWidth, candidate?.naturalHeight].join("|");
}

export function newImageCandidates(previous, current) {
  const before = new Set((previous || []).map(imageSignature));
  return (current || []).filter(item => item?.generated === true && !item.isExternalLink &&
    item.naturalWidth > 0 && item.naturalHeight > 0 && !before.has(imageSignature(item)));
}

export async function readVisibleImages(page) {
  return page.evaluate(selector => {
    const result = [];
    for (const image of document.querySelectorAll("img")) {
      if (!image.getClientRects().length || getComputedStyle(image).visibility === "hidden") continue;
      const link = image.closest("a[href]");
      let external = false;
      if (link) {
        const target = new URL(link.href);
        external = target.hostname !== location.hostname && !target.hostname.endsWith(".googleusercontent.com");
      }
      result.push({
        src: image.currentSrc || image.src, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        generated: Boolean(image.closest(selector)), isExternalLink: external,
      });
      if (result.length === 160) break;
    }
    return result;
  }, GENERATED);
}

export function verifyImageDataUrl(value) {
  const match = typeof value === "string" ? /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(value) : null;
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new BrowserImageError("FLASH_IMAGE_INVALID");
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== match[2]) throw new BrowserImageError("FLASH_IMAGE_INVALID");
  const png = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!(mime === "image/png" && png || mime === "image/jpeg" && jpeg || mime === "image/webp" && webp)) {
    throw new BrowserImageError("FLASH_IMAGE_INVALID");
  }
  return { mime, base64: match[2], bytes };
}

export async function captureBrowserImage(page, candidate) {
  const dataUrl = await page.evaluate(async ({ candidate, selector, maxBytes }) => {
    const image = [...document.querySelectorAll("img")].find(image => image.getClientRects().length && image.closest(selector) &&
      (image.currentSrc || image.src) === candidate.src && image.naturalWidth === candidate.naturalWidth &&
      image.naturalHeight === candidate.naturalHeight);
    if (!image) return null;
    const src = new URL(candidate.src, location.href);
    const localBlob = src.protocol === "blob:" && src.origin === location.origin;
    const googleAsset = src.protocol === "https:" && (src.origin === location.origin || src.hostname.endsWith(".googleusercontent.com"));
    if (!localBlob && !googleAsset && src.protocol !== "data:") return null;

    const response = await fetch(src.href, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxBytes) return null;
    const mime = (response.headers.get("content-type") || "").split(";")[0];
    if (!/^image\/(?:png|jpeg|webp)$/i.test(mime)) return null;
    const reader = response.body.getReader();
    const parts = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) return null;
        parts.push(value);
      }
      return await new Promise(resolve => {
        const fileReader = new FileReader();
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = () => resolve(null);
        fileReader.readAsDataURL(new Blob(parts, { type: mime }));
      });
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }, { candidate, selector: GENERATED, maxBytes: MAX_IMAGE_BYTES }).catch(() => null);
  const { mime, base64 } = verifyImageDataUrl(dataUrl);
  return { mime, base64 };
}

export async function waitForGeneratedImage(page, before, { signal, completed, timeoutMs = 80_000, poll = sleep }) {
  const deadline = performance.now() + timeoutMs;
  let previous;
  while (performance.now() < deadline) {
    await poll(350, undefined, { signal });
    if (!await completed()) continue;
    const [candidate, extra] = newImageCandidates(before, await readVisibleImages(page));
    if (!candidate || extra) continue;
    const signature = imageSignature(candidate);
    if (signature === previous) return captureBrowserImage(page, candidate);
    previous = signature;
  }
  throw new BrowserImageError("FLASH_IMAGE_TIMEOUT");
}
