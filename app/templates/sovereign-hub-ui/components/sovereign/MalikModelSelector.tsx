"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Crown, Lock, Search } from "lucide-react"
import { PUBLIC_MALIK_MODELS, getMalikModel, hasMalikProAccess, type MalikModelDefinition, type MalikModelId } from "@/lib/ai/malik-models"
import type { AIPlan } from "@/lib/ai/types"

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ")
type BrandIcon = { label: string; urls: readonly string[]; fallback: string }

const MOBILE_SELECTOR_QUERY = "(max-width: 768px)"
const getMobileSnapshot = () => window.matchMedia(MOBILE_SELECTOR_QUERY).matches
const getServerMobileSnapshot = () => false
function subscribeMobileSelector(onChange: () => void) {
  const query = window.matchMedia(MOBILE_SELECTOR_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

const MALIK_MAX_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAADMklEQVR42u2aPYgVVxTHf2feW1wTv4gpJGCqLIqd4kcRIdVCQghiIWwhKgEbCxuxMFZpVERsLGyEEGSLQFIkJFFX1tJCsBFB08TKhWAT8Nv38U9zBm6W2bdvn3dG5J0Lwyw78O78fufcc+derklinFvBmLcQEAJCQAgIASEgBISAEBACQkAICAEhIASEgLFr7aY6MrNCUt/MVgHngdOSnpmZyfflzOwqMAUIsFxdAz1gNXBP0uH/PZVU+wUU5R34DfgneWbJ3w8dvo7rb2Dr4ndrNxj5SeAn4BvgQRr5pL0A+n7lGJ49YAJ4BOyVtNDoEEjgVwO/AtMO15EkM7OKmlRkqk8l/GPgK0kLZtaW1G2kCCbwH3jaTwOvvc83NSdeH2gBT4AvJf1VBV9bBiTwa4DfgS+AbtKf1QxfAP965O8vBV9LBiTwG4AbFfB4UaoL3oDnwNeS7g6Cz54BZtaS1DOz9cB1YE8FPMDTJBOUGb4D7JN0ezn4rBngke+Z2TrgjwHwdWRAP5nv90uaHwY+mwCPfD+J/OcD4HM3JfcZSX+a2cQw8FmGQJL2HwHXgN0Nw5cV/6CkXxy+08haYBH8jVHg/XugfI/nKxgiKfwRSbMrhX8rARXwOzNEvruCyPcc/pikH0eBH1lAAr8RmMsEP+z3QQnfBk5Iujwq/Eg1oAJ+R8NjvoQ/JemiV/vOqD9YvEfwJPDfSTo37FSXRUAC//E7gu94X2cknTWztgupf0OkAn57w/BdX9ldkHS6hFeGA07FCuA3ZYS3ESJ/SdLJnPDLZkAC/wlwE9iWKfKvhhTR8chfkXTczFo54QdmQAK/GbiVCb588ZdDRn4C+EHSUYfvK/O5vmIZ+E+BeWBL5jE/bORnJX3rX4rZ4SsF+NSSwk81XPD6wCTwM3DI4aWaTnS2K77Nuz7m54DPfBsry5Tjv2EOuVS1L3z/cCZZLtR2nLVdkQG7fA9vk/9rVcb+Wn7/cInnG73eHCjX+Kr5LG9VWk/7hsaL5IVzjfu13uedxWt5n97mge8ldcqttbrHm8Vh6TFvISAEhIAQEAJCQAgIASEgBISAEBACQkAICAFj1/4Din4eTBWonBMAAAAASUVORK5CYII="

const BRAND_ICONS: Record<string, BrandIcon> = {
  malik: { label: "MalikLLM MAX", urls: [MALIK_MAX_ICON], fallback: "M" },
  mistral: { label: "Mistral AI", urls: ["https://mistral.ai/favicon.ico"], fallback: "M" },
  minimax: { label: "MiniMax", urls: ["https://www.minimax.io/favicon.ico", "https://minimax.io/favicon.ico"], fallback: "M" },
  qwen: { label: "Qwen", urls: ["https://qwen.ai/favicon.svg", "https://qwen.ai/favicon.ico"], fallback: "Q" },
  sensenova: { label: "SenseNova", urls: ["https://www.sensetime.com/favicon.ico"], fallback: "S" },
  deepseek: { label: "DeepSeek", urls: ["https://www.deepseek.com/favicon.ico", "https://deepseek.com/favicon.ico"], fallback: "D" },
  zai: { label: "Z.ai", urls: ["https://chat.z.ai/favicon.ico", "https://z.ai/favicon.ico"], fallback: "Z" },
  anthropic: { label: "Anthropic", urls: ["https://www.anthropic.com/favicon.ico"], fallback: "A" },
  google: { label: "Google Gemini", urls: ["https://ai.google.dev/favicon.ico", "https://aistudio.google.com/favicon.ico", "https://www.google.com/favicon.ico"], fallback: "G" },
  openai: { label: "OpenAI", urls: ["https://openai.com/favicon.ico"], fallback: "O" },
  xai: { label: "xAI", urls: ["https://x.ai/favicon.ico"], fallback: "X" },
  kimi: { label: "Kimi", urls: ["https://www.kimi.com/favicon.ico", "https://kimi.moonshot.cn/favicon.ico"], fallback: "K" },
  meta: { label: "Meta", urls: ["https://www.meta.com/favicon.ico"], fallback: "M" },
  xiaomi: { label: "Xiaomi", urls: ["https://www.mi.com/favicon.ico"], fallback: "M" },
  kling: { label: "Kling AI", urls: ["https://klingai.com/favicon.ico"], fallback: "K" },
  bytedance: { label: "ByteDance", urls: ["https://www.bytedance.com/favicon.ico"], fallback: "B" },
  nvidia: { label: "NVIDIA", urls: ["https://www.nvidia.com/favicon.ico"], fallback: "N" },
  nara: { label: "NaraRouter", urls: ["https://router.bynara.id/favicon.ico"], fallback: "N" },
  baidu: { label: "Baidu", urls: ["https://www.baidu.com/favicon.ico"], fallback: "B" },
  xkiro: { label: "xKiro", urls: ["https://xkiro.com/favicon.ico"], fallback: "X" },
  llm7: { label: "LLM7", urls: ["https://llm7.io/favicon.ico"], fallback: "L" },
  router: { label: "AI model", urls: [], fallback: "AI" },
}

function brandFor(model: MalikModelDefinition): BrandIcon {
  if (model.brand === "router") {
    if (model.provider === "xkiro") return BRAND_ICONS.xkiro
    if (model.provider === "llm7") return BRAND_ICONS.llm7
    if (model.provider === "nara") return BRAND_ICONS.nara
  }
  return BRAND_ICONS[model.brand] || BRAND_ICONS.router
}

function ModelBrandIcon({ model, compact = false }: { model: MalikModelDefinition; compact?: boolean }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const brand = brandFor(model)
  useEffect(() => setSourceIndex(0), [model.id])
  const source = brand.urls[sourceIndex]
  return (
    <span className={cn("malik-model-selector__brand", compact && "is-compact")} aria-label={brand.label} title={brand.label}>
      {source ? (
        <img src={source} alt={brand.label} loading="eager" referrerPolicy="no-referrer" onError={() => setSourceIndex((index) => index + 1)} />
      ) : (
        <span className="malik-model-selector__brand-fallback" aria-hidden="true">{brand.fallback}</span>
      )}
    </span>
  )
}

function ModelRow({
  model,
  selected,
  locked,
  onChoose,
  onUpgrade,
}: {
  model: MalikModelDefinition
  selected: boolean
  locked: boolean
  onChoose: () => void
  onUpgrade: () => void
}) {
  const pro = model.tier === "pro"
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={cn("malik-model-selector__row", selected && "is-selected", pro && "is-pro", locked && "is-locked")}
      onClick={locked ? onUpgrade : onChoose}
      title={locked ? "MalikAI Plus · нажмите, чтобы открыть подписку" : pro ? "MalikAI Plus model" : undefined}
    >
      <ModelBrandIcon model={model} />
      <span className="malik-model-selector__copy">
        <span className="malik-model-selector__name">{model.label}</span>
        <span className="malik-model-selector__description">{model.description}</span>
      </span>
      <span className="malik-model-selector__state">
        {selected ? <Check aria-label="Выбрано" /> : pro ? (
          <span className="malik-model-selector__pro-badge" aria-label={locked ? "Требуется MalikAI Plus" : "MalikAI Plus"}>
            <Crown aria-hidden="true" />
            <span>PRO</span>
            {locked ? <Lock className="malik-model-selector__lock" aria-hidden="true" /> : null}
          </span>
        ) : null}
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
  placement = "auto",
}: {
  selectedModelId: MalikModelId
  plan: AIPlan
  onSelect: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  className?: string
  placement?: "auto" | "bottom" | "top"
}) {
  const isMobile = useSyncExternalStore(subscribeMobileSelector, getMobileSnapshot, getServerMobileSnapshot)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const [resolvedPlacement, setResolvedPlacement] = useState<"top" | "bottom">("bottom")
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const selectedModel = getMalikModel(selectedModelId)
  const visibleModels = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return PUBLIC_MALIK_MODELS
    return PUBLIC_MALIK_MODELS.filter((model) =>
      `${model.label} ${model.provider} ${model.providerModel}`.toLowerCase().includes(value),
    )
  }, [query])
  const hasProAccess = hasMalikProAccess(plan)
  const freeModels = visibleModels.filter((model) => model.tier === "free")
  const proModels = visibleModels
    .filter((model) => model.tier === "pro")
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }))
  const requestUpgrade = () => {
    setOpen(false)
    setQuery("")
    onOpenBilling?.()
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
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
        setResolvedPlacement("bottom")
        setPopoverStyle({
          position: "fixed", left: 12, right: 12,
          bottom: Math.max(12, viewportHeight - visibleHeight - (visible?.offsetTop || 0) + 12),
          width: "auto", maxHeight: Math.min(visibleHeight - 24, 640),
        })
        return
      }
      const edge = 12, gap = 8
      const width = Math.min(382, viewportWidth - edge * 2)
      const left = Math.min(Math.max(edge, rect.left), viewportWidth - width - edge)
      const measuredHeight = Math.min(popoverRef.current?.scrollHeight || 560, 560)
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - edge)
      const spaceAbove = Math.max(0, rect.top - gap - edge)
      const openAbove = placement === "top" || (placement === "auto" && spaceAbove > spaceBelow)
      const available = openAbove ? spaceAbove : spaceBelow
      const desiredHeight = Math.min(measuredHeight, Math.max(120, available))
      setResolvedPlacement(openAbove ? "top" : "bottom")
      setPopoverStyle(openAbove ? {
        position: "fixed", left, right: "auto", top: "auto",
        bottom: Math.max(edge, viewportHeight - rect.top + gap), width, maxHeight: desiredHeight,
      } : {
        position: "fixed", left, right: "auto", top: rect.bottom + gap,
        bottom: "auto", width, maxHeight: desiredHeight,
      })
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    window.visualViewport?.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
      window.visualViewport?.removeEventListener("resize", updatePosition)
    }
  }, [open, placement, isMobile])

  const modelMenu = open ? (
    <div ref={popoverRef} className={cn("malik-model-selector__popover", resolvedPlacement === "top" ? "is-top" : "is-bottom")} role="menu" aria-label="AI models" style={popoverStyle}>
      <div style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px", background: "#111113", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <label style={{ height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", border: "1px solid rgba(255,255,255,.12)", borderRadius: 9 }}>
          <Search size={14} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск модели..." autoFocus style={{ width: "100%", border: 0, outline: 0, background: "transparent", color: "inherit", font: "inherit" }} />
        </label>
      </div>
      {freeModels.length ? (
        <>
          <div className="malik-model-selector__group-label">Бесплатные модели</div>
          <div className="malik-model-selector__group">
            {freeModels.map((model) => (
              <ModelRow key={model.id} model={model} selected={model.id === selectedModelId} locked={false}
                onChoose={() => { onSelect(model.id); setOpen(false); setQuery("") }} onUpgrade={requestUpgrade} />
            ))}
          </div>
        </>
      ) : null}
      {proModels.length ? (
        <section className="malik-model-selector__pro-section" aria-label="MalikAI Plus models">
          <div className="malik-model-selector__group-label is-pro"><Crown aria-hidden="true" /> PRO · MalikAI Plus · {proModels.length}</div>
          <div className="malik-model-selector__group">
            {proModels.map((model) => (
              <ModelRow key={model.id} model={model} selected={model.id === selectedModelId} locked={!hasProAccess}
                onChoose={() => { onSelect(model.id); setOpen(false); setQuery("") }} onUpgrade={requestUpgrade} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  ) : null

  return (
    <>
      <div ref={rootRef} className={cn("malik-model-selector", className)}>
        <button ref={triggerRef} type="button" className="malik-model-selector__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <ModelBrandIcon model={selectedModel} compact />
          <span>{selectedModel.label}</span>
          <ChevronDown className={cn("malik-model-selector__chevron", open && "is-open")} />
        </button>
      </div>
      {modelMenu && typeof document !== "undefined" ? createPortal(modelMenu, document.body) : null}
    </>
  )
}
