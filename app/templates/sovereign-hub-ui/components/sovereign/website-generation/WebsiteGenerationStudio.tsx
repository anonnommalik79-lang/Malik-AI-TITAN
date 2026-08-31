"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  ArrowLeft,
  Code2,
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { HOME_MALIK_TEMPLATES, type MalikTemplate } from "@/lib/malik-template-registry"

export type WebsiteGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type Site = {
  id: string
  title: string
  prompt: string
  html: string
  createdAt: string
}

const ENDPOINT = "/api/generate/website"
const STORAGE_KEY = "malik-sites-v4"
const DEFAULT_PROMPT =
  "Создай современный премиальный сайт мирового уровня: сильный hero, чистая типографика, адаптивная сетка, продукт в центре, доверие, CTA, FAQ и цельная визуальная система."

const TEMPLATES = HOME_MALIK_TEMPLATES.slice(0, 30)

function normalizeHtml(value: string) {
  return value
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

export function WebsiteGenerationStudio({
  onOpenCodex,
  onOpenCanvas,
}: WebsiteGenerationStudioProps) {
  const [sites, setSites] = useState<Site[]>([])
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("Все")
  const [builder, setBuilder] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [html, setHtml] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
      if (Array.isArray(stored)) setSites(stored.slice(0, 24))
    } catch {}
  }, [])

  const saveSites = (next: Site[]) => {
    setSites(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 24)))
    } catch {}
  }

  const categories = useMemo(
    () => ["Все", ...Array.from(new Set(TEMPLATES.map((item) => item.category)))],
    [],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TEMPLATES.filter((item) => {
      const categoryMatches = category === "Все" || item.category === category
      const queryMatches =
        !q ||
        `${item.title} ${item.description} ${item.category} ${item.hero}`
          .toLowerCase()
          .includes(q)
      return categoryMatches && queryMatches
    })
  }, [query, category])

  const useTemplate = (template: MalikTemplate) => {
    setPrompt(template.prompt)
    setHtml("")
    setError("")
    setBuilder(true)
  }

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError("")
    setHtml("")

    try {
      const response = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        },
        120000,
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : `Ошибка генерации (${response.status})`,
        )
      }

      const rawHtml =
        typeof data?.html === "string"
          ? data.html
          : typeof data?.content === "string"
            ? data.content
            : ""
      const output = normalizeHtml(rawHtml)
      if (!output) throw new Error("Генератор вернул пустой HTML")

      setHtml(output)
      const site: Site = {
        id: crypto.randomUUID(),
        title: prompt.slice(0, 52) || "Новый сайт",
        prompt,
        html: output,
        createdAt: new Date().toISOString(),
      }
      saveSites([site, ...sites.filter((item) => item.html !== output)].slice(0, 24))
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Ошибка генерации")
    } finally {
      setLoading(false)
    }
  }

  const importHtml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const output = await file.text()
    setHtml(output)
    setPrompt(`Импортированный сайт: ${file.name}`)
    setError("")
    setBuilder(true)
    event.target.value = ""
  }

  const openInNewTab = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  if (builder) {
    return (
      <main className="malikSites">
        <div className="sitesWorkspace sitesBuilder">
          <header className="builderHero">
            <div className="builderTitle">
              <button className="backButton" onClick={() => setBuilder(false)} aria-label="Назад">
                <ArrowLeft />
              </button>
              <div>
                <span>Сайты · Malik AI Website Studio</span>
                <h1>Создать сайт</h1>
                <p>
                  Опишите результат или выберите направление. Malik AI соберёт HTML, CSS и JS и
                  сразу покажет живой предпросмотр.
                </p>
              </div>
            </div>
          </header>

          <section className="builderPanel">
            <div className="stepTitle">
              <b>1</b>
              <div>
                <strong>Описание сайта</strong>
                <small>Цель, аудитория, структура, продукт и настроение.</small>
              </div>
            </div>
            <textarea
              className="promptBox"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Опишите сайт, который хотите создать…"
            />
            {error && <p className="siteError">{error}</p>}
          </section>

          <section className="builderPanel">
            <div className="stepTitle">
              <b>2</b>
              <div>
                <strong>Быстрые направления</strong>
                <small>Выберите премиальный стиль и при желании доработайте prompt.</small>
              </div>
            </div>
            <div className="quickGrid">
              {TEMPLATES.slice(0, 6).map((template) => (
                <button key={template.id} onClick={() => setPrompt(template.prompt)}>
                  <img src={template.preview} alt="" loading="lazy" />
                  <span>{template.title}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="builderActions">
            <button className="primaryButton" disabled={loading || !prompt.trim()} onClick={generate}>
              {loading ? <Loader2 className="spin" /> : <Globe2 />}
              {loading ? "Генерация…" : "Сгенерировать сайт"}
            </button>
            <button className="secondaryButton" onClick={() => fileRef.current?.click()}>
              <Upload /> Импорт HTML
            </button>
            <button className="secondaryButton" onClick={onOpenCodex}>
              <Code2 /> Код
            </button>
            {onOpenCanvas && (
              <button className="secondaryButton" disabled={!html} onClick={() => onOpenCanvas(html)}>
                Canvas
              </button>
            )}
            <button className="secondaryButton" disabled={!html} onClick={openInNewTab}>
              <ExternalLink /> Открыть
            </button>
          </div>

          {html && (
            <section className="livePreview">
              <div className="browserBar">
                <i />
                <i />
                <i />
                <span>Live preview</span>
              </div>
              <iframe
                title="Generated website"
                srcDoc={html}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
              />
            </section>
          )}

          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".html,.htm,text/html"
            onChange={importHtml}
          />
        </div>
        <SitesCss />
      </main>
    )
  }

  return (
    <main className="malikSites">
      <div className="sitesWorkspace">
        <header className="galleryHero">
          <div>
            <span>Malik AI · Website Studio</span>
            <h1>Сайты</h1>
            <p>
              30 премиальных направлений с реальными широкими превью. Выберите стиль и сразу
              переходите к генерации рабочего сайта.
            </p>
          </div>
          <button
            className="primaryButton createButton"
            onClick={() => {
              setPrompt(DEFAULT_PROMPT)
              setHtml("")
              setError("")
              setBuilder(true)
            }}
          >
            <Plus /> Создать сайт
          </button>
        </header>

        <section className="galleryTools">
          <label className="searchField">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск шаблонов…"
            />
          </label>
          <span className="templateCount">{shown.length} шаблонов</span>
        </section>

        <div className="categoryRow">
          {categories.map((item) => (
            <button
              key={item}
              className={item === category ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <section className="galleryHeading">
          <div>
            <h2>Премиальные шаблоны</h2>
            <p>Широкие 16:9 фото-превью. Desktop — 3 в ряд, mobile — отдельная одна колонка.</p>
          </div>
        </section>

        <section className="templateGrid">
          {shown.map((template) => (
            <article className="templateCard" key={template.id}>
              <button
                className="templateMedia"
                onClick={() => useTemplate(template)}
                aria-label={`Использовать ${template.title}`}
              >
                <img src={template.preview} alt={template.title} loading="lazy" />
              </button>
              <div className="templateCopy">
                <div className="templateTopline">
                  <strong>{template.title}</strong>
                  <span>{template.category}</span>
                </div>
                <small>{template.hero}</small>
                <p>{template.description}</p>
                <button className="useStyle" onClick={() => useTemplate(template)}>
                  Использовать стиль
                </button>
              </div>
            </article>
          ))}
        </section>

        {sites.length > 0 && (
          <section className="savedSites">
            <h2>Мои сайты</h2>
            {sites.map((site) => (
              <div className="savedRow" key={site.id}>
                <button
                  onClick={() => {
                    setPrompt(site.prompt)
                    setHtml(site.html)
                    setError("")
                    setBuilder(true)
                  }}
                >
                  <b>{site.title}</b>
                  <small>{new Date(site.createdAt).toLocaleString("ru-RU")}</small>
                </button>
                <button
                  className="deleteSite"
                  aria-label="Удалить сайт"
                  onClick={() => saveSites(sites.filter((item) => item.id !== site.id))}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </section>
        )}

        <input
          ref={fileRef}
          hidden
          type="file"
          accept=".html,.htm,text/html"
          onChange={importHtml}
        />
      </div>
      <SitesCss />
    </main>
  )
}

function SitesCss() {
  return (
    <style jsx global>{`
      .malikSites {
        width: 100%;
        height: 100%;
        overflow: auto;
        background: #000;
        color: #f7f7f8;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .malikSites * { box-sizing: border-box; }
      .malikSites button, .malikSites input, .malikSites textarea { font: inherit; }
      .malikSites button { cursor: pointer; }
      .sitesWorkspace {
        width: calc(100% - 30px);
        max-width: 1760px;
        margin: 0 auto;
        padding: 20px 0 64px;
      }
      .galleryHero, .builderHero {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 4px 2px 18px;
        border-bottom: 1px solid #17191d;
      }
      .galleryHero > div > span, .builderTitle > div > span {
        display: block;
        margin-bottom: 6px;
        color: #747a84;
        font-size: 10px;
      }
      .galleryHero h1, .builderHero h1 {
        margin: 0;
        font-size: clamp(38px, 4vw, 54px);
        line-height: .95;
        letter-spacing: -.055em;
      }
      .galleryHero p, .builderHero p {
        max-width: 800px;
        margin: 8px 0 0;
        color: #8d929b;
        font-size: 12px;
        line-height: 1.55;
      }
      .primaryButton, .secondaryButton {
        min-height: 40px;
        border-radius: 11px;
        padding: 0 15px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-weight: 800;
      }
      .primaryButton { border: 0; background: #fff; color: #000; }
      .secondaryButton { border: 1px solid #30343b; background: #0d0f12; color: #fff; }
      .primaryButton svg, .secondaryButton svg { width: 16px; height: 16px; }
      .primaryButton:disabled, .secondaryButton:disabled { opacity: .45; cursor: not-allowed; }
      .galleryTools { display: flex; align-items: center; gap: 9px; padding-top: 14px; }
      .searchField {
        height: 40px;
        flex: 1;
        display: flex;
        align-items: center;
        gap: 9px;
        border: 1px solid #2b2f36;
        background: #121417;
        border-radius: 11px;
        padding: 0 12px;
      }
      .searchField svg { width: 16px; color: #777d87; }
      .searchField input { width: 100%; border: 0; outline: 0; background: transparent; color: #fff; }
      .templateCount {
        height: 40px;
        display: inline-flex;
        align-items: center;
        border: 1px solid #292d34;
        background: #0c0e10;
        border-radius: 11px;
        padding: 0 12px;
        color: #a9aeb7;
        font-size: 10px;
        white-space: nowrap;
      }
      .categoryRow { display: flex; gap: 7px; overflow-x: auto; padding: 10px 0 2px; }
      .categoryRow button {
        height: 31px;
        border: 1px solid #292d33;
        background: #0c0e10;
        color: #aeb2ba;
        border-radius: 999px;
        padding: 0 11px;
        font-size: 10px;
        white-space: nowrap;
      }
      .categoryRow button.active { background: #fff; border-color: #fff; color: #000; font-weight: 850; }
      .galleryHeading { margin: 16px 0 10px; }
      .galleryHeading h2, .savedSites h2 { margin: 0; font-size: 24px; letter-spacing: -.03em; }
      .galleryHeading p { margin: 4px 0 0; color: #747a84; font-size: 10px; }
      .templateGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .templateCard {
        overflow: hidden;
        border: 1px solid #20242a;
        background: #08090a;
        border-radius: 15px;
        transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }
      .templateCard:hover { transform: translateY(-3px); border-color: #444a55; box-shadow: 0 18px 42px rgba(0,0,0,.42); }
      .templateMedia {
        width: 100%;
        aspect-ratio: 16 / 9;
        display: block;
        overflow: hidden;
        border: 0;
        border-bottom: 1px solid #1c1f24;
        background: #050505;
        padding: 0;
      }
      .templateMedia img, .quickGrid img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform .35s ease, filter .18s ease;
      }
      .templateCard:hover .templateMedia img { transform: scale(1.018); filter: brightness(1.035); }
      .templateCopy { padding: 10px 11px 11px; }
      .templateTopline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .templateTopline strong { font-size: 13px; }
      .templateTopline span {
        border: 1px solid #30343c;
        background: #0c0e11;
        color: #b9bec7;
        border-radius: 999px;
        padding: 4px 7px;
        font-size: 8px;
        white-space: nowrap;
      }
      .templateCopy small { display: block; margin-top: 3px; color: #686e78; font-size: 9px; }
      .templateCopy p { min-height: 30px; margin: 8px 0 10px; color: #aeb3bc; font-size: 10px; line-height: 1.45; }
      .useStyle {
        width: 100%;
        height: 34px;
        border-radius: 9px;
        border: 1px solid #30343b;
        background: #0d0f12;
        color: #fff;
        font-size: 10px;
        font-weight: 800;
      }
      .savedSites { margin-top: 28px; }
      .savedRow { display: grid; grid-template-columns: 1fr auto; border-top: 1px solid #1b1e23; padding: 8px 0; }
      .savedRow button { border: 0; background: transparent; color: #fff; text-align: left; }
      .savedRow small { display: block; margin-top: 3px; color: #6f7580; font-size: 9px; }
      .deleteSite svg { width: 16px; }
      .builderTitle { display: flex; gap: 12px; align-items: flex-start; }
      .backButton {
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        border-radius: 11px;
        border: 1px solid #292d34;
        background: #0d0f12;
        color: #fff;
      }
      .backButton svg { width: 17px; }
      .builderPanel {
        margin-top: 12px;
        border: 1px solid #1d2025;
        background: linear-gradient(180deg, #070708, #040404);
        border-radius: 16px;
        padding: 14px;
      }
      .stepTitle { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 11px; }
      .stepTitle > b {
        width: 26px;
        height: 26px;
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: #fff;
        color: #000;
        font-size: 11px;
      }
      .stepTitle strong { display: block; font-size: 14px; }
      .stepTitle small { display: block; margin-top: 3px; color: #737985; font-size: 10px; }
      .promptBox {
        width: 100%;
        min-height: 105px;
        resize: vertical;
        border: 1px solid #30343c;
        background: #15171a;
        color: #fff;
        border-radius: 11px;
        padding: 13px;
        outline: none;
      }
      .promptBox:focus { border-color: #4c515c; }
      .siteError { margin: 9px 0 0; color: #ff7b7b; font-size: 10px; }
      .quickGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .quickGrid button {
        position: relative;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border: 1px solid #20242a;
        background: #050505;
        border-radius: 11px;
        padding: 0;
        color: #fff;
      }
      .quickGrid span {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 24px 9px 7px;
        background: linear-gradient(transparent, rgba(0,0,0,.9));
        text-align: left;
        font-size: 9px;
        font-weight: 800;
      }
      .builderActions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px; }
      .livePreview { margin-top: 13px; overflow: hidden; border: 1px solid #242830; border-radius: 14px; }
      .browserBar {
        height: 36px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        border-bottom: 1px solid #24272d;
        background: #101216;
      }
      .browserBar i { width: 7px; height: 7px; border-radius: 50%; background: #4b5058; }
      .browserBar span { margin-left: 6px; color: #777d87; font-size: 9px; }
      .livePreview iframe { width: 100%; height: 650px; display: block; border: 0; background: #fff; }
      .spin { animation: siteSpin 1s linear infinite; }
      @keyframes siteSpin { to { transform: rotate(360deg); } }
      @media (max-width: 1120px) {
        .templateGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        .sitesWorkspace { width: calc(100% - 16px); padding-top: 12px; }
        .galleryHero h1, .builderHero h1 { font-size: 38px; }
        .createButton { display: none; }
        .galleryTools { display: block; }
        .templateCount { margin-top: 8px; height: 31px; }
        .templateGrid { grid-template-columns: 1fr; gap: 9px; }
        .templateCopy p { min-height: 0; }
        .quickGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .builderActions .primaryButton, .builderActions .secondaryButton { flex: 1 1 145px; }
        .livePreview iframe { height: 480px; }
      }
    `}</style>
  )
}
