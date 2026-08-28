"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Crown, Lock, X } from "lucide-react"
import {
  FREE_MALIK_MODELS,
  PRO_MALIK_MODELS,
  canUseMalikModel,
  getMalikModel,
  type MalikModelDefinition,
  type MalikModelId,
} from "@/lib/ai/malik-models"
import {
  DEFAULT_MALIK_IMAGE_MODEL_ID,
  loadMalikImageModeActive,
  loadMalikImageModelSelection,
  saveMalikImageModeActive,
  saveMalikImageModelSelection,
  type MalikImageModelId,
} from "@/lib/media/image-models"
import type { AIPlan } from "@/lib/ai/types"
import { MalikImageModelSelector } from "./MalikImageModelSelector"

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")

function MalikMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn("malik-model-selector__mark", compact && "is-compact")} aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <path d="M9 29 L22 15 L22 29 Z" fill="currentColor" />
        <path d="M24 15 H38 L24 29 Z" fill="currentColor" />
      </svg>
    </span>
  )
}

function ModelRow({
  model,
  selected,
  allowed,
  onChoose,
}: {
  model: MalikModelDefinition
  selected: boolean
  allowed: boolean
  onChoose: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={cn("malik-model-selector__row", selected && "is-selected")}
      onClick={onChoose}
    >
      <MalikMark />
      <span className="malik-model-selector__copy">
        <span className="malik-model-selector__name">{model.label}</span>
        <span className="malik-model-selector__description">{model.description}</span>
      </span>
      <span className="malik-model-selector__state">
        {selected ? (
          <Check aria-label="Выбрано" />
        ) : model.tier === "free" ? (
          <span className="is-free">Бесплатно</span>
        ) : allowed ? (
          <span className="is-free">Доступно</span>
        ) : (
          <span className="is-pro"><Crown /> PLUS</span>
        )}
        {!allowed && model.tier === "pro" ? <Lock className="malik-model-selector__lock" aria-hidden="true" /> : null}
      </span>
    </button>
  )
}

function setControlledTextareaValue(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
  if (setter) setter.call(field, value)
  else field.value = value
  field.dispatchEvent(new Event("input", { bubbles: true }))
}

function selectedComposerTextarea(button?: Element | null): HTMLTextAreaElement | null {
  if (button?.classList.contains("thome-submit")) {
    return document.querySelector<HTMLTextAreaElement>(".thome-composer textarea")
  }
  if (button?.classList.contains("malik-inline-send")) {
    return document.querySelector<HTMLTextAreaElement>(".malik-composer-textarea")
  }
  return document.querySelector<HTMLTextAreaElement>(".thome-composer textarea, .malik-composer-textarea")
}

function selectedComposerSendButton(field: HTMLTextAreaElement): HTMLButtonElement | null {
  if (field.matches(".malik-composer-textarea")) {
    return document.querySelector<HTMLButtonElement>(".malik-inline-send")
  }
  return document.querySelector<HTMLButtonElement>(".thome-submit")
}

export function MalikModelSelector({
  selectedModelId,
  plan,
  onSelect,
  onOpenBilling,
  className,
  placement = "auto",
}: {
  selectedModelId: MalikModelId
  plan: AIPlan
  onSelect: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  className?: string
  placement?: "auto" | "bottom"
}) {
  const [open, setOpen] = useState(false)
  const [upgradeModel, setUpgradeModel] = useState<MalikModelDefinition | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const [imageModelId, setImageModelId] = useState<MalikImageModelId>(DEFAULT_MALIK_IMAGE_MODEL_ID)
  const [imageModeActive, setImageModeActive] = useState(false)
  const bypassImageBridgeRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const selectedModel = getMalikModel(selectedModelId)

  useEffect(() => {
    const savedModel = loadMalikImageModelSelection()
    setImageModelId(savedModel)
    setImageModeActive(loadMalikImageModeActive())
    saveMalikImageModelSelection(savedModel)
  }, [])

  useEffect(() => {
    if (!imageModeActive) return

    const prefixPrompt = (field: HTMLTextAreaElement) => {
      const value = field.value.trim()
      if (!value || /^\s*\/(image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])/iu.test(value)) return false
      // Respect an explicit non-image slash command instead of silently replacing it.
      if (/^\s*\/[\p{L}\p{N}_-]+/u.test(value)) return false
      setControlledTextareaValue(field, `/image ${value}`)
      return true
    }

    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (bypassImageBridgeRef.current || event.key !== "Enter" || event.shiftKey || event.isComposing) return
      const field = event.target instanceof HTMLTextAreaElement ? event.target : null
      if (!field || !field.matches(".thome-composer textarea, .malik-composer-textarea")) return
      if (!prefixPrompt(field)) return

      const sendButton = selectedComposerSendButton(field)
      if (!sendButton || sendButton.disabled) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      window.setTimeout(() => {
        bypassImageBridgeRef.current = true
        sendButton.click()
        window.setTimeout(() => { bypassImageBridgeRef.current = false }, 0)
      }, 0)
    }

    const onClickCapture = (event: MouseEvent) => {
      if (bypassImageBridgeRef.current) return
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest(".thome-submit, .malik-inline-send") as HTMLButtonElement | null
      if (!button || button.disabled) return
      const field = selectedComposerTextarea(button)
      if (!field || !prefixPrompt(field)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      window.setTimeout(() => {
        bypassImageBridgeRef.current = true
        button.click()
        window.setTimeout(() => { bypassImageBridgeRef.current = false }, 0)
      }, 0)
    }

    document.addEventListener("keydown", onKeyDownCapture, true)
    document.addEventListener("click", onClickCapture, true)
    return () => {
      document.removeEventListener("keydown", onKeyDownCapture, true)
      document.removeEventListener("click", onClickCapture, true)
    }
  }, [imageModeActive])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        setUpgradeModel(null)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const mobile = viewportWidth <= 680

      if (mobile) {
        setPopoverStyle({
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          width: "auto",
          maxHeight: Math.min(viewportHeight * 0.76, 620),
        })
        return
      }

      const width = Math.min(344, viewportWidth - 24)
      const left = Math.min(Math.max(12, rect.left), viewportWidth - width - 12)

      if (placement === "bottom") {
        const top = rect.bottom + 10
        setPopoverStyle({
          position: "fixed",
          left,
          right: "auto",
          top,
          bottom: "auto",
          width,
          maxHeight: Math.max(260, Math.min(viewportHeight - top - 12, 566)),
        })
        return
      }

      const bottom = Math.max(12, viewportHeight - rect.top + 10)
      const availableAbove = Math.max(280, rect.top - 24)

      setPopoverStyle({
        position: "fixed",
        left,
        right: "auto",
        bottom,
        width,
        maxHeight: Math.min(viewportHeight * 0.72, 620, availableAbove),
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open, placement])

  const choose = (model: MalikModelDefinition) => {
    if (!canUseMalikModel(model.id, plan)) {
      setOpen(false)
      setUpgradeModel(model)
      return
    }
    onSelect(model.id)
    setOpen(false)
  }

  const chooseImageModel = (modelId: MalikImageModelId) => {
    setImageModelId(modelId)
    saveMalikImageModelSelection(modelId)
  }

  const setImageMode = (active: boolean) => {
    setImageModeActive(active)
    saveMalikImageModeActive(active)
  }

  const upgradeDialog = upgradeModel ? (
    <div className="malik-model-upgrade" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setUpgradeModel(null)
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="malik-model-upgrade-title" className="malik-model-upgrade__panel">
        <button type="button" className="malik-model-upgrade__close" aria-label="Закрыть" onClick={() => setUpgradeModel(null)}>
          <X />
        </button>
        <span className="malik-model-upgrade__icon"><Crown /></span>
        <h2 id="malik-model-upgrade-title">{upgradeModel.label} доступна в MalikAI Plus</h2>
        <p>Получите доступ к расширенным моделям, агентам и более высоким лимитам.</p>
        <button type="button" className="malik-model-upgrade__button" onClick={() => {
          setUpgradeModel(null)
          onOpenBilling?.()
        }}>
          Перейти на Plus
        </button>
      </section>
    </div>
  ) : null

  const modelMenu = open ? (
    <div
      ref={popoverRef}
      className={cn("malik-model-selector__popover", placement === "bottom" && "is-bottom")}
      role="menu"
      aria-label="Модели Malik AI"
      style={popoverStyle}
    >
      <div className="malik-model-selector__title">Модели</div>
      <div className="malik-model-selector__section-label">Бесплатные</div>
      <div className="malik-model-selector__group">
        {FREE_MALIK_MODELS.map((model) => (
          <ModelRow key={model.id} model={model} selected={model.id === selectedModelId} allowed onChoose={() => choose(model)} />
        ))}
      </div>
      <div className="malik-model-selector__divider" />
      <div className="malik-model-selector__section-label is-pro"><Crown /> Модели Plus</div>
      <div className="malik-model-selector__group">
        {PRO_MALIK_MODELS.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            selected={model.id === selectedModelId}
            allowed={canUseMalikModel(model.id, plan)}
            onChoose={() => choose(model)}
          />
        ))}
      </div>
    </div>
  ) : null

  return (
    <>
      <div ref={rootRef} className={cn("malik-model-selector", className)}>
        <button
          ref={triggerRef}
          type="button"
          className="malik-model-selector__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <MalikMark compact />
          <span>{selectedModel.label}</span>
          <ChevronDown className={cn("malik-model-selector__chevron", open && "is-open")} />
        </button>
      </div>

      <MalikImageModelSelector
        selectedModelId={imageModelId}
        active={imageModeActive}
        plan={plan}
        onSelect={chooseImageModel}
        onActiveChange={setImageMode}
        onOpenBilling={onOpenBilling}
        placement={placement}
      />

      {modelMenu && typeof document !== "undefined" ? createPortal(modelMenu, document.body) : null}
      {upgradeDialog && typeof document !== "undefined" ? createPortal(upgradeDialog, document.body) : null}
    </>
  )
}
