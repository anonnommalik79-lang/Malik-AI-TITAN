import fs from "node:fs/promises"
import path from "node:path"
import { updateKnowledgeIndex } from "../lib/live-intelligence/feed-updater.ts"
import { knowledgeHealth, validateKnowledgeIndex } from "../lib/live-intelligence/knowledge-index.ts"

const target = process.argv[2]
if (!target) throw new Error("Usage: update-live-knowledge.mjs /path/to/index.json")
let previous = null
try { previous = validateKnowledgeIndex(JSON.parse(await fs.readFile(target, "utf8"))) } catch {}
const index = await updateKnowledgeIndex(previous, { runId: process.env.GITHUB_RUN_ID || undefined })
const payload = JSON.stringify(index, null, 2) + "\n"
if (Buffer.byteLength(payload) > 2 * 1024 * 1024) throw new Error("INDEX_SIZE_LIMIT")
await fs.mkdir(path.dirname(target), { recursive: true })
await fs.writeFile(target + ".tmp", payload)
await fs.rename(target + ".tmp", target)
console.log(JSON.stringify(knowledgeHealth(index)))
if (!index.lastSuccessAt || index.lastSuccessAt !== index.lastAttemptAt) process.exitCode = 1
