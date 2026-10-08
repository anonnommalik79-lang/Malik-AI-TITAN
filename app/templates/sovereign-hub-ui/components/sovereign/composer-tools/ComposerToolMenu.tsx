"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { Check, FolderOpen, Github, Images, Mail, Paperclip, PenLine, Search, Sparkles, Telescope, type LucideIcon } from "lucide-react"
import {
  TOOL_GROUPS,
  TOOL_TEXT,
  connectorBadge,
  isConnectorId,
  moveFocus,
  toolChecked,
  typeahead,
  type ComposerToolId,
  type ConnectorId,
  type ResearchMode,
} from "./model"
import { useConnectorStatus } from "./useConnectorStatus"
import "./composer-tools.css"

const ICONS: Record<ComposerToolId, LucideIcon> = {
  upload: Paperclip,
  folder: FolderOpen,
  library: Images,
  draw: PenLine,
  image: Sparkles,
  web: Search,
  deep: Telescope,
  github: Github,
  gmail: Mail,
}

type Box = { sheet: true } | { sheet: false; left: number; width: number; top?: number; bottom?: number; maxHeight: number }

/**
 * The «+» menu shared by the chat and the home composer.
 *
 * Grouped rows; modes and connections are switches that show whether they
 * are on; GitHub and Gmail show their live connection state. Arrow keys,
 * Home/End, a typed letter, Enter and Esc work as in a native menu. On a
 * phone it is a sheet from the bottom of the screen.
 */
export function ComposerToolMenu({
  open,
  anchor,
  research,
  connector,
  onSelect,
  onClose,
}: {
  open: boolean
  anchor: HTMLElement | null
  research: ResearchMode
  connector: ConnectorId | null
  onSelect: (id: ComposerToolId) => void
  onClose: (reason: "escape" | "outside" | "tab" | "select") => void
}) {
  const status = useConnectorStatus(open)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const typed = useRef({ text: "", at: 0 })
  const [box, setBox] = useState<Box | null>(null)
  const [focus, setFocus] = useState(-1)

  const rows = useMemo(() => TOOL_GROUPS.flatMap((group) => group.items.map((id) => {
    const badge = isConnectorId(id) ? connectorBadge(status[id]) : null
    return { id, group: group.id, badge, disabled: Boolean(badge?.disabled), checked: toolChecked(id, research, connector) }
  })), [status, research, connector])
  const disabled = rows.map((row) => row.disabled)

  const place = useCallback(() => {
    if (!anchor) return
    const width = window.innerWidth
    const height = window.visualViewport?.height || window.innerHeight
    if (width < 640) { setBox({ sheet: true }); return }
    const rect = anchor.getBoundingClientRect()
    const menuWidth = Math.min(360, width - 24)
    const left = Math.min(Math.max(12, rect.left), Math.max(12, width - menuWidth - 12))
    const above = rect.top - 12
    const below = height - rect.bottom - 12
    setBox(above >= 380 || above >= below
      ? { sheet: false, left, width: menuWidth, bottom: height - rect.top + 8, maxHeight: Math.max(220, above - 8) }
      : { sheet: false, left, width: menuWidth, top: rect.bottom + 8, maxHeight: Math.max(220, below - 8) })
  }, [anchor])

  useLayoutEffect(() => {
    if (!open) { setBox(null); setFocus(-1); return }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    window.visualViewport?.addEventListener("resize", place)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      window.visualViewport?.removeEventListener("resize", place)
    }
  }, [open, place])

  // The first row takes focus, so the keyboard works at once.
  useEffect(() => {
    if (!open || !box) return
    const frame = requestAnimationFrame(() => setFocus((current) => current >= 0 ? current : moveFocus(-1, "Home", disabled)))
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, box])

  useEffect(() => {
    if (focus >= 0) itemRefs.current[focus]?.focus({ preventScroll: false })
  }, [focus])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return
      onClose("outside")
    }
    document.addEventListener("pointerdown", outside, true)
    return () => document.removeEventListener("pointerdown", outside, true)
  }, [open, anchor, onClose])

  if (!open || !box || typeof document === "undefined") return null

  const choose = (index: number) => {
    const row = rows[index]
    if (!row || row.disabled) return
    onSelect(row.id)
    onClose("select")
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      onClose("escape")
      anchor?.focus()
      return
    }
    if (event.key === "Tab") { onClose("tab"); return }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault()
      setFocus((current) => moveFocus(current, event.key, disabled))
      return
    }
    if (event.key.length === 1 && /\S/u.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now()
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + event.key : event.key, at: now }
      const found = typeahead(rows.map((row) => TOOL_TEXT[row.id].label), disabled, typed.current.text.length > 1 ? focus - 1 : focus, typed.current.text)
      if (found >= 0) setFocus(found)
    }
  }

  let index = -1
  const menu = (
    <div
      ref={menuRef}
      id="malik-composer-tools"
      role="menu"
      aria-label="Добавить в сообщение"
      className={box.sheet ? "mct-menu is-sheet" : "mct-menu"}
      data-preserve-brand-color="true"
      style={box.sheet ? undefined : { left: box.left, width: box.width, top: box.top, bottom: box.bottom, maxHeight: box.maxHeight }}
      onKeyDown={onKeyDown}
    >
      {box.sheet ? <span className="mct-handle" aria-hidden="true" /> : null}
      {TOOL_GROUPS.map((group) => (
        <div key={group.id} className="mct-group" role="group" aria-labelledby={`mct-group-${group.id}`}>
          <div id={`mct-group-${group.id}`} className="mct-group__label">{group.label}</div>
          {group.items.map((id) => {
            index += 1
            const at = index
            const row = rows[at]
            const Icon = ICONS[id]
            const text = TOOL_TEXT[id]
            const checked = row.checked
            return (
              <button
                key={id}
                ref={(node) => { itemRefs.current[at] = node }}
                type="button"
                role={checked === null ? "menuitem" : "menuitemcheckbox"}
                aria-checked={checked === null ? undefined : checked}
                aria-disabled={row.disabled || undefined}
                tabIndex={focus === at ? 0 : -1}
                data-tool={id}
                className={`mct-item${checked ? " is-on" : ""}${row.disabled ? " is-disabled" : ""}`}
                title={row.badge?.hint}
                onClick={() => choose(at)}
                onMouseEnter={() => { if (!row.disabled) setFocus(at) }}
              >
                <span className="mct-item__icon" aria-hidden="true"><Icon /></span>
                <span className="mct-item__text">
                  <strong>{text.label}</strong>
                  <small>{row.badge && row.badge.tone === "ok" && status[id as ConnectorId]?.account ? status[id as ConnectorId]?.account : text.description}</small>
                </span>
                {row.badge ? <span className={`mct-badge is-${row.badge.tone}`}>{row.badge.tone === "ok" ? <span className="mct-badge__dot" aria-hidden="true" /> : null}{row.badge.text}</span> : null}
                {checked ? <Check className="mct-item__check" aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      ))}
      {box.sheet ? null : <div className="mct-foot">Файлы можно перетащить в окно или вставить через Ctrl+V</div>}
    </div>
  )

  return createPortal(
    box.sheet ? <div className="mct-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose("outside") }}>{menu}</div> : menu,
    document.body,
  )
}
