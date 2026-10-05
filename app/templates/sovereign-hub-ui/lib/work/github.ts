import "server-only"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { getPipesCredential } from "@/lib/server/plugin-pipes"
import { readOwnerJson, writeOwnerJson, storeIsDurable, ownerKey } from "@/lib/os/store"
import { recordWorkActivity } from "./activity-log"

const repository = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}\/[a-zA-Z0-9_.-]{1,100}$/).refine(value => !value.split("/").some(part => part === "." || part === ".."))
const ref = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/).refine(value => !value.includes("..") && !value.includes("//") && !value.endsWith("/") && !value.endsWith(".") && !value.endsWith(".lock") && !value.split("/").some(part => part.startsWith(".")))
const filePath = z.string().min(1).max(240).refine(value => !value.startsWith("/") && !/[\\:\p{Cc}]/u.test(value) && !value.split("/").some(part => !part || part === "." || part === ".."))
const sha = z.string().regex(/^[a-f0-9]{40}$/)
export const githubReadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tree"), repo: repository, ref }).strict(),
  z.object({ action: z.literal("file"), repo: repository, ref, path: filePath }).strict(),
  z.object({ action: z.literal("search"), repo: repository, query: z.string().min(1).max(180).refine(value => !/(?:repo|org|user):/i.test(value)) }).strict(),
])
export const githubWriteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("branch"), repo: repository, base: ref, branch: ref, expectedHead: sha }).strict(),
  z.object({ action: z.literal("commit"), repo: repository, branch: ref, expectedHead: sha, message: z.string().min(1).max(200), files: z.array(z.object({ path: filePath, content: z.string().max(64000) }).strict()).min(1).max(20) }).strict(),
  z.object({ action: z.literal("pull-request"), repo: repository, base: ref, head: ref, expectedHead: sha, expectedBase: sha, title: z.string().min(1).max(160), body: z.string().max(12000), draft: z.boolean().default(true) }).strict(),
])
export type GitHubWrite = z.infer<typeof githubWriteSchema>
export class WorkGitHubError extends Error { constructor(public code: string, message: string, public status = 400) { super(message) } }
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`
  return JSON.stringify(value)
}
export function githubConfirmationConfigured() { return Boolean(confirmationSecret()) }
function confirmationSecret() { const secret = process.env.WORK_CONFIRMATION_SECRET || process.env.WORKOS_COOKIE_PASSWORD || ""; return secret.length >= 32 ? secret : "" }
function signature(ownerId: string, payload: GitHubWrite, expires: number) {
  const secret = confirmationSecret()
  if (!secret) throw new WorkGitHubError("CONFIRMATION_NOT_CONFIGURED", "Для записи настройте WORK_CONFIRMATION_SECRET или WORKOS_COOKIE_PASSWORD (не менее 32 символов).", 503)
  return createHmac("sha256", secret).update(`${ownerKey(ownerId)}:${hash(stable(payload))}:${expires}`).digest("hex")
}
function confirm(ownerId: string, payload: GitHubWrite, id: string, now: number) {
  const [expiry, digest, extra] = id.split("."), expires = Number(expiry)
  if (extra || !/^\d{13}$/.test(expiry || "") || !/^[a-f0-9]{64}$/.test(digest || "") || !Number.isSafeInteger(expires) || expires <= now || expires > now + 600000) throw new WorkGitHubError("CONFIRMATION_REQUIRED", "Предпросмотр истёк или отсутствует. Сначала просмотрите изменения.", 403)
  if (!timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(signature(ownerId, payload, expires), "hex"))) throw new WorkGitHubError("CONFIRMATION_MISMATCH", "Изменения не совпадают с подтверждённым предпросмотром.", 403)
}
async function userCredential(ownerId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const credential = await Promise.race([getPipesCredential(ownerId, "github"), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new WorkGitHubError("CONNECTION_TIMEOUT", "Подключение GitHub не ответило. Попробуйте ещё раз.", 503)), 10000) })]).catch(() => { throw new WorkGitHubError("NOT_CONNECTED", "GitHub не подключён. Плагины → GitHub → Подключить.", 409) }).finally(() => clearTimeout(timer))
  if (!credential.active || !credential.value) throw new WorkGitHubError("NOT_CONNECTED", "GitHub не подключён. Плагины → GitHub → Подключить.", 409)
  return credential.value
}
function client(token: string) {
  const deadline = Date.now() + 90000
  return async (endpoint: string, method = "GET", body?: unknown): Promise<Record<string, unknown>> => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new WorkGitHubError("TIMEOUT", "Время операции истекло. Проверьте репозиторий перед повтором.", 503)
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(remaining, 12000))
    try {
      // Fixed API origin only, no redirects or URL fields accepted from the client.
      const response = await fetch(`https://api.github.com${endpoint}`, { method, redirect: "error", cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      if (!response.ok) throw new WorkGitHubError(`GITHUB_${response.status}`, response.status === 404 ? "Репозиторий или файл не найден либо недоступен." : response.status === 403 ? "Недостаточно прав GitHub или исчерпан лимит API." : "GitHub отклонил операцию. Проверьте права и состояние ветки.", response.status === 404 ? 404 : 409)
      const reader = response.body?.getReader(); if (!reader) throw new WorkGitHubError("EMPTY_RESPONSE", "GitHub вернул пустой ответ.", 502)
      const decoder = new TextDecoder(); let bytes = 0, text = ""
      try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new WorkGitHubError("RESPONSE_TOO_LARGE", "Ответ GitHub слишком большой. Уточните запрос.", 413) }; text += decoder.decode(part.value, { stream: true }) }; text += decoder.decode() } finally { reader.releaseLock() }
      return JSON.parse(text) as Record<string, unknown>
    } catch (error) { if (error instanceof WorkGitHubError) throw error; throw new WorkGitHubError("GITHUB_UNAVAILABLE", "GitHub не ответил. Выполнение не подтверждено; сначала проверьте состояние репозитория.", 503) }
    finally { clearTimeout(timer) }
  }
}
const repoPath = (repo: string) => `/repos/${repo.split("/").map(encodeURIComponent).join("/")}`
const branchPath = (branch: string) => branch.split("/").map(encodeURIComponent).join("/")
function responseSha(value: unknown) { const parsed = sha.safeParse(value); if (!parsed.success) throw new WorkGitHubError("INVALID_RESPONSE", "GitHub вернул неверный идентификатор объекта.", 502); return parsed.data }
type Client = ReturnType<typeof client>
async function branchHead(api: Client, repo: string, branch: string) { const result = await api(`${repoPath(repo)}/git/ref/heads/${branchPath(branch)}`); return responseSha((result.object as Record<string, unknown>)?.sha) }
async function fileContent(api: Client, repo: string, path: string, branch: string) {
  const result = await api(`${repoPath(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`)
  if (result.type !== "file" || result.encoding !== "base64" || typeof result.content !== "string" || Number(result.size) > 128000) throw new WorkGitHubError("FILE_TOO_LARGE", "Файл не является небольшим текстовым файлом.", 413)
  const content = Buffer.from(result.content.replace(/\s/g, ""), "base64").toString("utf8")
  if (content.includes("\u0000")) throw new WorkGitHubError("BINARY_FILE", "Двоичные файлы этим действием не изменяются.", 400)
  return { content, sha: responseSha(result.sha) }
}
export async function readGitHub(ownerId: string, raw: unknown) {
  const input = githubReadSchema.parse(raw), api = client(await userCredential(ownerId)), base = repoPath(input.repo)
  if (input.action === "file") return fileContent(api, input.repo, input.path, input.ref)
  if (input.action === "tree") { const result = await api(`${base}/git/trees/${encodeURIComponent(input.ref)}?recursive=1`); return { sha: responseSha(result.sha), truncated: Boolean(result.truncated) || (Array.isArray(result.tree) && result.tree.length > 1000), tree: Array.isArray(result.tree) ? result.tree.slice(0, 1000).map(item => { const value = item as Record<string, unknown>; return { path: value.path, type: value.type, sha: value.sha, size: value.size } }) : [] } }
  const result = await api(`/search/code?q=${encodeURIComponent(`repo:${input.repo} ${input.query}`)}&per_page=20`)
  return { total: result.total_count, items: Array.isArray(result.items) ? result.items.slice(0, 20).map(item => { const value = item as Record<string, unknown>; return { name: value.name, path: value.path, url: value.html_url } }) : [] }
}
function validateFiles(payload: GitHubWrite) {
  if (payload.action !== "commit") return
  if (new Set(payload.files.map(file => file.path)).size !== payload.files.length || payload.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > 128000) throw new WorkGitHubError("INVALID_FILES", "Повторяющиеся пути или слишком большой набор файлов.")
}
async function checkHeads(api: Client, payload: GitHubWrite) {
  const branch = payload.action === "branch" ? payload.base : payload.action === "commit" ? payload.branch : payload.head
  if (await branchHead(api, payload.repo, branch) !== payload.expectedHead) throw new WorkGitHubError("HEAD_CHANGED", "Ветка изменилась. Обновите предпросмотр; чужие изменения сохранены.", 409)
  if (payload.action === "pull-request" && await branchHead(api, payload.repo, payload.base) !== payload.expectedBase) throw new WorkGitHubError("BASE_CHANGED", "Базовая ветка изменилась. Обновите предпросмотр.", 409)
}
export async function previewGitHub(ownerId: string, raw: unknown, now = Date.now()) {
  const started = Date.now()
  const payload = githubWriteSchema.parse(raw); validateFiles(payload)
  if (!githubConfirmationConfigured()) signature(ownerId, payload, now)
  const api = client(await userCredential(ownerId)); await checkHeads(api, payload)
  const files = []
  if (payload.action === "commit") for (const file of payload.files) {
    let before = ""
    try { before = (await fileContent(api, payload.repo, file.path, payload.expectedHead)).content } catch (error) { if (!(error instanceof WorkGitHubError) || error.code !== "GITHUB_404") throw error }
    const oldLines = before ? before.split("\n") : [], newLines = file.content ? file.content.split("\n") : []
    let first = 0, last = 0
    while (first < Math.min(oldLines.length, newLines.length) && oldLines[first] === newLines[first]) first++
    while (last < Math.min(oldLines.length, newLines.length) - first && oldLines[oldLines.length - 1 - last] === newLines[newLines.length - 1 - last]) last++
    files.push({ path: file.path, beforeBytes: Buffer.byteLength(before), afterBytes: Buffer.byteLength(file.content), removedLines: oldLines.length - first - last, addedLines: newLines.length - first - last })
  }
  const expiresAt = now + 600000
  await recordWorkActivity(ownerId, { action: `github.preview.${payload.action}`, ok: true, durationMs: Date.now() - started, subject: payload.repo })
  return { action: payload.action, repo: payload.repo, files, summary: payload.action === "branch" ? `Создать ветку ${payload.branch} из ${payload.base}` : payload.action === "commit" ? `Записать ${payload.files.length} файлов в ${payload.branch}; без удаления других файлов` : `Открыть ${payload.draft ? "черновик " : ""}PR ${payload.head} → ${payload.base}`, confirmationId: `${expiresAt}.${signature(ownerId, payload, expiresAt)}`, expiresAt }
}
type Receipt = { hash: string; status: "pending" | "completed" | "failed"; result?: Record<string, unknown> }
async function writeReceipt(ownerId: string, key: string, receipt: Receipt) {
  await writeOwnerJson(ownerId, key, receipt)
  const stored = await readOwnerJson<Receipt>(ownerId, key)
  // The OS best-effort store can swallow write failures. External actions fail closed.
  if (!stored || stable(stored) !== stable(receipt)) throw new WorkGitHubError("PERSISTENCE_FAILED", "Не удалось сохранить квитанцию операции. Проверьте приватное хранилище.", 503)
}
const scope = globalThis as typeof globalThis & { __malikGitHubWrites?: Set<string> }
export async function executeGitHub(ownerId: string, raw: unknown, confirmationId: string, idempotencyKey: string, now = Date.now()) {
  const payload = githubWriteSchema.parse(raw); validateFiles(payload); confirm(ownerId, payload, confirmationId, now)
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(idempotencyKey)) throw new WorkGitHubError("INVALID_KEY", "Нужен идентификатор операции.")
  if (!await storeIsDurable()) throw new WorkGitHubError("PERSISTENCE_REQUIRED", "Для безопасной записи GitHub подключите постоянное приватное хранилище S3/R2.", 503)
  const key = `github-operation-${hash(idempotencyKey).slice(0, 40)}`, digest = hash(stable(payload)), lock = `${ownerKey(ownerId)}:${key}`, locks = scope.__malikGitHubWrites ||= new Set()
  if (locks.has(lock)) throw new WorkGitHubError("IN_PROGRESS", "Эта операция уже выполняется.", 409)
  locks.add(lock); const started = Date.now()
  let claimed = false
  try {
    const previous = await readOwnerJson<Receipt>(ownerId, key)
    if (previous) {
      if (previous.hash !== digest) throw new WorkGitHubError("KEY_REUSED", "Идентификатор уже использован для других изменений.", 409)
      if (previous.status === "completed") return previous.result!
      throw new WorkGitHubError("CHECK_STATE", "Операция могла выполниться частично. Сначала проверьте ветку или PR; автоматический повтор заблокирован.", 409)
    }
    const api = client(await userCredential(ownerId)); await checkHeads(api, payload)
    await writeReceipt(ownerId, key, { hash: digest, status: "pending" }); claimed = true
    const base = repoPath(payload.repo); let result: Record<string, unknown>
    if (payload.action === "branch") {
      const created = await api(`${base}/git/refs`, "POST", { ref: `refs/heads/${payload.branch}`, sha: payload.expectedHead })
      result = { branch: payload.branch, sha: responseSha((created.object as Record<string, unknown>)?.sha) }
    } else if (payload.action === "commit") {
      const parent = await api(`${base}/git/commits/${payload.expectedHead}`), baseTree = responseSha((parent.tree as Record<string, unknown>)?.sha), entries = []
      for (const file of payload.files) { const blob = await api(`${base}/git/blobs`, "POST", { content: file.content, encoding: "utf-8" }); entries.push({ path: file.path, mode: "100644", type: "blob", sha: responseSha(blob.sha) }) }
      const tree = await api(`${base}/git/trees`, "POST", { base_tree: baseTree, tree: entries })
      const commit = await api(`${base}/git/commits`, "POST", { message: payload.message, tree: responseSha(tree.sha), parents: [payload.expectedHead] })
      await checkHeads(api, payload)
      await api(`${base}/git/refs/heads/${branchPath(payload.branch)}`, "PATCH", { sha: responseSha(commit.sha), force: false })
      result = { sha: responseSha(commit.sha), branch: payload.branch, files: payload.files.map(file => file.path) }
    } else {
      const pr = await api(`${base}/pulls`, "POST", { title: payload.title, body: payload.body, head: payload.head, base: payload.base, draft: payload.draft })
      if (typeof pr.html_url !== "string" || !pr.html_url.startsWith(`https://github.com/${payload.repo}/pull/`) || !Number.isSafeInteger(pr.number) || Number(pr.number) < 1) throw new WorkGitHubError("INVALID_RESPONSE", "GitHub не подтвердил создание PR. Проверьте репозиторий.", 502)
      result = { number: pr.number, url: pr.html_url, draft: payload.draft }
    }
    await writeReceipt(ownerId, key, { hash: digest, status: "completed", result })
    await recordWorkActivity(ownerId, { action: `github.execute.${payload.action}`, ok: true, durationMs: Date.now() - started, subject: payload.repo })
    return result
  } catch (error) {
    if (claimed) await writeReceipt(ownerId, key, { hash: digest, status: "failed" }).catch(() => undefined)
    await recordWorkActivity(ownerId, { action: `github.execute.${payload.action}`, ok: false, durationMs: Date.now() - started, code: error instanceof WorkGitHubError ? error.code : "FAILED", subject: payload.repo }).catch(() => undefined)
    throw error
  } finally { locks.delete(lock) }
}
