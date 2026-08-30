"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileText,
  Folder,
  FolderPlus,
  Hammer,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Pin,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react"
import { MalikModelSelector } from "../MalikModelSelector"
import { getMalikModel, type MalikModelId } from "@/lib/ai/malik-models"
import type { AIPlan } from "@/lib/ai/types"

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")

export type MalikProjectColor = "gold" | "blue" | "violet" | "emerald" | "rose"
export type MalikProjectStatus = "deployed" | "draft" | "building"

export type MalikProjectRecord = {
  id: string
  title: string
  timestamp: Date | string
  isPinned?: boolean
  messages: Array<{ role: "user" | "assistant"; content: string }>
  status?: MalikProjectStatus
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

const COLOR_STYLES: Record<MalikProjectColor, { icon: string; dot: string }> = {
  gold: { icon: "border-amber-300/25 bg-amber-300/10 text-amber-200", dot: "bg-amber-300" },
  blue: { icon: "border-sky-400/25 bg-sky-400/10 text-sky-200", dot: "bg-sky-400" },
  violet: { icon: "border-violet-400/25 bg-violet-400/10 text-violet-200", dot: "bg-violet-400" },
  emerald: { icon: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400" },
  rose: { icon: "border-rose-400/25 bg-rose-400/10 text-rose-200", dot: "bg-rose-400" },
}

const PROJECT_COLORS = Object.keys(COLOR_STYLES) as MalikProjectColor[]

const STATUS_META: Record<MalikProjectStatus, {
  label: string
  hint: string
  icon: typeof CircleDashed
  badge: string
  dot: string
}> = {
  draft: {
    label: "Черновик",
    hint: "Идея и настройки ещё формируются",
    icon: CircleDashed,
    badge: "border-white/10 bg-white/[0.04] text-zinc-400",
    dot: "bg-zinc-500",
  },
  building: {
    label: "В работе",
    hint: "Проект активно развивается",
    icon: Hammer,
    badge: "border-amber-300/15 bg-amber-300/[0.06] text-amber-200",
    dot: "bg-amber-300",
  },
  deployed: {
    label: "Готов",
    hint: "Основная версия проекта завершена",
    icon: CheckCircle2,
    badge: "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300",
    dot: "bg-emerald-400",
  },
}

const QUICK_START = [
  ["Составить план проекта", "Изучи цель и инструкции проекта, затем составь подробный план следующих шагов."],
  ["Проверить архитектуру", "Проанализируй текущий контекст проекта и предложи production-ready архитектуру."],
  ["Продолжить разработку", "Продолжи разработку проекта с учётом всей истории и инструкций."],
] as const

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

function normalizeStatus(status?: MalikProjectStatus): MalikProjectStatus {
  return status === "building" || status === "deployed" ? status : "draft"
}

function ProjectStatusBadge({ status, compact = false }: { status?: MalikProjectStatus; compact?: boolean }) {
  const resolved = normalizeStatus(status)
  const meta = STATUS_META[resolved]
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full border",
      compact ? "px-2 py-1 text-[9px]" : "px-2.5 py-1 text-[10px]",
      meta.badge,
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

function StatusPicker({ status, onChange }: { status?: MalikProjectStatus; onChange: (status: MalikProjectStatus) => void }) {
  const active = normalizeStatus(status)
  return (
    <div className="grid grid-cols-3 gap-1.5" aria-label="Статус проекта">
      {(Object.keys(STATUS_META) as MalikProjectStatus[]).map((value) => {
        const meta = STATUS_META[value]
        const Icon = meta.icon
        const selected = active === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(value)}
            className={cn(
              "flex min-w-0 flex-col items-start gap-1 rounded-xl border px-2.5 py-2.5 text-left transition",
              selected ? meta.badge : "border-white/[0.07] bg-black/20 text-zinc-500 hover:border-white/15 hover:text-zinc-300",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="truncate text-[10px] font-medium">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ProjectMark({ color = "gold", size = "normal" }: { color?: MalikProjectColor; size?: "small" | "normal" | "large" }) {
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,.08)]",
      COLOR_STYLES[color].icon,
      size === "small" && "h-9 w-9 rounded-xl",
      size === "normal" && "h-12 w-12",
      size === "large" && "h-14 w-14 rounded-[1.1rem] sm:h-16 sm:w-16 sm:rounded-[1.25rem]",
    )}>
      <Folder className={cn(size === "small" ? "h-4 w-4" : size === "large" ? "h-6 w-6 sm:h-7 sm:w-7" : "h-5 w-5")} strokeWidth={1.8} />
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
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:grid sm:place-items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100dvh-8px)] w-full max-w-[620px] flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-[#111112] shadow-[0_32px_120px_rgba(0,0,0,.72)] sm:max-h-[calc(100dvh-32px)] sm:rounded-[28px]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80 sm:text-[11px] sm:tracking-[0.18em]">Malik AI Projects</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.07] hover:text-white" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <ProjectMark color={draft.color} size="large" />
            <label className="min-w-0 flex-1">
              <span className="mb-2 block text-xs font-medium text-zinc-400">Название проекта</span>
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                onKeyDown={(event) => { if (event.key === "Enter") submit() }}
                placeholder="Например, Malik AI Mobile"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-[15px] text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-300/45 sm:px-4"
              />
            </label>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium text-zinc-400">Цвет проекта</span>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Цвет ${color}`}
                  onClick={() => setDraft((current) => ({ ...current, color }))}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border transition sm:h-9 sm:w-9",
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
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-[15px] text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-300/45 sm:px-4"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium text-zinc-400">Инструкции для Malik AI</span>
            <textarea
              value={draft.instructions}
              onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
              placeholder="Стиль ответов, технологии, правила проекта и важный контекст…"
              className="min-h-28 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-3.5 text-[14px] leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-300/45 sm:p-4"
            />
          </label>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3.5 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Модель проекта</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Выбор сохраняется для этого рабочего пространства.</p>
              </div>
              <div className="shrink-0 self-start sm:self-auto">
                <MalikModelSelector
                  selectedModelId={draft.selectedModelId}
                  plan={plan}
                  onSelect={(modelId) => setDraft((current) => ({ ...current, selectedModelId: modelId }))}
                  onOpenBilling={onOpenBilling}
                  placement="bottom"
                />
              </div>
            </div>
          </div>
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/[0.07] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white sm:h-10">Отмена</button>
          <button type="button" onClick={submit} disabled={!draft.title.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:px-5">
            <FolderPlus className="h-4 w-4" /> {submitLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}

type ProjectFilter = "all" | "draft" | "building" | "deployed"

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
  const [filter, setFilter] = useState<ProjectFilter>("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<MalikProjectRecord | null>(null)
  const [deleting, setDeleting] = useState<MalikProjectRecord | null>(null)
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return [...projects]
      .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter((project) => filter === "all" || normalizeStatus(project.status) === filter)
      .filter((project) => !normalized || `${project.title} ${project.projectDescription || ""} ${(project.techStack || []).join(" ")}`.toLowerCase().includes(normalized))
  }, [filter, projects, query])

  const emptyDraft: MalikProjectDraft = {
    title: "",
    description: "",
    instructions: "",
    color: "gold",
    selectedModelId,
  }

  const filters: Array<[ProjectFilter, string]> = [
    ["all", "Все"],
    ["building", "В работе"],
    ["draft", "Черновики"],
    ["deployed", "Готовые"],
  ]

  return (
    <div className="malik-projects-index h-full min-h-0 flex-1 overflow-y-auto overscroll-contain bg-black font-sans text-white">
      <div className="malik-projects-inner mx-auto w-full max-w-[920px] px-4 pb-10 pt-7 sm:px-8 sm:pt-16">
        <div className="malik-projects-head border-b border-white/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-white sm:text-[26px]">Проекты</h1>
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:gap-3 sm:justify-end">
              <label className="relative min-w-0 sm:max-w-[225px] sm:flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск проектов"
                  className="h-10 w-full rounded-full border !border-white/15 !bg-[#202020] pl-9 pr-3 text-[13px] !text-white outline-none placeholder:!text-zinc-400 focus:!border-white/30 sm:h-9 sm:pr-4"
                />
              </label>
              <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[13px] font-semibold text-black transition hover:bg-zinc-200 sm:h-9">
                Создать
              </button>
            </div>
          </div>

          <nav aria-label="Фильтр проектов" className="malik-projects-filters -mx-1 mt-6 flex items-center gap-1 overflow-x-auto px-1 pb-3 [scrollbar-width:none] sm:mt-10 [&::-webkit-scrollbar]:hidden">
            {filters.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-4 text-[13px] font-medium text-white transition hover:bg-white/10",
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
            {filtered.map((project) => (
              <article key={project.id} className="group relative transition hover:bg-white/[0.035]">
                <button type="button" onClick={() => onOpenProject(project.id)} className="flex w-full items-center gap-3 px-1 py-4 pr-12 text-left sm:gap-4 sm:px-2 sm:py-5 sm:pr-14">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#343434] text-white">
                    <Folder className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="min-w-0 truncate text-[15px] font-semibold text-white">{project.title}</h2>
                      {project.isPinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-zinc-300" /> : null}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12px] text-zinc-400">{project.projectDescription || relativeDate(project.timestamp)}</p>
                      <ProjectStatusBadge status={project.status} compact />
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMenuProjectId((current) => current === project.id ? null : project.id)}
                  className="absolute right-1 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 opacity-100 transition hover:bg-white/[0.08] hover:text-white sm:right-2 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                  aria-label="Действия проекта"
                  aria-expanded={menuProjectId === project.id}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>

                {menuProjectId === project.id ? (
                  <div className="absolute right-1 top-[62px] z-30 w-48 rounded-xl border border-white/10 bg-[#181819] p-1.5 shadow-2xl sm:right-2 sm:top-[68px]">
                    <button type="button" onClick={() => { onTogglePin(project.id); setMenuProjectId(null) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"><Pin className="h-3.5 w-3.5" />{project.isPinned ? "Открепить" : "Закрепить"}</button>
                    <button type="button" onClick={() => { setEditing(project); setMenuProjectId(null) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"><Pencil className="h-3.5 w-3.5" />Настроить</button>
                    <button type="button" onClick={() => { setDeleting(project); setMenuProjectId(null) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-400/10"><Trash2 className="h-3.5 w-3.5" />Удалить</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="malik-projects-empty flex min-h-[320px] flex-col items-center justify-start pt-14 text-center sm:min-h-[360px] sm:pt-16">
            <span className="grid h-[52px] w-[52px] place-items-center rounded-xl bg-[#343434] text-white">
              <Folder className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h2 className="mt-4 text-[15px] font-semibold text-white">{query ? "Проекты не найдены" : filter === "all" ? "Пока нет проектов" : "В этом статусе пока пусто"}</h2>
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
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:grid sm:place-items-center sm:p-4">
          <section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-t-[24px] border border-white/10 bg-[#121213] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-[24px] sm:p-6">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-400/10 text-rose-300"><Trash2 className="h-5 w-5" /></div>
            <h2 className="mt-5 text-lg font-semibold text-white">Удалить «{deleting.title}»?</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">История диалога и настройки этого проекта будут удалены из локальной рабочей области.</p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button type="button" onClick={() => setDeleting(null)} className="h-11 rounded-xl px-4 text-sm text-zinc-300 hover:bg-white/[0.06] sm:h-10">Отмена</button>
              <button type="button" onClick={() => { onDeleteProject(deleting.id); setDeleting(null) }} className="h-11 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white hover:bg-rose-400 sm:h-10">Удалить</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ProjectControlPanel({
  project,
  selectedModelId,
  plan,
  onSelectModel,
  onOpenBilling,
  instructions,
  setInstructions,
  onUpdateProject,
  onSendPrompt,
  compact = false,
}: {
  project: MalikProjectRecord
  selectedModelId: MalikModelId
  plan: AIPlan
  onSelectModel: (modelId: MalikModelId) => void
  onOpenBilling: () => void
  instructions: string
  setInstructions: (value: string) => void
  onUpdateProject: (id: string, patch: MalikProjectPatch) => void
  onSendPrompt: (prompt: string) => void
  compact?: boolean
}) {
  const model = getMalikModel(selectedModelId)
  const dirty = instructions !== (project.projectInstructions || "")
  return (
    <div className={cn("space-y-5", compact ? "p-4" : "p-4")}>
      <section>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300"><CheckCircle2 className="h-3.5 w-3.5 text-amber-300" /> Статус</div>
          <ProjectStatusBadge status={project.status} compact />
        </div>
        <StatusPicker status={project.status} onChange={(status) => onUpdateProject(project.id, { status })} />
        <p className="mt-2 text-[10px] leading-4 text-zinc-600">{STATUS_META[normalizeStatus(project.status)].hint}</p>
      </section>

      <section>
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-zinc-300"><Bot className="h-3.5 w-3.5 text-amber-300" /> Модель проекта</div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <MalikModelSelector selectedModelId={selectedModelId} plan={plan} onSelect={onSelectModel} onOpenBilling={onOpenBilling} placement="bottom" />
          <p className="mt-2 truncate text-[10px] text-zinc-600">{model.label} · выбранная модель проекта</p>
        </div>
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300"><FileText className="h-3.5 w-3.5 text-amber-300" /> Инструкции</div>
          {dirty ? <span className="text-[10px] text-amber-200">Не сохранено</span> : <span className="text-[10px] text-zinc-700">Сохранено</span>}
        </div>
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          onBlur={() => {
            const next = instructions.trim().slice(0, 3000)
            if (next !== (project.projectInstructions || "")) onUpdateProject(project.id, { projectInstructions: next })
          }}
          placeholder="Добавьте правила и контекст для AI…"
          className="min-h-28 w-full resize-none rounded-xl border border-white/[0.08] bg-black/30 p-3 text-xs leading-5 text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-amber-300/30"
        />
      </section>

      <section>
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-zinc-300"><MessageSquareText className="h-3.5 w-3.5 text-amber-300" /> Быстрый старт</div>
        <div className="space-y-1.5">
          {QUICK_START.map(([label, prompt]) => (
            <button key={label} type="button" onClick={() => onSendPrompt(prompt)} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200">
              <span>{label}</span><ChevronRight className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </section>
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
  const [instructions, setInstructions] = useState(project.projectInstructions || "")
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false)

  useEffect(() => {
    setInstructions(project.projectInstructions || "")
    setMobileControlsOpen(false)
  }, [project.id, project.projectInstructions])

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-black font-sans text-white">
      <aside className="hidden w-[278px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0b0b0c] xl:flex">
        <div className="border-b border-white/[0.07] p-4">
          <button type="button" onClick={onCloseProject} className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft className="h-4 w-4" /> Все проекты</button>
          <div className="mt-5 flex items-center gap-3 px-2">
            <ProjectMark color={color} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-white">{project.title}</h2>
              <div className="mt-1.5"><ProjectStatusBadge status={project.status} compact /></div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ProjectControlPanel
            project={project}
            selectedModelId={selectedModelId}
            plan={plan}
            onSelectModel={onSelectModel}
            onOpenBilling={onOpenBilling}
            instructions={instructions}
            setInstructions={setInstructions}
            onUpdateProject={onUpdateProject}
            onSendPrompt={onSendPrompt}
          />
        </div>

        <div className="border-t border-white/[0.07] p-4">
          <div className="flex items-center justify-between text-[10px] text-zinc-600"><span>{project.messages.length} сообщений</span><span>{relativeDate(project.timestamp)}</span></div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[60px] shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-[#0b0b0c] px-2.5 py-2 sm:h-[62px] sm:gap-4 sm:px-5 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button type="button" onClick={onCloseProject} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white xl:hidden" aria-label="Все проекты"><ArrowLeft className="h-4 w-4" /></button>
            <ProjectMark color={color} size="small" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[13px] font-semibold text-white sm:text-sm">{project.title}</h1>
              <p className="mt-0.5 hidden truncate text-[10px] text-zinc-600 sm:block">{project.projectDescription || "Рабочее пространство Malik AI"}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:block xl:hidden"><ProjectStatusBadge status={project.status} compact /></div>
            <button
              type="button"
              onClick={() => setMobileControlsOpen((current) => !current)}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-xl border text-zinc-400 transition xl:hidden",
                mobileControlsOpen ? "border-white/20 bg-white/[0.08] text-white" : "border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.06] hover:text-white",
              )}
              aria-label="Настройки проекта"
              aria-expanded={mobileControlsOpen}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        {mobileControlsOpen ? (
          <div className="max-h-[min(48dvh,430px)] shrink-0 overflow-y-auto overscroll-contain border-b border-white/[0.07] bg-[#0b0b0c] xl:hidden">
            <ProjectControlPanel
              project={project}
              selectedModelId={selectedModelId}
              plan={plan}
              onSelectModel={onSelectModel}
              onOpenBilling={onOpenBilling}
              instructions={instructions}
              setInstructions={setInstructions}
              onUpdateProject={onUpdateProject}
              onSendPrompt={(prompt) => {
                setMobileControlsOpen(false)
                onSendPrompt(prompt)
              }}
              compact
            />
          </div>
        ) : null}

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
