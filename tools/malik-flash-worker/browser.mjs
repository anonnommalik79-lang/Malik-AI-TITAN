import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { normalizePhotos, uploadPhotosToChrome } from "./photo.mjs";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const GOOGLE_HOME = "https://www.google.com/ai";
const MAX_USERS_PER_PROCESS = 4;
const MAX_CHAT_PAGES_PER_USER = 8;

export class BrowserWorkerError extends Error {
  constructor(code, message, status = 503) {
    super(message); this.name = "BrowserWorkerError"; this.code = code; this.status = status;
  }
}

export function isGoogleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "google.com" ||
      /^[a-z0-9-]+\.google\.com$/i.test(url.hostname) ||
      url.hostname === "google.kz" ||
      /^[a-z0-9-]+\.google\.kz$/i.test(url.hostname)
    );
  } catch { return false; }
}

export function sourceLinks(input) {
  const found = new Map();
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item.url !== "string") continue;
    try {
      const uri = new URL(item.url);
      if (uri.protocol !== "https:" && uri.protocol !== "http:") continue;
      if (uri.username || uri.password) continue;
      uri.hash = "";
      if (found.has(uri.href)) continue;
      found.set(uri.href, { url: uri.href, title: String(item.title || uri.hostname).slice(0, 160) });
      if (found.size >= 16) break;
    } catch { /* bad URL */ }
  }
  return [...found.values()];
}

export function deltaAnswer(before, after, question) {
  const oldText = String(before || "").trim();
  let current = String(after || "").trim();
  if (oldText && current.startsWith(oldText)) current = current.slice(oldText.length).trim();
  else if (oldText && current !== oldText) {
    let common = 0;
    while (common < oldText.length && common < current.length && oldText[common] === current[common]) common++;
    if (common >= Math.min(120, oldText.length)) current = current.slice(common).trim();
  }
  if (question && current.startsWith(question)) current = current.slice(question.length).trim();
  return current.slice(0, 180_000);
}

async function captureVisible(page) {
  return page.evaluate(() => {
    const visible = el => {
      if (!(el instanceof Element)) return false;
      const bounds = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return bounds.width > 0 && bounds.height > 0 && css.visibility !== "hidden" && css.display !== "none";
    };
    const candidates = [...document.querySelectorAll('main, [role="main"], article')].filter(visible);
    const root = candidates.sort((a,b) => (b.innerText || "").length - (a.innerText || "").length)[0] || document.body;
    const tree = root.cloneNode(true);
    for (const node of [...tree.querySelectorAll("script,style,svg,nav,footer,button")]) node.remove();
    const fence = String.fromCharCode(96).repeat(3);
    for (const node of [...tree.querySelectorAll("pre")]) {
      const code = (node.textContent || "").replace(/\r/g, "").trim();
      if (!code) continue;
      const cls = node.querySelector("code")?.getAttribute("class") || "";
      const lang = (cls.match(/language-([a-z0-9+#_-]+)/i) || [])[1] || "";
      node.replaceWith(document.createTextNode("\n" + fence + lang + "\n" + code + "\n" + fence + "\n"));
    }
    const text = String(tree.innerText || tree.textContent || root.innerText || "").replace(/\r/g, "").trim();
    const links = [...root.querySelectorAll("a[href]")].filter(visible).slice(0, 160).map(el => ({
      url: el.href,
      title: String(el.innerText || el.getAttribute("aria-label") || el.title || el.href).trim()
    }));
    const blockText = String(document.body?.innerText || "").slice(0, 1200);
    const busy = [...document.querySelectorAll('[aria-busy="true"],[role="progressbar"],button')]
      .some(el => visible(el) && (el.getAttribute("aria-busy") === "true" || el.getAttribute("role") === "progressbar" ||
        /(?:stop generating|stop response|остановить ответ|прервать ответ)/i.test(el.getAttribute("aria-label") || "")));
    return { text, links, busy, blockText, url: location.href };
  });
}

export async function submitQuestion(page, question) {
  const targets = page.locator('textarea, [contenteditable="true"], [role="textbox"], input[type="search"]');
  const count = await targets.count();
  for (let i = count - 1; i >= 0; i--) {
    const input = targets.nth(i);
    if (!await input.isVisible().catch(() => false)) continue;
    await input.fill(question, { timeout: 6000 });
    await input.press("Enter", { timeout: 6000 });
    return;
  }
  throw new BrowserWorkerError("GOOGLE_INPUT_NOT_FOUND", "Google AI Mode не показал поле вопроса. Проверь окно Chrome и свой аккаунт.");
}

export class GoogleBrowserWorker {
  constructor({ profileRoot = process.env.MALIK_FLASH_PROFILE_DIR || path.join(os.homedir(), ".malikii-flash-profiles"), chromiumFactory = null } = {}) {
    this.profileRoot = profileRoot;
    this.chromiumFactory = chromiumFactory;
    this.users = new Map();
    this.locks = new Map();
  }

  async userContext(userScope) {
    if (this.users.has(userScope)) return this.users.get(userScope);
    if (this.users.size >= MAX_USERS_PER_PROCESS)
      throw new BrowserWorkerError("WORKER_CAPACITY", "Все браузерные места заняты. Попробуйте позже.", 429);
    const profileDir = path.join(this.profileRoot, userScope);
    await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
    const factory = this.chromiumFactory || (await import("playwright-core")).chromium;
    const context = await factory.launchPersistentContext(profileDir, {
      headless: process.env.MALIK_FLASH_HEADLESS === "1",
      executablePath: process.env.MALIK_FLASH_CHROME_PATH || undefined,
      channel: process.env.MALIK_FLASH_CHROME_PATH ? undefined : "chrome",
      viewport: { width: 1360, height: 960 },
      acceptDownloads: false,
      args: ["--no-first-run", "--no-default-browser-check"],
    });
    let saved = {};
    try { saved = JSON.parse(await fs.readFile(path.join(profileDir, "chats.json"), "utf8")); }
    catch { saved = {}; }
    const entry = { context, pages: new Map(), chats: saved, profileDir };
    this.users.set(userScope, entry);
    context.on("close", () => this.users.delete(userScope));
    return entry;
  }

  async chatPage(user, chatScope) {
    const previous = user.pages.get(chatScope);
    if (previous && !previous.isClosed()) return previous;
    if (user.pages.size >= MAX_CHAT_PAGES_PER_USER) {
      const oldChat = user.pages.keys().next().value;
      await user.pages.get(oldChat)?.close().catch(() => {});
      user.pages.delete(oldChat);
    }
    const page = await user.context.newPage();
    const saved = user.chats[chatScope];
    const url = isGoogleUrl(saved) ? saved : GOOGLE_HOME;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    user.pages.set(chatScope, page);
    return page;
  }

  async persist(user, chatScope, url) {
    if (!isGoogleUrl(url)) return;
    user.chats[chatScope] = url;
    const temp = path.join(user.profileDir, "chats.json.tmp");
    const target = path.join(user.profileDir, "chats.json");
    await fs.writeFile(temp, JSON.stringify(user.chats), { mode: 0o600 });
    await fs.rename(temp, target);
  }

  async runExclusive(userScope, callback) {
    const old = this.locks.get(userScope) || Promise.resolve();
    let unlock;
    const current = new Promise(resolve => { unlock = resolve; });
    const chained = old.then(() => current);
    this.locks.set(userScope, chained);
    await old;
    try { return await callback(); }
    finally { unlock(); if (this.locks.get(userScope) === chained) this.locks.delete(userScope); }
  }

  async ask({ userScope, chatScope, question, images = [] }) {
    if (!/^[a-f0-9]{64}$/.test(userScope) || !/^[a-f0-9]{64}$/.test(chatScope))
      throw new BrowserWorkerError("INVALID_SCOPE", "Некорректный идентификатор сессии.", 400);
    if (typeof question !== "string" || !question.trim() || question.length > 6000)
      throw new BrowserWorkerError("INVALID_QUESTION", "Вопрос пустой или слишком длинный.", 400);
    const photos = normalizePhotos(images);
    return this.runExclusive(userScope, async () => {
      const user = await this.userContext(userScope);
      const page = await this.chatPage(user, chatScope);
      if (!isGoogleUrl(page.url()) || /accounts\.google/i.test(page.url()))
        throw new BrowserWorkerError("GOOGLE_LOGIN_REQUIRED", "Google просит войти или подтвердить согласие. Войди вручную в Chrome этого пользователя.");
      const initial = await captureVisible(page);
      if (/captcha|unusual traffic|подтвердите, что вы не робот/i.test(initial.blockText))
        throw new BrowserWorkerError("GOOGLE_VERIFICATION_REQUIRED", "Google просит пройти проверку вручную.");
      let uploaded = 0;
      try {
        uploaded = await uploadPhotosToChrome(page, photos);
        if (uploaded !== photos.length) throw new BrowserWorkerError("IMAGE_NOT_ATTACHED", "Не все фотографии были прикреплены.");
        await submitQuestion(page, question);
      } catch (error) {
        throw new BrowserWorkerError(error.code || "GOOGLE_COMPOSER_FAILED", error.message || "Не удалось отправить вопрос в Google.");
      }

      const started = Date.now();
      let previous = "", unchanged = 0, answer = "", latest;
      while (Date.now() - started < 90000) {
        await sleep(1300);
        latest = await captureVisible(page).catch(() => null);
        if (!latest) continue;
        if (/captcha|unusual traffic|подтвердите, что вы не робот/i.test(latest.blockText))
          throw new BrowserWorkerError("GOOGLE_VERIFICATION_REQUIRED", "Google требует ручную проверку.");
        const next = deltaAnswer(initial.text, latest.text, question);
        if (!next || next === deltaAnswer(initial.text, initial.text, question)) continue;
        if (next === previous) unchanged++; else unchanged = 0;
        previous = next;
        if (unchanged >= 3 && !latest.busy) { answer = next; break; }
      }
      if (!answer) throw new BrowserWorkerError("GOOGLE_ANSWER_INCOMPLETE", "Google не подтвердил завершение ответа. Проверь Chrome вручную.");
      await this.persist(user, chatScope, page.url());
      return {
        answer,
        complete: true,
        imagesProcessed: photos.length === uploaded,
        sources: sourceLinks(latest.links),
        origin: "google-ai-mode-browser-experimental",
      };
    });
  }

  async close() {
    const open = [...this.users.values()];
    this.users.clear();
    await Promise.allSettled(open.map(item => item.context.close()));
  }
}