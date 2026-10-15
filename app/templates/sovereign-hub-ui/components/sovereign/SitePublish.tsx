"use client"

import { useCallback, useState } from "react"
import { Check, Copy, ExternalLink, Globe2, Loader2, X } from "lucide-react"

/**
 * «Опубликовать» for a Malik Site Forge page: one click gives a public link
 * (malikaiworld.world/site/<id>) that works for anyone. Publishing the same
 * site again after an edit updates the page behind the same link. The author
 * can take it down from the same strip.
 */

export function isForgeSiteHtml(code: string) {
  return typeof code === "string" && code.includes('id="malik-site"') && code.includes("malik-forge/v1")
}

export type SitePublishState =
  | { status: "idle"; note?: string }
  | { status: "busy" }
  | { status: "done"; id: string; url: string; updated: boolean }
  | { status: "error"; message: string; signIn?: boolean }

export function useSitePublish(html: string) {
  // The strip belongs to the page it was made for: a new or edited site starts clean.
  const [stored, setStored] = useState<{ html: string; state: SitePublishState }>({ html, state: { status: "idle" } })
  const state: SitePublishState = stored.html === html ? stored.state : { status: "idle" }
  const setState = useCallback((next: SitePublishState) => setStored({ html, state: next }), [html])
  const publish = useCallback(async () => {
    setState({ status: "busy" })
    try {
      const response = await fetch("/api/sites/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) {
        setState({ status: "error", message: typeof data?.message === "string" ? data.message : "Не удалось опубликовать сайт. Попробуйте ещё раз.", signIn: response.status === 401 })
        return
      }
      const url = typeof data.site?.url === "string" ? data.site.url : `${window.location.origin}${data.site?.path || ""}`
      setState({ status: "done", id: String(data.site?.id || ""), url, updated: Boolean(data.updated) })
    } catch {
      setState({ status: "error", message: "Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз." })
    }
  }, [html, setState])
  const unpublish = useCallback(async (id: string) => {
    setState({ status: "busy" })
    try {
      const response = await fetch(`/api/sites/publish/${encodeURIComponent(id)}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) { setState({ status: "error", message: typeof data?.message === "string" ? data.message : "Не удалось снять сайт с публикации." }); return }
      setState({ status: "idle", note: "Сайт снят с публикации — ссылка больше не открывается." })
    } catch {
      setState({ status: "error", message: "Нет соединения с сервером. Попробуйте ещё раз." })
    }
  }, [setState])
  const reset = useCallback(() => setState({ status: "idle" }), [setState])
  return { state, publish, unpublish, reset }
}

export function SitePublishButton({ state, onPublish, className }: { state: SitePublishState; onPublish: () => void; className?: string }) {
  const busy = state.status === "busy"
  return (
    <button type="button" className={className} onClick={onPublish} disabled={busy} aria-label="Опубликовать сайт по ссылке">
      {busy ? <Loader2 aria-hidden="true" className="spin" /> : <Globe2 aria-hidden="true" />}
      {busy ? "Публикую…" : state.status === "done" ? "Обновить публикацию" : "Опубликовать"}
    </button>
  )
}

export function SitePublishStrip({ state, onUnpublish, onClose }: { state: SitePublishState; onUnpublish: (id: string) => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  if (state.status === "busy" || (state.status === "idle" && !state.note)) return null
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1400) } catch { setCopied(false) }
  }
  return (
    <div className={"site-publish-strip" + (state.status === "error" ? " is-error" : "")} role="status" aria-live="polite">
      {state.status === "done" ? (
        <>
          <div className="site-publish-strip__text">
            <strong>{state.updated ? "Публикация обновлена — ссылка та же" : "Сайт опубликован"}</strong>
            <a href={state.url} target="_blank" rel="noopener noreferrer">{state.url.replace(/^https?:\/\//, "")}</a>
          </div>
          <div className="site-publish-strip__actions">
            <button type="button" onClick={() => void copy(state.url)}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Скопировано" : "Копировать"}</button>
            <a href={state.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Открыть</a>
            <button type="button" onClick={() => onUnpublish(state.id)}>Снять с публикации</button>
          </div>
        </>
      ) : (
        <>
          <div className="site-publish-strip__text">
            {state.status === "error" ? <strong>{state.message}</strong> : <strong>{state.note}</strong>}
            {state.status === "error" && state.signIn ? <a href="/auth">Войти</a> : null}
          </div>
          <div className="site-publish-strip__actions"><button type="button" onClick={onClose} aria-label="Закрыть"><X aria-hidden="true" /></button></div>
        </>
      )}
    </div>
  )
}
