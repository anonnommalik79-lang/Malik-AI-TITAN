import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhotos, uploadPhotosToChrome, PhotoUploadError } from "../photo.mjs";
import { assertGooglePage, GOOGLE_COMPOSER_SELECTOR, GoogleBrowserWorker, isGoogleUrl, sourceLinks } from "../browser.mjs";

const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==";

test("decodes a real PNG attachment into a Chromium FilePayload", () => {
  const images = normalizePhotos([{ mime: "image/png", base64: tinyPng, name: "test.png" }]);
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, "image/png");
  assert.equal(images[0].name, "test.png");
  assert.ok(images[0].buffer.length > 30);
});

test("blocks forged MIME and oversized image lists", () => {
  assert.throws(() => normalizePhotos([{ mime: "image/jpeg", base64: tinyPng }]), e => e.code === "IMAGE_MIME_MISMATCH");
  assert.throws(() => normalizePhotos(Array.from({length: 5}, () => ({ mime: "image/png", base64: tinyPng }))), e => e.code === "TOO_MANY_IMAGES");
  assert.throws(() => normalizePhotos([{ mime: "text/plain", base64: tinyPng }]), PhotoUploadError);
});

test("calls actual Playwright setInputFiles with bytes, without fake response", async () => {
  const received = [];
  const input = {
    getAttribute: async () => null,
    setInputFiles: async (files) => received.push(files),
  };
  const page = {
    locator: () => ({ count: async () => 1, first: () => input }),
    waitForTimeout: async () => {},
  };
  const count = await uploadPhotosToChrome(page, normalizePhotos([{ mime: "image/png", base64: tinyPng }]));
  assert.equal(count, 1);
  assert.equal(received.length, 1);
  assert.ok(Buffer.isBuffer(received[0][0].buffer));
});

test("supports Google two-stage Image -> Upload image chooser", async () => {
  let openedMenu = 0, clickedUpload = 0, uploaded = 0;
  const page = {
    locator: () => ({ count: async () => 0 }),
    getByRole: (role) => ({
      first: () => ({
        count: async () => role === "button" || role === "menuitem" ? 1 : 0,
        isVisible: async () => true,
        click: async () => { if (role === "menuitem") clickedUpload++; else openedMenu++; },
      }),
    }),
    waitForEvent: async () => ({ setFiles: async photos => { uploaded += photos.length; } }),
    waitForTimeout: async () => {},
  };
  const result = await uploadPhotosToChrome(page, normalizePhotos([{ mime: "image/png", base64: tinyPng }]));
  assert.equal(openedMenu, 1);
  assert.equal(clickedUpload, 1);
  assert.equal(uploaded, 1);
  assert.equal(result, 1);
});

test("exposes a clear error instead of claiming photo transfer", async () => {
  const page = {
    locator: () => ({ count: async () => 0 }),
    getByRole: () => ({ first: () => ({ count: async () => 0 }) }),
  };
  await assert.rejects(uploadPhotosToChrome(page, normalizePhotos([{ mime: "image/png", base64: tinyPng }])), e => e.code === "GOOGLE_IMAGE_BUTTON_NOT_FOUND");
});

test("isolates account keys to 64-char opaque hashes", async t => {
  const worker = new GoogleBrowserWorker();
  t.after(() => worker.close());
  await assert.rejects(worker.ask({ userScope: "founder-email", chatScope: "chat1", question: "test" }), e => e.code === "INVALID_SCOPE");
});

test("rejects arbitrary restored URLs", () => {
  assert.equal(isGoogleUrl("https://www.google.com/search?udm=50"), true);
  assert.equal(isGoogleUrl("https://google.com/ai"), true);
  assert.equal(isGoogleUrl("https://evilgoogle.com/ai"), false);
  assert.equal(isGoogleUrl("http://google.com/ai"), false);
  assert.equal(isGoogleUrl("https://www.google.com.evil.example/ai"), false);
});

test("recognizes the Russian AI Mode composer by its label or placeholder", () => {
  assert.ok(GOOGLE_COMPOSER_SELECTOR.includes('[aria-label="Задайте вопрос"]'));
  assert.ok(GOOGLE_COMPOSER_SELECTOR.includes('[placeholder="Задайте вопрос"]'));
  assert.ok(GOOGLE_COMPOSER_SELECTOR.includes('[aria-label="Ask anything"]'));
});

test("Google consent stops submission and other pages still require the access check", async () => {
  for (const [url, code] of [
    ["https://consent.google.com/m", "GOOGLE_CONSENT_REQUIRED"],
    ["https://accounts.google.com/signin", "GOOGLE_LOGIN_REQUIRED"],
    ["https://consent.google.com.example.org/m", "GOOGLE_CONVERSATION_UNAVAILABLE"],
  ]) {
    await assert.rejects(assertGooglePage({ url: () => url }, () => assert.fail("unexpected policy call")), { code, status: 409 });
  }
  const url = "https://www.google.com/ai";
  await assert.rejects(assertGooglePage({ url: () => url }, async target => {
    assert.equal(target, url);
    throw new Error("automatic access unavailable");
  }), /automatic access unavailable/u);
});

test("deduplicates sources and rejects local/file URLs", () => {
  const links = sourceLinks([{url:"https://example.org/a#x",title:"X"},{url:"https://example.org/a#y",title:"Y"},{url:"file:///secret",title:"Secret"}]);
  assert.equal(links.length, 1);
  assert.equal(links[0].url, "https://example.org/a");
});
