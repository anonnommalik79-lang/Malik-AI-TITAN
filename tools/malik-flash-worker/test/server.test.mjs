import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("worker HTTP admission authenticates health and work, correlates failures, caps requests, and drains", async t => {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address();
  await new Promise(resolve => reservation.close(resolve));

  const secret = "test-only-secret-".repeat(3);
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, MALIK_FLASH_WORKER_SECRET: secret, MALIK_FLASH_WORKER_BIND: "127.0.0.1", MALIK_FLASH_WORKER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ended = once(child, "exit");
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  let startupTimer;
  try {
    await Promise.race([
      new Promise(resolve => child.stdout.on("data", chunk => { if (String(chunk).includes("listening")) resolve(); })),
      ended.then(([code]) => { throw new Error("Flash worker exited during startup (" + code + ")"); }),
      new Promise((_, reject) => { startupTimer = setTimeout(() => reject(new Error("Worker start timeout")), 10_000); }),
    ]);
  } finally { clearTimeout(startupTimer); }

  const base = "http://127.0.0.1:" + port;
  for (const [method, url] of [["GET", "/health"], ["GET", "/metrics"], ["POST", "/v1/ask"]]) {
    const response = await fetch(base + url, { method });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "UNAUTHORIZED");
  }
  const metrics = await fetch(base + "/metrics", { headers: { authorization: "Bearer " + secret } });
  assert.equal(metrics.status, 200);
  assert.deepEqual((await metrics.json()).latency, {});

  async function submit(data) {
    const requestId = randomUUID();
    const response = await fetch(base + "/v1/ask", {
      method: "POST",
      headers: { authorization: "Bearer " + secret, "content-type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({ requestId, protocol: "malik-flash-worker-v1", userScope: "a".repeat(64), chatScope: "b".repeat(64), task: "chat", question: "", ...data }),
    });
    const payload = await response.json();
    assert.equal(response.headers.get("x-request-id"), requestId);
    assert.equal(payload.requestId, requestId);
    return [response.status, payload.error];
  }
  assert.deepEqual(await submit({ userScope: "different-identity" }), [400, "INVALID_SCOPE"]);
  for (let n = 0; n < 30; n++) assert.deepEqual(await submit({}), [400, "INVALID_QUESTION"]);
  assert.deepEqual(await submit({}), [429, "HOURLY_LIMIT"]);
  child.kill("SIGTERM");
  assert.deepEqual(await ended, [0, null]);
});
