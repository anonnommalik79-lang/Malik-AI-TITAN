import { documentDisposition } from "./export"
export function documentResponse(file: { bytes: Uint8Array; mime: string; filename: string }) {
  return new Response(Buffer.from(file.bytes), { headers: { "content-type": file.mime, "content-disposition": documentDisposition(file.filename), "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } })
}
