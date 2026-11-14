import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { GoogleBrowserWorker } from "./browser.mjs";
import { googleAccess } from "./google-access.mjs";
import { flashLatency } from "./telemetry.mjs";

const secret = process.env.MALIK_FLASH_WORKER_SECRET || "";
if (secret.length < 24) throw new Error("MALIK_FLASH_WORKER_SECRET must have 24+ characters.");
const host = process.env.MALIK_FLASH_WORKER_BIND || "127.0.0.1";
const remote = !["127.0.0.1", "localhost", "::1"].includes(host);
if (remote && process.env.MALIK_FLASH_ALLOW_REMOTE !== "1") throw new Error("Remote binding requires an authenticated HTTPS reverse proxy.");
const port = Number(process.env.MALIK_FLASH_WORKER_PORT || process.env.PORT || 8793);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Flash worker port.");
const policy = googleAccess();
const worker = new GoogleBrowserWorker({ policy });
const latency = flashLatency();
const quota = new Map();
const running = new Set();
const active = new Set();
const WINDOW_MS = 60 * 60_000;
const MAX_QUOTA_ACCOUNTS = 1024;
const MAX_ACTIVE = 4;
const MAX_BODY_BYTES = 29 * 1024 * 1024;
const scopeId = /^[a-f0-9]{64}$/u;
const requestIdPattern = /^[a-f0-9-]{36}$/u;
const secretBytes = Buffer.from(secret);
const safeHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" };

function authorized(request) {
  const header = request.headers.authorization || "";
  const token = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  return token.length === secretBytes.length && timingSafeEqual(token, secretBytes);
}

function json(response, status, data) {
  response.writeHead(status, { ...safeHeaders, "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function parse(request) {
  const chunks = [];
  let size = 0;
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) throw Object.assign(new Error(), { status: 413, code: "PAYLOAD_TOO_LARGE" });
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error(), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error(), { status: 400, code: "INVALID_JSON" }); }
}

function rateLimit(scope) {
  const now = Date.now();
  for (const [key, current] of quota) if (current.until <= now) quota.delete(key);
  let current = quota.get(scope);
  if (!current && quota.size >= MAX_QUOTA_ACCOUNTS) return false;
  current ||= { count: 0, until: now + WINDOW_MS };
  if (current.count >= 30) return false;
  current.count++;
  quota.set(scope, current);
  return true;
}

let stopping = false;
const server = http.createServer(async (request, response) => {
  const receivedAt = performance.now();
  const requestId = requestIdPattern.test(request.headers["x-request-id"] || "") ? request.headers["x-request-id"] : randomUUID();
  response.setHeader("x-request-id", requestId);
  if (!authorized(request)) return json(response, 403, { error: "UNAUTHORIZED", requestId });
  // The trusted reverse proxy must set this header itself and prevent direct access to this port.
  if (remote && request.headers["x-forwarded-proto"] !== "https") return json(response, 403, { error: "HTTPS_REQUIRED", requestId });
  if (stopping) return json(response, 503, { error: "WORKER_DRAINING", requestId });
  if (request.method === "GET" && request.url === "/metrics") {
    return json(response, 200, { ok: true, requestId, latency: latency.snapshot() });
  }
  if (request.method === "GET" && request.url === "/health") {
    try {
      await policy();
      const ready = await worker.ready();
      return json(response, ready ? 200 : 503, { ok: ready, authorized: true, requestId });
    } catch { return json(response, 503, { ok: false, error: "GOOGLE_AUTOMATION_RESTRICTED", requestId }); }
  }
  if (request.method !== "POST" || request.url !== "/v1/ask") return json(response, 404, { error: "NOT_FOUND", requestId });
  if (active.size >= MAX_ACTIVE) return json(response, 429, { error: "WORKER_CAPACITY", requestId });

  const connection = new AbortController();
  const signal = AbortSignal.any([connection.signal, AbortSignal.timeout(110_000)]);
  active.add(connection);
  let userScope;
  let streamed = false;
  const onClose = () => { if (!response.writableEnded) connection.abort(); };
  response.once("close", onClose);
  try {
    const body = await parse(request);
    if (!body || body.protocol !== "malik-flash-worker-v1" || body.requestId !== requestId)
      return json(response, 400, { error: "PROTOCOL_MISMATCH", requestId });
    if (typeof body.userScope !== "string" || typeof body.chatScope !== "string" || !scopeId.test(body.userScope) || !scopeId.test(body.chatScope))
      return json(response, 400, { error: "INVALID_SCOPE", requestId });
    if (running.has(body.userScope)) return json(response, 409, { error: "USER_BUSY", requestId });
    userScope = body.userScope;
    running.add(userScope);
    if (!rateLimit(userScope)) return json(response, 429, { error: "HOURLY_LIMIT", requestId });
    signal.throwIfAborted();
    const task = body.task === undefined ? "chat" : body.task;
    const wantsStream = task === "chat" && request.headers.accept === "application/x-ndjson";
    const push = event => {
      if (response.destroyed) return;
      if (!streamed) {
        streamed = true;
        response.writeHead(200, { ...safeHeaders, "content-type": "application/x-ndjson; charset=utf-8", "x-accel-buffering": "no" });
      }
      response.write(JSON.stringify({ ...event, requestId }) + "\n");
    };
    const answer = await worker.ask(body, { receivedAt, signal, onText: wantsStream ? text => push({ type: "delta", text }) : undefined });
    const metricTask = task === "chat" && body.images?.length ? "image_understanding" : task;
    latency.record(metricTask, answer.timing);
    if (response.destroyed) return;
    if (wantsStream) {
      push({ type: "done", result: answer });
      response.end();
    } else json(response, 200, { ...answer, requestId });
    console.info("[MALIK_FLASH_WORKER]", { requestId, task: metricTask, timing: answer.timing });
  } catch (error) {
    const code = connection.signal.aborted ? "REQUEST_ABORTED" : signal.aborted ? "WORKER_TIMEOUT"
      : /^[A-Z0-9_]{1,80}$/u.test(error.code || "") ? error.code : "WORKER_FAILED";
    console.warn("[MALIK_FLASH_WORKER]", { requestId, code });
    if (!response.destroyed && streamed) response.end(JSON.stringify({ type: "error", error: code, requestId }) + "\n");
    else if (!response.destroyed) {
      const status = connection.signal.aborted ? 499 : signal.aborted ? 504 : error.status >= 400 && error.status < 600 ? error.status : 503;
      json(response, status, { error: code, requestId });
    }
  } finally {
    if (userScope) running.delete(userScope);
    active.delete(connection);
    response.off("close", onClose);
  }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.maxConnections = 32;
server.listen(port, host, () => console.info("[MALIK_FLASH_WORKER] listening", { port }));

async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  for (const connection of active) connection.abort();
  await worker.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
