"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Crown, Image as ImageIcon, Lock, MessageSquare, X } from "lucide-react"
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
  MALIK_IMAGE_MODELS,
  canUseMalikImageModel,
  getMalikImageModel,
  loadMalikImageModeActive,
  loadMalikImageModelSelection,
  saveMalikImageModeActive,
  saveMalikImageModelSelection,
  type MalikImageModelDefinition,
  type MalikImageModelId,
} from "@/lib/media/image-models"
import type { AIPlan } from "@/lib/ai/types"

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")

type SelectorTab = "models" | "photo"
type UpgradeTarget = { label: string; image?: boolean }

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

function OfficialBrandIcon({ model, compact = false }: { model: MalikImageModelDefinition; compact?: boolean }) {
  const [failed, setFailed] = useState(false)

  if (model.brand === "malik") return <MalikMark compact={compact} />
  if (failed) {
    return (
      <span className={cn("malik-model-selector__mark", compact && "is-compact")} aria-hidden="true">
        <ImageIcon />
      </span>
    )
  }

  const src = model.brand === "bfl" ? "https://bfl.ai/favicon.ico" : "https://leonardo.ai/favicon.ico"
  const alt = model.brand === "bfl" ? "Black Forest Labs" : "Leonardo.Ai"

  return (
    <span
      className={cn("malik-model-selector__mark", compact && "is-compact")}
      aria-hidden="true"
      style={{ overflow: "hidden", background: "#fff" }}
    >
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", borderRadius: 7 }}
      />
    </span>
  )
}

function ImageModelRow({
  model,
  selected,
  allowed,
  onChoose,
}: {
  model: MalikImageModelDefinition
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
      <OfficialBrandIcon model={model} />
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
        {!allowed && model.tier === "premium" ? <Lock className="malik-model-selector__lock" aria-hidden="true" /> : null}
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
  const [tab, setTab] = useState<SelectorTab>("models")
  const [upgradeModel, setUpgradeModel] = useState<UpgradeTarget | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const [imageModelId, setImageModelId] = useState<MalikImageModelId>(DEFAULT_MALIK_IMAGE_MODEL_ID)
  const [imageModeActive, setImageModeActive] = useState(false)
  const bypassImageBridgeRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const selectedModel = getMalikModel(selectedModelId)
  const selectedImageModel = getMalikImageModel(imageModelId)

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
          maxHeight: Math.min(viewportHeight * 0.78, 640),
        })
        return
      }

      const width = Math.min(378, viewportWidth - 24)
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
          maxHeight: Math.max(280, Math.min(viewportHeight - top - 12, 620)),
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

  const setImageMode = (active: boolean) => {
    setImageModeActive(active)
    saveMalikImageModeActive(active)
  }

  const choose = (model: MalikModelDefinition) => {
    if (!canUseMalikModel(model.id, plan)) {
      setOpen(false)
      setUpgradeModel({ label: model.label })
      return
    }
    setImageMode(false)
    onSelect(model.id)
    setOpen(false)
  }

  const chooseImageModel = (model: MalikImageModelDefinition) => {
    if (!canUseMalikImageModel(model.id, plan)) {
      setOpen(false)
      setUpgradeModel({ label: model.label, image: true })
      return
    }
    setImageModelId(model.id)
    saveMalikImageModelSelection(model.id)
    setImageMode(true)
    setOpen(false)
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
        <p>{upgradeModel.image
          ? "ULTRA-рендер фото с максимальным качеством и точностью сложных промптов."
          : "Получите доступ к расширенным моделям, агентам и более высоким лимитам."}</p>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "4px 4px 10px" }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "models"}
          onClick={() => setTab("models")}
          style={{
            minHeight: 38,
            borderRadius: 12,
            border: tab === "models" ? "1px solid rgba(255,255,255,.16)" : "1px solid transparent",
            background: tab === "models" ? "rgba(255,255,255,.08)" : "transparent",
            color: tab === "models" ? "#fff" : "#a1a1aa",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          <MalikMark compact /> Модели
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "photo"}
          onClick={() => setTab("photo")}
          style={{
            minHeight: 38,
            borderRadius: 12,
            border: tab === "photo" ? "1px solid rgba(230,190,80,.28)" : "1px solid transparent",
            background: tab === "photo" ? "rgba(230,190,80,.10)" : "transparent",
            color: tab === "photo" ? "#f4d675" : "#a1a1aa",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          <ImageIcon style={{ width: 15, height: 15 }} /> Фото
        </button>
      </div>

      {tab === "models" ? (
        <>
          <div className="malik-model-selector__section-label">Бесплатные</div>
          <div className="malik-model-selector__group">
            {FREE_MALIK_MODELS.map((model) => (
              <ModelRow key={model.id} model={model} selected={!imageModeActive && model.id === selectedModelId} allowed onChoose={() => choose(model)} />
            ))}
          </div>
          <div className="malik-model-selector__divider" />
          <div className="malik-model-selector__section-label is-pro"><Crown /> Модели Plus</div>
          <div className="malik-model-selector__group">
            {PRO_MALIK_MODELS.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                selected={!imageModeActive && model.id === selectedModelId}
                allowed={canUseMalikModel(model.id, plan)}
                onChoose={() => choose(model)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="malik-model-selector__section-label">Модели изображений</div>
          <div className="malik-model-selector__group">
            {MALIK_IMAGE_MODELS.map((model) => (
              <ImageModelRow
                key={model.id}
                model={model}
                selected={imageModeActive && model.id === imageModelId}
                allowed={canUseMalikImageModel(model.id, plan)}
                onChoose={() => chooseImageModel(model)}
              />
            ))}
          </div>
          <div className="malik-model-selector__divider" />
          <button
            type="button"
            role="menuitem"
            className="malik-model-selector__row"
            onClick={() => {
              setImageMode(false)
              setTab("models")
            }}
          >
            <span className="malik-model-selector__mark" aria-hidden="true"><MessageSquare /></span>
            <span className="malik-model-selector__copy">
              <span className="malik-model-selector__name">Обычный чат</span>
              <span className="malik-model-selector__description">Вернуться к текстовой модели</span>
            </span>
            <span className="malik-model-selector__state">{!imageModeActive ? <Check aria-label="Выбрано" /> : null}</span>
          </button>
        </>
      )}
    </div>
  ) : null

  return (
    <>
      <div ref={rootRef} className={cn("malik-model-selector", imageModeActive && "is-image-active", className)}>
        <button
          ref={triggerRef}
          type="button"
          className="malik-model-selector__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            if (!open) setTab(imageModeActive ? "photo" : "models")
            setOpen((value) => !value)
          }}
          style={imageModeActive ? { borderColor: "rgba(230,190,80,.42)", color: "#f4d675" } : undefined}
        >
          {imageModeActive
            ? <ImageIcon style={{ width: 16, height: 16, flex: "0 0 auto" }} aria-hidden="true" />
            : <MalikMark compact />}
          <span>{imageModeActive ? `Фото · ${selectedImageModel.shortLabel}` : selectedModel.label}</span>
          <ChevronDown className={cn("malik-model-selector__chevron", open && "is-open")} />
        </button>
      </div>

      {modelMenu && typeof document !== "undefined" ? createPortal(modelMenu, document.body) : null}
      {upgradeDialog && typeof document !== "undefined" ? createPortal(upgradeDialog, document.body) : null}
    </>
  )
}
