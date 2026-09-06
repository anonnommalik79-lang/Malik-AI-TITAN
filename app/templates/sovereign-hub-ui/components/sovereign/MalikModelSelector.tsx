"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
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

type UpgradeTarget = { label: string }
type BrandIcon = { label: string; url: string; fallback: string }

const MOBILE_SELECTOR_QUERY = "(max-width: 768px)"
const getMobileSnapshot = () => window.matchMedia(MOBILE_SELECTOR_QUERY).matches
const getServerMobileSnapshot = () => false
function subscribeMobileSelector(onChange: () => void) {
  const query = window.matchMedia(MOBILE_SELECTOR_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

const MODEL_BRANDS: Record<MalikModelId, BrandIcon> = {
  "malik-qwen-397b": { label: "Qwen", url: "https://qwen.ai/favicon.ico", fallback: "Q" },
  "malik-reason-753b": { label: "Z.ai GLM", url: "https://z.ai/favicon.ico", fallback: "Z" },
  "malik-core-300b": { label: "Baidu ERNIE", url: "https://ernie.baidu.com/favicon.ico", fallback: "E" },
  "malik-flash-53": { label: "Z.ai GLM", url: "https://z.ai/favicon.ico", fallback: "Z" },
  "malik-vision-k3": { label: "Kimi", url: "https://www.kimi.com/favicon.ico", fallback: "K" },
  "malik-8b": { label: "Meta Llama", url: "https://www.meta.com/favicon.ico", fallback: "M" },
  "malik-20b": { label: "OpenAI", url: "https://openai.com/favicon.ico", fallback: "O" },
  "malik-fast-120b": { label: "OpenAI GPT-OSS", url: "https://openai.com/favicon.ico", fallback: "O" },
  "malik-27b": { label: "Qwen", url: "https://qwen.ai/favicon.ico", fallback: "Q" },
  "malik-30b": { label: "Qwen", url: "https://qwen.ai/favicon.ico", fallback: "Q" },
  "malik-vision-26b": { label: "Google Gemma", url: "https://www.google.com/favicon.ico", fallback: "G" },
  "malik-coder-32b": { label: "Qwen", url: "https://qwen.ai/favicon.ico", fallback: "Q" },
  "malik-70b": { label: "Meta Llama", url: "https://www.meta.com/favicon.ico", fallback: "M" },
  "malik-120b": { label: "OpenAI GPT-OSS", url: "https://openai.com/favicon.ico", fallback: "O" },
  "malik-agent-120b": { label: "NVIDIA Nemotron", url: "https://www.nvidia.com/favicon.ico", fallback: "N" },
}

function ModelBrandIcon({ model, compact = false }: { model: MalikModelDefinition; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  const brand = MODEL_BRANDS[model.id]
  return (
    <span
      className={cn("malik-model-selector__brand", compact && "is-compact")}
      aria-label={brand.label}
      title={brand.label}
    >
      {failed ? (
        <span className="malik-model-selector__brand-fallback" aria-hidden="true">{brand.fallback}</span>
      ) : (
        <img
          src={brand.url}
          alt=""
          loading="eager"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
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
      <ModelBrandIcon model={model} />
      <span className="malik-model-selector__copy">
        <span className="malik-model-selector__name">{model.label}</span>
      </span>
      <span className="malik-model-selector__state">
        {selected ? <Check aria-label="Выбрано" /> : null}
        {!selected && model.tier === "pro" ? <Crown className="malik-model-selector__pro-crown" aria-label="MalikAI Plus" /> : null}
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
  placement = "bottom",
}: {
  selectedModelId: MalikModelId
  plan: AIPlan
  onSelect: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  className?: string
  placement?: "auto" | "bottom"
}) {
  const isMobile = useSyncExternalStore(subscribeMobileSelector, getMobileSnapshot, getServerMobileSnapshot)
  const [open, setOpen] = useState(false)
  const [upgradeModel, setUpgradeModel] = useState<UpgradeTarget | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const selectedModel = getMalikModel(selectedModelId)

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
      if (isMobile) {
        const visible = window.visualViewport
        const visibleHeight = visible?.height || viewportHeight
        setPopoverStyle({
          position: "fixed",
          left: 12,
          right: 12,
          bottom: Math.max(12, viewportHeight - visibleHeight - (visible?.offsetTop || 0) + 12),
          width: "auto",
          maxHeight: Math.min(visibleHeight - 24, 640),
        })
        return
      }

      // Desktop rule: the list never flips above the selector. It always opens
      // from the lower edge exactly like the final Malik UI reference.
      const edge = 12
      const gap = 8
      const width = Math.min(356, viewportWidth - edge * 2)
      const left = Math.min(Math.max(edge, rect.left), viewportWidth - width - edge)
      const top = rect.bottom + gap
      const availableBelow = Math.max(120, viewportHeight - top - edge)
      const measuredHeight = popoverRef.current?.scrollHeight || 520
      const desiredHeight = Math.min(measuredHeight, 520, availableBelow)

      setPopoverStyle({
        position: "fixed",
        left,
        right: "auto",
        top,
        bottom: "auto",
        width,
        maxHeight: desiredHeight,
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    window.visualViewport?.addEventListener("resize", updatePosition)
    window.visualViewport?.addEventListener("scroll", updatePosition)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
      window.visualViewport?.removeEventListener("resize", updatePosition)
      window.visualViewport?.removeEventListener("scroll", updatePosition)
    }
  }, [open, placement, isMobile])

  const choose = (model: MalikModelDefinition) => {
    if (!canUseMalikModel(model.id, plan)) {
      setOpen(false)
      setUpgradeModel({ label: model.label })
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
      className="malik-model-selector__popover is-bottom"
      role="menu"
      aria-label="Модели Malik AI"
      data-requested-placement={placement}
      style={popoverStyle}
    >
      <div className="malik-model-selector__group">
        {FREE_MALIK_MODELS.map((model) => (
          <ModelRow key={model.id} model={model} selected={model.id === selectedModelId} allowed onChoose={() => choose(model)} />
        ))}
      </div>
      {PRO_MALIK_MODELS.length ? <div className="malik-model-selector__divider" /> : null}
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
          <ModelBrandIcon model={selectedModel} compact />
          <span>{selectedModel.label}</span>
          <ChevronDown className={cn("malik-model-selector__chevron", open && "is-open")} />
        </button>
      </div>

      {modelMenu && typeof document !== "undefined" ? createPortal(modelMenu, document.body) : null}
      {upgradeDialog && typeof document !== "undefined" ? createPortal(upgradeDialog, document.body) : null}
    </>
  )
}
