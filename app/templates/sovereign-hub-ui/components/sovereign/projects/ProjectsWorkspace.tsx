"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { MalikModelSelector } from "../MalikModelSelector"
import { getMalikModel, type MalikModelId } from "@/lib/ai/malik-models"
import type { AIPlan } from "@/lib/ai/types"

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")

export type MalikProjectColor = "gold" | "blue" | "violet" | "emerald" | "rose"

export type MalikProjectRecord = {
  id: string
  title: string
  timestamp: Date | string
  isPinned?: boolean
  messages: Array<{ role: "user" | "assistant"; content: string }>
  status?: "deployed" | "draft" | "building"
  techStack?: string[]
  selectedModelId?: MalikModelId
  projectDescription?: string
  projectInstructions?: string
  projectColor?: MalikProjectColor
  kind?: "chat" | "project"
}

export type MalikProjectDraft = {
  title: string
  description: string
  instructions: string
  color: MalikProjectColor
  selectedModelId: MalikModelId
}

export type MalikProjectPatch = Partial<Omit<MalikProjectRecord, "id" | "messages">>

type ProjectsWorkspaceProps = {
  projects: MalikProjectRecord[]
  activeProjectId: string | null
  selectedModelId: MalikModelId
  plan: AIPlan
  onSelectModel: (modelId: MalikModelId) => void
  onOpenBilling: () => void
  onCreateProject: (draft: MalikProjectDraft) => void
  onOpenProject: (id: string) => void
  onCloseProject: () => void
  onUpdateProject: (id: string, patch: MalikProjectPatch) => void
  onDeleteProject: (id: string) => void
  onTogglePin: (id: string) => void
  onSendPrompt: (prompt: string) => void
  renderProjectChat: () => ReactNode
}

const COLOR_STYLES: Record<MalikProjectColor, { glow: string; icon: string; dot: string }> = {
  gold: {
    glow: "from-amber-300/20 via-amber-500/5 to-transparent",
    icon: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    dot: "bg-amber-300",
  },
  blue: {
    glow: "from-sky-400/20 via-sky-500/5 to-transparent",
    icon: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    dot: "bg-sky-400",
  },
  violet: {
    glow: "from-violet-400/20 via-violet-500/5 to-transparent",
    icon: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    dot: "bg-violet-400",
  },
  emerald: {
    glow: "from-emerald-400/20 via-emerald-500/5 to-transparent",
    icon: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  rose: {
    glow: "from-rose-400/20 via-rose-500/5 to-transparent",
    icon: "border-rose-400/25 bg-rose-400/10 text-rose-200",
    dot: "bg-rose-400",
  },
}

const PROJECT_COLORS = Object.keys(COLOR_STYLES) as MalikProjectColor[]

function relativeDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Недавно"
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000))
  if (minutes < 1) return "Только что"
  if (minutes < 60) return `${minutes} мин. назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч. назад`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн. назад`
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

function ProjectMark({ color = "gold", size = "normal" }: { color?: MalikProjectColor; size?: "small" | "normal" | "large" }) {
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,.08)]",
      COLOR_STYLES[color].icon,
      size === "small" && "h-9 w-9 rounded-xl",
      size === "normal" && "h-12 w-12",
      size === "large" && "h-16 w-16 rounded-[1.25rem]",
    )}>
      <Folder className={cn(size === "small" ? "h-4 w-4" : size === "large" ? "h-7 w-7" : "h-5 w-5")} strokeWidth={1.8} />
    </span>
  )
}

function ProjectFormModal({
  title,
  submitLabel,
  initial,
  plan,
  onOpenBilling,
  onClose,
  onSubmit,
}: {
  title: string
  submitLabel: string
  initial: MalikProjectDraft
  plan: AIPlan
  onOpenBilling: () => void
  onClose: () => void
  onSubmit: (draft: MalikProjectDraft) => void
}) {
  const [draft, setDraft] = useState(initial)

  useEffect(() => setDraft(initial), [initial])

  const submit = () => {
    const cleanTitle = draft.title.trim().slice(0, 80)
    if (!cleanTitle) return
    onSubmit({
      ...draft,
      title: cleanTitle,
      description: draft.description.trim().slice(0, 240),
      instructions: draft.instructions.trim().slice(0, 3000),
    })
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[620px] overflow-hidden rounded-[28px] border border-white/10 bg-[#111112] shadow-[0_32px_120px_rgba(0,0,0,.72)]">
        <header className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Malik AI Projects</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.07] hover:text-white" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <ProjectMark color={draft.color} size="large" />
            <label className="min-w-0 flex-1">
              <span className="mb-2 block text-xs font-medium text-zinc-400">Название проекта</span>
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                onKeyDown={(event) => { if (event.key === "Enter") submit() }}
                placeholder="Например, Malik AI Mobile"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-[15px] text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-300/45"
              />
            </label>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium text-zinc-400">Цвет проекта</span>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Цвет ${color}`}
                  onClick={() => setDraft((current) => ({ ...current, color }))}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full border transition",
                    draft.color === color ? "border-white/70 bg-white/10" : "border-white/10 hover:border-white/30",
                  )}
                >
                  <span className={cn("h-4 w-4 rounded-full", COLOR_STYLES[color].dot)} />
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-medium text-zinc-400">Краткая цель</span>
            <input
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Что вы создаёте в этом проекте?"
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-[15px] text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-300/45"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium text-zinc-400">Инструкции для Malik AI</span>
            <textarea
              value={draft.instructions}
              onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
              placeholder="Стиль ответов, технологии, правила проекта и важный контекст…"
              className="min-h-28 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-4 text-[14px] leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-300/45"
            />
          </label>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Модель проекта</p>
                <p className="mt-1 text-xs text-zinc-500">Каждый запрос пойдёт именно в выбранную модель.</p>
              </div>
              <MalikModelSelector
                selectedModelId={draft.selectedModelId}
                plan={plan}
                onSelect={(modelId) => setDraft((current) => ({ ...current, selectedModelId: modelId }))}
                onOpenBilling={onOpenBilling}
                placement="bottom"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Серверное подключение активно · ключи защищены
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-white/[0.07] px-6 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white">Отмена</button>
          <button type="button" onClick={submit} disabled={!draft.title.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35">
            <FolderPlus className="h-4 w-4" /> {submitLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}

function ProjectsIndex({
  projects,
  selectedModelId,
  plan,
  onOpenBilling,
  onCreateProject,
  onOpenProject,
  onUpdateProject,
  onDeleteProject,
  onTogglePin,
}: Omit<ProjectsWorkspaceProps, "activeProjectId" | "onSelectModel" | "onCloseProject" | "onSendPrompt" | "renderProjectChat">) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "mine" | "shared">("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<MalikProjectRecord | null>(null)
  const [deleting, setDeleting] = useState<MalikProjectRecord | null>(null)
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (filter === "shared") return []
    return [...projects]
      .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter((project) => !normalized || `${project.title} ${project.projectDescription || ""} ${(project.techStack || []).join(" ")}`.toLowerCase().includes(normalized))
  }, [filter, projects, query])

  const emptyDraft: MalikProjectDraft = {
    title: "",
    description: "",
    instructions: "",
    color: "gold",
    selectedModelId,
  }

  return (
    <div className="malik-projects-index h-full flex-1 overflow-y-auto bg-black font-sans text-white">
      <div className="malik-projects-inner mx-auto w-full max-w-[920px] px-5 pb-10 pt-12 sm:px-8 sm:pt-16">
        <div className="malik-projects-head border-b border-white/10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-white">Проекты</h1>
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:justify-end">
              <label className="relative min-w-0 flex-1 sm:max-w-[225px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск проектов"
                  className="h-9 w-full rounded-full border !border-white/15 !bg-[#202020] pl-9 pr-4 text-[13px] !text-white outline-none placeholder:!text-zinc-400 focus:!border-white/30"
                />
              </label>
              <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[13px] font-semibold text-black transition hover:bg-zinc-200">
                Создать
              </button>
            </div>
          </div>

          <nav aria-label="Фильтр проектов" className="malik-projects-filters mt-10 flex items-center gap-1 pb-3">
            {[
              ["all", "Все"],
              ["mine", "Созданные вами"],
              ["shared", "Доступные вам"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id as "all" | "mine" | "shared")}
                className={cn(
                  "h-9 rounded-full px-4 text-[13px] font-medium text-white transition hover:bg-white/10",
                  filter === id && "bg-[#343434]",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-white/[0.08]">
            {filtered.map((project) => {
              return (
                <article key={project.id} className="group relative transition hover:bg-white/[0.035]">
                  <button type="button" onClick={() => onOpenProject(project.id)} className="flex w-full items-center gap-4 px-2 py-5 pr-14 text-left">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#343434] text-white">
                      <Folder className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-[15px] font-semibold text-white">{project.title}</h2>
                        {project.isPinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-zinc-300" /> : null}
                      </div>
                      <p className="mt-1 truncate text-[12px] text-zinc-400">{project.projectDescription || relativeDate(project.timestamp)}</p>
                    </div>
                  </button>

                  <button type="button" onClick={() => setMenuProjectId((current) => current === project.id ? null : project.id)} className="absolute right-2 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-zinc-500 opacity-0 transition hover:bg-white/[0.08] hover:text-white group-hover:opacity-100 focus:opacity-100" aria-label="Действия проекта">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menuProjectId === project.id ? (
                    <div className="absolute right-2 top-[68px] z-30 w-48 rounded-xl border border-white/10 bg-[#181819] p-1.5 shadow-2xl">
                      <button type="button" onClick={() => { onTogglePin(project.id); setMenuProjectId(null) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"><Pin className="h-3.5 w-3.5" />{project.isPinned ? "Открепить" : "Закрепить"}</button>
                      <button type="button" onClick={() => { setEditing(project); setMenuProjectId(null) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"><Pencil className="h-3.5 w-3.5" />Настроить</button>
                      <button type="button" onClick={() => { setDeleting(project); setMenuProjectId(null) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-400/10"><Trash2 className="h-3.5 w-3.5" />Удалить</button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="malik-projects-empty flex min-h-[360px] flex-col items-center justify-start pt-16 text-center">
            <span className="grid h-[52px] w-[52px] place-items-center rounded-xl bg-[#343434] text-white">
              <Folder className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h2 className="mt-4 text-[15px] font-semibold text-white">{query ? "Проекты не найдены" : "Пока нет проектов"}</h2>
          </div>
        )}
      </div>

      {createOpen ? (
        <ProjectFormModal title="Новый проект" submitLabel="Создать проект" initial={emptyDraft} plan={plan} onOpenBilling={onOpenBilling} onClose={() => setCreateOpen(false)} onSubmit={(draft) => { onCreateProject(draft); setCreateOpen(false) }} />
      ) : null}
      {editing ? (
        <ProjectFormModal
          title="Настройки проекта"
          submitLabel="Сохранить"
          initial={{
            title: editing.title,
            description: editing.projectDescription || "",
            instructions: editing.projectInstructions || "",
            color: editing.projectColor || "gold",
            selectedModelId: editing.selectedModelId || selectedModelId,
          }}
          plan={plan}
          onOpenBilling={onOpenBilling}
          onClose={() => setEditing(null)}
          onSubmit={(draft) => {
            onUpdateProject(editing.id, {
              title: draft.title,
              projectDescription: draft.description,
              projectInstructions: draft.instructions,
              projectColor: draft.color,
              selectedModelId: draft.selectedModelId,
            })
            setEditing(null)
          }}
        />
      ) : null}
      {deleting ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#121213] p-6 shadow-2xl">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-400/10 text-rose-300"><Trash2 className="h-5 w-5" /></div>
            <h2 className="mt-5 text-lg font-semibold text-white">Удалить «{deleting.title}»?</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">История диалога и настройки этого проекта будут удалены из локальной рабочей области.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="h-10 rounded-xl px-4 text-sm text-zinc-300 hover:bg-white/[0.06]">Отмена</button>
              <button type="button" onClick={() => { onDeleteProject(deleting.id); setDeleting(null) }} className="h-10 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white hover:bg-rose-400">Удалить</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ProjectDetail({
  project,
  selectedModelId,
  plan,
  onSelectModel,
  onOpenBilling,
  onCloseProject,
  onUpdateProject,
  onSendPrompt,
  renderProjectChat,
}: {
  project: MalikProjectRecord
  selectedModelId: MalikModelId
  plan: AIPlan
  onSelectModel: (modelId: MalikModelId) => void
  onOpenBilling: () => void
  onCloseProject: () => void
  onUpdateProject: (id: string, patch: MalikProjectPatch) => void
  onSendPrompt: (prompt: string) => void
  renderProjectChat: () => ReactNode
}) {
  const color = project.projectColor || "gold"
  const model = getMalikModel(selectedModelId)
  const [instructions, setInstructions] = useState(project.projectInstructions || "")

  useEffect(() => setInstructions(project.projectInstructions || ""), [project.id, project.projectInstructions])

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-black font-sans text-white">
      <aside className="hidden w-[278px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0b0b0c] xl:flex">
        <div className="border-b border-white/[0.07] p-4">
          <button type="button" onClick={onCloseProject} className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft className="h-4 w-4" /> Все проекты</button>
          <div className="mt-5 flex items-center gap-3 px-2">
            <ProjectMark color={color} />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">{project.title}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Активен</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300"><Bot className="h-3.5 w-3.5 text-amber-300" /> Модель проекта</div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <MalikModelSelector selectedModelId={selectedModelId} plan={plan} onSelect={onSelectModel} onOpenBilling={onOpenBilling} placement="bottom" />
              <p className="mt-2 truncate text-[10px] text-zinc-600">{model.provider === "groq" ? "Groq" : "Cloudflare"} · серверный API</p>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300"><FileText className="h-3.5 w-3.5 text-amber-300" /> Инструкции</div>
              {instructions !== (project.projectInstructions || "") ? <span className="text-[10px] text-amber-200">Не сохранено</span> : null}
            </div>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              onBlur={() => onUpdateProject(project.id, { projectInstructions: instructions.trim().slice(0, 3000) })}
              placeholder="Добавьте правила и контекст для AI…"
              className="min-h-32 w-full resize-none rounded-xl border border-white/[0.08] bg-black/30 p-3 text-xs leading-5 text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-amber-300/30"
            />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300"><MessageSquareText className="h-3.5 w-3.5 text-amber-300" /> Быстрый старт</div>
            <div className="space-y-1.5">
              {[
                ["Составить план проекта", "Изучи цель и инструкции проекта, затем составь подробный план следующих шагов."],
                ["Проверить архитектуру", "Проанализируй текущий контекст проекта и предложи production-ready архитектуру."],
                ["Продолжить разработку", "Продолжи разработку проекта с учётом всей истории и инструкций."],
              ].map(([label, prompt]) => (
                <button key={label} type="button" onClick={() => onSendPrompt(prompt)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200">
                  <span>{label}</span><ChevronRight className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="border-t border-white/[0.07] p-4">
          <div className="flex items-center justify-between text-[10px] text-zinc-600"><span>{project.messages.length} сообщений</span><span>{relativeDate(project.timestamp)}</span></div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[62px] shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] bg-[#0b0b0c] px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onCloseProject} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white xl:hidden" aria-label="Все проекты"><ArrowLeft className="h-4 w-4" /></button>
            <ProjectMark color={color} size="small" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-white">{project.title}</h1>
              <p className="mt-0.5 truncate text-[10px] text-zinc-600">{project.projectDescription || "Рабочее пространство Malik AI"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="xl:hidden"><MalikModelSelector selectedModelId={selectedModelId} plan={plan} onSelect={onSelectModel} onOpenBilling={onOpenBilling} placement="bottom" /></div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-[10px] text-emerald-300 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> API подключён</span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {renderProjectChat()}
        </div>
      </section>
    </div>
  )
}

export function ProjectsWorkspace(props: ProjectsWorkspaceProps) {
  const activeProject = props.activeProjectId ? props.projects.find((project) => project.id === props.activeProjectId) : null

  if (activeProject) {
    return (
      <ProjectDetail
        project={activeProject}
        selectedModelId={props.selectedModelId}
        plan={props.plan}
        onSelectModel={props.onSelectModel}
        onOpenBilling={props.onOpenBilling}
        onCloseProject={props.onCloseProject}
        onUpdateProject={props.onUpdateProject}
        onSendPrompt={props.onSendPrompt}
        renderProjectChat={props.renderProjectChat}
      />
    )
  }

  return (
    <ProjectsIndex
      projects={props.projects}
      selectedModelId={props.selectedModelId}
      plan={props.plan}
      onOpenBilling={props.onOpenBilling}
      onCreateProject={props.onCreateProject}
      onOpenProject={props.onOpenProject}
      onUpdateProject={props.onUpdateProject}
      onDeleteProject={props.onDeleteProject}
      onTogglePin={props.onTogglePin}
    />
  )
}

export default ProjectsWorkspace
