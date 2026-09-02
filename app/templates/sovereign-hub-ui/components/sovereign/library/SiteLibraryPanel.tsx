"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, ExternalLink, Search, Sparkles, Star, Wand2, X } from "lucide-react"
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

const SORTS: Array<[Sort, string]> = [
  ["popular", "По популярности"],
  ["name", "По названию"],
  ["category", "По категории"],
]

const FAVOURITES_KEY = "malik-library-favourites-v1"

function readFavourites(): number[] {
  if (typeof window === "undefined") return []
  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVOURITES_KEY) || "[]")
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "number") : []
  } catch {
    return []
  }
}

export function SiteLibraryPanel({ onUseStyle }: SiteLibraryPanelProps) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("Все")
  const [sort, setSort] = useState<Sort>("popular")
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const [favourites, setFavourites] = useState<number[]>([])
  const [opened, setOpened] = useState<LibraryTemplate | null>(null)
  const [openCard, setOpenCard] = useState<number | null>(null)
  const [touchOnly, setTouchOnly] = useState(false)
  const [visible, setVisible] = useState(24)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setFavourites(readFavourites()) }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const media = window.matchMedia("(hover: none)")
    const sync = () => setTouchOnly(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const toggleFavourite = (id: number) => {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      try { window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru")
    const filtered = LIBRARY_TEMPLATES.filter((template) => {
      if (category !== "Все" && template.category !== category) return false
      if (onlyFavourites && !favourites.includes(template.id)) return false
      if (!needle) return true
      return `${template.name} ${template.category} ${template.subcategory}`.toLocaleLowerCase("ru").includes(needle)
    })
    const sorted = [...filtered]
    if (sort === "popular") sorted.sort((a, b) => b.popularity - a.popularity || a.id - b.id)
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"))
    if (sort === "category") sorted.sort((a, b) => a.category.localeCompare(b.category, "ru") || b.popularity - a.popularity)
    return sorted
  }, [query, category, sort, onlyFavourites, favourites])

  // A hundred cards is too many to mount at once on a phone. They arrive a
  // screenful at a time as the person reaches the end of the list.
  useEffect(() => { setVisible(24) }, [query, category, sort, onlyFavourites])
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

  const download = () => {
    if (!opened || !openedHtml) return
    const url = URL.createObjectURL(new Blob([openedHtml], { type: "text/html" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${opened.slug || "malik-site"}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <main className="malikLibrary">
      <div className="libWorkspace">
        <header className="libHero">
          <div>
            <span>Malik AI · Site Library</span>
            <h1>Библиотека</h1>
            <p>Сто готовых сайтов. Каждый открывается целиком, работает на телефоне и может стать основой вашего — «Использовать стиль» передаёт направление прямо в генератор.</p>
          </div>
          <div className="libHeroMeta">
            <b>{LIBRARY_TEMPLATES.length}</b>
            <small>шаблонов · {LIBRARY_CATEGORIES.length} категорий</small>
          </div>
        </header>

        <section className="libTools">
          <label className="libSearch">
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти сайт, категорию или направление…" />
            {query && <button type="button" aria-label="Очистить" onClick={() => setQuery("")}><X /></button>}
          </label>
          <select className="libSort" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Сортировка">
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button
            type="button"
            className={`libFavFilter${onlyFavourites ? " is-on" : ""}`}
            onClick={() => setOnlyFavourites((current) => !current)}
            aria-pressed={onlyFavourites}
          >
            <Star aria-hidden="true" /> Избранное{favourites.length ? ` · ${favourites.length}` : ""}
          </button>
        </section>

        <div className="libCategories">
          {["Все", ...LIBRARY_CATEGORIES].map((item) => (
            <button key={item} type="button" className={item === category ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>

        <section className="libHeading">
          <div><h2>{category === "Все" ? "Все направления" : category}</h2><p>{shown.length} из {LIBRARY_TEMPLATES.length} · клик по фото открывает настоящий сайт</p></div>
        </section>

        {shown.length === 0 ? (
          <p className="libEmpty">Ничего не нашлось. Попробуйте другое слово или снимите фильтр.</p>
        ) : (
          <section className="libGrid">
            {shown.slice(0, visible).map((template, position) => (
              <article className={`libCard${openCard === template.id ? " is-open" : ""}`} key={template.id}>
                <button
                  className="libShot"
                  onClick={() => {
                    if (!touchOnly || openCard === template.id) setOpened(template)
                    else setOpenCard(template.id)
                  }}
                  aria-label={touchOnly && openCard !== template.id ? `Показать описание: ${template.name}` : `Открыть сайт ${template.name}`}
                >
                  <img
                    src={template.preview}
                    alt=""
                    width={1280}
                    height={720}
                    loading={position < 6 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                  />
                </button>

                <button
                  type="button"
                  className={`libFav${favourites.includes(template.id) ? " is-on" : ""}`}
                  onClick={() => toggleFavourite(template.id)}
                  aria-label={favourites.includes(template.id) ? `Убрать ${template.name} из избранного` : `В избранное: ${template.name}`}
                  aria-pressed={favourites.includes(template.id)}
                >
                  <Star aria-hidden="true" />
                </button>

                {template.featured && <span className="libBadge"><Sparkles aria-hidden="true" /> Выбор Malik</span>}

                <span className="libShade" aria-hidden="true" />
                <span className="libMeta">
                  <b>{template.name}</b>
                  <small>{template.subcategory}</small>
                  <em style={{ ["--accent" as string]: LIBRARY_STYLES[template.category].accent }}>{template.category}</em>
                  <span className="libActions">
                    <button type="button" onClick={() => setOpened(template)}>Открыть</button>
                    <button type="button" className="is-primary" onClick={() => onUseStyle?.(libraryPrompt(template), template)}>Использовать стиль</button>
                  </span>
                </span>
              </article>
            ))}
          </section>
        )}

        <div ref={sentinelRef} aria-hidden="true" />
        {visible < shown.length && <p className="libMore">Показано {visible} из {shown.length} — прокрутите дальше</p>}
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
                <button type="button" onClick={download}><Download aria-hidden="true" /> Скачать HTML</button>
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
    .malikLibrary{width:100%;height:100%;overflow:auto;background:#000;color:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    .malikLibrary *{box-sizing:border-box}.malikLibrary button,.malikLibrary input,.malikLibrary select{font:inherit}.malikLibrary button{cursor:pointer}
    .libWorkspace{width:calc(100% - 30px);max-width:1760px;margin:0 auto;padding:20px 0 72px}
    .libHero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:4px 2px 18px;border-bottom:1px solid #17191d}
    .libHero>div>span{display:block;margin-bottom:6px;color:#747a84;font-size:10px}
    .libHero h1{margin:0;font-size:clamp(38px,4vw,54px);line-height:.95;letter-spacing:-.055em}
    .libHero p{max-width:820px;margin:8px 0 0;color:#8d929b;font-size:12px;line-height:1.55}
    .libHeroMeta{flex:0 0 auto;text-align:right}.libHeroMeta b{display:block;font-size:34px;line-height:1;letter-spacing:-.05em}.libHeroMeta small{display:block;margin-top:4px;color:#747a84;font-size:10px}
    .libTools{display:flex;align-items:center;gap:9px;padding-top:14px}
    .libSearch{height:40px;flex:1;display:flex;align-items:center;gap:9px;border:1px solid #2b2f36;background:#121417;border-radius:11px;padding:0 12px}
    .libSearch svg{width:16px;height:16px;color:#777d87;flex:0 0 auto}
    .libSearch input{width:100%;border:0;outline:0;background:transparent;color:#fff}
    .libSearch button{border:0;background:transparent;color:#8b909a;display:grid;place-items:center;padding:0}
    .libSort{height:40px;border:1px solid #2b2f36;background:#0c0e10;color:#c9cdd4;border-radius:11px;padding:0 10px;outline:0}
    .libFavFilter{height:40px;display:inline-flex;align-items:center;gap:7px;border:1px solid #2b2f36;background:#0c0e10;color:#c9cdd4;border-radius:11px;padding:0 12px;font-size:11px;white-space:nowrap}
    .libFavFilter svg{width:15px;height:15px}
    .libFavFilter.is-on{background:#fff;border-color:#fff;color:#000;font-weight:800}
    .libCategories{display:flex;gap:7px;overflow-x:auto;padding:10px 0 2px}
    .libCategories button{height:31px;border:1px solid #292d33;background:#0c0e10;color:#aeb2ba;border-radius:999px;padding:0 12px;font-size:10px;white-space:nowrap}
    .libCategories button.is-active{background:#fff;border-color:#fff;color:#000;font-weight:850}
    .libHeading{margin:16px 0 10px}.libHeading h2{margin:0;font-size:24px;letter-spacing:-.03em}.libHeading p{margin:4px 0 0;color:#747a84;font-size:10px}
    .libEmpty{color:#8b909a;font-size:12px;padding:28px 2px}
    .libMore{margin:14px 0 0;text-align:center;color:#6f757f;font-size:10px}

    .libGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;background:#000}
    .libCard{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:1px solid #16191d;border-radius:12px;background:#0a0b0d;isolation:isolate}
    .libShot{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:#0a0b0d;cursor:zoom-in;display:block}
    .libShot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;max-width:none;transform:scale(1);transition:transform .5s cubic-bezier(.22,.61,.36,1)}
    .libCard:hover .libShot img,.libCard:focus-within .libShot img{transform:scale(1.045)}
    .libShot:focus-visible{outline:2px solid #fff;outline-offset:-2px}
    .libFav{position:absolute;z-index:3;top:9px;right:9px;width:31px;height:31px;display:grid;place-items:center;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(8,9,11,.66);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#e7e9ed;padding:0}
    .libFav svg{width:15px;height:15px}
    .libFav.is-on{background:#fff;border-color:#fff;color:#111}.libFav.is-on svg{fill:currentColor}
    .libBadge{position:absolute;z-index:3;top:9px;left:9px;display:inline-flex;align-items:center;gap:5px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(8,9,11,.68);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:4px 8px;font-size:8px;letter-spacing:.02em}
    .libBadge svg{width:11px;height:11px}
    .libShade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,0) 34%,rgba(0,0,0,.34) 56%,rgba(0,0,0,.8) 78%,rgba(0,0,0,.96) 100%);opacity:0;transition:opacity .16s ease}
    .libMeta{position:absolute;left:0;right:0;bottom:0;padding:48px 11px 10px;display:grid;grid-template-columns:1fr auto;gap:3px 8px;opacity:0;transform:translateY(8px);transition:opacity .16s ease,transform .16s ease;pointer-events:none}
    .libMeta b{font-size:12.5px;text-shadow:0 1px 10px rgba(0,0,0,.85)}
    .libMeta small{grid-column:1;color:#dfe2e6;font-size:9px;text-shadow:0 1px 8px rgba(0,0,0,.85)}
    .libMeta em{grid-column:2;grid-row:1/3;align-self:start;border:1px solid var(--accent,rgba(255,255,255,.22));color:var(--accent,#fff);background:rgba(0,0,0,.55);border-radius:999px;padding:3px 7px;font-size:7.5px;font-style:normal;white-space:nowrap}
    .libActions{grid-column:1/-1;display:flex;gap:6px;margin-top:6px;pointer-events:auto}
    .libActions button{flex:1;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(10,12,15,.92);color:#fff;font-size:9.5px;font-weight:800}
    .libActions button.is-primary{background:#fff;border-color:#fff;color:#000}
    .libCard:hover .libShade,.libCard:hover .libMeta,.libCard:focus-within .libShade,.libCard:focus-within .libMeta,.libCard.is-open .libShade,.libCard.is-open .libMeta{opacity:1;transform:none}

    .libViewer{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.94);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
    .libViewerBox{width:min(1400px,97vw);height:min(92vh,980px);display:flex;flex-direction:column;background:#08090a;border:1px solid #2b2f36;border-radius:16px;overflow:hidden}
    .libViewerHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-bottom:1px solid #1e2229;flex-wrap:wrap}
    .libViewerHead b{display:block;font-size:15px;letter-spacing:-.02em}
    .libViewerHead small{display:block;margin-top:2px;color:#828892;font-size:10px}
    .libViewerActions{display:flex;gap:7px;flex-wrap:wrap}
    .libViewerActions button{height:34px;display:inline-flex;align-items:center;gap:6px;border-radius:9px;border:1px solid #2f333a;background:#111317;color:#fff;padding:0 11px;font-size:11px;font-weight:700}
    .libViewerActions button.is-primary{background:#fff;border-color:#fff;color:#000;font-weight:850}
    .libViewerActions svg{width:14px;height:14px}
    .libViewerBox iframe{flex:1;width:100%;border:0;display:block;background:#000}

    @media(max-width:1120px){.libGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:720px){
      .libWorkspace{width:calc(100% - 16px);padding-top:12px}
      .libHero{display:block;padding-bottom:14px}.libHero h1{font-size:34px}.libHeroMeta{text-align:left;margin-top:12px;display:flex;align-items:baseline;gap:8px}.libHeroMeta b{font-size:26px}
      .libTools{display:grid;grid-template-columns:1fr auto;gap:8px}.libSearch{grid-column:1/-1}
      .libGrid{grid-template-columns:1fr;gap:10px}
      .libMeta{padding:64px 12px 12px}.libMeta b{font-size:15px}.libMeta small{font-size:10.5px}
      .libActions button{height:38px;font-size:11.5px}
      .libViewerBox{width:100%;height:94vh;border-radius:14px}
      .libViewerActions{width:100%}.libViewerActions button{flex:1;justify-content:center}
    }
  `}</style>
}

export default SiteLibraryPanel
