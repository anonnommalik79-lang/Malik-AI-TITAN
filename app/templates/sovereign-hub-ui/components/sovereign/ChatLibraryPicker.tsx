"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, Image as ImageIcon, LogIn, Paperclip, Search, X } from "lucide-react"
import "./composer-tools/library-picker.css"

type LibraryItem = {
  id: string
  src: string
  prompt?: string
  provider?: string
  quality?: string
  createdAt?: string
}

type ChatLibraryPickerProps = {
  open: boolean
  onClose: () => void
  onSelect: (url: string, label?: string) => void | Promise<void>
  /** How many can still be attached to this message. */
  maxSelect?: number
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "sign-in" }
  | { kind: "not-configured" }
  | { kind: "error"; message: string }

const PAGE = 60

function imagesWord(count: number) {
  const n = count % 100
  const last = n % 10
  if (n > 10 && n < 20) return "изображений"
  if (last === 1) return "изображение"
  if (last >= 2 && last <= 4) return "изображения"
  return "изображений"
}

function dateLabel(value?: string) {
  const time = value ? Date.parse(value) : NaN
  if (!Number.isFinite(time)) return ""
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(time)).replace(".", "")
}

/**
 * «Из библиотеки»: the person's saved Malik AI images. Several can be chosen
 * at once; nothing is attached until «Прикрепить»; a failure is said in words
 * and the picker stays open.
 */
export function ChatLibraryPicker({ open, onClose, onSelect, maxSelect = 6 }: ChatLibraryPickerProps) {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [loadingMore, setLoadingMore] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const limit = Math.max(1, maxSelect)

  const fetchPage = useCallback(async (offset: number) => {
    const response = await fetch(`/api/media/library?limit=${PAGE}&offset=${offset}`, { cache: "no-store", credentials: "same-origin" })
    const data = await response.json().catch(() => null)
    if (response.status === 401) return { state: { kind: "sign-in" } as LoadState }
    if (!response.ok || !data?.ok) return { state: { kind: "error", message: "Библиотека сейчас не открывается. Попробуйте ещё раз." } as LoadState }
    if (data.configured === false) return { state: { kind: "not-configured" } as LoadState }
    return {
      state: { kind: "ready" } as LoadState,
      items: (Array.isArray(data.items) ? data.items : []).filter((item: LibraryItem) => item && typeof item.src === "string" && item.src) as LibraryItem[],
      nextOffset: typeof data.nextOffset === "number" ? data.nextOffset : null,
      total: Number(data.total) || 0,
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setItems([]); setSelected([]); setQuery(""); setError(""); setNextOffset(null); setState({ kind: "loading" })
    fetchPage(0)
      .then((result) => {
        if (cancelled) return
        setState(result.state)
        if (result.items) { setItems(result.items); setNextOffset(result.nextOffset); setTotal(result.total) }
      })
      .catch(() => { if (!cancelled) setState({ kind: "error", message: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз." }) })
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [open, fetchPage])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !attaching) { event.preventDefault(); onClose() } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, attaching, onClose])

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
    if (!words.length) return items
    return items.filter((item) => {
      const haystack = [item.prompt, item.provider, item.quality, dateLabel(item.createdAt)].filter(Boolean).join(" ").toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
  }, [items, query])

  if (!open || typeof document === "undefined") return null

  const toggle = (id: string) => {
    setError("")
    if (selected.includes(id)) { setSelected(selected.filter((value) => value !== id)); return }
    if (selected.length >= limit) { setError(limit === 1 ? "К этому сообщению можно прикрепить ещё одно изображение." : `Можно выбрать не больше ${limit}.`); return }
    setSelected([...selected, id])
  }

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await fetchPage(nextOffset)
      if (result.items) {
        setItems((current) => [...current, ...result.items!.filter((item) => !current.some((known) => known.id === item.id))])
        setNextOffset(result.nextOffset)
      } else setError("Не удалось загрузить ещё. Попробуйте снова.")
    } catch {
      setError("Не удалось загрузить ещё. Попробуйте снова.")
    } finally {
      setLoadingMore(false)
    }
  }

  const attach = async () => {
    if (!selected.length || attaching) return
    setAttaching(true)
    setError("")
    const chosen = selected.map((id) => items.find((item) => item.id === id)).filter((item): item is LibraryItem => Boolean(item))
    let done = 0
    try {
      for (const item of chosen) {
        await onSelect(item.src, item.prompt || "Изображение из библиотеки")
        done += 1
        setSelected((current) => current.filter((id) => id !== item.id))
      }
      onClose()
    } catch (reason) {
      const message = reason instanceof Error && reason.message ? reason.message : "Не удалось прикрепить изображение"
      setError(done ? `Прикреплено ${done} из ${chosen.length}. ${message}` : message)
    } finally {
      setAttaching(false)
    }
  }

  const body = (() => {
    if (state.kind === "loading") return <div className="mlp-grid" aria-busy="true">{Array.from({ length: 8 }, (_, at) => <span key={at} className="mlp-skeleton" />)}</div>
    if (state.kind === "sign-in") return (
      <div className="mlp-empty">
        <LogIn aria-hidden="true" />
        <strong>Библиотека доступна после входа</strong>
        <span>Изображения, которые вы создаёте в Malik AI, сохраняются в аккаунте.</span>
        <a className="mlp-btn is-primary" href="/sign-in">Войти</a>
      </div>
    )
    if (state.kind === "not-configured") return (
      <div className="mlp-empty">
        <ImageIcon aria-hidden="true" />
        <strong>Облачная библиотека не подключена</strong>
        <span>Созданные изображения пока не сохраняются на сервере.</span>
      </div>
    )
    if (state.kind === "error") return (
      <div className="mlp-empty is-error">
        <ImageIcon aria-hidden="true" />
        <strong>{state.message}</strong>
      </div>
    )
    if (!filtered.length) return (
      <div className="mlp-empty">
        <ImageIcon aria-hidden="true" />
        <strong>{items.length ? "Ничего не найдено" : "Здесь появятся ваши изображения"}</strong>
        <span>{items.length ? "Попробуйте другие слова из описания картинки." : "Создайте изображение — оно сохранится в библиотеке."}</span>
      </div>
    )
    return (
      <>
        <div className="mlp-grid" role="listbox" aria-multiselectable="true" aria-label="Изображения">
          {filtered.map((item) => {
            const order = selected.indexOf(item.id)
            const on = order >= 0
            return (
              <button key={item.id} type="button" role="option" aria-selected={on} className={on ? "mlp-tile is-on" : "mlp-tile"} onClick={() => toggle(item.id)} onDoubleClick={() => { if (!on) toggle(item.id) }} title={item.prompt || undefined}>
                <img src={item.src} alt={item.prompt || "Изображение из библиотеки"} loading="lazy" decoding="async" />
                <span className="mlp-tile__mark" aria-hidden="true">{on ? (limit > 1 ? order + 1 : <Check />) : null}</span>
                <span className="mlp-tile__caption">
                  <span>{item.prompt || item.provider || "Malik AI"}</span>
                  {dateLabel(item.createdAt) ? <small>{dateLabel(item.createdAt)}</small> : null}
                </span>
              </button>
            )
          })}
        </div>
        {nextOffset !== null && !query.trim() ? (
          <button type="button" className="mlp-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Загружаю…" : `Показать ещё (${Math.max(0, total - items.length)})`}</button>
        ) : null}
      </>
    )
  })()

  return createPortal(
    <div className="mlp-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !attaching) onClose() }}>
      <section className="mlp" role="dialog" aria-modal="true" aria-label="Добавить из библиотеки" data-preserve-brand-color="true">
        <header className="mlp-head">
          <div>
            <h2>Из библиотеки</h2>
            <p>{state.kind === "ready" && total ? `${total} ${imagesWord(total)} · выберите ${limit > 1 ? "одно или несколько" : "одно"}` : "Ваши сохранённые изображения Malik AI"}</p>
          </div>
          <button type="button" className="mlp-close" onClick={onClose} disabled={attaching} aria-label="Закрыть"><X aria-hidden="true" /></button>
        </header>
        <label className="mlp-search">
          <Search aria-hidden="true" />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по описанию, модели или дате…" aria-label="Поиск по библиотеке" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X aria-hidden="true" /></button> : null}
        </label>
        <div className="mlp-body">{body}</div>
        <footer className="mlp-foot">
          <span className={error ? "mlp-status is-error" : "mlp-status"} role={error ? "alert" : "status"}>
            {error || (selected.length ? `Выбрано: ${selected.length}${limit > 1 ? ` из ${limit}` : ""}` : "Нажмите на изображение, чтобы выбрать")}
          </span>
          {selected.length ? <button type="button" className="mlp-btn" onClick={() => setSelected([])} disabled={attaching}>Сбросить</button> : null}
          <button type="button" className="mlp-btn is-primary" onClick={() => void attach()} disabled={!selected.length || attaching}>
            <Paperclip aria-hidden="true" />{attaching ? "Прикрепляю…" : selected.length > 1 ? `Прикрепить ${selected.length}` : "Прикрепить"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
