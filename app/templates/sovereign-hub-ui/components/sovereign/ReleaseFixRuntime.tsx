"use client"

import { useEffect } from "react"
import { prefillPrompt } from "@/lib/malik-context"
import { MALIK_PLUGINS } from "@/components/sovereign/features/plugin-registry"
import { pluginDisplayName } from "@/components/sovereign/features/plugin-brand-icons"

const SITE_INLINE_ID = "malik-sites-inline-send"
const BUSINESS_FINAL_ATTR = "data-malik-business-final"
const BUSINESS_MODAL_ID = "malik-business-result-modal"
const PLUGIN_RETURN_PARAM = "plugin_return"

function delay(ms = 50) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function showToast(text: string, kind: "info" | "success" = "info") {
  document.querySelector("[data-malik-release-toast]")?.remove()
  const toast = document.createElement("div")
  toast.dataset.malikReleaseToast = kind
  toast.textContent = text
  document.body.appendChild(toast)
  window.setTimeout(() => toast.remove(), kind === "success" ? 4200 : 6500)
}

function syncSitesInlineButton() {
  const builder = document.querySelector<HTMLElement>(".malikSites .sitesBuilder")
  if (!builder) return

  const prompt = builder.querySelector<HTMLTextAreaElement>("textarea.promptBox")
  const nativeButton = builder.querySelector<HTMLButtonElement>(".builderActions .primaryButton")
  if (!prompt || !nativeButton) return

  let row = builder.querySelector<HTMLElement>(`#${SITE_INLINE_ID}`)
  let send = row?.querySelector<HTMLButtonElement>("button") || null

  if (!row) {
    row = document.createElement("div")
    row.id = SITE_INLINE_ID
    row.className = "malik-sites-inline-action"

    const hint = document.createElement("span")
    hint.textContent = "Enter — создать · Shift+Enter — новая строка"

    send = document.createElement("button")
    send.type = "button"
    send.className = "malik-sites-inline-action__send"
    send.addEventListener("click", () => {
      const current = document.querySelector<HTMLButtonElement>(".malikSites .sitesBuilder .builderActions .primaryButton")
      if (current && !current.disabled) current.click()
    })

    row.append(hint, send)
    prompt.insertAdjacentElement("afterend", row)
  }

  if (!send) return
  const nativeText = (nativeButton.textContent || "").trim().toLowerCase()
  const busy = nativeButton.disabled && Boolean(prompt.value.trim()) && nativeText.includes("генера")
  send.disabled = nativeButton.disabled
  send.textContent = busy ? "Генерирую…" : "Создать сайт"

  if (prompt.dataset.malikSitesEnterBound !== "1") {
    prompt.dataset.malikSitesEnterBound = "1"
    prompt.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      event.preventDefault()
      const current = document.querySelector<HTMLButtonElement>(".malikSites .sitesBuilder .builderActions .primaryButton")
      if (current && !current.disabled) current.click()
    })
  }
}

function businessIsComplete(root: HTMLElement) {
  const text = root.innerText || ""
  const match = text.match(/(\d+)\s+из\s+(\d+)\s+агентов\s+завершили\s+работу/i)
  return Boolean(match && Number(match[1]) >= Number(match[2]) && Number(match[2]) > 0 && !/Остановить/i.test(text))
}

function businessStepArticles(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("article")).filter((article) =>
    Boolean(article.querySelector<HTMLButtonElement>('button[aria-expanded]')),
  )
}

async function collectBusinessResult(root: HTMLElement) {
  const initial = businessStepArticles(root)
  const parts: string[] = []

  for (let index = 0; index < initial.length; index += 1) {
    let articles = businessStepArticles(root)
    let article = articles[index]
    if (!article) continue
    let head = article.querySelector<HTMLButtonElement>('button[aria-expanded]')
    if (!head) continue

    if (head.getAttribute("aria-expanded") !== "true") {
      head.click()
      await delay(70)
      articles = businessStepArticles(root)
      article = articles[index]
      head = article?.querySelector<HTMLButtonElement>('button[aria-expanded]') || null
    }

    if (!article || !head) continue
    const title = (head.innerText || `Этап ${index + 1}`).replace(/\s+/g, " ").trim()
    const childText = Array.from(article.children)
      .filter((node) => node !== head)
      .map((node) => (node as HTMLElement).innerText || "")
      .join("\n")
      .trim()

    if (childText) parts.push(`${title}\n\n${childText}`)
  }

  return parts.join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n").trim()
}

function closeBusinessModal() {
  document.getElementById(BUSINESS_MODAL_ID)?.remove()
  document.documentElement.style.removeProperty("overflow")
}

function openBusinessModal(result: string, prompt: string) {
  closeBusinessModal()

  const overlay = document.createElement("div")
  overlay.id = BUSINESS_MODAL_ID
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-modal", "true")
  overlay.setAttribute("aria-label", "Готовый результат бизнеса")

  const modal = document.createElement("div")
  modal.className = "malik-business-result-modal__box"

  const head = document.createElement("div")
  head.className = "malik-business-result-modal__head"
  const titleWrap = document.createElement("div")
  const eyebrow = document.createElement("span")
  eyebrow.textContent = "MALIK AUTONOMOUS COMPANY"
  const title = document.createElement("h2")
  title.textContent = "Готовый результат"
  const subtitle = document.createElement("p")
  subtitle.textContent = "Все 8 агентов собраны в один итоговый документ."
  titleWrap.append(eyebrow, title, subtitle)

  const close = document.createElement("button")
  close.type = "button"
  close.textContent = "Закрыть"
  close.addEventListener("click", closeBusinessModal)
  head.append(titleWrap, close)

  const body = document.createElement("pre")
  body.className = "malik-business-result-modal__body"
  body.textContent = result || "Результаты готовы, но текст этапов не удалось собрать. Открой этапы ниже вручную."

  const actions = document.createElement("div")
  actions.className = "malik-business-result-modal__actions"

  const copy = document.createElement("button")
  copy.type = "button"
  copy.textContent = "Копировать"
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result)
      showToast("Готовый результат скопирован", "success")
    } catch {
      showToast("Не удалось скопировать автоматически")
    }
  })

  const download = document.createElement("button")
  download.type = "button"
  download.textContent = "Скачать .txt"
  download.addEventListener("click", () => {
    const blob = new Blob([`MALIK AUTONOMOUS COMPANY\n\nЗадача:\n${prompt}\n\n${result}`], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `malik-business-${new Date().toISOString().slice(0, 10)}.txt`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  })

  const continueButton = document.createElement("button")
  continueButton.type = "button"
  continueButton.className = "is-primary"
  continueButton.textContent = "Продолжить с Malik AI"
  continueButton.addEventListener("click", () => {
    const compact = result.length > 18000 ? `${result.slice(0, 18000)}\n\n[результат сокращён для продолжения]` : result
    prefillPrompt(`Продолжи работу над этим готовым бизнес-планом. Найди следующие конкретные действия и помоги реализовать их по очереди.\n\nИсходная задача: ${prompt}\n\n${compact}`)
    window.location.assign("/dashboard")
  })

  actions.append(copy, download, continueButton)
  modal.append(head, body, actions)
  overlay.appendChild(modal)
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeBusinessModal() })
  document.body.appendChild(overlay)
  document.documentElement.style.overflow = "hidden"
}

function ensureBusinessFinal() {
  const root = document.querySelector<HTMLElement>('[data-view="business-autonomous"][data-stage="running"]')
  if (!root || !businessIsComplete(root)) return
  if (root.querySelector(`[${BUSINESS_FINAL_ATTR}]`)) return

  const run = root.querySelector<HTMLElement>("div")?.parentElement ? root.querySelector<HTMLElement>("[class]") : null
  const anchor = Array.from(root.querySelectorAll<HTMLElement>("div")).find((node) =>
    /\d+\s+из\s+\d+\s+агентов\s+завершили\s+работу/i.test(node.innerText || "") &&
    node.querySelector("button"),
  )
  const host = anchor?.parentElement || run || root

  const panel = document.createElement("section")
  panel.setAttribute(BUSINESS_FINAL_ATTR, "true")
  panel.className = "malik-business-final"

  const copy = document.createElement("div")
  const label = document.createElement("span")
  label.textContent = "8 / 8 · ГОТОВО"
  const title = document.createElement("h3")
  title.textContent = "Готовый результат"
  const note = document.createElement("p")
  note.textContent = "Стратегия, исследование, продукт, дизайн, маркетинг, продажи, поддержка и аналитика собраны."
  copy.append(label, title, note)

  const actions = document.createElement("div")
  const open = document.createElement("button")
  open.type = "button"
  open.className = "is-primary"
  open.textContent = "Открыть готовый результат"
  open.addEventListener("click", async () => {
    open.disabled = true
    open.textContent = "Собираю итог…"
    const result = await collectBusinessResult(root)
    const brief = (root.innerText.match(/\d+\s+из\s+\d+\s+агентов\s+завершили\s+работу\s*([^\n]+)/i)?.[1] || "").trim()
    open.disabled = false
    open.textContent = "Открыть готовый результат"
    openBusinessModal(result, brief)
  })

  const stress = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => /Проверить план/i.test(button.textContent || ""))
  const stressButton = document.createElement("button")
  stressButton.type = "button"
  stressButton.textContent = "Проверить план"
  stressButton.disabled = !stress
  stressButton.addEventListener("click", () => stress?.click())

  actions.append(open, stressButton)
  panel.append(copy, actions)

  if (anchor?.parentElement) anchor.insertAdjacentElement("afterend", panel)
  else host.prepend(panel)
}

function pluginByDisplayedName(name: string) {
  const clean = name.trim().toLowerCase()
  return MALIK_PLUGINS.find((plugin) =>
    pluginDisplayName(plugin.id, plugin.name).trim().toLowerCase() === clean || plugin.name.trim().toLowerCase() === clean,
  ) || null
}

function startPluginAuthorization(pluginId: string) {
  const returnTo = `/dashboard?${PLUGIN_RETURN_PARAM}=${encodeURIComponent(pluginId)}`
  const connectUrl = `/api/plugins/connect?id=${encodeURIComponent(pluginId)}&return_to=${encodeURIComponent(returnTo)}`
  try { localStorage.setItem("malik-plugin-auth-pending", pluginId) } catch {}

  const width = Math.min(680, Math.max(420, Math.floor(window.screen.availWidth * 0.48)))
  const height = Math.min(820, Math.max(620, Math.floor(window.screen.availHeight * 0.82)))
  const left = Math.max(0, Math.floor((window.screen.availWidth - width) / 2))
  const top = Math.max(0, Math.floor((window.screen.availHeight - height) / 2))
  const popup = window.open(connectUrl, `malik-plugin-${pluginId}`, `popup=yes,width=${width},height=${height},left=${left},top=${top}`)

  if (!popup) {
    // replace(), not assign(): if OAuth is cancelled, Back must never revisit
    // /api/plugins/connect and immediately throw the user back to GitHub again.
    window.location.replace(connectUrl)
    return
  }

  popup.focus()
  showToast("Авторизация открыта отдельно. Malik AI останется на месте.")
}

function openPluginSection() {
  const button = document.querySelector<HTMLButtonElement>('[data-action-id="plugins"]')
  if (button) {
    button.click()
    return true
  }
  return false
}

function handlePluginReturn() {
  const current = new URL(window.location.href)
  const pluginId = current.searchParams.get(PLUGIN_RETURN_PARAM)
  if (!pluginId) return

  current.searchParams.delete(PLUGIN_RETURN_PARAM)
  const cleanUrl = `${current.pathname}${current.search}${current.hash}`
  window.history.replaceState(window.history.state, "", cleanUrl)
  try { localStorage.removeItem("malik-plugin-auth-pending") } catch {}

  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: "malik-plugin-connected", pluginId }, window.location.origin)
    document.documentElement.dataset.malikPluginReturn = "true"
    window.setTimeout(() => window.close(), 450)
    return
  }

  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    if (openPluginSection() || attempts > 30) window.clearInterval(timer)
  }, 100)
  showToast("Подключение завершено. Возвращаю в Плагины.", "success")
}

export function ReleaseFixRuntime() {
  useEffect(() => {
    handlePluginReturn()

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "malik-plugin-connected") return
      try { localStorage.removeItem("malik-plugin-auth-pending") } catch {}
      openPluginSection()
      showToast("Плагин подключён. Можно использовать внутри Malik AI.", "success")
    }

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const pluginRun = target.closest<HTMLElement>(".plugin-run")
      if (pluginRun) {
        const detail = pluginRun.closest<HTMLElement>(".plugin-detail")
        const name = detail?.querySelector<HTMLElement>("h2")?.textContent || ""
        const plugin = pluginByDisplayedName(name)
        if (plugin?.runtime === "pipes") {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          startPluginAuthorization(plugin.id)
          return
        }
      }

      const connectLink = target.closest<HTMLAnchorElement>('a[href*="/api/plugins/connect"]')
      if (connectLink) {
        try {
          const url = new URL(connectLink.href, window.location.origin)
          const pluginId = url.searchParams.get("id")
          if (!pluginId) return
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          startPluginAuthorization(pluginId)
        } catch {}
      }
    }

    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        syncSitesInlineButton()
        ensureBusinessFinal()
      })
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["disabled", "aria-expanded", "data-stage"] })
    document.addEventListener("click", onClickCapture, true)
    window.addEventListener("message", onMessage)
    window.addEventListener("popstate", schedule)

    return () => {
      observer.disconnect()
      document.removeEventListener("click", onClickCapture, true)
      window.removeEventListener("message", onMessage)
      window.removeEventListener("popstate", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <style jsx global>{`
      #${SITE_INLINE_ID} {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-top:10px;
      }
      #${SITE_INLINE_ID} > span {
        color:#646971;
        font-size:10px;
      }
      #${SITE_INLINE_ID} .malik-sites-inline-action__send {
        min-width:148px;
        height:40px;
        border:0;
        border-radius:10px;
        background:#f5f5f5;
        color:#050505;
        font-size:12px;
        font-weight:800;
        cursor:pointer;
      }
      #${SITE_INLINE_ID} .malik-sites-inline-action__send:disabled { opacity:.45; cursor:not-allowed; }

      .malik-business-final {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:18px;
        margin:14px 0;
        padding:18px 20px;
        border:1px solid rgba(255,255,255,.13);
        border-radius:14px;
        background:#0b0b0c;
        color:#f6f6f7;
      }
      .malik-business-final > div:first-child { min-width:0; }
      .malik-business-final span { display:block; color:#797981; font-size:9px; font-weight:800; letter-spacing:.09em; }
      .malik-business-final h3 { margin:5px 0 3px; font-size:20px; letter-spacing:-.025em; }
      .malik-business-final p { margin:0; color:#8c8c94; font-size:11px; line-height:1.5; }
      .malik-business-final > div:last-child { display:flex; flex:0 0 auto; gap:8px; }
      .malik-business-final button,
      .malik-business-result-modal__actions button,
      .malik-business-result-modal__head > button {
        min-height:38px;
        border:1px solid rgba(255,255,255,.12);
        border-radius:10px;
        background:#131315;
        color:#eeeef0;
        padding:0 13px;
        font:inherit;
        font-size:11px;
        font-weight:700;
        cursor:pointer;
      }
      .malik-business-final button.is-primary,
      .malik-business-result-modal__actions button.is-primary { border-color:#f5f5f5; background:#f5f5f5; color:#050505; }
      .malik-business-final button:disabled { opacity:.45; cursor:not-allowed; }

      #${BUSINESS_MODAL_ID} {
        position:fixed;
        inset:0;
        z-index:2147483000;
        display:grid;
        place-items:center;
        padding:18px;
        background:rgba(0,0,0,.9);
      }
      .malik-business-result-modal__box {
        width:min(1120px,96vw);
        max-height:92dvh;
        display:flex;
        flex-direction:column;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.13);
        border-radius:18px;
        background:#080809;
        color:#f5f5f6;
        box-shadow:0 32px 120px rgba(0,0,0,.7);
      }
      .malik-business-result-modal__head {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:16px;
        padding:20px 22px 16px;
        border-bottom:1px solid rgba(255,255,255,.08);
      }
      .malik-business-result-modal__head span { color:#777780; font-size:9px; font-weight:800; letter-spacing:.1em; }
      .malik-business-result-modal__head h2 { margin:5px 0 2px; font-size:24px; letter-spacing:-.035em; }
      .malik-business-result-modal__head p { margin:0; color:#85858e; font-size:11px; }
      .malik-business-result-modal__body {
        flex:1 1 auto;
        margin:0;
        overflow:auto;
        padding:20px 22px;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
        color:#d7d7db;
        background:#050506;
        font:12px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
      }
      .malik-business-result-modal__actions {
        display:flex;
        justify-content:flex-end;
        gap:8px;
        padding:14px 18px;
        border-top:1px solid rgba(255,255,255,.08);
      }

      [data-malik-release-toast] {
        position:fixed;
        z-index:2147483640;
        right:18px;
        bottom:18px;
        max-width:min(420px,calc(100vw - 36px));
        padding:12px 14px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:12px;
        background:#111113;
        color:#efeff1;
        box-shadow:0 18px 50px rgba(0,0,0,.5);
        font:12px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
      }
      [data-malik-release-toast="success"] { border-color:rgba(255,255,255,.28); }

      @media (max-width: 767px) {
        #${SITE_INLINE_ID} { align-items:stretch; flex-direction:column; }
        #${SITE_INLINE_ID} > span { order:2; text-align:center; }
        #${SITE_INLINE_ID} .malik-sites-inline-action__send { width:100%; }
        .malik-business-final { align-items:stretch; flex-direction:column; }
        .malik-business-final > div:last-child { width:100%; }
        .malik-business-final button { flex:1 1 0; }
        .malik-business-result-modal__actions { flex-wrap:wrap; }
        .malik-business-result-modal__actions button { flex:1 1 120px; }
      }
    `}</style>
  )
}
