"use client"

import { useMemo, useState } from "react"
import {
  Aperture,
  Camera,
  Download,
  ImageIcon,
  Layers,
  Palette,
  Sparkles,
  Wand2,
  Maximize2,
  RefreshCw,
  Cpu,
  ChevronRight,
} from "lucide-react"
import { canUseGeneration, incrementUsage } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { PHOTO_GALLERY_EXAMPLES, PHOTO_STYLE_PRESETS } from "@/lib/media-library"

export type PhotoGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type PhotoResult = {
  url: string
  prompt?: string
  filename?: string
  fallback?: boolean
  provider?: string
}

type StylePreset = {
  id: string
  title: string
  body: string
  tag: string
  photo: string
  tint: string
}

const ENDPOINT = "/api/media/image"

function styleToMode(styleId: string): "cinematic" | "realistic" | "product" | "design" {
  if (/product|saas|ui|dashboard/i.test(styleId)) return "product"
  if (/portrait|real|photo/i.test(styleId)) return "realistic"
  if (/design|brand|logo/i.test(styleId)) return "design"
  return "cinematic"
}
const DEFAULT_PROMPT =
  "Киберпанковская AI-студия в Астане: премиальный SaaS-дашборд, синие и фиолетовые огни, кинематографичный продуктовый кадр, мокрый асфальт, неоновые отражения."

const STYLE_PRESETS: StylePreset[] = PHOTO_STYLE_PRESETS

const PROMPT_CHIPS = [
  "Киберпанковский мегаполис ночью, дождь, неоновые вывески, отражения на мокром асфальте",
  "Премиальный AI-продукт на чёрном фоне, стеклянный интерфейс, инвесторская демо-сцена",
  "Портрет основателя в неоновой AI-студии, кинематографичный свет, Digital Bridge 2026",
  "Футуристичный дата-центр Казахстана, тёмно-синее освещение, enterprise-инфраструктура",
]

const GALLERY_EXAMPLES = PHOTO_GALLERY_EXAMPLES

const RATIOS = ["1:1", "16:9", "9:16", "4:3"] as const

function localSvgDataUrl(prompt: string, style: string) {
  const safe = (prompt || "Malik Vision").slice(0, 100)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1344" height="768" viewBox="0 0 1344 768"><defs><radialGradient id="g" cx="25%" cy="15%" r="80%"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#020617"/></radialGradient></defs><rect width="1344" height="768" fill="url(#g)"/><text x="80" y="120" fill="#e2e8f0" font-family="system-ui" font-size="36" font-weight="700">Malik Vision</text><text x="80" y="170" fill="#94a3b8" font-family="system-ui" font-size="18">${style}</text><foreignObject x="80" y="520" width="1100" height="120"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:system-ui;color:#cbd5e1;font-size:22px;line-height:1.3">${safe}</div></foreignObject></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function canvasArtifact(prompt: string, imageUrl: string, operator: string) {
  const safePrompt = prompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Photo Generation · Malik Vision</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#030303;color:#e8eae9;min-height:100vh;padding:40px 20px}.wrap{max-width:960px;margin:0 auto}h1{font-size:28px;margin:0 0 8px}p{color:#94a3b8;line-height:1.6}img{width:100%;border-radius:18px;border:1px solid rgba(255,255,255,.1);margin-top:24px}.meta{margin-top:16px;font-size:12px;color:#64748b}</style></head>
<body><div class="wrap"><h1>Malik Vision · Photo</h1><p>${safePrompt}</p><img src="${imageUrl}" alt="Generated"/><p class="meta">Оператор: ${operator}</p></div></body></html>`
}

export function PhotoGenerationStudio({
  username,
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: PhotoGenerationStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [activeStyle, setActiveStyle] = useState(STYLE_PRESETS[0].id)
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>("16:9")
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("Студия готова к рендеру")
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<PhotoResult[]>([])
  const [providerUsed, setProviderUsed] = useState("")
  const [remainingDaily, setRemainingDaily] = useState<number | null>(null)

  const styleMeta = useMemo(
    () => STYLE_PRESETS.find((s) => s.id === activeStyle) ?? STYLE_PRESETS[0],
    [activeStyle],
  )

  const heroPhoto = results[0]?.url ?? styleMeta.photo

  const generate = async () => {
    if (!prompt.trim()) {
      setError("Введите описание изображения")
      return
    }
    if (!canUseGeneration("image", operator)) {
      setError("Достигнут лимит бесплатной генерации изображений")
      setStatus("Лимит исчерпан")
      return
    }
    incrementUsage("image")
    setLoading(true)
    setError(null)
    setStatus("Рендерю кадр…")
    try {
      const res = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            aspectRatio: ratio,
            mode: styleToMode(activeStyle),
            userEmail: operator,
          }),
        },
        95_000,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Ошибка ${res.status}`)
      const imageUrl = data.imageUrl || data.url
      if (!imageUrl) throw new Error("Сервер не вернул imageUrl")
      const next: PhotoResult = {
        url: imageUrl,
        prompt,
        provider: data.provider,
        fallback: data.provider === "pollinations",
      }
      setProviderUsed(String(data.provider || ""))
      setRemainingDaily(typeof data.remainingDailyImages === "number" ? data.remainingDailyImages : null)
      setResults((prev) => [next, ...prev].slice(0, 8))
      setStatus(data.provider === "pollinations" ? "Резервный провайдер: Pollinations" : `Готово · ${data.provider || "stability"}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Генерация изображения недоступна")
      setStatus("Ошибка генерации")
    } finally {
      setLoading(false)
    }
  }

  const sendCanvas = () => {
    const url = results[0]?.url ?? heroPhoto
    onOpenCanvas?.(canvasArtifact(prompt, url, operator))
    setStatus("Кадр отправлен в Canvas")
  }

  const reset = () => {
    onNewChat?.()
    setPrompt(DEFAULT_PROMPT)
    setResults([])
    setError(null)
    setStatus("Студия готова к рендеру")
  }

  return (
    <main className="pgs" data-view="photo-generation">
      <div className="pgs__bg" aria-hidden="true" />
      <div className="pgs__inner">

        <div className="pgs__status">
          <span className="pgs__status-left">
            <span className="pgs__dot" />
            <span className="pgs__status-key">Malik Vision</span>
            <strong className="pgs__status-val">Онлайн</strong>
          </span>
          <span className="pgs__status-right">
            Статус рендера
            <strong>{loading ? "в работе" : "готов"}</strong>
            {providerUsed && <strong> · {providerUsed}</strong>}
            {remainingDaily !== null && <strong> · осталось {remainingDaily}</strong>}
          </span>
        </div>

        <header className="pgs__head">
          <span className="pgs__eyebrow"><Camera size={13} /> Визуальная студия</span>
          <h1 className="pgs__title">Photo Generation</h1>
          <p className="pgs__lede">
            Премиальная фото-студия для AI-продуктов. Опишите кадр — получите кинематографичное изображение
            с пресетами стилей, галереей примеров и мгновенным экспортом в Canvas. Каждая полка — визуальный
            мир, а не пустая форма.
          </p>
        </header>

        {/* Hero shelf — dominant photo */}
        <section className="pgs__shelf pgs__hero">
          <div
            className="pgs__hero-media"
            style={{ backgroundImage: `url(${heroPhoto})` }}
            role="img"
            aria-label="Текущий визуальный кадр"
          >
            <div className="pgs__hero-overlay" style={{ background: styleMeta.tint }} />
            <div className="pgs__hero-caption">
              <span className="pgs__shelf-label"><Aperture size={13} /> Текущий кадр</span>
              <h2 className="pgs__shelf-title">{styleMeta.title}</h2>
              <p>{status}</p>
            </div>
          </div>
          <div className="pgs__hero-copy">
            <span className="pgs__shelf-label">Что это и как использовать</span>
            <h2 className="pgs__shelf-title">От идеи до готового кадра</h2>
            <p>
              Photo Generation — это визуальная лаборатория Malik AI. Вы задаёте промпт, выбираете стиль и
              соотношение сторон, а движок Vision XL рендерит кадр через <code>{ENDPOINT}</code> с безопасным
              резервным режимом, если провайдер недоступен.
            </p>
            <ol className="pgs__steps">
              <li><span className="pgs__step-num">1</span><div><strong>Опишите сцену.</strong> Промпт-лаборатория принимает детальное описание света, композиции и настроения.</div></li>
              <li><span className="pgs__step-num">2</span><div><strong>Выберите стиль.</strong> Пресеты с фото-превью задают визуальное направление — киберпанк, портрет, студия.</div></li>
              <li><span className="pgs__step-num">3</span><div><strong>Запустите рендер.</strong> Кнопка «Сгенерировать» вызывает API и показывает результат в галерее.</div></li>
              <li><span className="pgs__step-num">4</span><div><strong>Экспортируйте.</strong> Отправьте кадр в Canvas или переходите к Video Generation.</div></li>
            </ol>
          </div>
        </section>

        {/* Prompt lab */}
        <section className="pgs__shelf pgs__prompt">
          <div className="pgs__prompt-head">
            <div>
              <span className="pgs__shelf-label"><Wand2 size={13} /> Промпт-лаборатория</span>
              <h2 className="pgs__shelf-title">Опишите изображение</h2>
            </div>
            <div className="pgs__ratio-pills" role="group" aria-label="Соотношение сторон">
              {RATIOS.map((r) => (
                <button key={r} type="button" data-active={ratio === r ? "1" : "0"} onClick={() => setRatio(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="pgs__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Опишите сцену: свет, композиция, настроение, детали…"
          />
          <div className="pgs__chips">
            {PROMPT_CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setPrompt(chip)}>
                {chip.slice(0, 52)}…
              </button>
            ))}
          </div>
          {error ? <p className="pgs__error">{error}</p> : null}
          <div className="pgs__actions">
            <button type="button" className="pgs__btn pgs__btn--primary" onClick={generate} disabled={loading}>
              <Sparkles size={15} />
              {loading ? "Рендерю…" : "Сгенерировать"}
            </button>
            <button type="button" className="pgs__btn pgs__btn--ghost" onClick={sendCanvas}>
              <Maximize2 size={15} /> В Canvas
            </button>
            <button type="button" className="pgs__btn pgs__btn--ghost" onClick={onOpenCodex}>
              <Cpu size={15} /> Cortex
            </button>
            <button type="button" className="pgs__btn pgs__btn--ghost" onClick={reset}>
              <RefreshCw size={15} /> Сброс
            </button>
          </div>
        </section>

        {/* Style presets — photo cards */}
        <section className="pgs__styles" aria-label="Пресеты стилей">
          <div className="pgs__section-head">
            <div>
              <span className="pgs__shelf-label"><Palette size={13} /> Стили</span>
              <h2 className="pgs__shelf-title">Визуальные пресеты с превью</h2>
            </div>
          </div>
          <div className="pgs__style-grid">
            {STYLE_PRESETS.map((preset) => (
              <article
                key={preset.id}
                data-active={activeStyle === preset.id ? "1" : "0"}
                onClick={() => {
                  setActiveStyle(preset.id)
                  setStatus(`Стиль «${preset.title}» выбран`)
                }}
                onKeyDown={(e) => e.key === "Enter" && setActiveStyle(preset.id)}
                role="button"
                tabIndex={0}
              >
                <div className="pgs__style-photo" style={{ backgroundImage: `url(${preset.photo})` }}>
                  <div className="pgs__style-tint" style={{ background: preset.tint }} />
                  <span className="pgs__style-tag">{preset.tag}</span>
                </div>
                <div className="pgs__style-body">
                  <strong>{preset.title}</strong>
                  <p>{preset.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Results gallery */}
        {results.length > 0 ? (
          <section className="pgs__shelf pgs__results" aria-label="Ваши результаты">
            <span className="pgs__shelf-label"><ImageIcon size={13} /> Ваш рендер</span>
            <h2 className="pgs__shelf-title">Сгенерированные кадры</h2>
            <div className="pgs__gallery">
              {results.map((item, i) => (
                <figure key={`${item.url}-${i}`} className="pgs__gallery-item pgs__gallery-item--hero">
                  <div className="pgs__gallery-photo" style={{ backgroundImage: `url(${item.url})` }}>
                    {item.fallback ? <span className="pgs__fallback-badge">Резерв</span> : null}
                  </div>
                  <figcaption>{item.prompt?.slice(0, 80)}…</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {/* Example gallery */}
        <section className="pgs__gallery-section" aria-label="Галерея примеров">
          <div className="pgs__section-head">
            <div>
              <span className="pgs__shelf-label"><Layers size={13} /> Галерея</span>
              <h2 className="pgs__shelf-title">Примеры кинематографичных кадров</h2>
            </div>
            <button type="button" className="pgs__link-btn" onClick={() => onViewChange("video-generation")}>
              Видео →
            </button>
          </div>
          <div className="pgs__gallery">
            {GALLERY_EXAMPLES.map((ex) => (
              <figure key={ex.title} className="pgs__gallery-item">
                <button
                  type="button"
                  className="pgs__gallery-photo"
                  style={{ backgroundImage: `url(${ex.photo})` }}
                  onClick={() => {
                    setPrompt(ex.prompt)
                    setStatus(`Промпт из «${ex.title}» подставлен`)
                  }}
                >
                  <span className="pgs__gallery-use"><Download size={14} /> Использовать</span>
                </button>
                <figcaption>
                  <strong>{ex.title}</strong>
                  <span>{ex.prompt}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="pgs__shelf pgs__cta">
          <div className="pgs__cta-copy">
            <span className="pgs__shelf-label">Визуальный стандарт</span>
            <h2 className="pgs__shelf-title">Кадры уровня Digital Bridge.</h2>
            <p>Каждый рендер готов к демо-сцене, питч-деку или продуктовой странице — без доработки в сторонних редакторах.</p>
          </div>
          <div className="pgs__actions">
            <button type="button" className="pgs__btn pgs__btn--primary" onClick={generate} disabled={loading}>
              <Sparkles size={15} />
              {loading ? "Рендерю…" : "Сгенерировать кадр"}
            </button>
            <button type="button" className="pgs__btn pgs__btn--ghost" onClick={() => onViewChange("video-generation")}>
              Video Generation <ChevronRight size={15} />
            </button>
          </div>
        </section>

        <footer className="pgs__footer">
          <span><Camera size={12} /> Malik Vision XL v2</span>
          <span>Оператор · {operator}</span>
          <span>Эндпоинт · {ENDPOINT}</span>
          <span className="pgs__footer-comp"><Sparkles size={12} /> 34 пресета · Canvas export</span>
        </footer>
      </div>

      <style jsx>{`
        .pgs {
          position: relative;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: clamp(96px, 8vw, 116px) clamp(16px, 3vw, 44px) 88px;
          color: #e7eae8;
          -webkit-font-smoothing: antialiased;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
        }
        .pgs::-webkit-scrollbar { width: 6px; }
        .pgs::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
        @media (max-width: 920px) { .pgs { padding-top: clamp(20px, 3vw, 32px); } }
        .pgs__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(55% 40% at 12% 0%, rgba(211, 162, 62, 0.06), transparent 60%),
            radial-gradient(45% 35% at 95% 4%, rgba(217, 174, 69, 0.05), transparent 62%);
        }
        .pgs__inner { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; }
        .pgs__shelf-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8ba3b8;
        }
        .pgs__status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          margin-bottom: 30px;
        }
        .pgs__status-left { display: inline-flex; align-items: center; gap: 10px; }
        .pgs__dot { width: 8px; height: 8px; border-radius: 999px; background: #f0d288; }
        .pgs__status-key { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a958f; }
        .pgs__status-val { font-size: 12.5px; font-weight: 700; color: #dbeafe; }
        .pgs__status-right { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a958f; }
        .pgs__status-right strong { margin-left: 8px; font-weight: 700; color: #f8e5ac; }
        .pgs__head { max-width: 70ch; margin: 0 0 40px; }
        .pgs__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #8ba3b8;
          margin-bottom: 18px;
        }
        .pgs__title {
          margin: 0 0 18px;
          font-size: clamp(38px, 6vw, 64px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #f4f6f5;
        }
        .pgs__lede {
          margin: 0;
          font-size: clamp(16px, 1.7vw, 20px);
          line-height: 1.55;
          color: #aab4af;
          max-width: 60ch;
        }
        .pgs__shelf {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 38px);
          margin-bottom: 22px;
        }
        .pgs__shelf-title {
          margin: 14px 0 14px;
          font-size: clamp(20px, 2.3vw, 27px);
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -0.015em;
          color: #f1f4f2;
        }
        .pgs__hero {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
          gap: clamp(20px, 3vw, 32px);
          padding: 0;
          overflow: hidden;
          border: none;
          background: transparent;
        }
        @media (max-width: 900px) { .pgs__hero { grid-template-columns: 1fr; } }
        .pgs__hero-media {
          position: relative;
          min-height: 340px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background-size: cover;
          background-position: center;
          overflow: hidden;
        }
        .pgs__hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 30%, rgba(3, 3, 3, 0.85) 100%);
        }
        .pgs__hero-caption {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 28px;
        }
        .pgs__hero-caption p { margin: 8px 0 0; font-size: 13px; color: #b8c4be; }
        .pgs__hero-copy {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          padding: clamp(24px, 3vw, 32px);
        }
        .pgs__hero-copy p {
          margin: 0 0 14px;
          font-size: 15px;
          line-height: 1.7;
          color: #a7b2ac;
        }
        .pgs__hero-copy code {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 12px;
          color: #f0d288;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          padding: 1px 6px;
        }
        .pgs__steps { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
        .pgs__steps li { display: flex; gap: 14px; align-items: flex-start; }
        .pgs__step-num {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          color: #f8e5ac;
          border: 1px solid rgba(240, 210, 136, 0.28);
          background: rgba(211, 162, 62, 0.08);
        }
        .pgs__steps li div { font-size: 14px; line-height: 1.6; color: #9aa6a0; }
        .pgs__steps strong { display: block; color: #e7ece9; font-weight: 600; margin-bottom: 2px; }
        .pgs__prompt-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .pgs__prompt-head .pgs__shelf-title { margin-bottom: 0; }
        .pgs__ratio-pills { display: flex; gap: 8px; flex-wrap: wrap; }
        .pgs__ratio-pills button {
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          background: transparent;
          color: #aab4af;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 12px;
          cursor: pointer;
          transition: border-color 0.16s, background 0.16s, color 0.16s;
        }
        .pgs__ratio-pills button[data-active="1"] {
          border-color: rgba(240, 210, 136, 0.45);
          background: rgba(211, 162, 62, 0.1);
          color: #dbeafe;
        }
        .pgs__textarea {
          width: 100%;
          resize: vertical;
          min-height: 110px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          color: #e7ece9;
          font-size: 15px;
          line-height: 1.65;
          padding: 16px 18px;
          font-family: inherit;
        }
        .pgs__textarea:focus { outline: none; border-color: rgba(240, 210, 136, 0.35); }
        .pgs__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .pgs__chips button {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.03);
          color: #9aa6a0;
          font-size: 12px;
          padding: 8px 14px;
          cursor: pointer;
          transition: border-color 0.16s, color 0.16s;
        }
        .pgs__chips button:hover { border-color: rgba(255, 255, 255, 0.22); color: #e7ece9; }
        .pgs__error { margin: 12px 0 0; font-size: 13px; color: #e8a87c; }
        .pgs__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
        .pgs__btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          border-radius: 10px;
          padding: 11px 18px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.16s, border-color 0.16s, color 0.16s, opacity 0.16s;
        }
        .pgs__btn--primary { background: #f5f6f5; color: #0c1310; border-color: #f5f6f5; }
        .pgs__btn--primary:hover:not(:disabled) { background: #e3e6e4; }
        .pgs__btn--primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .pgs__btn--ghost {
          background: transparent;
          color: #cdd6d1;
          border-color: rgba(255, 255, 255, 0.16);
        }
        .pgs__btn--ghost:hover { background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.28); color: #f1f4f2; }
        .pgs__link-btn {
          background: none;
          border: none;
          color: #8ba3b8;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }
        .pgs__link-btn:hover { color: #eef3f0; }
        .pgs__section-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .pgs__section-head .pgs__shelf-title { margin-bottom: 0; }
        .pgs__styles, .pgs__gallery-section { margin-bottom: 22px; }
        .pgs__style-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }
        .pgs__style-grid article {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
          overflow: hidden;
          cursor: pointer;
          transition: border-color 0.18s, transform 0.18s;
        }
        .pgs__style-grid article:hover { border-color: rgba(255, 255, 255, 0.2); transform: translateY(-2px); }
        .pgs__style-grid article[data-active="1"] { border-color: rgba(240, 210, 136, 0.45); }
        .pgs__style-photo {
          position: relative;
          height: 160px;
          background-size: cover;
          background-position: center;
        }
        .pgs__style-tint { position: absolute; inset: 0; }
        .pgs__style-tag {
          position: absolute;
          left: 12px;
          bottom: 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #f1f4f2;
          background: rgba(0, 0, 0, 0.45);
          border-radius: 999px;
          padding: 4px 10px;
        }
        .pgs__style-body { padding: 16px 18px 18px; }
        .pgs__style-body strong { display: block; font-size: 16px; color: #f1f4f2; margin-bottom: 6px; }
        .pgs__style-body p { margin: 0; font-size: 13px; line-height: 1.6; color: #9aa6a0; }
        .pgs__gallery {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
        }
        .pgs__gallery-item { margin: 0; }
        .pgs__gallery-item--hero { grid-column: 1 / -1; }
        .pgs__gallery-item--hero .pgs__gallery-photo { min-height: 320px; }
        .pgs__gallery-photo {
          position: relative;
          display: block;
          width: 100%;
          min-height: 180px;
          border: none;
          border-radius: 16px;
          background-size: cover;
          background-position: center;
          cursor: pointer;
          overflow: hidden;
          padding: 0;
        }
        .pgs__gallery-photo::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 40%, rgba(3, 3, 3, 0.75) 100%);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .pgs__gallery-photo:hover::after { opacity: 1; }
        .pgs__gallery-use {
          position: absolute;
          left: 14px;
          bottom: 14px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #f1f4f2;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .pgs__gallery-photo:hover .pgs__gallery-use { opacity: 1; }
        .pgs__fallback-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #e8c46a;
          background: rgba(0, 0, 0, 0.55);
          border-radius: 999px;
          padding: 4px 10px;
        }
        .pgs__gallery-item figcaption {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 10px;
          font-size: 12px;
          color: #8a958f;
        }
        .pgs__gallery-item figcaption strong { color: #d4ddd8; font-size: 13px; }
        .pgs__cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 22px;
        }
        .pgs__cta-copy { max-width: 56ch; }
        .pgs__cta-copy .pgs__shelf-title { margin-bottom: 10px; }
        .pgs__cta-copy p { margin: 0; font-size: 14.5px; line-height: 1.6; color: #a7b2ac; }
        .pgs__cta .pgs__actions { margin-top: 0; }
        .pgs__footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 20px;
          margin-top: 8px;
          padding: 16px 18px;
          border-radius: 13px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.015);
          font-size: 11.5px;
          color: #7e8b85;
        }
        .pgs__footer span { display: inline-flex; align-items: center; gap: 6px; }
        .pgs__footer-comp { margin-left: auto; color: #8ba3b8; }
      `}</style>
    </main>
  )
}

export default PhotoGenerationStudio
