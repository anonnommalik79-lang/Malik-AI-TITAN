"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, File, FileArchive, Folder, FolderUp, Loader2, Monitor, RefreshCw, Save, Smartphone, Upload, Wand2 } from "lucide-react"
import { IGNORED_DIRECTORIES, PROJECT_LIMITS, isSecretPath, isTextPath, projectTree, safeProjectPath, stripCommonRoot, type ProjectFile, type TreeNode } from "@/lib/work/code/files"
import { projectStatus, type WorkCodeStatus } from "@/lib/work/code/status"
import { downloadBlob, safeFileName, zipFiles } from "../os/preview"
import { studioLanguage, studioReason, studioSkip, studioWord, type StudioWord } from "./i18n"
import "./work-code-studio.css"

/**
 * Malik Work Code Studio: one place to see a project's files, its real
 * problems and its running preview, then export or save it.
 *
 * Nothing on this screen is decorative: the status comes from the server's
 * diagnostics and from the preview frame itself (it must report «ready»),
 * the file tree is the files that were actually read, and every button
 * calls a working endpoint or a local download.
 */

type Diagnostic = { file: string; line: number; column: number; severity: "error" | "warning" | "info"; code: string; message: string; source: string }
type Analysis = { stack: string; packageName: string | null; diagnostics: Diagnostic[]; counts: { errors: number; warnings: number; infos: number }; stats: { files: number; lines: number }; checks: string[]; limitations: string[] }
type Preview = { ok: boolean; mode: string | null; html: string; entry: string | null; routes: string[]; limitations: string[]; reason: string | null; token: string }
type Skipped = { path: string; code: string }

const STATUS_ICON: Record<WorkCodeStatus, ReactNode> = {
  COMPLETED_VERIFIED: <Check size={14} aria-hidden="true" />,
  COMPLETED_WITH_LIMITATIONS: <Check size={14} aria-hidden="true" />,
  FAILED: <AlertTriangle size={14} aria-hidden="true" />,
  BLOCKED: <AlertTriangle size={14} aria-hidden="true" />,
  CANCELLED: <AlertTriangle size={14} aria-hidden="true" />,
  CHECKING: <Loader2 size={14} className="wcs-spin" aria-hidden="true" />,
}

async function postCode<T>(payload: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; message: string; code?: string }> {
  try {
    const response = await fetch("/api/work/code", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) return { ok: false, message: String(data?.error || `HTTP ${response.status}`), code: data?.code }
    return { ok: true, data: data as T }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Network error" }
  }
}

type PickedFile = { path: string; file: File }

/** Every file inside a dropped folder (Chromium, Safari, Firefox). */
async function filesFromDrop(items: DataTransferItemList): Promise<PickedFile[]> {
  const out: PickedFile[] = []
  type Entry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string; file?: (ok: (file: File) => void, fail: (error: unknown) => void) => void; createReader?: () => { readEntries: (ok: (entries: Entry[]) => void, fail: (error: unknown) => void) => void } }
  const walk = async (entry: Entry, prefix: string): Promise<void> => {
    if (out.length > PROJECT_LIMITS.files * 3) return
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject)).catch(() => null)
      if (file) out.push({ path: `${prefix}${entry.name}`, file })
      return
    }
    if (entry.isDirectory && entry.createReader) {
      if (IGNORED_DIRECTORIES.has(entry.name)) return
      const reader = entry.createReader()
      for (;;) {
        const batch = await new Promise<Entry[]>((resolve) => reader.readEntries(resolve, () => resolve([])))
        if (!batch.length) break
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`)
      }
    }
  }
  const entries = Array.from(items).map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.()).filter(Boolean) as Entry[]
  if (!entries.length) return Array.from(items).map((item) => item.getAsFile()).filter(Boolean).map((file) => ({ path: (file as File).name, file: file as File }))
  for (const entry of entries) await walk(entry, "")
  return out
}

function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

function TreeView({ nodes, active, onOpen, problems, depth = 0 }: { nodes: TreeNode[]; active: string; onOpen: (path: string) => void; problems: Map<string, number>; depth?: number }) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  return (
    <ul className="wcs-tree" role={depth ? "group" : "tree"}>
      {nodes.map((node) => node.type === "dir" ? (
        <li key={node.path} role="treeitem" aria-expanded={!closed.has(node.path)}>
          <button type="button" className="wcs-tree__row" style={{ paddingInlineStart: 8 + depth * 14 }} onClick={() => setClosed((current) => { const next = new Set(current); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next })}>
            {closed.has(node.path) ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}<Folder size={14} aria-hidden="true" /><span>{node.name}</span>
          </button>
          {closed.has(node.path) ? null : <TreeView nodes={node.children || []} active={active} onOpen={onOpen} problems={problems} depth={depth + 1} />}
        </li>
      ) : (
        <li key={node.path} role="treeitem" aria-selected={node.path === active}>
          <button type="button" className={`wcs-tree__row${node.path === active ? " is-active" : ""}`} style={{ paddingInlineStart: 22 + depth * 14 }} onClick={() => onOpen(node.path)}>
            <File size={14} aria-hidden="true" /><span>{node.name}</span>{problems.get(node.path) ? <b className="wcs-count">{problems.get(node.path)}</b> : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function WorkCodeStudio({ initialFiles, title: initialTitle, onFixWithAi, onSaved, embedded = false }: { initialFiles?: ProjectFile[]; title?: string; onFixWithAi?: (errors: string[]) => void; onSaved?: (artifactId: string) => void; embedded?: boolean }) {
  const [language] = useState(studioLanguage)
  const t = useCallback((key: StudioWord, values?: Record<string, string | number>) => studioWord(language, key, values), [language])
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles || [])
  const [title, setTitle] = useState(initialTitle || "")
  const [busy, setBusy] = useState<"" | "reading" | "checking" | "saving">("")
  const [error, setError] = useState("")
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [skipped, setSkipped] = useState<Skipped[]>([])
  const [tab, setTab] = useState<"preview" | "code" | "problems">("preview")
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [active, setActive] = useState("")
  const [jumpLine, setJumpLine] = useState(0)
  const [runtime, setRuntime] = useState<{ ready: boolean; errors: string[] } | null>(null)
  const [route, setRoute] = useState("/")
  const [frameKey, setFrameKey] = useState(0)
  const [saved, setSaved] = useState<{ artifactId: string; savedFiles: number; totalFiles: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number>(0)

  useEffect(() => { folderRef.current?.setAttribute("webkitdirectory", ""); folderRef.current?.setAttribute("directory", "") }, [files.length])

  const check = useCallback(async (next: ProjectFile[]) => {
    setBusy("checking"); setError(""); setRuntime(null); setRoute("/")
    const result = await postCode<{ analysis: Analysis; preview: Preview }>({ action: "preview", files: next })
    setBusy("")
    if (!result.ok) { setError(result.message); return }
    setAnalysis(result.data.analysis)
    setPreview(result.data.preview)
    setFrameKey((value) => value + 1)
    setTab(result.data.analysis.counts.errors ? "problems" : result.data.preview.ok ? "preview" : "code")
    const firstFile = next.find((file) => file.path === result.data.analysis.diagnostics[0]?.file) || next.find((file) => /(?:^|\/)(?:page|main|index|App)\.(?:tsx|jsx|ts|js|html)$/.test(file.path)) || next[0]
    setActive(firstFile?.path || "")
  }, [])

  useEffect(() => { if (initialFiles?.length) void check(initialFiles) }, [initialFiles, check])

  // Messages from this studio's preview frame only, with its token.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!preview || event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: string; kind?: string; token?: string; message?: string; route?: string }
      if (data?.token !== preview.token) return
      if (data.kind === "ready") { window.clearTimeout(timer.current); setRuntime((current) => ({ ready: true, errors: current?.errors || [] })) }
      else if (data.kind === "route" && data.message) setRoute(data.message)
      else if (data.type === "malik-preview-error" && data.message) setRuntime((current) => {
        const errors = current?.errors || []
        return errors.includes(data.message!) || errors.length >= 12 ? current : { ready: current?.ready || false, errors: [...errors, data.message!] }
      })
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [preview])

  // A preview that never answers is a failure, not an endless spinner.
  useEffect(() => {
    if (!preview?.ok) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setRuntime((current) => current?.ready ? current : { ready: false, errors: [...(current?.errors || []), studioWord(language, "timeout")] }), 8000)
    return () => window.clearTimeout(timer.current)
  }, [preview, frameKey, language])

  const accept = useCallback(async (picked: PickedFile[]) => {
    setError(""); setSaved(null)
    const zip = picked.length === 1 && /\.zip$/i.test(picked[0].path) ? picked[0].file : null
    if (zip) {
      if (zip.size > 20 * 1024 * 1024) { setError("ZIP > 20 MB"); return }
      setBusy("reading")
      const result = await postCode<{ files: ProjectFile[]; skipped: Skipped[]; analysis: Analysis }>({ action: "unzip", zipBase64: base64(await zip.arrayBuffer()) })
      setBusy("")
      if (!result.ok) { setError(result.message); return }
      setTitle(zip.name.replace(/\.zip$/i, "")); setSkipped(result.data.skipped); setFiles(result.data.files)
      if (result.data.files.length) await check(result.data.files)
      return
    }
    setBusy("reading")
    const read: ProjectFile[] = []
    const skip: Skipped[] = []
    let total = 0
    for (const item of picked) {
      const path = safeProjectPath(item.path)
      if (!path) { skip.push({ path: item.path, code: "UNSAFE_PATH" }); continue }
      if (path.split("/").slice(0, -1).some((part) => IGNORED_DIRECTORIES.has(part))) { skip.push({ path, code: "IGNORED_DIRECTORY" }); continue }
      if (isSecretPath(path)) { skip.push({ path, code: "SECRET_FILE" }); continue }
      if (!isTextPath(path)) { skip.push({ path, code: "BINARY_OR_UNSUPPORTED" }); continue }
      if (item.file.size > PROJECT_LIMITS.fileChars) { skip.push({ path, code: "TOO_LARGE" }); continue }
      if (read.length >= PROJECT_LIMITS.files) { skip.push({ path, code: "LIMIT_FILES" }); continue }
      if (total + item.file.size > PROJECT_LIMITS.totalChars) { skip.push({ path, code: "LIMIT_TOTAL" }); continue }
      total += item.file.size
      read.push({ path, content: await item.file.text() })
    }
    setBusy("")
    const top = read[0]?.path.split("/")[0]
    setTitle(read.length > 1 && read.every((file) => file.path.startsWith(`${top}/`)) ? top : read[0]?.path.split("/").pop() || "Проект")
    setSkipped(skip)
    // A picked folder behaves like its contents, exactly as the server sees it.
    const project = stripCommonRoot(read)
    setFiles(project)
    if (project.length) await check(project)
    else setError(studioWord(language, "skipped") + ": " + skip.length)
  }, [check, language])

  const onDrop = async (event: DragEvent) => {
    event.preventDefault(); setDragging(false)
    await accept(await filesFromDrop(event.dataTransfer.items))
  }

  const save = async () => {
    setBusy("saving"); setError("")
    const result = await postCode<{ artifactId: string; savedFiles: number; totalFiles: number }>({ action: "save", files, title: title || "Проект" })
    setBusy("")
    if (!result.ok) { setError(result.code === "SIGN_IN_REQUIRED" ? t("signIn") : result.message); return }
    setSaved(result.data)
  }

  const status = useMemo(() => projectStatus({ analysis, preview, runtime: preview?.ok ? runtime : undefined }), [analysis, preview, runtime])
  const tree = useMemo(() => projectTree(files), [files])
  const problems = useMemo(() => { const map = new Map<string, number>(); for (const item of analysis?.diagnostics || []) if (item.severity !== "info") map.set(item.file, (map.get(item.file) || 0) + 1); return map }, [analysis])
  const activeFile = files.find((file) => file.path === active)
  const activeProblems = (analysis?.diagnostics || []).filter((item) => item.file === active)
  const errorTexts = [...(analysis?.diagnostics || []).filter((item) => item.severity === "error").map((item) => `${item.file}:${item.line} ${item.message}`), ...(runtime?.errors || [])]

  useEffect(() => {
    if (!jumpLine || tab !== "code") return
    document.getElementById(`wcs-line-${jumpLine}`)?.scrollIntoView({ block: "center" })
  }, [jumpLine, active, tab])

  const pickers = (
    <>
      <input ref={folderRef} type="file" multiple hidden onChange={(event) => { const list = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void accept(list.map((file) => ({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, file }))) }} />
      <input ref={filesRef} type="file" multiple hidden onChange={(event) => { const list = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void accept(list.map((file) => ({ path: file.name, file }))) }} />
      <input ref={zipRef} type="file" accept=".zip,application/zip" hidden onChange={(event) => { const list = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void accept(list.map((file) => ({ path: file.name, file }))) }} />
    </>
  )

  if (!files.length) return (
    <section className="wcs" dir={language === "ar" ? "rtl" : "ltr"} lang={language} data-wcs-state="empty">
      {pickers}
      <div className={`wcs-drop${dragging ? " is-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => void onDrop(event)}>
        <Upload size={30} aria-hidden="true" />
        <h3>{t("drop")}</h3>
        <p>{t("subtitle")}</p>
        <div className="wcs-actions">
          <button type="button" className="wcs-button is-primary" onClick={() => folderRef.current?.click()} disabled={Boolean(busy)}><FolderUp size={16} aria-hidden="true" />{t("pickFolder")}</button>
          <button type="button" className="wcs-button" onClick={() => filesRef.current?.click()} disabled={Boolean(busy)}><File size={16} aria-hidden="true" />{t("pickFiles")}</button>
          <button type="button" className="wcs-button" onClick={() => zipRef.current?.click()} disabled={Boolean(busy)}><FileArchive size={16} aria-hidden="true" />{t("pickZip")}</button>
        </div>
        <small>{t("limits")}</small>
        {busy ? <p className="wcs-note" role="status"><Loader2 size={14} className="wcs-spin" aria-hidden="true" />{t(busy === "reading" ? "reading" : "checking")}</p> : null}
        {error ? <p className="wcs-error" role="alert">{error}</p> : null}
        {skipped.length ? <p className="wcs-note">{t("skipped")}: {skipped.length}</p> : null}
      </div>
    </section>
  )

  return (
    <section className={`wcs${embedded ? " is-embedded" : ""}`} dir={language === "ar" ? "rtl" : "ltr"} lang={language} data-wcs-state={status.status}>
      {pickers}
      <header className="wcs-head">
        <div className="wcs-head__title">
          <strong>{title || initialTitle || t("title")}</strong>
          <span>{files.length} {t("files")}{analysis ? ` · ${t("stack")}: ${analysis.stack}` : ""}</span>
        </div>
        <span className={`wcs-status is-${status.status}`} data-wcs-status={status.status} title={status.reasons.join(" ")}>{STATUS_ICON[status.status]}{t(`status.${status.status}` as StudioWord)}</span>
      </header>
      <div className="wcs-toolbar" role="toolbar">
        <div className="wcs-tabs" role="tablist">
          {(["preview", "code", "problems"] as const).map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} className="wcs-tab" onClick={() => setTab(name)}>
              {t(name)}{name === "problems" && (errorTexts.length || analysis?.counts.warnings) ? <b className="wcs-count">{errorTexts.length + (analysis?.counts.warnings || 0)}</b> : null}
            </button>
          ))}
        </div>
        {tab === "preview" && preview?.ok ? (
          <div className="wcs-tabs" role="group" aria-label={t("preview")}>
            <button type="button" className="wcs-tab" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={15} aria-hidden="true" />{t("desktop")}</button>
            <button type="button" className="wcs-tab" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={15} aria-hidden="true" />{t("mobile")}</button>
            <button type="button" className="wcs-tab" onClick={() => { setRuntime(null); setRoute("/"); setFrameKey((value) => value + 1) }}><RefreshCw size={15} aria-hidden="true" />{t("refresh")}</button>
          </div>
        ) : null}
        <div className="wcs-actions">
          {onFixWithAi && errorTexts.length ? <button type="button" className="wcs-button is-primary" onClick={() => onFixWithAi(errorTexts.slice(0, 20))}><Wand2 size={15} aria-hidden="true" />{t("fix")}</button> : null}
          <button type="button" className="wcs-button" onClick={() => downloadBlob(zipFiles(files), safeFileName(title || "malik-project", "zip"))}><Download size={15} aria-hidden="true" />{t("exportZip")}</button>
          {!embedded ? <button type="button" className="wcs-button" onClick={() => void save()} disabled={busy === "saving"}>{busy === "saving" ? <Loader2 size={15} className="wcs-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}{t("save")}</button> : null}
          {!embedded ? <button type="button" className="wcs-button" onClick={() => { setFiles([]); setAnalysis(null); setPreview(null); setSaved(null); setSkipped([]); setRuntime(null) }}>{t("newProject")}</button> : null}
        </div>
      </div>
      {busy === "checking" ? <p className="wcs-note" role="status"><Loader2 size={14} className="wcs-spin" aria-hidden="true" />{t("checking")}</p> : null}
      {error ? <p className="wcs-error" role="alert">{error}</p> : null}
      {saved ? <p className="wcs-note" role="status"><Check size={14} aria-hidden="true" />{t("saved", { n: saved.savedFiles, m: saved.totalFiles })}{onSaved ? <button type="button" className="wcs-link" onClick={() => onSaved(saved.artifactId)}>{t("open")}</button> : null}</p> : null}

      <div className="wcs-body">
        {tab === "preview" ? (
          preview?.ok ? (
            <div className="wcs-stage">
              {preview.mode === "next-app" && preview.routes.length > 1 ? <p className="wcs-route">{t("route")}: <code>{route}</code>{route !== "/" ? <button type="button" className="wcs-link" onClick={() => { setRuntime(null); setRoute("/"); setFrameKey((value) => value + 1) }}>{t("home")}</button> : null}</p> : null}
              <div className={`wcs-frame is-${device}`}>
                <iframe key={frameKey} ref={frameRef} title={`${t("preview")}: ${title}`} sandbox="allow-scripts allow-forms allow-modals allow-popups" srcDoc={preview.html} />
              </div>
            </div>
          ) : <p className="wcs-note">{t("noPreview", { reason: studioReason(language, preview?.reason || null) })}</p>
        ) : tab === "code" ? (
          <div className="wcs-code">
            <nav className="wcs-code__tree" aria-label={t("code")}><TreeView nodes={tree} active={active} onOpen={(path) => { setActive(path); setJumpLine(0) }} problems={problems} /></nav>
            <div className="wcs-code__view">
              {activeFile ? (
                <>
                  <div className="wcs-code__path" dir="ltr">{activeFile.path}</div>
                  <pre className="wcs-code__text" dir="ltr">{activeFile.content.split("\n").map((line, index) => {
                    const number = index + 1
                    const issue = activeProblems.find((item) => item.line === number)
                    return <div key={number} id={`wcs-line-${number}`} className={`wcs-line${issue ? ` has-${issue.severity}` : ""}${number === jumpLine ? " is-target" : ""}`} title={issue?.message}><span className="wcs-line__no">{number}</span><code>{line || " "}</code></div>
                  })}</pre>
                </>
              ) : <p className="wcs-note">{t("selectFile")}</p>}
            </div>
          </div>
        ) : (
          <div className="wcs-problems">
            {errorTexts.length === 0 && !analysis?.counts.warnings ? <p className="wcs-note"><Check size={14} aria-hidden="true" />{t("noProblems")}</p> : null}
            <ul className="wcs-list">
              {(analysis?.diagnostics || []).filter((item) => item.severity !== "info").map((item, index) => (
                <li key={index} data-severity={item.severity}>
                  <button type="button" className="wcs-problem" onClick={() => { setActive(item.file); setJumpLine(item.line); setTab("code") }}>
                    <AlertTriangle size={14} aria-hidden="true" /><span dir="ltr">{item.file}:{item.line}:{item.column}</span><span>{item.message}</span><code>{item.code}</code>
                  </button>
                </li>
              ))}
              {(runtime?.errors || []).map((message, index) => <li key={`runtime-${index}`} data-severity="error"><div className="wcs-problem"><AlertTriangle size={14} aria-hidden="true" /><span>{t("runtime")}</span><span>{message}</span></div></li>)}
            </ul>
            {analysis?.checks.length ? <><h4>{t("checks")}</h4><ul className="wcs-list is-plain">{analysis.checks.map((item) => <li key={item}>{item}</li>)}{analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
            {preview?.limitations.length ? <><h4>{t("limitations")}</h4><ul className="wcs-list is-plain">{preview.limitations.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
            {skipped.length ? <><h4>{t("skipped")} ({skipped.length})</h4><ul className="wcs-list is-plain">{skipped.slice(0, 80).map((item, index) => <li key={index}><span dir="ltr">{item.path}</span> — {studioSkip(language, item.code)}</li>)}</ul></> : null}
          </div>
        )}
      </div>
    </section>
  )
}
