import "server-only"
import { inflateRawSync } from "node:zlib"
import { isIgnoredPath, isSecretPath, isTextPath, safeProjectPath, type FileRejection, type ProjectFile } from "./files"

/**
 * Reads an uploaded ZIP of a project without trusting it.
 *
 * Only the central directory decides what exists. Each entry's name is a
 * safe relative path (no `..`, no absolute or drive paths), its declared and
 * actual sizes must agree, its CRC must match, and expansion is capped per
 * file, in total and by ratio — a zip bomb stops at the first entry that
 * crosses a limit. Encrypted, multi-disk and ZIP64 archives are refused.
 * Nothing is written to disk; generated, secret and binary files are listed
 * as skipped.
 */

export const ZIP_LIMITS = { bytes: 20 * 1024 * 1024, entries: 3000, entryBytes: 1024 * 1024, totalBytes: 24 * 1024 * 1024, ratio: 200 } as const

export class ZipReadError extends Error {
  constructor(public code: string) { super(code) }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function readProjectZip(buffer: Buffer): { files: ProjectFile[]; skipped: FileRejection[] } {
  if (buffer.length < 22 || buffer.length > ZIP_LIMITS.bytes) throw new ZipReadError("ZIP_SIZE")
  if (buffer.readUInt32LE(0) !== 0x04034b50 && buffer.readUInt32LE(0) !== 0x06054b50) throw new ZipReadError("ZIP_SIGNATURE")
  let end = -1
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { end = index; break }
  }
  if (end < 0) throw new ZipReadError("ZIP_NO_DIRECTORY")
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) throw new ZipReadError("ZIP_MULTI_DISK")
  const count = buffer.readUInt16LE(end + 10)
  const size = buffer.readUInt32LE(end + 12)
  let offset = buffer.readUInt32LE(end + 16)
  if (count === 0xffff || offset === 0xffffffff) throw new ZipReadError("ZIP64_UNSUPPORTED")
  if (count > ZIP_LIMITS.entries) throw new ZipReadError("ZIP_TOO_MANY_ENTRIES")
  if (offset + size > end) throw new ZipReadError("ZIP_DIRECTORY_BOUNDS")

  const files: ProjectFile[] = []
  const skipped: FileRejection[] = []
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let total = 0
  for (let entry = 0; entry < count; entry++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new ZipReadError("ZIP_DIRECTORY_ENTRY")
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const crc = buffer.readUInt32LE(offset + 16)
    const compressed = buffer.readUInt32LE(offset + 20)
    const uncompressed = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const local = buffer.readUInt32LE(offset + 42)
    if (offset + 46 + nameLength + extraLength + commentLength > buffer.length) throw new ZipReadError("ZIP_DIRECTORY_ENTRY")
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength).toString(flags & 0x800 ? "utf8" : "latin1")
    offset += 46 + nameLength + extraLength + commentLength
    if (rawName.endsWith("/")) continue
    if (flags & 0x1) throw new ZipReadError("ZIP_ENCRYPTED")
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) throw new ZipReadError("ZIP64_UNSUPPORTED")
    const path = safeProjectPath(rawName)
    if (!path) { skipped.push({ path: rawName.slice(0, 200), code: "UNSAFE_PATH" }); continue }
    if (isIgnoredPath(path)) { skipped.push({ path, code: "IGNORED_DIRECTORY" }); continue }
    if (isSecretPath(path)) { skipped.push({ path, code: "SECRET_FILE" }); continue }
    if (!isTextPath(path)) { skipped.push({ path, code: "BINARY_OR_UNSUPPORTED" }); continue }
    if (uncompressed > ZIP_LIMITS.entryBytes) { skipped.push({ path, code: "TOO_LARGE" }); continue }
    if (compressed > 0 && uncompressed / compressed > ZIP_LIMITS.ratio && uncompressed > 64 * 1024) throw new ZipReadError("ZIP_BOMB_RATIO")
    total += uncompressed
    if (total > ZIP_LIMITS.totalBytes) throw new ZipReadError("ZIP_TOO_LARGE_TOTAL")
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new ZipReadError("ZIP_LOCAL_HEADER")
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    if (start + compressed > buffer.length) throw new ZipReadError("ZIP_TRUNCATED")
    const raw = buffer.subarray(start, start + compressed)
    let data: Buffer
    if (method === 0) data = raw
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: ZIP_LIMITS.entryBytes }) } catch { throw new ZipReadError("ZIP_INFLATE") }
    } else { skipped.push({ path, code: "BINARY_OR_UNSUPPORTED" }); continue }
    if (data.length !== uncompressed || crc32(data) !== crc) throw new ZipReadError("ZIP_CRC_OR_SIZE")
    let text: string
    try { text = decoder.decode(data) } catch { skipped.push({ path, code: "BINARY_OR_UNSUPPORTED" }); continue }
    if (text.includes("\u0000")) { skipped.push({ path, code: "BINARY_OR_UNSUPPORTED" }); continue }
    files.push({ path, content: text.replace(/^\uFEFF/, "") })
  }
  return { files, skipped }
}
