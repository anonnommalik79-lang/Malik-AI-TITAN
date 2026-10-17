"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { ProjectFile } from "@/lib/work/code/files"

const CodeStudio = dynamic(() => import("./WorkCodeStudio").then(m => m.WorkCodeStudio), { ssr: false })
type Check = { status: string; details: string[] }
type Job = {
  id: string; title: string; state: string; checkpoint: string; revision: number; cursor: number; totalFiles: number; error?: string; retryAt?: number; updatedAt?: string
  files?: ProjectFile[]; fileList: Array<{ path: string; chars: number }>; revisions: Array<{ id: string; summary: string }>
  events: Array<{ seq: number; message: string }>; checks: Record<string, Check>
  execution?: { previewUrl?: string; status: string }
}
const labels: Record<string, string> = { queued: "В очереди", planning: "Анализирую", designing: "Планирую проект", assets: "Подбираю медиа", coding: "Пишу исходники", installing: "Проверяю импорты", building: "Проверяю сборку", testing: "Подготавливаю превью", preview_ready: "Предпросмотр готов", completed: "Проверки пройдены", paused: "Приостановлено", failed: "Проверка не пройдена", cancelled: "Отменено", resuming: "Возобновляю" }
const checks: Record<string, string> = { static: "Исходники", dependencies: "Установка", build: "Сборка", browser: "Браузерные тесты", media: "Медиа" }
const statuses: Record<string, string> = { pass: "PASS", fail: "FAIL", not_run: "Не запускалось", not_required: "Не требуется" }

/** Lives in an answer, not in Sites or a new dashboard. Every progress item
 * comes from saved server events, never a simulated animation timeline. */
export function WebsiteProjectCard({ id, active = false, shared = false }: { id: string; active?: boolean; shared?: boolean }) {
  const [job, setJob] = useState<Job | null>(null)
  const [files, setFiles] = useState<ProjectFile[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [automatic, setAutomatic] = useState(active)
  const [instruction, setInstruction] = useState("")
  const [revision, setRevision] = useState("")
  const [iterations, setIterations] = useState(0)
  const request = useRef<AbortController | null>(null)
  const endpoint = `/api/website/projects/${encodeURIComponent(id)}`
  const get = useCallback(async (suffix = "", controller?: AbortController) => {
    const response = await fetch(endpoint + suffix, { credentials: "same-origin", cache: "no-store", signal: controller?.signal })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(data.error || data.code || `HTTP ${response.status}`)
    return data
  }, [endpoint])
  useEffect(() => {
    if (shared) return
    const controller = new AbortController()
    get("", controller).then(data => setJob(data.job)).catch(e => { if (!controller.signal.aborted) setError(String(e.message)) })
    return () => { controller.abort(); request.current?.abort() }
  }, [get, shared])
  const action = useCallback(async (action: string, prompt = "", revisionId = "") => {
    if (shared) return
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 65_000)
    setBusy(true); setError("")
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, prompt, revisionId }), signal: controller.signal })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        // A second tab/worker owns the lease. Read, don't start another call.
        if (response.status === 409) { const latest = await get(); setJob(latest.job); return }
        throw new Error(data.error || data.code || `HTTP ${response.status}`)
      }
      setJob(data.job)
      if (["edit", "restore"].includes(action)) { setFiles(null); setInstruction(""); setIterations(0); setAutomatic(true) }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Нет подтверждения операции"); setAutomatic(false) }
    finally { clearTimeout(timeout); if (request.current === controller) { request.current = null; setBusy(false) } }
  }, [endpoint, get, shared])
  useEffect(() => {
    if (!job || shared || busy || !automatic || ["completed", "failed", "paused", "cancelled"].includes(job.state)) return
    if (iterations >= 100) return
    const delay = Math.min(30_000, Math.max(300, (job.retryAt || 0) - Date.now()))
    const timer = setTimeout(() => { setIterations(value => value + 1); void action("step") }, delay)
    return () => clearTimeout(timer)
  }, [action, automatic, busy, iterations, job, shared])
  useEffect(() => {
    if (!job || files || !job.fileList.length || !["paused", "preview_ready", "completed", "failed"].includes(job.state) || shared) return
    const controller = new AbortController()
    get("?files=1", controller).then(data => setFiles(data.job.files)).catch(e => { if (!controller.signal.aborted) setError(String(e.message)) })
    return () => controller.abort()
  }, [files, get, job, shared])
  if (shared) return <p className="malik-md-p">Приватный исходный проект доступен только его владельцу.</p>
  return <section className="malik-md-codeblock" data-malik-website-project={id} aria-label="Проект Malik AI">
    <div className="malik-md-codebar"><span>Malik AI · {job ? labels[job.state] || job.state : "Открываю проект…"}</span>
      <div className="malik-md-codebar-actions">
        {job?.fileList.length ? <a href={`${endpoint}?export=zip`} download>Скачать ZIP</a> : null}
        {job?.execution?.status === "completed" && job.execution.previewUrl ? <a href={job.execution.previewUrl} target="_blank" rel="noopener noreferrer">Открыть собранный сайт</a> : null}
        {job && !["cancelled", "completed"].includes(job.state) ? <button type="button" onClick={() => { setAutomatic(false); request.current?.abort(); void action("cancel") }}>Отменить</button> : null}
        {job && !["cancelled", "completed", "paused", "failed"].includes(job.state) ? <button type="button" onClick={() => { setAutomatic(false); request.current?.abort(); void action("pause") }}>Пауза</button> : null}
      </div>
    </div>
    {error ? <p className="malik-md-p" role="alert">{error}</p> : null}
    {job ? <>
      <details className="malik-md-details" open={!files || undefined}>
        <summary className="malik-md-details-summary">Ход работы · {job.cursor}/{job.totalFiles} файлов</summary>
        <ol className="malik-md-ol" aria-live="polite">{job.events.slice(-10).map(e => <li key={e.seq}>{e.message}</li>)}</ol>
        {Object.entries(job.checks).map(([name, check]) => <p className="malik-md-p" key={name}>{checks[name] || name}: {statuses[check.status] || check.status}{check.details.length ? ` — ${check.details.join("; ")}` : ""}</p>)}
      </details>
      <p className="malik-md-p">Этапы сохраняются вне процесса сервера. Без отдельного запущенного worker работа продолжится, когда вы вернётесь в этот чат. Браузерное превью не заменяет production-сборку.</p>
      {job.state === "paused" || job.state === "failed" || (!automatic && !["completed", "cancelled"].includes(job.state)) || iterations >= 100 ? <button type="button" disabled={busy} onClick={() => { setIterations(0); setAutomatic(true); void action(["paused", "failed"].includes(job.state) ? "resume" : "step") }}>Продолжить с checkpoint</button> : null}
      {files ? <>
        <CodeStudio key={`${id}:${job.updatedAt || job.revision}`} initialFiles={files} title={job.title} embedded previewOnly={job.checks.build.status !== "pass"} onFixWithAi={errors => { setInstruction(`Исправь только подтверждённые ошибки, сохрани остальное:\n${errors.join("\n")}`) }} />
        <details className="malik-md-details"><summary className="malik-md-details-summary">Изменить этот проект / версии</summary>
          <label>Правка к текущему проекту<textarea className="wcs-editor" value={instruction} onChange={e => setInstruction(e.target.value)} rows={3} /></label>
          <button type="button" disabled={busy || !instruction.trim() || !["completed", "failed", "paused", "cancelled"].includes(job.state)} onClick={() => void action("edit", instruction)}>Применить правку</button>
          {job.revisions.length ? <><label>Сохранённая версия<select value={revision} onChange={e => setRevision(e.target.value)}><option value="">Выберите версию</option>{job.revisions.map(r => <option key={r.id} value={r.id}>{r.summary}</option>)}</select></label><button type="button" disabled={busy || !revision} onClick={() => void action("restore", "", revision)}>Восстановить</button></> : null}
        </details>
      </> : null}
    </> : null}
  </section>
}
