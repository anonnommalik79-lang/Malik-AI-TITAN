"use client"

import { Check, ChevronDown } from "lucide-react"
import { useState } from "react"
import type { MalikModelId } from "@/lib/ai/malik-models"

export type BusinessModelChoice = {
  id: MalikModelId
  label: string
  providerModel: string
  icon: "meta" | "claude" | "google" | "kimi" | "huggingface" | "x" | "malik"
}

export const BUSINESS_MODEL_CHOICES: readonly BusinessModelChoice[] = [
  { id: "malik-reason-753b", label: "MalikReason753B GLM 5.2", providerModel: "ZhipuAI/GLM-5.2", icon: "meta" },
  { id: "malik-core-300b", label: "MalikCore300B ERNIE 4.5", providerModel: "PaddlePaddle/ERNIE-4.5-300B-A47B-PT", icon: "claude" },
  { id: "malik-flash-53", label: "MalikFlash GLM 5.3", providerModel: "coding-glm-5.3-free", icon: "google" },
  { id: "malik-vision-k3", label: "MalikVision Kimi K3", providerModel: "coding-kimi-k3-free", icon: "kimi" },
  { id: "malik-20b", label: "MalikLLM 20B", providerModel: "openai/gpt-oss-20b", icon: "huggingface" },
  { id: "malik-fast-120b", label: "MalikLLM Fast 120B", providerModel: "gpt-oss-120b", icon: "x" },
  { id: "malik-27b", label: "MalikLLM Qwen3.8 27B", providerModel: "qwen/qwen3.8-27b", icon: "malik" },
] as const

export const DEFAULT_BUSINESS_MODEL_ID: MalikModelId = "malik-27b"

export function getBusinessModelChoice(modelId: MalikModelId): BusinessModelChoice {
  return BUSINESS_MODEL_CHOICES.find((model) => model.id === modelId) || BUSINESS_MODEL_CHOICES[BUSINESS_MODEL_CHOICES.length - 1]
}

function ProviderMark({ kind }: { kind: BusinessModelChoice["icon"] }) {
  if (kind === "malik") {
    return <span className="bm-provider bm-provider-malik"><img src="/icon.svg" alt="" /></span>
  }
  if (kind === "huggingface") {
    return <span className="bm-provider bm-provider-hf" aria-hidden="true">🤗</span>
  }
  if (kind === "x") {
    return <span className="bm-provider bm-provider-x" aria-hidden="true">𝕏</span>
  }
  if (kind === "meta") {
    return <span className="bm-provider bm-provider-meta" aria-hidden="true">∞</span>
  }
  if (kind === "claude") {
    return <span className="bm-provider bm-provider-claude" aria-hidden="true">✳</span>
  }
  if (kind === "google") {
    return <span className="bm-provider bm-provider-google" aria-hidden="true">G</span>
  }
  return <span className="bm-provider bm-provider-kimi" aria-hidden="true"><i /><b /></span>
}

export function BusinessModelSelector({
  value,
  onChange,
}: {
  value: MalikModelId
  onChange: (modelId: MalikModelId) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = getBusinessModelChoice(value)

  return (
    <div
      className={`bm-select${open ? " is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        className="bm-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ProviderMark kind={selected.icon} />
        <span className="bm-trigger-copy">
          <strong>{selected.label}</strong>
          <small>{selected.providerModel}</small>
        </span>
        <ChevronDown className="bm-chevron" size={21} strokeWidth={2.2} />
      </button>

      {open ? (
        <div className="bm-menu" role="listbox" aria-label="Модели Malik AI для бизнеса">
          {BUSINESS_MODEL_CHOICES.map((model) => {
            const active = model.id === value
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`bm-option${active ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(model.id)
                  setOpen(false)
                }}
              >
                <ProviderMark kind={model.icon} />
                <span className="bm-option-label">{model.label}</span>
                {active ? <Check className="bm-check" size={22} strokeWidth={2.3} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <style jsx global>{`
        .bm-select{position:relative;width:min(430px,100%);flex:0 0 auto;z-index:30}
        .bm-trigger{display:grid;width:100%;height:74px;grid-template-columns:46px minmax(0,1fr) 28px;align-items:center;gap:14px;border:1px solid #4a4d52;border-radius:18px;background:#17191d;padding:0 18px;color:#f7f7f8;text-align:left;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025);transition:border-color .15s ease,background .15s ease}
        .bm-trigger:hover,.bm-select.is-open .bm-trigger{border-color:#666a70;background:#1b1d21}
        .bm-trigger-copy{min-width:0}.bm-trigger-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;font-weight:690;letter-spacing:-.02em}.bm-trigger-copy small{display:block;overflow:hidden;margin-top:5px;color:#8c94a5;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500}
        .bm-chevron{justify-self:end;color:#f0f0f2;transition:transform .15s ease}.bm-select.is-open .bm-chevron{transform:rotate(180deg)}
        .bm-menu{position:absolute;top:89px;right:0;width:calc(100% + 76px);min-width:430px;max-width:504px;border:1px solid #3e4147;border-radius:17px;background:#15171a;padding:13px;box-shadow:0 24px 70px rgba(0,0,0,.56);overflow:hidden}
        .bm-option{display:grid;width:100%;height:59px;grid-template-columns:48px minmax(0,1fr) 28px;align-items:center;gap:13px;border:0;border-radius:12px;background:transparent;padding:0 14px;color:#ededf0;text-align:left;transition:background .12s ease}
        .bm-option:hover{background:#202227}.bm-option.is-selected{background:#2a2c31}
        .bm-option-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:650;letter-spacing:-.012em}.bm-check{justify-self:end;color:#f4f4f5}
        .bm-provider{position:relative;display:grid;width:38px;height:38px;place-items:center;flex:0 0 auto;border-radius:10px;font-style:normal;font-weight:750;line-height:1;overflow:hidden}
        .bm-provider-malik{border:1px solid rgba(255,255,255,.12);background:#f2f2f2}.bm-provider-malik img{width:100%;height:100%;object-fit:cover}
        .bm-provider-hf{background:transparent;font-size:32px;filter:saturate(1.06)}
        .bm-provider-x{background:transparent;color:#f5f5f6;font-family:Arial,sans-serif;font-size:31px;font-weight:700;transform:rotate(-8deg)}
        .bm-provider-meta{background:transparent;color:#1685ff;font-family:Arial,sans-serif;font-size:42px;font-weight:500;letter-spacing:-.14em;transform:translateX(-2px)}
        .bm-provider-claude{background:transparent;color:#f37a3f;font-size:38px;font-weight:700;transform:rotate(12deg)}
        .bm-provider-google{background:linear-gradient(135deg,#4285f4 12%,#34a853 40%,#fbbc05 66%,#ea4335 86%);-webkit-background-clip:text;background-clip:text;color:transparent;font-family:Arial,sans-serif;font-size:31px;font-weight:800}
        .bm-provider-kimi{background:transparent}.bm-provider-kimi:before,.bm-provider-kimi:after,.bm-provider-kimi i,.bm-provider-kimi b{content:"";position:absolute;inset:7px;border:4px solid #6447ff;transform:rotate(45deg)}.bm-provider-kimi:after{inset:11px;border-color:#8d6bff}.bm-provider-kimi i{inset:4px 15px;border-width:3px;border-color:#6f50ff}.bm-provider-kimi b{inset:15px 4px;border-width:3px;border-color:#6f50ff}
        @media(max-width:700px){.bm-select{width:100%}.bm-trigger{height:68px;grid-template-columns:42px minmax(0,1fr) 24px;border-radius:15px;padding:0 14px}.bm-trigger-copy strong{font-size:15px}.bm-trigger-copy small{font-size:11px}.bm-menu{right:0;top:78px;width:100%;min-width:0;max-width:none;padding:9px}.bm-option{height:54px;grid-template-columns:42px minmax(0,1fr) 24px;padding:0 10px}.bm-option-label{font-size:14px}.bm-provider{width:34px;height:34px}}
      `}</style>
    </div>
  )
}

export default BusinessModelSelector
