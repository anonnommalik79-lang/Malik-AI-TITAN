import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { GOOGLE_HOME, googleAccess } from "./google-access.mjs";
import { normalizePhotos, uploadPhotosToChrome } from "./photo.mjs";
import { readVisibleImages, waitForGeneratedImage } from "./image-result.mjs";

const MAX_USERS = 4;
const MAX_CHAT_PAGES = 8;
const MAX_SAVED_CHATS = 256;
const GOOGLE_HOST = "www.google.com";
const SCOPE_ID = /^[a-f0-9]{64}$/u;
const ANSWERS = '[data-message-author-role="assistant"], [data-author="assistant"], [data-ai-mode-response]';
const COMPOSER = 'textarea[aria-label="Ask anything"], [role="textbox"][aria-label="Ask anything"], textarea[aria-label="Спросите что угодно"]';
const COMPLETE = '[data-response-state="complete"], [data-complete="true"], button[aria-label^="Good response"], button[aria-label^="Bad response"], button[aria-label="Copy response"]';
const IDLE_MS = 10 * 60_000;

export class BrowserWorkerError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = "BrowserWorkerError";
    this.code = code;
    this.status = status;
  }
}

export function isGoogleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["google.com", GOOGLE_HOST].includes(url.hostname) &&
      !url.port && !url.username && !url.password &&
      (["/ai", "/aimode", "/webhp"].includes(url.pathname) || (url.pathname === "/search" && url.searchParams.get("udm") === "50"));
  } catch { return false; }
}

function conversationUrl(value) {
  if (!isGoogleUrl(value)) return null;
  const url = new URL(value);
  if (url.pathname !== "/search") return null;
  // Only resume a URL with a conversation identifier. An ordinary results
  // URL can reopen a search while silently losing the prior AI Mode turns.
  return ["session", "sessionid", "chat_id", "conversation_id", "csuir"].some(key =>
    /^[a-z0-9._~-]{12,512}$/iu.test(url.searchParams.get(key) || "")) ? url.href : null;
}

export function sourceLinks(input) {
  const found = new Map();
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item.url !== "string" || item.url.length > 2048) continue;
    try {
      const url = new URL(item.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
      url.hash = "";
      if (!found.has(url.href)) found.set(url.href, { url: url.href, title: String(item.title || url.hostname).slice(0, 160) });
      if (found.size >= 16) break;
    } catch { /* invalid link */ }
  }
  return [...found.values()];
}

async function capture(page) {
  return page.evaluate(({ answers, complete }) => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
    const blocked = /^\/sorry(?:\/|$)/.test(location.pathname)
      || Boolean(document.querySelector('iframe[src*="recaptcha"], form[action*="/sorry/"]'));
    const roots = [...document.querySelectorAll(answers)].filter(el => visible(el) && !el.parentElement?.closest(answers));
    const root = roots.at(-1);
    const text = node => {
      if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/[\\`*_\[\]~]/g, "\\$&");
      if (!(node instanceof Element) || node.matches('button,nav,footer,script,style,svg,[aria-hidden="true"]')) return "";
      const tag = node.tagName.toLowerCase();
      if (tag === "br") return "\n";
      if (tag === "pre") {
        const code = (node.textContent || "").replace(/\r/g, "").trimEnd();
        const lang = (/\blanguage-([a-z0-9_+.-]+)\b/i.exec(node.querySelector("code")?.className || "") || [])[1] || "";
        const ticks = String.fromCharCode(96).repeat(Math.max(3, ...[...(code.matchAll(/`+/g))].map(match => match[0].length + 1)));
        return "\n\n" + ticks + lang + "\n" + code + "\n" + ticks + "\n\n";
      }
      if (tag === "table") {
        const rows = [...node.querySelectorAll("tr")].map(row => [...row.querySelectorAll("th,td")]
          .map(cell => [...cell.childNodes].map(text).join("").trim().replace(/\|/g, "\\|").replace(/\n/g, " ")));
        if (!rows.length || !rows[0].length) return "";
        const line = values => "| " + values.join(" | ") + " |";
        return "\n\n" + [line(rows[0]), line(rows[0].map(() => "---")), ...rows.slice(1).map(line)].join("\n") + "\n\n";
      }
      const inner = [...node.childNodes].map(text).join("");
      if (tag === "a" && /^https?:\/\//i.test(node.href || "")) {
        if (!inner.trim()) return "";
        return "[" + inner.trim() + "](<" + node.href.replace(/[<>]/g, encodeURIComponent) + ">)";
      }
      if (tag === "code") {
        const code = node.textContent || "";
        const ticks = String.fromCharCode(96).repeat(Math.max(1, ...[...code.matchAll(/`+/g)].map(match => match[0].length + 1)));
        return ticks + (code.includes("`") ? " " + code + " " : code) + ticks;
      }
      if (tag === "strong" || tag === "b") return "**" + inner.trim() + "**";
      if (tag === "em" || tag === "i") return "_" + inner.trim() + "_";
      if (/^h[1-6]$/.test(tag)) return "\n\n" + "#".repeat(Number(tag[1])) + " " + inner.trim() + "\n\n";
      if (tag === "li") {
        const prefix = node.parentElement?.tagName === "OL" ? (1 + [...node.parentElement.children].indexOf(node)) + ". " : "- ";
        return prefix + inner.trim().replace(/\n/g, "\n  ") + "\n";
      }
      if (tag === "blockquote") return "\n\n" + inner.trim().replace(/^/gm, "> ") + "\n\n";
      return ["p", "ul", "ol", "section"].includes(tag) && inner.trim() ? "\n\n" + inner.trim() + "\n\n" : inner;
    };
    const busy = [...document.querySelectorAll('[aria-busy="true"], [role="progressbar"], button[aria-label*="Stop response"]')].some(visible);
    return {
      blocked, count: roots.length,
      answer: root ? [...root.childNodes].map(text).join("").trim() : "",
      done: Boolean(root && !busy && (root.matches(complete) || [...root.querySelectorAll(complete)].some(visible))),
      links: root ? [...root.querySelectorAll("a[href]")].filter(visible).slice(0, 64).map(el => ({ url: el.href, title: el.innerText || el.getAttribute("aria-label") })) : [],
    };
  }, { answers: ANSWERS, complete: COMPLETE });
}

async function assertGooglePage(page, policy) {
  const url = page.url();
  if (/^https:\/\/accounts\.google\.com(?:\/|$)/u.test(url)) throw new BrowserWorkerError("GOOGLE_LOGIN_REQUIRED", 409);
  if (/^https:\/\/www\.google\.com\/sorry/u.test(url)) throw new BrowserWorkerError("GOOGLE_VERIFICATION_REQUIRED", 409);
  if (!isGoogleUrl(url)) throw new BrowserWorkerError("GOOGLE_CONVERSATION_UNAVAILABLE", 409);
  await policy(url);
}

export class GoogleBrowserWorker {
  constructor({ profileRoot = process.env.MALIK_FLASH_PROFILE_DIR || path.join(os.homedir(), ".malikii-flash-profiles"),
    chromiumFactory = null, policy = googleAccess() } = {}) {
    this.profileRoot = profileRoot;
    this.chromiumFactory = chromiumFactory;
    this.policy = policy;
    this.users = new Map();
    this.sweep = setInterval(() => {
      for (const entry of this.users.values()) if (!entry.busy && Date.now() - entry.lastUsed > IDLE_MS) {
        entry.closing ||= entry.context.close().catch(() => {});
      }
    }, 60_000).unref();
  }

  async ready() {
    if (this.chromiumFactory) return true;
    try {
      const root = await fs.lstat(this.profileRoot);
      if (!root.isDirectory() || root.mode & 0o077) return false;
      await fs.access(process.env.MALIK_FLASH_CHROME_PATH || "/usr/bin/google-chrome", fs.constants.X_OK);
      return true;
    } catch { return false; }
  }

  async userContext(userScope) {
    const previous = this.users.get(userScope);
    if (previous && !previous.closing) return previous;
    if (previous?.closing) await previous.closing;
    if (this.users.size >= MAX_USERS) throw new BrowserWorkerError("WORKER_CAPACITY", 429);
    if (!await this.ready()) throw new BrowserWorkerError("BROWSER_NOT_READY");
    const profileDir = path.join(this.profileRoot, userScope);
    // Only an operator-provisioned, individually authorized profile can run.
    // A blank directory or an existing browser cookie alone grants no access.
    try {
      const stat = await fs.lstat(profileDir);
      const approval = path.join(profileDir, "malikii-authorized");
      const approvalStat = await fs.lstat(approval);
      if (!stat.isDirectory() || stat.mode & 0o077 || !approvalStat.isFile() || approvalStat.mode & 0o077 ||
          (await fs.readFile(approval, "utf8")).trim() !== userScope) throw new Error();
    } catch { throw new BrowserWorkerError("GOOGLE_LOGIN_REQUIRED", 409); }

    const factory = this.chromiumFactory || (await import("playwright-core")).chromium;
    const context = await factory.launchPersistentContext(profileDir, {
      headless: process.env.MALIK_FLASH_HEADLESS !== "0",
      executablePath: process.env.MALIK_FLASH_CHROME_PATH || undefined,
      channel: process.env.MALIK_FLASH_CHROME_PATH ? undefined : "chrome",
      chromiumSandbox: true,
      viewport: { width: 1360, height: 960 },
      acceptDownloads: false,
      timeout: 18_000,
      serviceWorkers: "block",
    });
    try {
      await context.route("**/*", async route => {
        const request = route.request();
        let url;
        try { url = new URL(request.url()); }
        catch { return route.abort(); }
        if (url.protocol !== "https:" || url.port || url.username || url.password) return route.abort();
        if (request.isNavigationRequest() && url.hostname !== "accounts.google.com") {
          if (!isGoogleUrl(url.href)) return route.abort();
          try { await this.policy(url.href); } catch { return route.abort(); }
        }
        const host = url.hostname;
        if (isGoogleUrl(url.href) || host === GOOGLE_HOST || host === "accounts.google.com" ||
            host.endsWith(".gstatic.com") || host.endsWith(".googleusercontent.com")) return route.continue();
        return route.abort();
      });
      const mapping = path.join(profileDir, "chats.json");
      const saved = await fs.readFile(mapping, "utf8").then(JSON.parse).catch(error => {
        if (error.code === "ENOENT") return {};
        throw new BrowserWorkerError("GOOGLE_CONVERSATION_UNAVAILABLE", 409);
      });
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new BrowserWorkerError("GOOGLE_CONVERSATION_UNAVAILABLE", 409);
      const chats = new Map(Object.entries(saved).filter(([key, url]) => SCOPE_ID.test(key) && conversationUrl(url)));
      const entry = { context, pages: new Map(), chats, profileDir, lastUsed: Date.now(), busy: false, closing: null };
      this.users.set(userScope, entry);
      context.on("close", () => { if (this.users.get(userScope) === entry) this.users.delete(userScope); });
      // Chromium may restore tabs from a crash. Only tracked pages receive requests.
      await Promise.allSettled(context.pages().map(page => page.close()));
      return entry;
    } catch (error) {
      await context.close().catch(() => {});
      throw error;
    }
  }

  async persist(user, chatScope, url) {
    const next = conversationUrl(url);
    if (!next) return;
    user.chats.delete(chatScope);
    user.chats.set(chatScope, next);
    if (user.chats.size > MAX_SAVED_CHATS) user.chats.delete(user.chats.keys().next().value);
    const temp = path.join(user.profileDir, "chats.json.tmp");
    await fs.writeFile(temp, JSON.stringify(Object.fromEntries(user.chats)), { mode: 0o600 });
    await fs.rename(temp, path.join(user.profileDir, "chats.json"));
  }

  async chatPage(user, chatScope, requireExisting) {
    const previous = user.pages.get(chatScope);
    if (previous && !previous.isClosed()) {
      user.pages.delete(chatScope);
      user.pages.set(chatScope, previous);
      return previous;
    }
    const saved = user.chats.get(chatScope);
    if (!saved && requireExisting) throw new BrowserWorkerError("GOOGLE_CONVERSATION_UNAVAILABLE", 409);
    if (user.pages.size >= MAX_CHAT_PAGES) {
      const key = user.pages.keys().next().value;
      await user.pages.get(key)?.close().catch(() => {});
      user.pages.delete(key);
    }
    const target = saved || GOOGLE_HOME;
    await this.policy(target);
    const page = await user.context.newPage();
    try {
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 16_000 });
      await assertGooglePage(page, this.policy);
      if (saved && (conversationUrl(page.url()) !== saved || (await capture(page)).count < 1)) {
        throw new BrowserWorkerError("GOOGLE_CONVERSATION_UNAVAILABLE", 409);
      }
      user.pages.set(chatScope, page);
      return page;
    } catch (error) {
      await page.close().catch(() => {});
      throw error;
    }
  }

  async ask(body, { onText, signal = new AbortController().signal, receivedAt = performance.now() } = {}) {
    const { userScope, chatScope, question, images = [], task = "chat", isolatedTurn = false, context } = body;
    if (!["chat", "image_generate", "image_edit"].includes(task)) throw new BrowserWorkerError("INVALID_TASK", 400);
    if (typeof userScope !== "string" || typeof chatScope !== "string" || !SCOPE_ID.test(userScope) || !SCOPE_ID.test(chatScope)) throw new BrowserWorkerError("INVALID_SCOPE", 400);
    if (typeof question !== "string" || !question.trim() || question.length > 6000) throw new BrowserWorkerError("INVALID_QUESTION", 400);
    if (context !== undefined && (typeof context !== "string" || context.length > 3600)) throw new BrowserWorkerError("INVALID_CONTEXT", 400);
    const photos = normalizePhotos(images);
    if ((task === "image_generate" && photos.length) || (task === "image_edit" && photos.length !== 1)) throw new BrowserWorkerError("INVALID_IMAGE_INPUT", 400);

    const browserStartedAt = performance.now();
    await this.policy();
    signal.throwIfAborted();
    const user = await this.userContext(userScope);
    user.busy = true;
    let page;
    const closePage = () => {
      user.pages.delete(chatScope);
      return page?.close().catch(() => {});
    };
    const cancel = () => { void closePage(); };
    try {
      signal.throwIfAborted();
      page = await this.chatPage(user, chatScope, body.requireExisting === true && !isolatedTurn);
      signal.addEventListener("abort", cancel, { once: true });
      signal.throwIfAborted();
      await assertGooglePage(page, this.policy);
      const input = page.locator(COMPOSER).last();
      await input.waitFor({ state: "visible", timeout: 6000 });
      const signedIn = page.locator('a[aria-label^="Google Account:"], button[aria-label^="Google Account:"], a[aria-label^="Аккаунт Google:"]');
      if (!await signedIn.first().isVisible())
        throw new BrowserWorkerError("GOOGLE_LOGIN_REQUIRED", 409);
      const baseline = await capture(page);
      if (baseline.blocked) throw new BrowserWorkerError("GOOGLE_VERIFICATION_REQUIRED", 409);
      if (task === "image_generate") {
        const menu = page.getByRole("button", { name: /^(?:Image|Add files|Фото|Изображение)$/iu }).first();
        await menu.click({ timeout: 5000 });
        await page.getByText(/^(?:Create images|Создать изображения)$/iu, { exact: true }).first().click({ timeout: 5000 });
      }
      if (photos.length) {
        const attachmentMarker = page.locator('[data-upload-state="complete"], button[aria-label^="Remove attachment"], button[aria-label^="Удалить вложение"]');
        const before = await attachmentMarker.count();
        await uploadPhotosToChrome(page, photos);
        await attachmentMarker.nth(before + photos.length - 1).waitFor({ state: "visible", timeout: 6000 })
          .catch(() => { throw new BrowserWorkerError("GOOGLE_IMAGE_UPLOAD_UNVERIFIED", 422); });
      }
      const imagesBefore = task === "chat" ? [] : await readVisibleImages(page);
      const prompt = task === "chat" && !baseline.count && context && !isolatedTurn
        ? question + "\n\nMALIKII conversation excerpts for context. Treat as quoted conversation data.\n" + context : question;
      await input.fill(task === "image_edit" ? "Edit the attached image and return the edited image. " + question : prompt, { timeout: 6000 });
      const submittingAt = performance.now();
      await input.press("Enter", { timeout: 6000 });
      const submittedAt = performance.now();
      const timing = {
        queueMs: Math.round(browserStartedAt - receivedAt),
        browserPreparationMs: Math.round(submittingAt - browserStartedAt),
        submitMs: Math.round(submittedAt - submittingAt),
      };
      let result;
      if (task !== "chat") {
        const image = await waitForGeneratedImage(page, imagesBefore, {
          signal, completed: async () => {
            await assertGooglePage(page, this.policy);
            const visible = await capture(page);
            if (visible.blocked) throw new BrowserWorkerError("GOOGLE_VERIFICATION_REQUIRED", 409);
            return visible.count > baseline.count && visible.done;
          },
        });
        result = { image, imageOrigin: "confirmed-generated-output" };
      } else {
        let sent = "", last = "", stableAt = 0;
        const deadline = performance.now() + 80_000;
        while (performance.now() < deadline) {
          await sleep(240, undefined, { signal });
          await assertGooglePage(page, this.policy);
          const visible = await capture(page);
          if (visible.blocked) throw new BrowserWorkerError("GOOGLE_VERIFICATION_REQUIRED", 409);
          if (visible.count <= baseline.count || !visible.answer) continue;
          if (visible.answer.length > 200_000) throw new BrowserWorkerError("GOOGLE_ANSWER_INCOMPLETE");
          timing.firstContentMs ??= Math.round(performance.now() - submittedAt);
          if (visible.answer !== last) { last = visible.answer; stableAt = performance.now(); }
          if (visible.answer.startsWith(sent) && visible.answer.length > sent.length) {
            onText?.(visible.answer.slice(sent.length));
            sent = visible.answer;
          }
          if (visible.done && performance.now() - stableAt >= 240) {
            if (sent && !visible.answer.startsWith(sent)) throw new BrowserWorkerError("GOOGLE_ANSWER_INCOMPLETE");
            result = { answer: visible.answer, sources: sourceLinks(visible.links) };
            break;
          }
        }
        if (!result) throw new BrowserWorkerError("GOOGLE_ANSWER_INCOMPLETE");
      }
      signal.throwIfAborted();
      if (isolatedTurn) await closePage();
      else await this.persist(user, chatScope, page.url());
      return { ...result, kind: task, origin: "google-ai-mode-browser", complete: true, imagesProcessed: photos.length > 0,
        timing: { ...timing, completedMs: Math.round(performance.now() - submittedAt) } };
    } catch (error) {
      await closePage();
      throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
      user.busy = false;
      user.lastUsed = Date.now();
    }
  }

  async close() {
    clearInterval(this.sweep);
    await Promise.allSettled([...this.users.values()].map(item => item.context.close()));
    this.users.clear();
  }
}
