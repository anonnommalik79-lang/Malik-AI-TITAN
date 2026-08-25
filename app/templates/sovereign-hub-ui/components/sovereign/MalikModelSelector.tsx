"use client"

import { useEffect, useRef, useState } from "react"
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
        {selected ? <Check aria-label="Выбрано" /> : model.tier === "free" ? <span className="is-free">Бесплатно</span> : <span className="is-pro"><Crown /> PRO</span>}
        {!allowed && model.tier === "pro" ? <Lock className="malik-model-selector__lock" aria-hidden="true" /> : null}
      </span>
    </button>
  )
}

export function MalikModelSelector({
  selectedModelId,
  plan,
  onSelect,
  onOpenBilling,
  className,
}: {
  selectedModelId: MalikModelId
  plan: AIPlan
  onSelect: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [upgradeModel, setUpgradeModel] = useState<MalikModelDefinition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedModel = getMalikModel(selectedModelId)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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

  const choose = (model: MalikModelDefinition) => {
    if (!canUseMalikModel(model.id, plan)) {
      setOpen(false)
      setUpgradeModel(model)
      return
    }
    onSelect(model.id)
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
        <h2 id="malik-model-upgrade-title">{upgradeModel.label} доступна в Malik AI Pro</h2>
        <p>Получите доступ к расширенным моделям, агентам и более высоким лимитам.</p>
        <button type="button" className="malik-model-upgrade__button" onClick={() => {
          setUpgradeModel(null)
          onOpenBilling?.()
        }}>
          Перейти на Pro
        </button>
      </section>
    </div>
  ) : null

  return (
    <>
      <div ref={rootRef} className={cn("malik-model-selector", className)}>
        <button
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

        {open ? (
          <div className="malik-model-selector__popover" role="menu" aria-label="Модели Malik AI">
            <div className="malik-model-selector__title">Модели</div>
            <div className="malik-model-selector__section-label">Бесплатные</div>
            <div className="malik-model-selector__group">
              {FREE_MALIK_MODELS.map((model) => (
                <ModelRow key={model.id} model={model} selected={model.id === selectedModelId} allowed onChoose={() => choose(model)} />
              ))}
            </div>
            <div className="malik-model-selector__divider" />
            <div className="malik-model-selector__section-label is-pro"><Crown /> Pro модели</div>
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
        ) : null}
      </div>
      {upgradeDialog && typeof document !== "undefined" ? createPortal(upgradeDialog, document.body) : null}
    </>
  )
}
