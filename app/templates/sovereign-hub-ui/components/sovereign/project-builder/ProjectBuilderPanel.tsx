"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Clipboard, FileCode2, FolderTree, Loader2, Play, Sparkles } from "lucide-react"
import type { ProjectBuilderResult, ProjectFile } from "@/lib/ai/project-builder"

type ProjectBuilderPanelProps = {
  onGenerated?: (project: ProjectBuilderResult) => void
}

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")

const demoPrompt = "Создай premium SaaS dashboard для AI платформы: chat, image studio, video studio, billing, settings, mobile-first dark UI."

function languageBadge(file: ProjectFile) {
  return file.language || file.path.split(".").pop() || "txt"
}

export function ProjectBuilderPanel({ onGenerated }: ProjectBuilderPanelProps) {
  const [prompt, setPrompt] = useState(demoPrompt)
  const [project, setProject] = useState<ProjectBuilderResult | null>(null)
  const [selectedPath, setSelectedPath] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const selectedFile = useMemo(() => {
    if (!project) return null
    return project.files.find((file) => file.path === selectedPath) || project.files[0] || null
  }, [project, selectedPath])

  async function generate() {
    const clean = prompt.trim()
    if (!clean || loading) return

    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/ai/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: clean, provider: "auto" }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Project generation failed")

      const nextProject: ProjectBuilderResult = data.project || data.output || data
      setProject(nextProject)
      setSelectedPath(nextProject.files?.[0]?.path || "")
      onGenerated?.(nextProject)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function copyCode() {
    if (!selectedFile) return
    await navigator.clipboard?.writeText(selectedFile.content)
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#07070b] p-4 text-white shadow-2xl sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Project Builder</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Создай полноценный проект</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Prompt → plan → folder structure → files → commands. Код не выполняется на сервере.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />Router ready
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
          <label className="text-sm font-black text-zinc-200">Project prompt</label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="mt-3 min-h-44 w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-cyan-400/50"
            placeholder="Опиши проект: сайт, app, dashboard, ecommerce, AI tool..."
          />
          <button
            type="button"
            onClick={generate}
            disabled={loading || !prompt.trim()}
            className={cn(
              "mt-4 inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 font-black transition",
              loading || !prompt.trim() ? "bg-white/10 text-zinc-500" : "bg-white text-black hover:bg-cyan-100",
            )}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
            {loading ? "Generating project..." : "Generate Project"}
          </button>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {project ? (
            <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-cyan-200">
                <Sparkles className="h-4 w-4" /> {project.status}
              </div>
              <h3 className="font-black">{project.title}</h3>
              <p className="text-sm text-zinc-400">{project.description}</p>
              <div className="flex flex-wrap gap-2">
                {project.commands.map((command) => (
                  <code key={command} className="rounded-lg bg-white/10 px-2 py-1 text-xs text-zinc-200">
                    {command}
                  </code>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
          {!project ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
              <FolderTree className="h-10 w-10 text-zinc-500" />
              <p className="mt-4 font-black">Project output appears here</p>
              <p className="mt-2 max-w-sm text-sm text-zinc-500">File tree, code preview, commands and status after generation.</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-black">
                  <FolderTree className="h-4 w-4 text-cyan-300" /> Files
                </div>
                <div className="space-y-1">
                  {project.files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedPath(file.path)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition",
                        selectedFile?.path === file.path ? "bg-cyan-400/15 text-cyan-100" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <span className="truncate">
                        <FileCode2 className="mr-2 inline h-3.5 w-3.5" />
                        {file.path}
                      </span>
                      <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{languageBadge(file)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#050508]">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{selectedFile?.path || "No file"}</p>
                    <p className="text-xs text-zinc-500">{selectedFile ? languageBadge(selectedFile) : ""}</p>
                  </div>
                  <button onClick={copyCode} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10">
                    <Clipboard className="mr-2 inline h-3.5 w-3.5" />Copy
                  </button>
                </div>
                <pre className="max-h-[560px] overflow-auto p-4 text-xs leading-5 text-zinc-200">
                  <code>{selectedFile?.content || ""}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default ProjectBuilderPanel

