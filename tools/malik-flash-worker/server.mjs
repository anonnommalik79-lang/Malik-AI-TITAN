import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { GoogleBrowserWorker } from "./browser.mjs";

const secret = process.env.MALIK_FLASH_WORKER_SECRET || "";
if (secret.length < 24) throw new Error("MALIK_FLASH_WORKER_SECRET must have 24+ characters.");
const host = process.env.MALIK_FLASH_WORKER_BIND || "127.0.0.1";
if (!["127.0.0.1", "localhost", "::1"].includes(host) && process.env.MALIK_FLASH_ALLOW_REMOTE !== "1") {
  throw new Error("Remote binding requires MALIK_FLASH_ALLOW_REMOTE=1 and HTTPS reverse proxy.");
}
const port = Number(process.env.MALIK_FLASH_WORKER_PORT || 8793);
const worker = new GoogleBrowserWorker();
const quota = new Map();
const safeHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" };

function json(res, status, data) {
  res.writeHead(status, { ...safeHeaders, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
function authorized(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token, "utf8"), b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
async function parse(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 30 * 1024 * 1024) throw Object.assign(new Error("Payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}
function rateLimit(scope) {
  const now = Date.now();
  const previous = quota.get(scope);
  const current = previous && previous.until > now ? previous : { count: 0, until: now + 3600_000 };
  current.count++;
  quota.set(scope, current);
  return current.count <= 30;
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true, service: "malik-flash-worker", authorized: false });
  if (request.method !== "POST" || request.url !== "/v1/ask") return json(response, 404, { error: "NOT_FOUND" });
  if (!authorized(request)) return json(response, 403, { error: "UNAUTHORIZED" });
  try {
    const body = await parse(request);
    if (!body || body.protocol !== "malik-flash-worker-v1") return json(response, 400, { error: "PROTOCOL_MISMATCH" });
    if (typeof body.userScope !== "string" || !/^[a-f0-9]{64}$/.test(body.userScope))
      return json(response, 400, { error: "INVALID_USER_SCOPE" });
    if (!rateLimit(body.userScope)) return json(response, 429, { error: "HOURLY_LIMIT" });
    const answer = await worker.ask(body);
    return json(response, 200, answer);
  } catch (error) {
    console.error("[MALIK_FLASH_WORKER]", error.code || "INTERNAL", error.message);
    return json(response, error.status && error.status >= 400 && error.status <= 599 ? error.status : 503, {
      error: error.code || "WORKER_FAILED",
      message: error.message || "Browser worker failure",
    });
  }
});
server.requestTimeout = 115_000;
server.listen(port, host, () => console.log("[MALIK_FLASH_WORKER] listening on " + host + ":" + port));
const shutdown = async () => { await worker.close(); server.close(); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
