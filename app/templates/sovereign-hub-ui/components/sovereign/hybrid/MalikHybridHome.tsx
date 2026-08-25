"use client"

import { memo, useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  ArrowUp,
  Brain,
  Code2,
  Film,
  Globe,
  Image as ImageIcon,
  Layers3,
  Mic,
  Paperclip,
  Plus,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { prefetchChatShell } from "@/lib/studio-prefetch"
import { PREFILL_EVENT, takePrefillPrompt, useContextEnabled } from "@/lib/malik-context"
import { DEFAULT_MALIK_MODEL_ID, type MalikModelId } from "@/lib/ai/malik-models"
import type { AIPlan } from "@/lib/ai/types"
import { HOME_MALIK_TEMPLATES, type MalikTemplate } from "@/lib/malik-template-registry"
import { MalikModelSelector } from "../MalikModelSelector"
import type { AiModeId } from "../power-registry"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

export interface MalikHybridHomeProps {
  onSubmit: (prompt: string) => void
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
        placeholder="Спросите Malik AI"
      />

      <div className="thome-composer-bar">
        <div className="thome-composer-left">
          <button type="button" onClick={onOpenCanvas} className="thome-icon-button" aria-label="Добавить файл">
            <Plus aria-hidden="true" />
          </button>

          <div className="thome-tools" ref={toolsRef}>
            <button
              type="button"
              className={cn("thome-tools-trigger", toolsOpen && "is-open")}
              onClick={() => setToolsOpen((open) => !open)}
              aria-expanded={toolsOpen}
              aria-haspopup="menu"
            >
              <Wrench aria-hidden="true" />
              Инструменты
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

          <MalikModelSelector
            selectedModelId={selectedModelId}
            plan={userPlan}
            onSelect={onModelChange}
            onOpenBilling={onOpenBilling}
          />
        </div>

        <div className="thome-composer-right">
          <button type="button" className="thome-icon-button" aria-label="Голосовой ввод" disabled>
            <Mic aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!prompt.trim() || isLoading}
            className="thome-submit"
            aria-label={isLoading ? "Malik AI отвечает" : "Отправить запрос"}
          >
            {isLoading ? <span className="thome-submit-loader" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const [webOn, setWebOn] = useState(true)
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
    props.onSubmit(text)
    setPrompt("")
  }

  const runTemplate = (template: MalikTemplate) => {
    if (props.onLaunchTemplate) {
      props.onLaunchTemplate(template)
      return
    }
    setPrompt(template.prompt)
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

            <HomeComposer
              prompt={prompt}
              isLoading={props.isLoading}
              webOn={webOn}
              memoryOn={memoryOn}
              onPromptChange={setPrompt}
              onSubmit={submit}
              onToggleWeb={() => setWebOn((on) => !on)}
              onToggleMemory={() => setMemoryOn(!memoryOn)}
              onOpenPhoto={props.onOpenPhoto}
              onOpenVideo={props.onOpenVideo}
              onOpenCode={props.onOpenCode}
              onOpenCanvas={props.onOpenCanvas}
              selectedModelId={props.selectedModelId || DEFAULT_MALIK_MODEL_ID}
              userPlan={props.userPlan || "free"}
              onModelChange={props.onModelChange || (() => {})}
              onOpenBilling={props.onOpenBilling}
            />
          </div>
        </section>

        <section className="thome-library" aria-labelledby="thome-library-title">
          <div className="thome-section-head">
            <div>
              <span>Библиотека</span>
              <h2 id="thome-library-title">
                <Layers3 aria-hidden="true" />
                Готовые шаблоны <small>40</small>
              </h2>
            </div>
            <button type="button" onClick={props.onOpenTemplates} className="thome-section-link">
              Все 100 шаблонов
              <ArrowRight aria-hidden="true" />
            </button>
          </div>

          <div className="thome-templates" aria-label="40 шаблонов на главной">
            {HOME_MALIK_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => runTemplate(template)}
                className="thome-template"
              >
                <span className="thome-template-media">
                  <img
                    className="thome-template-shot"
                    src={template.preview}
                    alt={`Превью шаблона «${template.title}»`}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  <span className="thome-template-category">{template.category}</span>
                </span>
                <span className="thome-template-body">
                  <strong>{template.title}</strong>
                  <span>{template.description}</span>
                  <span className="thome-template-meta">
                    Открыть в Malik AI
                    <ArrowRight aria-hidden="true" />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <footer className="thome-footer">
          <span>© MALIK AI — Sovereign Hub. Build the Future.</span>
          <b>v6.5 TITAN</b>
        </footer>
      </div>
    </div>
  )
}

export const MalikHybridHome = memo(MalikHybridHomeInner)
export default MalikHybridHome
