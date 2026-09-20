"use client"

import { useEffect } from "react"

type BusinessModelMeta = {
  label: string
  icon: "qwen" | "glm" | "ernie" | "kimi" | "openai"
  legacy: readonly string[]
  providerHints: readonly string[]
}

const BUSINESS_MODELS: readonly BusinessModelMeta[] = [
  {
    label: "Qwen3.5-397B-A17B",
    icon: "qwen",
    legacy: ["MalikLLM397B Qwen 3.5", "Qwen 3.5 397B", "Qwen3.5-397B-A17B"],
    providerHints: ["Qwen/Qwen3.5-397B-A17B", "Qwen3.5-397B"],
  },
  {
    label: "GLM-5.2",
    icon: "glm",
    legacy: ["MalikReason753B GLM 5.2", "GLM 5.2", "GLM-5.2"],
    providerHints: ["ZhipuAI/GLM-5.2", "GLM-5.2"],
  },
  {
    label: "ERNIE 4.5 300B-A47B-PT",
    icon: "ernie",
    legacy: ["MalikCore300B ERNIE 4.5", "ERNIE 4.5 300B", "ERNIE 4.5 300B-A47B-PT"],
    providerHints: ["PaddlePaddle/ERNIE-4.5-300B-A47B-PT", "ERNIE-4.5-300B"],
  },
  {
    label: "GLM-5.3",
    icon: "glm",
    legacy: ["MalikFlash GLM 5.3", "GLM 5.3", "GLM-5.3"],
    providerHints: ["coding-glm-5.3-free", "GLM-5.3"],
  },
  {
    label: "Kimi K3",
    icon: "kimi",
    legacy: ["MalikVision Kimi K3", "Kimi K3"],
    providerHints: ["coding-kimi-k3-free", "kimi-k3"],
  },
  {
    label: "GPT-OSS 20B",
    icon: "openai",
    legacy: ["MalikLLM 20B", "GPT-OSS 20B"],
    providerHints: ["openai/gpt-oss-20b", "gpt-oss-20b"],
  },
  {
    label: "GPT-OSS 120B",
    icon: "openai",
    legacy: ["MalikLLM Fast 120B", "GPT-OSS 120B"],
    providerHints: ["gpt-oss-120b"],
  },
  {
    label: "Qwen3.8-27B",
    icon: "qwen",
    legacy: ["MalikLLM Qwen3.8 27B", "MalikLLM27B", "Qwen3.8-27B"],
    providerHints: ["qwen/qwen3.8-27b", "qwen3.8-27b"],
  },
]

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase()
}

function modelFromLabel(value: string | null | undefined) {
  const target = normalize(value)
  if (!target) return null
  return BUSINESS_MODELS.find((model) => model.legacy.some((label) => normalize(label) === target)) || null
}

function modelFromProvider(value: string | null | undefined) {
  const target = normalize(value)
  if (!target) return null
  return BUSINESS_MODELS.find((model) => model.providerHints.some((hint) => target.includes(normalize(hint)))) || null
}

function replaceExactModelName(node: Element) {
  if (node.children.length) return
  const model = modelFromLabel(node.textContent)
  if (model && node.textContent !== model.label) node.textContent = model.label
}

function syncBusinessModelUi() {
  const root = document.querySelector<HTMLElement>('main[data-view="business-autonomous"]')
  if (!root) return

  const trigger = root.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')
  if (trigger) {
    const directSpans = Array.from(trigger.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "SPAN")
    const iconHost = directSpans[0]
    const copy = directSpans[1]
    const name = copy?.children[0] instanceof HTMLElement ? copy.children[0] as HTMLElement : null
    const provider = copy?.children[1] instanceof HTMLElement ? copy.children[1] as HTMLElement : null
    const meta = modelFromProvider(provider?.textContent) || modelFromLabel(name?.textContent)

    if (meta) {
      trigger.dataset.businessModelIcon = meta.icon
      iconHost?.setAttribute("data-preserve-brand-color", "true")
      if (name && name.textContent !== meta.label) name.textContent = meta.label
    }
  }

  root.querySelectorAll<HTMLButtonElement>('button[role="option"]').forEach((option) => {
    const meta = modelFromLabel(option.textContent)
    if (meta && option.textContent !== meta.label) option.textContent = meta.label
  })

  root.querySelectorAll("span,b").forEach(replaceExactModelName)
}

export function BusinessModelUiRuntime() {
  useEffect(() => {
    let frame = 0
    const queue = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        syncBusinessModelUi()
      })
    }

    queue()
    const observer = new MutationObserver(queue)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    window.addEventListener("popstate", queue)

    return () => {
      observer.disconnect()
      window.removeEventListener("popstate", queue)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <style jsx global>{`
      #malik-root main[data-view="business-autonomous"] button[aria-haspopup="listbox"] > span:first-child > svg {
        display: none !important;
      }

      #malik-root main[data-view="business-autonomous"] button[aria-haspopup="listbox"] > span:first-child::before {
        content: "";
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        color: #f5f5f5;
        font-family: Arial, sans-serif;
        font-weight: 800;
        line-height: 1;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="qwen"] > span:first-child::before {
        content: "";
        border: 1px solid rgba(255,255,255,.12);
        background: #f7f7f8 url('https://qwen.ai/favicon.svg') center/25px 25px no-repeat;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="glm"] > span:first-child::before {
        content: "";
        border: 1px solid rgba(255,255,255,.12);
        background: #f7f7f8 url('https://chat.z.ai/favicon.ico') center/25px 25px no-repeat;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="ernie"] > span:first-child::before {
        content: "";
        border: 1px solid rgba(255,255,255,.12);
        background: #f7f7f8 url('https://ernie.baidu.com/favicon.ico') center/25px 25px no-repeat;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="kimi"] > span:first-child::before {
        content: "";
        border: 1px solid rgba(255,255,255,.12);
        background: #f7f7f8 url('https://www.kimi.com/favicon.ico') center/25px 25px no-repeat;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="openai"] > span:first-child::before {
        content: "";
        border: 1px solid rgba(255,255,255,.12);
        background: #f7f7f8 url('https://openai.com/favicon.ico') center/25px 25px no-repeat;
      }

      /* The business selector must expose every free model; the older final CSS
         hid the first Qwen row and then used its position to fake icons. */
      #malik-root main[data-view="business-autonomous"] button[aria-haspopup="listbox"] + div[role="listbox"] > button:first-child {
        display: grid !important;
      }

      @media (max-width: 900px) {
        #malik-root main[data-view="business-autonomous"] button[aria-haspopup="listbox"] > span:first-child::before {
          width: 34px;
          height: 34px;
        }
      }
    `}</style>
  )
}

export default BusinessModelUiRuntime
