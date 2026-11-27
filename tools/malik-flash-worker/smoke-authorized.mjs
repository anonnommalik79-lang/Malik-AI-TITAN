// Live, opt-in smoke test. Never bypass the worker's Google access checks.
// Node 22+. Supply an authorized isolated test profile scope via environment.
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

async function main() {
  const endpoint = new URL(process.env.MALIK_FLASH_WORKER_URL || "");
  const secret = process.env.MALIK_FLASH_WORKER_SECRET || "";
  const userScope = process.env.MALIK_FLASH_SMOKE_USER_SCOPE || "";
  const chatScope = process.env.MALIK_FLASH_SMOKE_CHAT_SCOPE || "";
  assert.equal(endpoint.protocol, "https:", "Use the authorized HTTPS worker.");
  assert.equal(endpoint.pathname, "/v1/ask");
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash);
  assert.ok(secret.length >= 24, "Worker secret is required.");
  assert.ok(/^[a-f0-9]{64}$/.test(userScope) && /^[a-f0-9]{64}$/.test(chatScope), "Supply authorized test scopes.");
  const headers = { authorization: "Bearer " + secret, accept: "application/json" };
  async function request(url, options = {}) {
    const requestId = randomUUID();
    const body = options.body ? JSON.stringify({ ...options.body, requestId }) : undefined;
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { ...headers, "x-request-id": requestId, ...(body ? { "content-type": "application/json" } : {}) },
      body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(115000),
    });
    const receipt = await response.json();
    assert.equal(response.headers.get("x-request-id"), requestId, "Uncorrelated response.");
    assert.equal(receipt.requestId, requestId, "Uncorrelated receipt.");
    if (!response.ok) {
      const code = /^[A-Z0-9_]{1,80}$/.test(receipt.error || "") ? receipt.error : "UNVERIFIED_ERROR";
      throw new Error("Worker returned HTTP " + response.status + " " + code);
    }
    return receipt;
  }
  const health = await request(new URL("/health", endpoint));
  assert.equal(health.ok, true, "Worker is not ready.");
  const start = performance.now();
  const result = await request(endpoint, { body: {
    protocol: "malik-flash-worker-v1", task: "chat", userScope, chatScope,
    question: "Почему небо голубое?", images: [], requireExisting: false, isolatedTurn: false,
  } });
  assert.equal(result.origin, "google-ai-mode-browser");
  assert.equal(result.kind, "chat");
  assert.equal(result.complete, true);
  assert.ok(typeof result.answer === "string" && result.answer.trim().length > 0);
  console.log(JSON.stringify({ status: "worker-receipt-verified", provider: result.origin,
    elapsedMs: Math.round(performance.now() - start), answerCharacters: result.answer.length,
    scope: "worker-only; chat UI and persistence still require separate verification" }));
}
main().catch(error => {
  console.error("Flash smoke failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
