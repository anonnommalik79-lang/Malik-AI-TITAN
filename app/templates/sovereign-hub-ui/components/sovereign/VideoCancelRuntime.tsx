"use client"

import { useEffect } from "react"

const VIDEO_USAGE_KEY = "MALIK_USAGE_VIDEO_COUNT"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function VideoCancelRuntime() {
  useEffect(() => {
    let cancelling = false
    let cancelLocked = false
    let destroyed = false

    const style = document.createElement("style")
    style.dataset.malikVideoCancel = "1"
    style.textContent = `
      #malik-root .mv[data-view="video-generation"] .mv__send[data-video-cancel="1"] {
        background: #25262b !important;
        color: #fff !important;
        opacity: 1 !important;
        cursor: pointer !important;
        border: 1px solid rgba(255,255,255,.12) !important;
      }
      #malik-root .mv[data-view="video-generation"] .mv__send[data-video-cancel="1"] svg {
        display: none !important;
      }
      #malik-root .mv[data-view="video-generation"] .mv__send[data-video-cancel="1"]::after {
        content: "" !important;
        width: 11px !important;
        height: 11px !important;
        border-radius: 2px !important;
        background: #fff !important;
        display: block !important;
      }
      #malik-root .mv[data-view="video-generation"] .mv__send[data-video-cancel="1"][data-cancelling="1"]::after {
        width: 13px !important;
        height: 13px !important;
        border-radius: 50% !important;
        background: transparent !important;
        border: 2px solid rgba(255,255,255,.35) !important;
        border-top-color: #fff !important;
        animation: malik-video-cancel-spin .7s linear infinite !important;
      }
      @keyframes malik-video-cancel-spin { to { transform: rotate(360deg); } }
    `
    document.head.appendChild(style)

    const phase = () =>
      document.querySelector<HTMLElement>("#malik-root .mv[data-view='video-generation'] .mv__statusbar")?.dataset.phase || ""

    const isBusy = () => {
      const value = phase()
      return value === "queued" || value === "rendering"
    }

    const getSendButton = () =>
      document.querySelector<HTMLButtonElement>("#malik-root .mv[data-view='video-generation'] .mv__send")

    const setStatusMessage = (message: string, isError = false) => {
      const bar = document.querySelector<HTMLElement>("#malik-root .mv[data-view='video-generation'] .mv__statusbar")
      const strong = bar?.querySelector<HTMLElement>("strong")
      if (strong) strong.textContent = message
      if (isError && bar) {
        let error = bar.querySelector<HTMLElement>(".mv__error")
        if (!error) {
          error = document.createElement("span")
          error.className = "mv__error"
          bar.appendChild(error)
        }
        error.textContent = message
      }
    }

    const syncButton = () => {
      const button = getSendButton()
      if (!button) return

      if (isBusy() && !cancelLocked) {
        button.disabled = false
        button.dataset.videoCancel = "1"
        button.dataset.cancelling = cancelling ? "1" : "0"
        button.setAttribute("aria-label", cancelling ? "Отменяю генерацию" : "Отменить генерацию")
        button.title = cancelling ? "Отменяю генерацию…" : "Отменить генерацию"
        return
      }

      delete button.dataset.videoCancel
      delete button.dataset.cancelling
      if (isBusy() && cancelLocked) button.disabled = true
      if (!isBusy()) {
        cancelLocked = false
        cancelling = false
      }
    }

    const cancelVideo = async () => {
      if (cancelling || cancelLocked || destroyed) return
      cancelling = true
      syncButton()
      setStatusMessage("Отменяю генерацию…")

      for (let attempt = 0; attempt < 40 && !destroyed; attempt += 1) {
        try {
          const response = await fetch("/api/media/video/cancel", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: "{}",
          })
          const data = await response.json().catch(() => ({}))

          if (response.ok && data?.cancelled) {
            window.localStorage.setItem(VIDEO_USAGE_KEY, "0")
            cancelLocked = true
            cancelling = false
            setStatusMessage("Генерация отменена · лимит возвращён")
            syncButton()
            return
          }

          if (response.status === 404 && isBusy()) {
            await sleep(300)
            continue
          }

          cancelLocked = response.status === 409
          cancelling = false
          setStatusMessage(String(data?.error || "Не удалось отменить генерацию."), true)
          syncButton()
          return
        } catch {
          if (isBusy() && attempt < 39) {
            await sleep(300)
            continue
          }
          cancelling = false
          setStatusMessage("Не удалось связаться с сервисом отмены.", true)
          syncButton()
          return
        }
      }

      cancelling = false
      setStatusMessage("Задача ещё создаётся. Попробуй отменить ещё раз.", true)
      syncButton()
    }

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".mv__send[data-video-cancel='1']") : null
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      void cancelVideo()
    }

    document.addEventListener("click", onClickCapture, true)
    const observer = new MutationObserver(syncButton)
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase", "disabled"] })
    syncButton()

    return () => {
      destroyed = true
      observer.disconnect()
      document.removeEventListener("click", onClickCapture, true)
      style.remove()
    }
  }, [])

  return null
}
