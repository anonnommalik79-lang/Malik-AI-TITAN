"use client"

import { memo, useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  BookOpen,
  Brain,
  Code2,
  Film,
  Github,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Paperclip,
  Plus,
  type LucideIcon,
} from "lucide-react"
import { prefetchChatShell } from "@/lib/studio-prefetch"
import { PREFILL_EVENT, takePrefillPrompt, useContextEnabled } from "@/lib/malik-context"
import { DEFAULT_MALIK_MODEL_ID, type MalikModelId } from "@/lib/ai/malik-models"
import type { ChatSendOptions } from "@/lib/ai/response-depth"
import { useWebSearchEnabled } from "@/lib/ai/web-search-preference"
import type { AIPlan } from "@/lib/ai/types"
import type { MalikTemplate } from "@/lib/malik-template-registry"
import { MalikModelSelector } from "../MalikModelSelector"
import type { ChatAttachment } from "../chat-view"
import type { AiModeId } from "../power-registry"
import { VoiceWaveIcon } from "@/components/voice/VoiceWaveIcon"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

const SOURCE_PLUGINS: Array<{
  id: string
  label: string
  icon: LucideIcon
  prompt: string
}> = [
  {
    id: "web",
    label: "Веб",
    icon: Globe,
    prompt: "Найди в открытом вебе актуальную информацию по теме: ",
  },
  {
    id: "github",
    label: "GitHub",
    icon: Github,
    prompt: "Найди через веб-поиск лучшие открытые репозитории и исходный код по теме (site:github.com): ",
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    icon: BookOpen,
    prompt: "Найди проверенную справочную информацию по теме в Wikipedia (site:wikipedia.org): ",
  },
  {
    id: "arxiv",
    label: "arXiv",
    icon: GraduationCap,
    prompt: "Найди научные статьи и исследования по теме на arXiv (site:arxiv.org): ",
  },
]

export interface MalikHybridHomeProps {
  onSubmit: (prompt: string, attachments?: ChatAttachment[], options?: ChatSendOptions) => void
  isLoading?: boolean
  onOpenCodex?: () => void
  onOpenTemplates?: () => void
  onOpenPhoto?: () => void
  onOpenVideo?: () => void
  onOpenWebsite?: () => void
  onOpenCode?: () => void
  onOpenBilling?: () => void
  onOpenCanvas?: () => void
  onOpenCommandCenter?: () => void
  onOpenSupport?: () => void
  onOpenCapabilities?: () => void
  onOpenVoice?: () => void
  onLaunchTemplate?: (template: MalikTemplate) => void
  selectedModelId?: MalikModelId
  userPlan?: AIPlan
  onModelChange?: (modelId: MalikModelId) => void
  currentMode?: AiModeId
  onModeChange?: (mode: AiModeId) => void
}

function HomeComposer({
  prompt,
  isLoading,
  webOn,
  memoryOn,
  onPromptChange,
  onSubmit,
  onToggleWeb,
  onToggleMemory,
  onOpenPhoto,
  onOpenVideo,
  onOpenCode,
  onOpenCanvas,
  selectedModelId,
  userPlan,
  onModelChange,
  onOpenBilling,
  onOpenVoice,
}: {
  prompt: string
  isLoading?: boolean
  webOn: boolean
  memoryOn: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onToggleWeb: () => void
  onToggleMemory: () => void
  onOpenPhoto?: () => void
  onOpenVideo?: () => void
  onOpenCode?: () => void
  onOpenCanvas?: () => void
  selectedModelId: MalikModelId
  userPlan: AIPlan
  onModelChange: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  onOpenVoice?: () => void
}) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const field = textareaRef.current
    if (!field) return
    field.style.height = "0px"
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 54), 220)}px`
  }, [prompt])

  useEffect(() => {
    if (!toolsOpen) return
    const close = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [toolsOpen])

  const openAndClose = (action?: () => void) => {
    action?.()
    setToolsOpen(false)
  }

  const tools: Array<{
    id: string
    label: string
    icon: LucideIcon
    active?: boolean
    action?: () => void
  }> = [
    { id: "web", label: "Веб-поиск", icon: Globe, active: webOn, action: onToggleWeb },
    { id: "image", label: "Изображение", icon: ImageIcon, action: onOpenPhoto },
    { id: "video", label: "Видео", icon: Film, action: onOpenVideo },
    { id: "code", label: "Код", icon: Code2, action: onOpenCode },
    { id: "files", label: "Файлы", icon: Paperclip, action: onOpenCanvas },
    { id: "memory", label: "Память", icon: Brain, active: memoryOn, action: onToggleMemory },
  ]

  return (
    <section className="thome-composer" aria-label="Новый запрос">
      <div className="thome-composer-row">
        <div className="thome-tools" ref={toolsRef}>
          <button
            type="button"
            onClick={() => setToolsOpen((open) => !open)}
            className={cn("thome-icon-button thome-plus-button", toolsOpen && "is-open")}
            aria-label="Добавить файл или инструмент"
            aria-expanded={toolsOpen}
            aria-haspopup="menu"
          >
            <Plus aria-hidden="true" />
          </button>

          {toolsOpen ? (
            <div className="thome-tools-menu" role="menu" aria-label="Инструменты Malik AI">
              {tools.map((tool) => {
                const Icon = tool.icon
                return (
                  <button
                    key={tool.id}
                    type="button"
                    role="menuitem"
                    className={cn("thome-tools-item", tool.active && "is-active")}
                    onClick={() => openAndClose(tool.action)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{tool.label}</span>
                    {tool.active ? <span className="thome-tools-state">Вкл.</span> : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onFocus={prefetchChatShell}
          onChange={(event) => {
            if (event.target.value.trim()) prefetchChatShell()
            onPromptChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          rows={1}
          aria-label="Спросите Malik AI"
          placeholder="Чем я могу помочь сегодня?"
        />

        <div className="thome-composer-right">
          <MalikModelSelector
            selectedModelId={selectedModelId}
            plan={userPlan}
            onSelect={onModelChange}
            onOpenBilling={onOpenBilling}
            placement="bottom"
          />

          <span className="thome-action-swap">
            <button
              type="button"
              onClick={onOpenVoice}
              disabled={isLoading}
              className={cn("thome-voice-entry", prompt.trim() && "is-hidden")}
              aria-label="Открыть голосовой режим"
              aria-hidden={Boolean(prompt.trim())}
              tabIndex={prompt.trim() ? -1 : 0}
            >
              <VoiceWaveIcon />
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!prompt.trim() || isLoading}
              className={cn("thome-submit", !prompt.trim() && "is-hidden")}
              aria-label={isLoading ? "Malik AI отвечает" : "Отправить запрос"}
              aria-hidden={!prompt.trim()}
              tabIndex={prompt.trim() ? 0 : -1}
            >
              {isLoading ? <span className="thome-submit-loader" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
            </button>
          </span>
        </div>
      </div>

      <div className="thome-composer-meta" aria-label="Активные возможности">
        <button type="button" onClick={onToggleWeb} className={cn("thome-meta-chip", webOn && "is-active")}>
          <Globe aria-hidden="true" />
          {webOn ? "Веб-поиск: авто" : "Веб-поиск выключен"}
        </button>
        <button type="button" onClick={onToggleMemory} className={cn("thome-meta-chip", memoryOn && "is-active")}>
          <Brain aria-hidden="true" />
          Память {memoryOn ? "включена" : "выключена"}
        </button>
        <span className="thome-meta-note">Покажу прочитанные источники</span>
      </div>
    </section>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const [webOn, setWebOn] = useWebSearchEnabled()
  const [memoryOn, setMemoryOn] = useContextEnabled()

  useEffect(() => {
    const fill = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (typeof text !== "string") return
      setPrompt(text)
      window.setTimeout(() => {
        const field = document.querySelector<HTMLTextAreaElement>(".thome-composer textarea")
        field?.focus()
        field?.setSelectionRange(text.length, text.length)
      }, 0)
    }

    const pending = takePrefillPrompt()
    if (pending) fill(new CustomEvent(PREFILL_EVENT, { detail: pending }))

    window.addEventListener(PREFILL_EVENT, fill)
    return () => window.removeEventListener(PREFILL_EVENT, fill)
  }, [])

  const submit = () => {
    const text = prompt.trim()
    if (!text || props.isLoading) return
    props.onSubmit(text, [], { research: webOn })
    setPrompt("")
  }

  const focusPrompt = (value: string) => {
    setPrompt(value)
    window.setTimeout(() => {
      const field = document.querySelector<HTMLTextAreaElement>(".thome-composer textarea")
      field?.focus()
      field?.setSelectionRange(value.length, value.length)
    }, 0)
  }

  const openSourcePlugin = (pluginPrompt: string) => {
    setWebOn(true)
    prefetchChatShell()
    focusPrompt(pluginPrompt)
  }

  return (
    <div className="thome">
      <div className="thome-inner">
        <section className="thome-launcher" aria-label="Malik AI">
          <div className="thome-welcome">
            <span className="thome-welcome-logo" aria-hidden="true">
              <svg viewBox="0 0 44 44">
                <path d="M9 29 L22 15 L22 29 Z" fill="currentColor" />
                <path d="M24 15 H38 L24 29 Z" fill="currentColor" />
              </svg>
            </span>
            <h1 aria-label="Добро пожаловать в Malik AI">
              <span className="thome-word is-1">Добро</span>{" "}
              <span className="thome-word is-2">пожаловать</span>{" "}
              <span className="thome-word is-3">в</span>{" "}
              <strong>
                <span className="thome-word is-4">Malik</span>{" "}
                <span className="thome-word is-5">AI</span>
              </strong>
            </h1>
            <p className="thome-welcome-subtitle">
              От простого вопроса до глубокого исследования — Malik AI ищет по открытому вебу, читает страницы и показывает источники.
            </p>

            <HomeComposer
              prompt={prompt}
              isLoading={props.isLoading}
              webOn={webOn}
              memoryOn={memoryOn}
              onPromptChange={setPrompt}
              onSubmit={submit}
              onToggleWeb={() => setWebOn(!webOn)}
              onToggleMemory={() => setMemoryOn(!memoryOn)}
              onOpenPhoto={props.onOpenPhoto}
              onOpenVideo={props.onOpenVideo}
              onOpenCode={props.onOpenCode}
              onOpenCanvas={props.onOpenCanvas}
              selectedModelId={props.selectedModelId || DEFAULT_MALIK_MODEL_ID}
              userPlan={props.userPlan || "free"}
              onModelChange={props.onModelChange || (() => {})}
              onOpenBilling={props.onOpenBilling}
              onOpenVoice={props.onOpenVoice}
            />

            <div
              className="mx-auto mt-5 grid w-full max-w-[920px] grid-cols-2 gap-2 sm:grid-cols-4"
              aria-label="Бесплатные плагины источников"
            >
              {SOURCE_PLUGINS.map((plugin) => {
                const Icon = plugin.icon
                return (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => openSourcePlugin(plugin.prompt)}
                    className="group inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.018] px-3 text-[13px] font-medium text-zinc-400 transition duration-150 hover:border-white/[0.13] hover:bg-white/[0.045] hover:text-zinc-100 active:scale-[0.985]"
                  >
                    <Icon className="h-4 w-4 shrink-0 stroke-[1.7] text-zinc-500 transition-colors group-hover:text-zinc-300" aria-hidden="true" />
                    <span>{plugin.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export const MalikHybridHome = memo(MalikHybridHomeInner)
export default MalikHybridHome
