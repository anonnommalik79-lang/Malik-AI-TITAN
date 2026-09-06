"use client"

import { useEffect } from "react"

type BusinessModelMeta = {
  label: string
  icon: "qwen" | "glm52" | "ernie" | "glm53" | "kimi" | "oss20" | "oss120" | "malik"
  legacy: readonly string[]
  providerHints: readonly string[]
}

const BUSINESS_MODELS: readonly BusinessModelMeta[] = [
  {
    label: "Qwen 3.5 397B",
    icon: "qwen",
    legacy: ["MalikLLM397B Qwen 3.5", "Qwen 3.5 397B"],
    providerHints: ["Qwen/Qwen3.5-397B-A17B", "Qwen3.5-397B"],
  },
  {
    label: "GLM 5.2",
    icon: "glm52",
    legacy: ["MalikReason753B GLM 5.2", "GLM 5.2"],
    providerHints: ["ZhipuAI/GLM-5.2", "GLM-5.2"],
  },
  {
    label: "ERNIE 4.5 300B",
    icon: "ernie",
    legacy: ["MalikCore300B ERNIE 4.5", "ERNIE 4.5 300B"],
    providerHints: ["PaddlePaddle/ERNIE-4.5-300B-A47B-PT", "ERNIE-4.5-300B"],
  },
  {
    label: "GLM 5.3",
    icon: "glm53",
    legacy: ["MalikFlash GLM 5.3", "GLM 5.3"],
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
    icon: "oss20",
    legacy: ["MalikLLM 20B", "GPT-OSS 20B"],
    providerHints: ["openai/gpt-oss-20b", "gpt-oss-20b"],
  },
  {
    label: "GPT-OSS 120B",
    icon: "oss120",
    legacy: ["MalikLLM Fast 120B", "GPT-OSS 120B"],
    providerHints: ["gpt-oss-120b"],
  },
  {
    label: "MalikLLM27B",
    icon: "malik",
    legacy: ["MalikLLM Qwen3.8 27B", "MalikLLM27B"],
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
        content: "Q";
        background: linear-gradient(135deg,#5f6cff 0%,#8a4dff 52%,#38a6ff 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        font-size: 31px;
        font-weight: 900;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="glm52"] > span:first-child::before {
        content: "∞";
        color: #1685ff;
        background: transparent;
        font-size: 42px;
        font-weight: 500;
        letter-spacing: -.14em;
        transform: translateX(-2px);
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="ernie"] > span:first-child::before {
        content: "✳";
        color: #f37a3f;
        background: transparent;
        font-size: 36px;
        transform: rotate(10deg);
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="glm53"] > span:first-child::before {
        content: "G";
        background: linear-gradient(135deg,#4285f4 12%,#34a853 40%,#fbbc05 66%,#ea4335 86%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        font-size: 31px;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="kimi"] > span:first-child::before {
        content: "✥";
        color: #6848ff;
        background: transparent;
        font-size: 34px;
        transform: rotate(45deg);
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="oss20"] > span:first-child::before {
        content: "🤗";
        background: transparent;
        font-size: 31px;
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="oss120"] > span:first-child::before {
        content: "✕";
        color: #f5f5f5;
        background: transparent;
        font-size: 34px;
        font-weight: 900;
        transform: rotate(-10deg);
      }

      #malik-root main[data-view="business-autonomous"] button[data-business-model-icon="malik"] > span:first-child::before {
        content: "";
        border: 1px solid rgba(255,255,255,.12);
        background: #f2f2f2 url('/icon.svg') center/cover no-repeat;
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
