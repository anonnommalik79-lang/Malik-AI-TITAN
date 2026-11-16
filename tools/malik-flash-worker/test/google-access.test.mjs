import assert from "node:assert/strict";
import test from "node:test";
import { googleAccess } from "../google-access.mjs";
import { GoogleBrowserWorker, isGoogleUrl } from "../browser.mjs";

const scope = "1".repeat(64);
const request = { userScope: scope, chatScope: "2".repeat(64), question: "Hello" };

test("general robots rule applies when multiple user agents share a group", async () => {
  let reads = 0;
  const policy = googleAccess(async () => {
    reads++;
    return new Response("User-agent: *\nUser-agent: Yandex\nDisallow: /search\nAllow: /search/about\n\nUser-agent: Twitterbot\nAllow: /search");
  });
  await assert.rejects(policy("https://www.google.com/ai"), { code: "GOOGLE_AUTOMATION_RESTRICTED" });
  await assert.rejects(policy(), { code: "GOOGLE_AUTOMATION_RESTRICTED" });
  assert.equal(reads, 1);
});

test("robots outage stops access before creating Chrome context", async t => {
  const worker = new GoogleBrowserWorker({
    policy: googleAccess(async () => new Response("upstream down", { status: 502 })),
    chromiumFactory: { launchPersistentContext() { assert.fail("Chrome was opened"); } },
  });
  t.after(() => worker.close());
  await assert.rejects(worker.ask(request), { code: "GOOGLE_AUTOMATION_RESTRICTED" });
});

test("an allowed test policy still requires a separately authorized account profile", async t => {
  const worker = new GoogleBrowserWorker({
    profileRoot: "/nonexistent/malikii-provider-fixture",
    policy: googleAccess(async () => new Response("User-agent: *\nAllow: /")),
    chromiumFactory: { launchPersistentContext() { assert.fail("Profile was missing"); } },
  });
  t.after(() => worker.close());
  await assert.rejects(worker.ask(request), { code: "GOOGLE_LOGIN_REQUIRED" });
  assert.equal(isGoogleUrl("https://accounts.google.com/"), false);
  assert.equal(isGoogleUrl("https://www.google.com:9443/ai"), false);
});

test("disallowed Google AI Mode blocks all four multimodal tasks before Chrome", async t => {
  let launches = 0;
  const worker = new GoogleBrowserWorker({
    policy: googleAccess(async () => new Response("User-agent: *\nDisallow: /search")),
    chromiumFactory: { launchPersistentContext() { launches++; throw new Error("Browser must not launch"); } },
  });
  t.after(() => worker.close());
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  for (const body of [
    { ...request, task: "chat" },
    { ...request, task: "chat", images: [{ mime: "image/png", base64: tinyPng }] },
    { ...request, task: "image_generate" },
    { ...request, task: "image_edit", images: [{ mime: "image/png", base64: tinyPng }] },
  ]) {
    await assert.rejects(worker.ask(body), { code: "GOOGLE_AUTOMATION_RESTRICTED" });
  }
  assert.equal(launches, 0);
});
