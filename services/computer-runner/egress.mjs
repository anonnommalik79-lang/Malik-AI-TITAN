import { createServer } from "node:http"
import { connect } from "node:net"
import { lookup } from "node:dns/promises"
import { publicAddress, publicUrl } from "./policy.mjs"

/** HTTPS CONNECT proxy pins the validated DNS address before opening the socket. */
export async function startEgressProxy() {
  const server = createServer((_request, response) => { response.writeHead(403); response.end() })
  server.on("connect", async (request, socket, head) => {
    let upstream
    socket.on("error", () => upstream?.destroy())
    try {
      const destination = new URL(await publicUrl("https://" + request.url))
      const host = destination.hostname.replace(/^\[|\]$/gu, "")
      const addresses = await lookup(host, { all: true })
      if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error("Private destination")
      // Connect to the checked address, never resolve the hostname again in Chromium.
      upstream = connect({ host: addresses[0].address, family: addresses[0].family, port: 443 })
      upstream.setTimeout(45_000, () => upstream.destroy())
      upstream.on("error", () => socket.destroy())
      socket.on("close", () => upstream.destroy())
      upstream.on("connect", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head.length) upstream.write(head)
        upstream.pipe(socket); socket.pipe(upstream)
      })
    } catch { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n") }
  })
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  return `http://127.0.0.1:${server.address().port}`
}
