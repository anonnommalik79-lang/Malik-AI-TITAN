"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Crown, Lock, Search, Star } from "lucide-react"
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
  mistral: { label: "Mistral AI", urls: ["/api/ai/model-icon/mistral"], fallback: "M" },
  minimax: { label: "MiniMax", urls: ["/api/ai/model-icon/minimax"], fallback: "M" },
  qwen: { label: "Qwen", urls: ["/api/ai/model-icon/qwen"], fallback: "Q" },
  sensenova: { label: "SenseNova", urls: ["/api/ai/model-icon/sensenova"], fallback: "S" },
  deepseek: { label: "DeepSeek", urls: ["/api/ai/model-icon/deepseek"], fallback: "D" },
  zai: { label: "Z.ai", urls: ["/api/ai/model-icon/zai"], fallback: "Z" },
  anthropic: { label: "Anthropic", urls: ["/api/ai/model-icon/anthropic"], fallback: "A" },
  google: { label: "Google Gemini", urls: ["/api/ai/model-icon/google"], fallback: "G" },
  openai: { label: "OpenAI", urls: ["/api/ai/model-icon/openai"], fallback: "O" },
  xai: { label: "xAI", urls: ["/api/ai/model-icon/xai"], fallback: "X" },
  kimi: { label: "Kimi", urls: ["/api/ai/model-icon/kimi"], fallback: "K" },
  meta: { label: "Meta", urls: ["/api/ai/model-icon/meta"], fallback: "M" },
  xiaomi: { label: "Xiaomi", urls: ["/api/ai/model-icon/xiaomi"], fallback: "M" },
  kling: { label: "Kling AI", urls: ["/api/ai/model-icon/kling"], fallback: "K" },
  bytedance: { label: "ByteDance", urls: ["/api/ai/model-icon/bytedance"], fallback: "B" },
  nvidia: { label: "NVIDIA", urls: ["/api/ai/model-icon/nvidia"], fallback: "N" },
  nara: { label: "NaraRouter", urls: ["/api/ai/model-icon/nara"], fallback: "N" },
  baidu: { label: "Baidu", urls: ["/api/ai/model-icon/baidu"], fallback: "B" },
  xkiro: { label: "xKiro", urls: ["/api/ai/model-icon/xkiro"], fallback: "X" },
  llm7: { label: "LLM7", urls: ["/api/ai/model-icon/llm7"], fallback: "L" },
  router: { label: "AI model", urls: [], fallback: "AI" },
}

const FAVORITES_KEY = "malik_model_favorites_v1"
const RECENT_KEY = "malik_model_recent_v1"
const SHORTLIST_SIZE = 10

function readModelList(key: string) {
  if (typeof window === "undefined") return [] as MalikModelId[]
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]")
    return Array.isArray(parsed)
      ? parsed.filter((value): value is MalikModelId => typeof value === "string" && PUBLIC_MALIK_MODELS.some((model) => model.id === value)).slice(0, 12)
      : []
  } catch {
    return []
  }
}

function saveModelList(key: string, values: MalikModelId[]) {
  try { window.localStorage.setItem(key, JSON.stringify(values.slice(0, 12))) } catch {}
}

function brandFor(model: MalikModelDefinition): BrandIcon {
  if (model.brand === "router") {
    if (model.provider === "xkiro") return BRAND_ICONS.xkiro
    if (model.provider === "llm7") return BRAND_ICONS.llm7
    if (model.provider === "nara") return BRAND_ICONS.nara
  }
  return BRAND_ICONS[model.brand] || BRAND_ICONS.router
}

function capabilityLabel(value: MalikModelDefinition["capabilities"][number]) {
  if (value === "vision") return "Vision"
  if (value === "code") return "Code"
  if (value === "tools") return "Tools"
  if (value === "reasoning") return "Reasoning"
  return "Text"
}

function ModelBrandIcon({ model, compact = false }: { model: MalikModelDefinition; compact?: boolean }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const brand = brandFor(model)
  useEffect(() => setSourceIndex(0), [model.id])
  const source = brand.urls[sourceIndex]
  return (
    <span className={cn("malik-model-selector__brand", compact && "is-compact")} aria-label={brand.label} title={brand.label}>
      {source ? (
        <img src={source} alt={brand.label} loading="eager" onError={() => setSourceIndex((index) => index + 1)} />
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
  favorite,
  onChoose,
  onUpgrade,
  onToggleFavorite,
}: {
  model: MalikModelDefinition
  selected: boolean
  locked: boolean
  favorite: boolean
  onChoose: () => void
  onUpgrade: () => void
  onToggleFavorite: () => void
}) {
  const pro = model.tier === "pro"
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        className={cn("malik-model-selector__row", selected && "is-selected", pro && "is-pro", locked && "is-locked")}
        onClick={locked ? onUpgrade : onChoose}
        title={locked ? "MalikAI Plus · нажмите, чтобы открыть подписку" : pro ? "MalikAI Plus model" : undefined}
        style={{ width: "100%", paddingRight: 62 }}
      >
        <ModelBrandIcon model={model} />
        <span className="malik-model-selector__copy">
          <span className="malik-model-selector__name">{model.label}</span>
          <span className="malik-model-selector__description">{model.description}</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
            {model.capabilities.slice(0, 4).map((capability) => (
              <span key={capability} style={{ padding: "1px 5px", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", color: "#9fa2aa", fontSize: 8, lineHeight: "14px" }}>
                {capabilityLabel(capability)}
              </span>
            ))}
          </span>
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
      <button
        type="button"
        aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"}
        title={favorite ? "Убрать из избранного" : "В избранное"}
        onClick={(event) => { event.stopPropagation(); onToggleFavorite() }}
        style={{
          position: "absolute", right: 34, top: "50%", transform: "translateY(-50%)",
          width: 26, height: 26, border: 0, borderRadius: 7, display: "grid", placeItems: "center",
          background: favorite ? "rgba(255,255,255,.12)" : "transparent", color: favorite ? "#fff" : "#74777f",
        }}
      >
        <Star size={13} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
      </button>
    </div>
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
  const [showAll, setShowAll] = useState(false)
  const [favorites, setFavorites] = useState<MalikModelId[]>(() => readModelList(FAVORITES_KEY))
  const [recent, setRecent] = useState<MalikModelId[]>(() => readModelList(RECENT_KEY))
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const [resolvedPlacement, setResolvedPlacement] = useState<"top" | "bottom">("bottom")
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const selectedModel = getMalikModel(selectedModelId)

  const visibleModels = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (value) {
      return PUBLIC_MALIK_MODELS.filter((model) =>
        `${model.label} ${model.provider} ${model.providerModel} ${model.capabilities.join(" ")}`.toLowerCase().includes(value),
      )
    }
    if (showAll) return PUBLIC_MALIK_MODELS

    const ids = [selectedModelId, "malik-max", ...favorites, ...recent, ...PUBLIC_MALIK_MODELS.map((model) => model.id)]
    const seen = new Set<string>()
    const models: MalikModelDefinition[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      const model = PUBLIC_MALIK_MODELS.find((candidate) => candidate.id === id)
      if (!model) continue
      seen.add(id)
      models.push(model)
      if (models.length >= SHORTLIST_SIZE) break
    }
    return models
  }, [favorites, query, recent, selectedModelId, showAll])

  const hasProAccess = hasMalikProAccess(plan)
  const freeModels = visibleModels.filter((model) => model.tier === "free")
  const proModels = visibleModels
    .filter((model) => model.tier === "pro")
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }))

  const rememberRecent = (modelId: MalikModelId) => {
    setRecent((current) => {
      const next = [modelId, ...current.filter((id) => id !== modelId)].slice(0, 6)
      saveModelList(RECENT_KEY, next)
      return next
    })
  }

  const chooseModel = (modelId: MalikModelId) => {
    rememberRecent(modelId)
    onSelect(modelId)
    setOpen(false)
    setQuery("")
  }

  const toggleFavorite = (modelId: MalikModelId) => {
    setFavorites((current) => {
      const next = current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [modelId, ...current].slice(0, 12)
      saveModelList(FAVORITES_KEY, next)
      return next
    })
  }

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
      const width = Math.min(410, viewportWidth - edge * 2)
      const left = Math.min(Math.max(edge, rect.left), viewportWidth - width - edge)
      const measuredHeight = Math.min(popoverRef.current?.scrollHeight || 600, 600)
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
        {!query.trim() ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7 }}>
            <span style={{ color: "#777b84", fontSize: 9 }}>
              {showAll ? `Все модели · ${PUBLIC_MALIK_MODELS.length}` : `Быстрый выбор · ${visibleModels.length} · избранное + недавние`}
            </span>
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              style={{ height: 25, padding: "0 8px", border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, background: "#17171a", color: "#d7d7db", fontSize: 9 }}
            >
              {showAll ? "Свернуть" : `Все модели (${PUBLIC_MALIK_MODELS.length})`}
            </button>
          </div>
        ) : null}
      </div>
      {freeModels.length ? (
        <>
          <div className="malik-model-selector__group-label">{showAll || query.trim() ? "Бесплатные модели" : "Рекомендуемые"}</div>
          <div className="malik-model-selector__group">
            {freeModels.map((model) => (
              <ModelRow key={model.id} model={model} selected={model.id === selectedModelId} locked={false}
                favorite={favorites.includes(model.id)} onToggleFavorite={() => toggleFavorite(model.id)}
                onChoose={() => chooseModel(model.id)} onUpgrade={requestUpgrade} />
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
                favorite={favorites.includes(model.id)} onToggleFavorite={() => toggleFavorite(model.id)}
                onChoose={() => chooseModel(model.id)} onUpgrade={requestUpgrade} />
            ))}
          </div>
        </section>
      ) : null}
      {!visibleModels.length ? <div style={{ padding: 18, color: "#7d8088", fontSize: 11 }}>Модель не найдена.</div> : null}
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
