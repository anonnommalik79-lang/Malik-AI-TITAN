import http from "node:http"
import fs from "node:fs"
import path from "node:path"

const port = Number(process.argv[2] || 3000)
const root = path.join(process.cwd(), "out")
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
}

const server = http.createServer((request, response) => {
  const clean = decodeURIComponent((request.url || "/").split("?")[0])
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "")
  let file = path.join(root, relative)

  if (!file.startsWith(root)) {
    response.writeHead(403)
    response.end("Forbidden")
    return
  }

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, "index.html")
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404)
      response.end("Not found")
      return
    }
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" })
    response.end(data)
  })
})

server.listen(port, "127.0.0.1", () => {
  try {
    console.log(`Malik static preview ready at http://localhost:${port}`)
  } catch {
    // Hidden Windows background processes can start without a writable console.
  }
})
