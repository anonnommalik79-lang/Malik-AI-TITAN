"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Crown, Image as ImageIcon, Lock, Power, X } from "lucide-react"
import {
  MALIK_IMAGE_MODELS,
  canUseMalikImageModel,
  getMalikImageModel,
  type MalikImageModelDefinition,
  type MalikImageModelId,
} from "@/lib/media/image-models"
import type { AIPlan } from "@/lib/ai/types"

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

export function MalikImageModelSelector({
  selectedModelId,
  active,
  plan,
  onSelect,
  onActiveChange,
  onOpenBilling,
  placement = "bottom",
}: {
  selectedModelId: MalikImageModelId
  active: boolean
  plan: AIPlan
  onSelect: (modelId: MalikImageModelId) => void
  onActiveChange: (active: boolean) => void
  onOpenBilling?: () => void
  placement?: "auto" | "bottom"
}) {
  const [open, setOpen] = useState(false)
  const [upgradeModel, setUpgradeModel] = useState<MalikImageModelDefinition | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const selectedModel = getMalikImageModel(selectedModelId)

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
          maxHeight: Math.min(viewportHeight * 0.78, 620),
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
      setPopoverStyle({
        position: "fixed",
        left,
        right: "auto",
        bottom,
        width,
        maxHeight: Math.min(viewportHeight * 0.72, 620),
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

  const choose = (model: MalikImageModelDefinition) => {
    if (!canUseMalikImageModel(model.id, plan)) {
      setOpen(false)
      setUpgradeModel(model)
      return
    }
    onSelect(model.id)
    onActiveChange(true)
    setOpen(false)
  }

  const modelMenu = open ? (
    <div
      ref={popoverRef}
      className={cn("malik-model-selector__popover", placement === "bottom" && "is-bottom")}
      role="menu"
      aria-label="Модели генерации фото Malik AI"
      style={popoverStyle}
    >
      <div className="malik-model-selector__title">Генерация фото</div>
      <div className="malik-model-selector__section-label">Модели изображений</div>
      <div className="malik-model-selector__group">
        {MALIK_IMAGE_MODELS.map((model) => (
          <ImageModelRow
            key={model.id}
            model={model}
            selected={active && model.id === selectedModelId}
            allowed={canUseMalikImageModel(model.id, plan)}
            onChoose={() => choose(model)}
          />
        ))}
      </div>
      <div className="malik-model-selector__divider" />
      <button
        type="button"
        role="menuitem"
        className="malik-model-selector__row"
        onClick={() => {
          onActiveChange(false)
          setOpen(false)
        }}
      >
        <span className="malik-model-selector__mark" aria-hidden="true"><Power /></span>
        <span className="malik-model-selector__copy">
          <span className="malik-model-selector__name">Обычный чат</span>
          <span className="malik-model-selector__description">Выключить режим генерации фото</span>
        </span>
        <span className="malik-model-selector__state">{!active ? <Check aria-label="Выбрано" /> : null}</span>
      </button>
    </div>
  ) : null

  const upgradeDialog = upgradeModel ? (
    <div className="malik-model-upgrade" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setUpgradeModel(null)
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="malik-image-upgrade-title" className="malik-model-upgrade__panel">
        <button type="button" className="malik-model-upgrade__close" aria-label="Закрыть" onClick={() => setUpgradeModel(null)}>
          <X />
        </button>
        <span className="malik-model-upgrade__icon"><Crown /></span>
        <h2 id="malik-image-upgrade-title">{upgradeModel.label} доступна в MalikAI Plus</h2>
        <p>ULTRA-рендер на FLUX.2 Dev с максимальным качеством и точностью сложных промптов.</p>
        <button type="button" className="malik-model-upgrade__button" onClick={() => {
          setUpgradeModel(null)
          onOpenBilling?.()
        }}>
          Перейти на Plus
        </button>
      </section>
    </div>
  ) : null

  return (
    <>
      <div ref={rootRef} className={cn("malik-model-selector", active && "is-image-active")}>
        <button
          ref={triggerRef}
          type="button"
          className="malik-model-selector__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Выбрать модель генерации фото"
          onClick={() => setOpen((value) => !value)}
          style={active ? { borderColor: "rgba(230, 190, 80, .42)", color: "#f4d675" } : undefined}
        >
          <ImageIcon style={{ width: 16, height: 16, flex: "0 0 auto" }} aria-hidden="true" />
          <span>{active ? `Фото · ${selectedModel.shortLabel}` : "Фото"}</span>
          <ChevronDown className={cn("malik-model-selector__chevron", open && "is-open")} />
        </button>
      </div>
      {modelMenu && typeof document !== "undefined" ? createPortal(modelMenu, document.body) : null}
      {upgradeDialog && typeof document !== "undefined" ? createPortal(upgradeDialog, document.body) : null}
    </>
  )
}
