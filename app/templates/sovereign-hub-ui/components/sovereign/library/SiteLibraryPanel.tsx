"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Clock,
  Download,
  ExternalLink,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Search,
  Share2,
  Shuffle,
  Sparkles,
  Star,
  Tag,
  Wand2,
  X,
} from "lucide-react"
import {
  LIBRARY_CATEGORIES,
  LIBRARY_TEMPLATES,
  LIBRARY_STYLES,
  buildLibrarySite,
  libraryPrompt,
  type LibraryTemplate,
} from "@/lib/library/site-library"

export type SiteLibraryPanelProps = {
  /** Hands a style to the site generator, which is what stops this being a museum. */
  onUseStyle?: (prompt: string, template: LibraryTemplate) => void
}

type Sort = "popular" | "name" | "category"
type ViewMode = "grid" | "list"

const SORTS: Array<[Sort, string]> = [
  ["popular", "Сначала популярные"],
  ["name", "По названию"],
  ["category", "По категории"],
]

const FAVOURITES_KEY = "malik-library-favourites-v1"
const VIEW_KEY = "malik-library-view-v1"

function readFavourites(): number[] {
  if (typeof window === "undefined") return []
  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVOURITES_KEY) || "[]")
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "number") : []
  } catch {
    return []
  }
}

/**
 * Tags for a template, derived rather than invented.
 *
 * The reference shows a row of tag pills under the title. There is no tag field
 * in the data, and making words up would put labels on a template that nothing
 * in the product agrees with - so the pills carry what is actually known: the
 * category, the direction, and the editorial flag when it is set.
 */
function tagsOf(template: LibraryTemplate) {
  const parts = [template.category, ...template.subcategory.split("/").map((part) => part.trim())]
  if (template.featured) parts.push("Выбор Malik")
  return parts.filter(Boolean)
}

export function SiteLibraryPanel({ onUseStyle }: SiteLibraryPanelProps) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("Все")
  const [direction, setDirection] = useState<string>("Все")
  const [sort, setSort] = useState<Sort>("popular")
  const [view, setView] = useState<ViewMode>("grid")
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const [favourites, setFavourites] = useState<number[]>([])
  const [selected, setSelected] = useState<LibraryTemplate | null>(null)
  const [opened, setOpened] = useState<LibraryTemplate | null>(null)
  const [shared, setShared] = useState(false)
  const [visible, setVisible] = useState(24)
  const [sortOpen, setSortOpen] = useState(false)
  const [directionOpen, setDirectionOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setFavourites(readFavourites())
    try {
      const storedView = window.localStorage.getItem(VIEW_KEY)
      if (storedView === "grid" || storedView === "list") setView(storedView)
    } catch {}
  }, [])

  // One handler for both dropdowns: two separate outside-click listeners on the
  // same container fight each other and leave one menu stuck open.
  useEffect(() => {
    if (!sortOpen && !directionOpen) return
    const onDown = (event: MouseEvent) => {
      if (toolsRef.current?.contains(event.target as Node)) return
      setSortOpen(false)
      setDirectionOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSortOpen(false); setDirectionOpen(false) }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [sortOpen, directionOpen])

  const toggleFavourite = (id: number) => {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      try { window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const chooseView = (next: ViewMode) => {
    setView(next)
    try { window.localStorage.setItem(VIEW_KEY, next) } catch {}
  }

  /** Directions available inside the chosen category - the filter never offers an empty result. */
  const directions = useMemo(() => {
    const pool = category === "Все" ? LIBRARY_TEMPLATES : LIBRARY_TEMPLATES.filter((item) => item.category === category)
    return ["Все", ...Array.from(new Set(pool.map((item) => item.subcategory))).sort((a, b) => a.localeCompare(b, "ru"))]
  }, [category])

  useEffect(() => { setDirection("Все") }, [category])

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru")
    const filtered = LIBRARY_TEMPLATES.filter((template) => {
      if (category !== "Все" && template.category !== category) return false
      if (direction !== "Все" && template.subcategory !== direction) return false
      if (onlyFavourites && !favourites.includes(template.id)) return false
      if (!needle) return true
      return `${template.name} ${template.category} ${template.subcategory}`.toLocaleLowerCase("ru").includes(needle)
    })
    const sorted = [...filtered]
    if (sort === "popular") sorted.sort((a, b) => b.popularity - a.popularity || a.id - b.id)
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"))
    if (sort === "category") sorted.sort((a, b) => a.category.localeCompare(b.category, "ru") || b.popularity - a.popularity)
    return sorted
  }, [query, category, direction, sort, onlyFavourites, favourites])

  // A hundred cards is too many to mount at once on a phone. They arrive a
  // screenful at a time as the person reaches the end of the list.
  useEffect(() => { setVisible(24) }, [query, category, direction, sort, onlyFavourites])
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible((current) => Math.min(current + 24, shown.length))
      }
    }, { rootMargin: "600px 0px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [shown.length])

  // A selected template that a filter has just hidden would keep its panel open
  // over a grid that no longer contains it.
  useEffect(() => {
    if (selected && !shown.some((item) => item.id === selected.id)) setSelected(null)
  }, [shown, selected])

  useEffect(() => { setShared(false) }, [selected])

  useEffect(() => {
    if (!opened) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpened(null) }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [opened])

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const openedHtml = opened ? buildLibrarySite(opened, origin) : ""

  const openInTab = () => {
    if (!openedHtml) return
    const url = URL.createObjectURL(new Blob([openedHtml], { type: "text/html" }))
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const download = (template: LibraryTemplate) => {
    const html = buildLibrarySite(template, origin)
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${template.slug || "malik-site"}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  /** Copies the finished page, because there is no public URL to share. */
  const share = async (template: LibraryTemplate) => {
    const html = buildLibrarySite(template, origin)
    try {
      await navigator.clipboard.writeText(html)
      setShared(true)
      window.setTimeout(() => setShared(false), 2200)
    } catch {
      download(template)
    }
  }

  const surprise = () => {
    const pool = shown.length ? shown : LIBRARY_TEMPLATES
    setSelected(pool[Math.floor(Math.random() * pool.length)])
  }

  const accentOf = (template: LibraryTemplate) => LIBRARY_STYLES[template.category].accent

  return (
    <main className="malikLibrary">
      <header className="libBar">
        <div className="libBarTitle"><Folder aria-hidden="true" /> Библиотека</div>
        <label className="libBarSearch">
          <Search aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск…" aria-label="Поиск по библиотеке" />
          <kbd>⌘K</kbd>
        </label>
      </header>

      <div className={`libBody${selected ? " has-detail" : ""}`}>
        <div className="libMain">
          <section className="libIntro">
            <div>
              <p className="libIntroLead">Готовые сайты, стили и направления — всегда под рукой.</p>
              <p className="libIntroSub">Любой шаблон открывается целиком и может стать основой вашего.</p>
            </div>
            <button type="button" className="libPrimary" onClick={surprise}>
              <Shuffle aria-hidden="true" /> Случайный стиль
            </button>
          </section>

          <nav className="libTabs" aria-label="Категории">
            <button type="button" className={category === "Все" && !onlyFavourites ? "is-active" : ""} onClick={() => { setCategory("Все"); setOnlyFavourites(false) }}>
              <Sparkles aria-hidden="true" /> Все
            </button>
            <button type="button" className={onlyFavourites ? "is-active" : ""} onClick={() => setOnlyFavourites((current) => !current)} aria-pressed={onlyFavourites}>
              <Star aria-hidden="true" /> Избранное{favourites.length ? ` · ${favourites.length}` : ""}
            </button>
            {LIBRARY_CATEGORIES.map((item) => (
              <button key={item} type="button" className={item === category && !onlyFavourites ? "is-active" : ""} onClick={() => { setCategory(item); setOnlyFavourites(false) }}>
                <ImageIcon aria-hidden="true" /> {item}
              </button>
            ))}
          </nav>

          <div className="libTools" ref={toolsRef}>
            <label className="libFilterSearch">
              <Search aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по библиотеке…" />
              {query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")}><X /></button>}
            </label>

            <div className="libSelect">
              <button type="button" onClick={() => { setDirectionOpen((v) => !v); setSortOpen(false) }} aria-expanded={directionOpen}>
                <Tag aria-hidden="true" /> Направление: {direction}
              </button>
              {directionOpen && (
                <div className="libMenu" role="menu">
                  {directions.map((item) => (
                    <button key={item} type="button" role="menuitem" className={item === direction ? "is-on" : ""} onClick={() => { setDirection(item); setDirectionOpen(false) }}>{item}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="libSpacer" />

            <div className="libSelect">
              <button type="button" onClick={() => { setSortOpen((v) => !v); setDirectionOpen(false) }} aria-expanded={sortOpen}>
                <Clock aria-hidden="true" /> {SORTS.find(([value]) => value === sort)?.[1]}
              </button>
              {sortOpen && (
                <div className="libMenu is-right" role="menu">
                  {SORTS.map(([value, label]) => (
                    <button key={value} type="button" role="menuitem" className={value === sort ? "is-on" : ""} onClick={() => { setSort(value); setSortOpen(false) }}>{label}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="libViewSwitch" role="group" aria-label="Вид">
              <button type="button" className={view === "grid" ? "is-on" : ""} onClick={() => chooseView("grid")} aria-label="Сеткой" aria-pressed={view === "grid"}><LayoutGrid /></button>
              <button type="button" className={view === "list" ? "is-on" : ""} onClick={() => chooseView("list")} aria-label="Списком" aria-pressed={view === "list"}><List /></button>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="libEmpty">Ничего не нашлось. Попробуйте другое слово или снимите фильтр.</p>
          ) : (
            <section className={view === "grid" ? "libGrid" : "libList"}>
              {shown.slice(0, visible).map((template, position) => (
                <article
                  key={template.id}
                  className={`libCard${selected?.id === template.id ? " is-selected" : ""}`}
                  style={{ ["--accent" as string]: accentOf(template) }}
                >
                  <button className="libShot" onClick={() => setSelected(template)} aria-label={`Показать ${template.name}`}>
                    <img
                      src={template.preview}
                      alt=""
                      width={1280}
                      height={720}
                      loading={position < 6 ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                    />
                    {template.featured && <span className="libBadge"><Sparkles aria-hidden="true" /> Выбор Malik</span>}
                  </button>

                  <div className="libCardFoot">
                    <span className="libKind" aria-hidden="true"><ImageIcon /></span>
                    <span className="libCardText">
                      <b>{template.name}</b>
                      <small>Шаблон · {template.subcategory}</small>
                    </span>
                    <button
                      type="button"
                      className={`libFav${favourites.includes(template.id) ? " is-on" : ""}`}
                      onClick={() => toggleFavourite(template.id)}
                      aria-label={favourites.includes(template.id) ? `Убрать ${template.name} из избранного` : `В избранное: ${template.name}`}
                      aria-pressed={favourites.includes(template.id)}
                    >
                      <Star aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <div ref={sentinelRef} aria-hidden="true" />
          {visible < shown.length && <p className="libMore">Показано {visible} из {shown.length} — прокрутите дальше</p>}
        </div>

        {selected && (
          <aside className="libDetail" aria-label={`О шаблоне ${selected.name}`} style={{ ["--accent" as string]: accentOf(selected) }}>
            <div className="libDetailShot">
              <img src={selected.preview} alt="" width={1280} height={720} decoding="async" draggable={false} />
              <button type="button" className="libDetailClose" onClick={() => setSelected(null)} aria-label="Закрыть панель"><X /></button>
            </div>

            <div className="libDetailBody">
              <h2>{selected.name}</h2>
              <p className="libDetailMeta"><ImageIcon aria-hidden="true" /> Шаблон сайта · {selected.category}</p>

              <div className="libTags">
                {tagsOf(selected).map((tag) => <span key={tag}>{tag}</span>)}
              </div>

              <p className="libDetailText">
                {LIBRARY_STYLES[selected.category].tagline}
              </p>

              <dl className="libSpecs">
                <div><dt>Направление</dt><dd>{selected.subcategory}</dd></div>
                <div><dt>Категория</dt><dd>{selected.category}</dd></div>
                <div><dt>Заголовок</dt><dd>{LIBRARY_STYLES[selected.category].headline}</dd></div>
                <div><dt>Популярность</dt><dd>{selected.popularity} из 100</dd></div>
                <div><dt>Файл</dt><dd>{selected.slug}.html</dd></div>
              </dl>

              <button type="button" className="libPrimary is-wide" onClick={() => setOpened(selected)}>
                <ExternalLink aria-hidden="true" /> Открыть
              </button>
              <div className="libDetailRow">
                <button type="button" onClick={() => void share(selected)}>
                  <Share2 aria-hidden="true" /> {shared ? "Скопировано" : "Поделиться"}
                </button>
                <button type="button" onClick={() => { const t = selected; setSelected(null); onUseStyle?.(libraryPrompt(t), t) }}>
                  <Wand2 aria-hidden="true" /> Использовать стиль
                </button>
              </div>
              <button type="button" className="libDetailWide" onClick={() => download(selected)}>
                <FolderPlus aria-hidden="true" /> Скачать HTML
              </button>
            </div>
          </aside>
        )}
      </div>

      {opened && (
        <div className="libViewer" role="dialog" aria-modal="true" aria-label={opened.name} onClick={() => setOpened(null)}>
          <div className="libViewerBox" onClick={(event) => event.stopPropagation()}>
            <div className="libViewerHead">
              <div>
                <b>{opened.name}</b>
                <small>{opened.category} · {opened.subcategory}</small>
              </div>
              <div className="libViewerActions">
                <button type="button" className="is-primary" onClick={() => { const t = opened; setOpened(null); onUseStyle?.(libraryPrompt(t), t) }}><Wand2 aria-hidden="true" /> Использовать стиль</button>
                <button type="button" onClick={openInTab}><ExternalLink aria-hidden="true" /> В новой вкладке</button>
                <button type="button" onClick={() => download(opened)}><Download aria-hidden="true" /> Скачать HTML</button>
                <button type="button" onClick={() => setOpened(null)} aria-label="Закрыть"><X aria-hidden="true" /></button>
              </div>
            </div>
            {/* The real site, running. Not a screenshot of one. */}
            <iframe title={`Сайт ${opened.name}`} srcDoc={openedHtml} sandbox="allow-scripts allow-popups" />
          </div>
        </div>
      )}

      <LibraryCss />
    </main>
  )
}

function LibraryCss() {
  return <style jsx global>{`
    .malikLibrary{--lib-bg:#08090a;--lib-panel:#101113;--lib-panel-2:#17181b;--lib-line:rgba(255,255,255,.085);--lib-line-2:rgba(255,255,255,.14);--lib-text:#f3f4f5;--lib-dim:rgba(255,255,255,.56);--lib-dim-2:rgba(255,255,255,.36);width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--lib-bg);color:var(--lib-text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    .malikLibrary *{box-sizing:border-box}
    .malikLibrary button,.malikLibrary input{font:inherit}
    .malikLibrary button{cursor:pointer;color:inherit}
    .malikLibrary :focus-visible{outline:2px solid rgba(255,255,255,.5);outline-offset:2px}

    /* top strip */
    .libBar{flex:0 0 auto;display:flex;align-items:center;gap:16px;height:56px;padding:0 18px;border-bottom:1px solid var(--lib-line);background:var(--lib-panel)}
    .libBarTitle{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:650}
    .libBarTitle svg{width:16px;height:16px;color:var(--lib-dim)}
    .libBarSearch{margin-left:auto;display:flex;align-items:center;gap:9px;width:min(320px,42vw);height:34px;padding:0 11px;border:1px solid var(--lib-line);border-radius:10px;background:#0a0b0c}
    .libBarSearch svg{width:14px;height:14px;color:var(--lib-dim-2);flex:0 0 14px}
    .libBarSearch input{flex:1;min-width:0;border:0;background:transparent;color:inherit;font-size:13px;outline:none}
    .libBarSearch input::placeholder{color:var(--lib-dim-2)}
    .libBarSearch kbd{font-family:inherit;font-size:10px;color:var(--lib-dim-2);border:1px solid var(--lib-line);border-radius:5px;padding:2px 5px}

    /* two columns: grid + detail */
    .libBody{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}
    .libBody.has-detail{grid-template-columns:minmax(0,1fr) 380px}
    .libMain{min-width:0;overflow-y:auto;padding:22px 20px 64px;scrollbar-width:thin}

    .libIntro{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:20px}
    .libIntroLead{margin:0;font-size:15px;font-weight:600}
    .libIntroSub{margin:4px 0 0;font-size:13px;color:var(--lib-dim)}

    /* .malikLibrary button sets color:inherit and is (0,1,1); a bare .libPrimary
       is (0,1,0) and loses, which painted white text on the white button. The
       class is scoped so it outranks the reset instead of fighting it. */
    .malikLibrary .libPrimary{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 17px;border:0;border-radius:10px;background:#fff;color:#0a0a0b;font-size:13px;font-weight:650;flex:0 0 auto}
    .malikLibrary .libPrimary:hover{background:#e9e9ea}
    .malikLibrary .libPrimary svg{width:15px;height:15px}
    .malikLibrary .libPrimary.is-wide{width:100%;height:42px}

    /* filter tabs */
    .libTabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;scrollbar-width:none}
    .libTabs::-webkit-scrollbar{display:none}
    .libTabs button{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;flex:0 0 auto;border:1px solid var(--lib-line);border-radius:10px;background:var(--lib-panel);font-size:12.5px;font-weight:600;white-space:nowrap;transition:background .14s ease,border-color .14s ease}
    .libTabs button svg{width:14px;height:14px;color:var(--lib-dim)}
    .libTabs button:hover{background:var(--lib-panel-2)}
    .libTabs button.is-active{border-color:var(--lib-line-2);background:#000;color:#fff}
    .libTabs button.is-active svg{color:#fff}

    /* filter row */
    .libTools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px}
    .libSpacer{flex:1 1 auto;min-width:0}
    .libFilterSearch{display:flex;align-items:center;gap:9px;width:min(300px,100%);height:36px;padding:0 12px;border:1px solid var(--lib-line);border-radius:10px;background:var(--lib-panel)}
    .libFilterSearch svg{width:14px;height:14px;color:var(--lib-dim-2);flex:0 0 14px}
    .libFilterSearch input{flex:1;min-width:0;border:0;background:transparent;color:inherit;font-size:13px;outline:none}
    .libFilterSearch input::placeholder{color:var(--lib-dim-2)}
    .libFilterSearch button{display:grid;place-items:center;border:0;background:transparent;padding:0}

    .libSelect{position:relative;flex:0 0 auto}
    .libSelect>button{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border:1px solid var(--lib-line);border-radius:10px;background:var(--lib-panel);font-size:12.5px;font-weight:550}
    .libSelect>button:hover{background:var(--lib-panel-2)}
    .libSelect>button svg{width:14px;height:14px;color:var(--lib-dim)}
    .libMenu{position:absolute;z-index:20;top:calc(100% + 6px);left:0;min-width:220px;max-height:290px;overflow-y:auto;padding:6px;border:1px solid var(--lib-line-2);border-radius:12px;background:var(--lib-panel-2);box-shadow:0 18px 44px rgba(0,0,0,.55);display:grid;gap:2px}
    .libMenu.is-right{left:auto;right:0}
    .libMenu button{width:100%;text-align:left;border:0;border-radius:8px;background:transparent;padding:8px 10px;font-size:12.5px}
    .libMenu button:hover{background:rgba(255,255,255,.07)}
    .libMenu button.is-on{background:rgba(255,255,255,.12);font-weight:650}

    .libViewSwitch{display:flex;gap:2px;padding:3px;border:1px solid var(--lib-line);border-radius:10px;background:var(--lib-panel);flex:0 0 auto}
    .libViewSwitch button{display:grid;place-items:center;width:30px;height:28px;border:0;border-radius:7px;background:transparent}
    .libViewSwitch button svg{width:15px;height:15px;color:var(--lib-dim)}
    .libViewSwitch button.is-on{background:rgba(255,255,255,.12)}
    .libViewSwitch button.is-on svg{color:#fff}

    /* cards */
    .libGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
    .libList{display:grid;gap:8px}
    .libCard{position:relative;display:flex;flex-direction:column;border:1px solid var(--lib-line);border-radius:14px;background:var(--lib-panel);overflow:hidden;transition:border-color .16s ease,transform .16s ease}
    .libCard:hover{border-color:var(--lib-line-2);transform:translateY(-2px)}
    .libCard.is-selected{border-color:#fff}
    .libShot{position:relative;display:block;width:100%;padding:0;border:0;background:#000;line-height:0}
    .libShot img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;display:block}
    .libBadge{position:absolute;top:9px;left:9px;display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.66);backdrop-filter:blur(6px);color:#fff;font-size:10px;font-weight:700;line-height:1}
    .libBadge svg{width:11px;height:11px;color:var(--accent,#fff)}
    .libCardFoot{display:flex;align-items:center;gap:10px;padding:10px 11px;min-width:0}
    .libKind{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:8px;background:var(--lib-panel-2)}
    .libKind svg{width:14px;height:14px;color:var(--lib-dim)}
    .libCardText{min-width:0;display:grid;gap:1px}
    .libCardText b{font-size:12.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .libCardText small{font-size:11px;color:var(--lib-dim-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .libFav{margin-left:auto;display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border:0;border-radius:8px;background:transparent}
    .libFav svg{width:15px;height:15px;color:var(--lib-dim-2)}
    .libFav:hover{background:rgba(255,255,255,.07)}
    .libFav.is-on svg{color:var(--accent,#fff);fill:var(--accent,#fff)}

    /* list mode: same card, laid sideways */
    .libList .libCard{flex-direction:row;align-items:center;border-radius:12px}
    .libList .libShot{width:132px;flex:0 0 132px}
    /* The top-left of a site screenshot is its masthead - the part that makes a
       template recognisable. Centre-cropping a 132px strip shows the middle of
       the page instead, which is the same grey block on every card. */
    .libList .libShot img{aspect-ratio:16/9;object-position:left top}
    .libList .libCardFoot{flex:1;min-width:0}
    .libList .libBadge{display:none}

    .libEmpty,.libMore{margin:26px 0 0;font-size:13px;color:var(--lib-dim)}

    /* detail panel */
    .libDetail{min-width:0;overflow-y:auto;border-left:1px solid var(--lib-line);background:var(--lib-panel);scrollbar-width:thin}
    .libDetailShot{position:relative;line-height:0;background:#000}
    .libDetailShot img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;display:block}
    .libDetailClose{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:50%;background:rgba(0,0,0,.6);backdrop-filter:blur(6px)}
    .libDetailClose svg{width:14px;height:14px}
    .libDetailBody{padding:16px 16px 26px;display:grid;gap:12px}
    .libDetailBody h2{margin:0;font-size:17px;font-weight:700;letter-spacing:-.01em}
    .libDetailMeta{margin:0;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--lib-dim)}
    .libDetailMeta svg{width:13px;height:13px}
    .libTags{display:flex;flex-wrap:wrap;gap:6px}
    .libTags span{padding:4px 9px;border:1px solid var(--lib-line);border-radius:999px;background:var(--lib-panel-2);font-size:11px;color:var(--lib-dim)}
    .libDetailText{margin:0;font-size:13px;line-height:1.6;color:var(--lib-dim)}
    .libSpecs{margin:2px 0 0;display:grid;gap:0}
    .libSpecs>div{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid var(--lib-line)}
    .libSpecs>div:last-child{border-bottom:0}
    .libSpecs dt{margin:0;font-size:12px;color:var(--lib-dim-2)}
    .libSpecs dd{margin:0;font-size:12px;font-weight:600;text-align:right;min-width:0;overflow-wrap:anywhere}
    .libDetailRow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .libDetailRow button,.libDetailWide{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 12px;border:1px solid var(--lib-line);border-radius:10px;background:var(--lib-panel-2);font-size:12.5px;font-weight:600}
    .libDetailWide{width:100%}
    .libDetailRow button:hover,.libDetailWide:hover{border-color:var(--lib-line-2);background:#1d1e22}
    .libDetailRow svg,.libDetailWide svg{width:14px;height:14px}

    /* full viewer */
    .libViewer{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:22px;background:rgba(0,0,0,.82);backdrop-filter:blur(6px)}
    .libViewerBox{width:min(1180px,100%);height:min(88vh,900px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--lib-line-2);border-radius:16px;background:#0a0b0c}
    .libViewerHead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--lib-line)}
    .libViewerHead b{display:block;font-size:14px;font-weight:700}
    .libViewerHead small{display:block;font-size:11.5px;color:var(--lib-dim-2)}
    .libViewerActions{display:flex;gap:8px;flex-wrap:wrap}
    .libViewerActions button{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:1px solid var(--lib-line);border-radius:9px;background:var(--lib-panel-2);font-size:12.5px;font-weight:600}
    .libViewerActions button svg{width:14px;height:14px}
    .malikLibrary .libViewerActions button.is-primary{border-color:transparent;background:#fff;color:#0a0a0b}
    .libViewerBox iframe{flex:1;width:100%;border:0;background:#fff}

    @media (max-width:1100px){
      .libBody.has-detail{grid-template-columns:minmax(0,1fr)}
      .libDetail{position:fixed;inset:auto 0 0;z-index:70;max-height:78dvh;border-left:0;border-top:1px solid var(--lib-line-2);border-radius:18px 18px 0 0;box-shadow:0 -18px 50px rgba(0,0,0,.6)}
    }
    @media (max-width:640px){
      .libBar{padding:0 12px}
      .libBarTitle span{display:none}
      .libMain{padding:16px 12px 60px}
      .libGrid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
      .libFilterSearch{width:100%}
      .libSpacer{display:none}
    }
    @media (prefers-reduced-motion:reduce){
      .libCard{transition:none}
      .libCard:hover{transform:none}
    }
  `}</style>
}
