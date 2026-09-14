const encoder = new TextEncoder()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
}

function u32(value: number) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ])
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

export type ProjectZipFile = {
  name: string
  content: string
}

/**
 * Tiny dependency-free ZIP writer. Files are stored without compression: for
 * AI-generated source bundles this is fast, deterministic and works in every
 * modern browser without pulling a large archiver into the dashboard bundle.
 */
export function buildProjectZip(files: ProjectZipFile[]) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  const { time, day } = dosDateTime()

  for (const file of files) {
    const name = encoder.encode(file.name.replace(/^\/+/, ""))
    const data = encoder.encode(file.content)
    const checksum = crc32(data)
    const flags = 0x0800 // UTF-8 filenames

    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(0),
      u16(time),
      u16(day),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ])
    localParts.push(local)

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(flags),
      u16(0),
      u16(time),
      u16(day),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    centralParts.push(central)
    offset += local.length
  }

  const centralDirectory = concat(centralParts)
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ])

  return new Blob([...localParts, centralDirectory, end], { type: "application/zip" })
}

export function downloadProjectZip(filename: string, files: ProjectZipFile[]) {
  const blob = buildProjectZip(files)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.endsWith(".zip") ? filename : `${filename}.zip`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
