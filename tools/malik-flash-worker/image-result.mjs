/**
 * Extract a REAL browser-rendered image result from Google AI Mode.
 * Candidate detection is deliberately conservative: uploaded source pictures
 * and pre-existing recommendations are baselined before submitting a prompt.
 * Never fake output or return a web-search thumbnail as generated artwork.
 */
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;
const MIN_DISPLAY_AREA = 170 * 140;
const POLL_MS = 1300;

export class BrowserImageError extends Error {
  constructor(code, message) {
    super(message); this.name = "BrowserImageError"; this.code = code;
  }
}

export function imageSignature(candidate) {
  return [candidate?.src, candidate?.naturalWidth, candidate?.naturalHeight].join("|");
}

export function newImageCandidates(previous, current) {
  const before = new Set((previous || []).map(imageSignature));
  return (current || [])
    .filter(item => item && !item.isExternalLink && !before.has(imageSignature(item)) && item.width * item.height >= MIN_DISPLAY_AREA)
    .sort((a, b) => scoreImage(b) - scoreImage(a));
}

function scoreImage(item) {
  const hint = /generated|created|result|output|сгенерирован|создан|результат|готово|сурет дайын/i.test([item.alt, item.context].filter(Boolean).join(" ")) ? 1_000_000 : 0;
  return hint + (Math.min(item.width * item.height, 1_000_000) * Math.min(item.naturalWidth * item.naturalHeight, 4_000_000)) / 2_000_000;
}

export async function readVisibleImages(page) {
  return page.evaluate(() => {
    const result = [];
    const all = [...document.querySelectorAll("img")];
    const inMain = el => Boolean(el.closest('main,[role="main"],article'));
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!inMain(el)) continue;
      const rect = el.getBoundingClientRect();
      const css = window.getComputedStyle(el);
      if (rect.width < 170 || rect.height < 140 || css.visibility === "hidden" || css.display === "none" || css.opacity === "0") continue;
      if (el.naturalWidth < 240 || el.naturalHeight < 160) continue;
      result.push({
        index: i,
        src: el.currentSrc || el.src,
        alt: el.getAttribute("alt") || el.getAttribute("aria-label") || "",
        context: [
          el.closest("figure")?.innerText || "",
          el.parentElement?.parentElement?.innerText || "",
        ].join(" ").slice(0, 240),
        // Search-result recommendation thumbnails often lead to third-party
        // websites; they must not be returned as newly generated artwork.
        isExternalLink: (() => {
          const href = el.closest("a[href]")?.href;
          if (!href) return false;
          try { const u = new URL(href); return !/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && !u.hostname.endsWith(".googleusercontent.com"); }
          catch { return false; }
        })(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
      });
    }
    return result.slice(0, 80);
  });
}

/** Browser page can fetch same-origin/blob/data images and return original bytes.
 * For cross-origin images, the fallback captures ONLY the actual <img> element. */
async function fetchInlineImage(page, index) {
  return page.evaluate(async (idx) => {
    const img = document.querySelectorAll("img")[idx];
    if (!img) return null;
    const src = img.currentSrc || img.src || "";
    if (!/^(?:blob:|data:image\/)/i.test(src)) return null;
    try {
      const response = await fetch(src);
      if (!response.ok) return null;
      const data = await response.blob();
      if (data.size < 1000 || data.size > 9 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/i.test(data.type)) return null;
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, mime: data.type });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(data);
      });
    } catch { return null; }
  }, index);
}

export function verifyImageDataUrl(value) {
  if (typeof value !== "string") throw new BrowserImageError("FLASH_IMAGE_MISSING", "Результат не содержит изображения.");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/]+={0,2})$/i.exec(value);
  if (!match || match[2].length > MAX_IMAGE_BYTES * 1.4)
    throw new BrowserImageError("FLASH_IMAGE_INVALID", "Получено изображение неверного формата или размера.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 1000 || bytes.length > MAX_IMAGE_BYTES) throw new BrowserImageError("FLASH_IMAGE_INVALID", "Изображение повреждено или превышает лимит.");
  const png = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!(match[1] === "image/png" && png || match[1] === "image/jpeg" && jpeg || match[1] === "image/webp" && webp))
    throw new BrowserImageError("FLASH_IMAGE_INVALID", "Байты изображения не соответствуют формату.");
  return { mime: match[1].toLowerCase(), base64: match[2], bytes };
}

export async function captureBrowserImage(page, candidate) {
  let dataUrl;
  const direct = await fetchInlineImage(page, candidate.index).catch(() => null);
  if (direct?.dataUrl) dataUrl = direct.dataUrl;
  if (!dataUrl) {
    const element = page.locator("img").nth(candidate.index);
    if (!await element.isVisible().catch(() => false)) throw new BrowserImageError("FLASH_IMAGE_NOT_VISIBLE", "Google не показал готовую картинку.");
    const screenshot = await element.screenshot({ type: "png", animations: "disabled", timeout: 12_000 });
    dataUrl = "data:image/png;base64," + screenshot.toString("base64");
  }
  const { mime, base64 } = verifyImageDataUrl(dataUrl);
  return { mime, base64, width: candidate.naturalWidth, height: candidate.naturalHeight };
}

export async function waitForGeneratedImage(page, before, options = {}) {
  const timeoutMs = Math.min(Math.max(options.timeoutMs || 85_000, 1000), 120_000);
  const poll = options.poll || (ms => new Promise(r => setTimeout(r, ms)));
  const started = Date.now();
  let previousSignature = "", stable = 0;
  while (Date.now() - started < timeoutMs) {
    await poll(POLL_MS);
    const candidates = newImageCandidates(before, await readVisibleImages(page));
    const chosen = candidates[0];
    if (!chosen) continue;
    const sig = imageSignature(chosen);
    if (sig === previousSignature) stable++; else stable = 0;
    previousSignature = sig;
    if (stable < 2) continue;
    const busy = await page.evaluate(() => {
      const visible = el => {
        const b = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return b.width > 0 && b.height > 0 && style.display !== "none";
      };
      return [...document.querySelectorAll('[aria-busy="true"], [role="progressbar"],button')]
        .some(el => visible(el) && (
          el.getAttribute("aria-busy") === "true" ||
          el.getAttribute("role") === "progressbar" ||
          /(?:stop generating|stop response|остановить ответ)/i.test(el.getAttribute("aria-label") || "")
        ));
    }).catch(() => true);
    if (busy) continue;
    return captureBrowserImage(page, chosen);
  }
  throw new BrowserImageError("FLASH_IMAGE_TIMEOUT", "Google не вернул подтверждённое готовое изображение.");
}
