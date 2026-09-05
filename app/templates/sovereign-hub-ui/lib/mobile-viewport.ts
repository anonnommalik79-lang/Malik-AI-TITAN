/** Keep the app inside the visible viewport without moving its scrollable panes.
 * Safari pans the layout viewport and resizes only visualViewport for the OSK.
 * Ignore pinch zoom: reflowing to the zoomed width/height would fight the user.
 */
export function observeMobileViewport(win: Window = window, doc: Document = document) {
  const root = doc.documentElement
  const mobile = win.matchMedia("(max-width: 767px)")
  const viewport = win.visualViewport
  let frame = 0
  let fullHeight = win.innerHeight
  let layoutWidth = win.innerWidth
  let keyboardOpen = false

  const clear = () => {
    root.removeAttribute("data-malik-mobile-viewport")
    root.removeAttribute("data-malik-keyboard")
    root.style.removeProperty("--malik-viewport-height")
    root.style.removeProperty("--malik-viewport-top")
  }

  const update = () => {
    frame = 0
    if (!mobile.matches) {
      clear()
      keyboardOpen = false
      fullHeight = win.innerHeight
      return
    }
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return

    if (layoutWidth !== win.innerWidth) {
      layoutWidth = win.innerWidth
      fullHeight = win.innerHeight
      keyboardOpen = false
    }
    const height = Math.round(viewport?.height || win.innerHeight)
    const focused = doc.activeElement
    const editing = Boolean(focused?.matches("textarea, input:not([type=button]):not([type=submit]), [contenteditable=true]"))
    fullHeight = Math.max(fullHeight, win.innerHeight, height)
    keyboardOpen = (editing || keyboardOpen) && fullHeight - height > 120
    if (!keyboardOpen && !editing) fullHeight = win.innerHeight

    root.setAttribute("data-malik-mobile-viewport", "true")
    root.setAttribute("data-malik-keyboard", keyboardOpen ? "open" : "closed")
    root.style.setProperty("--malik-viewport-height", `${height}px`)
    root.style.setProperty("--malik-viewport-top", `${Math.max(0, viewport?.offsetTop || 0)}px`)
  }
  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(update)
  }

  update()
  viewport?.addEventListener("resize", schedule)
  viewport?.addEventListener("scroll", schedule)
  win.addEventListener("resize", schedule)
  win.addEventListener("pageshow", schedule)
  doc.addEventListener("focusin", schedule)
  doc.addEventListener("focusout", schedule)
  mobile.addEventListener("change", schedule)

  return () => {
    if (frame) win.cancelAnimationFrame(frame)
    viewport?.removeEventListener("resize", schedule)
    viewport?.removeEventListener("scroll", schedule)
    win.removeEventListener("resize", schedule)
    win.removeEventListener("pageshow", schedule)
    doc.removeEventListener("focusin", schedule)
    doc.removeEventListener("focusout", schedule)
    mobile.removeEventListener("change", schedule)
    clear()
  }
}
