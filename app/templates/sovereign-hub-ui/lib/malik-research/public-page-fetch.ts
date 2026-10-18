import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { assertPublicHttpUrl } from "../server/request-safety"

const blocked = new BlockList()
for (const [base, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) blocked.addSubnet(base, prefix, "ipv4")
const publicV6 = new BlockList(); publicV6.addSubnet("2000::", 3, "ipv6")
export function publicIp(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, "ipv4") : family === 6 && publicV6.check(address, "ipv6")
}
export async function publicAddresses(host: string, resolver = lookup, signal?: AbortSignal) {
  signal?.throwIfAborted()
  let abort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(signal?.reason); signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort() })
  const addresses = await Promise.race([resolver(host, { all: true, verbatim: true }), cancelled]).finally(() => signal?.removeEventListener("abort", abort))
  if (!addresses.length || addresses.some((item) => !publicIp(item.address))) throw new Error("Unsafe page DNS address")
  return addresses
}

/** Resolve, validate and PIN the DNS address for each redirect; no private-network fetch or rebinding. */
export async function fetchPublicPage(value: string, signal: AbortSignal, maxBytes = 1024 * 1024, options?: { media?: "image" }): Promise<Response> {
  let target = assertPublicHttpUrl(value)
  if (target.port && !["80", "443"].includes(target.port)) throw new Error("Unsafe page port")
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted()
    const addresses = await publicAddresses(target.hostname, lookup, signal)
    signal.throwIfAborted()
    const pinned = addresses[0]
    const response = await new Promise<Response>((resolve, reject) => {
      const makeRequest = target.protocol === "https:" ? httpsRequest : httpRequest
      const request = makeRequest(target, {
        signal,
        lookup: (_host, options, callback) => {
          if (typeof options === "object" && options.all) callback(null, [pinned])
          else callback(null, pinned.address, pinned.family)
        },
        headers: { "user-agent": "MALIK-AI-ResearchBot/6.0", accept: options?.media === "image" ? "image/jpeg,image/png,image/webp" : "text/html,text/plain,application/json", "accept-encoding": "identity" },
      }, (incoming) => {
        const status = incoming.statusCode || 502
        const headers = new Headers()
        for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value)
        const mime = headers.get("content-type") || ""
        if (status >= 300 && status < 400 || /^(?:image|video|audio)\/|application\/pdf/iu.test(mime) && !(options?.media === "image" && /^image\/(?:jpeg|png|webp)(?:;|$)/iu.test(mime))) {
          incoming.destroy(); resolve(new Response(null, { status, headers })); return
        }
        if (Number(headers.get("content-length")) > maxBytes || headers.has("content-encoding") && headers.get("content-encoding") !== "identity") {
          incoming.destroy(); reject(new Error("Unsupported or oversized page body")); return
        }
        const chunks: Buffer[] = []; let size = 0
        incoming.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { incoming.destroy(); reject(new Error("Page byte limit")) } else chunks.push(chunk) })
        incoming.on("error", reject)
        incoming.on("end", () => { headers.delete("content-length"); resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers })) })
      })
      request.on("error", reject); request.end()
    })
    if (!(response.status >= 300 && response.status < 400)) return response
    const location = response.headers.get("location")
    if (!location || redirects === 3) throw new Error("Page redirect limit")
    target = assertPublicHttpUrl(new URL(location, target).href)
    if (target.port && !["80", "443"].includes(target.port)) throw new Error("Unsafe page redirect port")
  }
  throw new Error("Page redirect limit")
}
