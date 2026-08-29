"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUp, Camera, Check, ChevronDown, Film, Play, Plus, Sparkles, Volume2 } from "lucide-react"
import { canUseGeneration, incrementUsage, isOwnerUser } from "@/lib/usage-limits"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { VIDEO_AI_TEMPLATES } from "@/lib/media-library"
import { takePrefillPrompt } from "@/lib/malik-context"
import { VideoLoop } from "./VideoLoop"

export type VideoGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type Ratio = "16:9" | "9:16" | "1:1"
type Duration = 5 | 10
type GenerationPhase = "idle" | "queued" | "rendering" | "ready" | "failed"

const ENDPOINT = "/api/media/video"
const DEFAULT_PROMPT = "Ночной Алматы после дождя. Чёрный премиальный автомобиль медленно едет по мокрой улице, отражения городских огней на асфальте, камера низко следует сбоку, реалистичная физика, кинематографичный свет и естественный звук города."
const CATEGORIES = ["Кино", "Реклама", "Соцсети", "Персонажи", "Эксперимент"] as const

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function formatStatus(phase: GenerationPhase, attempt: number) {
  if (phase === "queued") return "Ставлю сцену в очередь…"
  if (phase === "rendering") {
    if (attempt < 4) return "Собираю сцену и движение камеры…"
    if (attempt < 12) return "Рендерю движение, свет и детали…"
    if (attempt < 24) return "Финализирую видео и звук…"
    return "Финальный рендер — ещё немного…"
  }
  if (phase === "ready") return "Видео готово"
  if (phase === "failed") return "Генерация остановлена"
  return "Готов к созданию"
}

export function VideoGenerationStudio({ username, onViewChange }: VideoGenerationStudioProps) {
  const operator = username?.trim() || "guest@malik.ai"
  const owner = isOwnerUser(operator)
  const templates = useMemo(() => VIDEO_AI_TEMPLATES.slice(0, 9), [])
  const [prompt, setPrompt] = useState(() => takePrefillPrompt() || DEFAULT_PROMPT)
  const [ratio, setRatio] = useState<Ratio>("16:9")
  const [duration, setDuration] = useState<Duration>(5)
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("Кино")
  const [activeTemplate, setActiveTemplate] = useState(0)
  const [phase, setPhase] = useState<GenerationPhase>("idle")
  const [attempt, setAttempt] = useState(0)
  const [taskId, setTaskId] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [error, setError] = useState("")
  const [remainingDaily, setRemainingDaily] = useState<number | null>(null)
  const [providerLabel, setProviderLabel] = useState("Wan 2.7")
  const [showControls, setShowControls] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const finishSoundPlayedRef = useRef(false)
  const hero = templates[activeTemplate] || templates[0]
  const busy = phase === "queued" || phase === "rendering"
  const statusText = formatStatus(phase, attempt)

  useEffect(() => () => { audioContextRef.current?.close().catch(() => {}) }, [])

  const armAudio = () => {
    if (typeof window === "undefined") return
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    if (!audioContextRef.current) audioContextRef.current = new AudioCtx()
    if (audioContextRef.current.state === "suspended") audioContextRef.current.resume().catch(() => {})
  }

  const playFinishSoundOnce = () => {
    if (finishSoundPlayedRef.current) return
    finishSoundPlayedRef.current = true
    const ctx = audioContextRef.current
    if (!ctx) return
    const now = ctx.currentTime
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) { const fade = 1 - i / data.length; data[i] = (Math.random() * 2 - 1) * fade * fade }
    const noise = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain()
    noise.buffer = buffer; filter.type = "highpass"; filter.frequency.value = 1100
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.25, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
    noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination); noise.start(now); noise.stop(now + 0.16)
    const click = ctx.createOscillator(); const clickGain = ctx.createGain(); click.type = "triangle"
    click.frequency.setValueAtTime(380, now); click.frequency.exponentialRampToValueAtTime(120, now + 0.11)
    clickGain.gain.setValueAtTime(0.0001, now); clickGain.gain.exponentialRampToValueAtTime(0.13, now + 0.006); clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    click.connect(clickGain); clickGain.connect(ctx.destination); click.start(now); click.stop(now + 0.13)
  }

  const generate = async () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || busy) return
    armAudio(); finishSoundPlayedRef.current = false; setError(""); setVideoUrl(""); setTaskId(""); setAttempt(0)
    if (!canUseGeneration("video", operator)) {
      setPhase("failed"); setError("Сегодняшняя бесплатная генерация уже использована. Лимит обновится завтра."); return
    }
    setPhase("queued")
    try {
      const response = await clientFetchWithTimeout(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, length: duration, resolution: "1080p", ratio, generateAudio: true, userEmail: operator }),
      }, 60_000)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 429) throw new Error("Сегодняшняя генерация уже использована. Лимит обновится завтра.")
        throw new Error(data?.error || data?.publicError || data?.message || `Ошибка ${response.status}`)
      }
      const id = String(data?.taskId || "")
      if (!id) throw new Error("Видеомодель не вернула taskId")
      setTaskId(id); setProviderLabel(String(data?.model || "Wan 2.7").replace("wan2.7-t2v-2026-06-12", "Wan 2.7"))
      setRemainingDaily(typeof data?.remainingDailyVideos === "number" ? data.remainingDailyVideos : null)
      if (!owner) incrementUsage("video")
      setPhase("rendering")
      const statusUrl = String(data?.statusUrl || `/api/media/video/status?taskId=${encodeURIComponent(id)}`)
      for (let i = 0; i < 72; i += 1) {
        setAttempt(i); await sleep(i === 0 ? 2500 : 5000)
        const statusResponse = await clientFetchWithTimeout(statusUrl, { method: "GET" }, 30_000)
        const statusData = await statusResponse.json().catch(() => ({}))
        if (!statusResponse.ok) throw new Error(statusData?.error || `Status ${statusResponse.status}`)
        if (statusData?.status === "failed") throw new Error(statusData?.error || "Видеомодель не смогла завершить рендер")
        const readyUrl = String(statusData?.videoUrl || statusData?.url || "")
        if (readyUrl) { setVideoUrl(readyUrl); setPhase("ready"); playFinishSoundOnce(); return }
      }
      throw new Error("Видео всё ещё рендерится. Попробуйте проверить задачу позже.")
    } catch (err) { setPhase("failed"); setError(err instanceof Error ? err.message : "Генерация видео недоступна") }
  }

  const chooseTemplate = (index: number) => {
    const item = templates[index]; if (!item) return
    setActiveTemplate(index); setPrompt(item.prompt); setVideoUrl(""); setPhase("idle"); setError("")
  }

  return (
    <main className="mv" data-view="video-generation">
      <section className="mv__showcase" aria-label="Video inspiration">
        <div className="mv__showcase-media">
          {videoUrl ? <video src={videoUrl} controls playsInline autoPlay className="mv__showcase-video" /> : <VideoLoop src={hero.src} poster={hero.poster} className="mv__showcase-video" />}
          <div className="mv__showcase-vignette" />
          <div className="mv__showcase-top"><span className="mv__brand-mark"><svg viewBox="0 0 44 44"><path d="M9 29 L22 15 L22 29 Z" /><path d="M24 15 H38 L24 29 Z" /></svg></span><span>MalikVideo</span></div>
          <div className="mv__showcase-bottom"><span className="mv__showcase-kicker"><Film size={13} /> Showcase</span><strong>{videoUrl ? "Ваше видео готово" : hero.title}</strong><span>{videoUrl ? `${providerLabel} · 1080p` : `${hero.provider} · ${hero.tag}`}</span></div>
          {busy ? (
            <div className="mv__render-state" aria-live="polite">
              <div className="mv__render-square"><div className="mv__grid" /><div className="mv__scan" /><div className="mv__focus-corner mv__focus-corner--tl" /><div className="mv__focus-corner mv__focus-corner--tr" /><div className="mv__focus-corner mv__focus-corner--bl" /><div className="mv__focus-corner mv__focus-corner--br" /><div className="mv__camera"><div className="mv__camera-top" /><div className="mv__camera-lens"><span /></div><i /></div></div>
              <div className="mv__render-copy"><span className="mv__render-dot" /><strong>{statusText}</strong><small>1080p · {ratio} · {duration}s · sound</small></div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mv__workspace">
        <header className="mv__header"><div><span className="mv__eyebrow">MALIK VIDEO · WAN 2.7</span><h1>Что вы хотите создать?</h1></div><button type="button" className="mv__library-btn" onClick={() => onViewChange("templates")}>Библиотека</button></header>
        <section className="mv__composer-shell">
          <div className="mv__notice"><span>New</span><strong>MalikVideo 1.0</strong><p>Русский · Қазақша · English → cinematic prompt → 1080p video</p></div>
          <div className="mv__composer">
            <div className="mv__thumb"><VideoLoop src={hero.src} poster={hero.poster} className="mv__thumb-video" /></div>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Опишите сцену, персонажа, камеру, движение и звук. Можно писать по-русски или на казахском…" disabled={busy} />
            <div className="mv__composer-bottom"><button type="button" className="mv__plus" aria-label="Добавить референс" title="Image-to-video скоро"><Plus size={18} /></button><div className="mv__composer-actions"><button type="button" className="mv__quality" onClick={() => setShowControls((value) => !value)}><Sparkles size={14} /> 1080p · Quality <ChevronDown size={14} /></button><button type="button" className="mv__send" onClick={generate} disabled={busy || !prompt.trim()} aria-label="Сгенерировать видео">{busy ? <Camera size={17} /> : <ArrowUp size={18} />}</button></div></div>
          </div>
          {showControls ? <div className="mv__settings-popover"><div><span>Формат</span><div className="mv__segmented">{(["16:9", "9:16", "1:1"] as Ratio[]).map((value) => <button key={value} type="button" data-active={ratio === value ? "1" : "0"} onClick={() => setRatio(value)}>{value}</button>)}</div></div><div><span>Длительность</span><div className="mv__segmented">{([5, 10] as Duration[]).map((value) => <button key={value} type="button" data-active={duration === value ? "1" : "0"} onClick={() => setDuration(value)}>{value}s</button>)}</div></div><div className="mv__fixed-setting"><Check size={14} /> 1080p</div><div className="mv__fixed-setting"><Volume2 size={14} /> Sound</div></div> : null}
          <div className="mv__model-row"><button type="button" className="is-active"><span className="mv__model-icon"><Play size={13} fill="currentColor" /></span> MalikVideo 1.0</button><button type="button"><Volume2 size={15} /> Audio synced</button><button type="button"><Sparkles size={15} /> RU · KZ · EN</button></div>
        </section>

        <div className="mv__statusbar" data-phase={phase}><span className="mv__status-dot" /><strong>{statusText}</strong>{taskId ? <span>Task {taskId.slice(0, 8)}</span> : null}{owner ? <span>Owner · unlimited</span> : remainingDaily !== null ? <span>Осталось сегодня: {remainingDaily}</span> : <span>1 видео в день</span>}{error ? <span className="mv__error">{error}</span> : null}</div>

        <section className="mv__discover">
          <div className="mv__tabs" role="tablist" aria-label="Категории видео">{CATEGORIES.map((category) => <button key={category} type="button" data-active={activeCategory === category ? "1" : "0"} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
          <div className="mv__cards">{templates.map((item, index) => <button key={item.id} type="button" className="mv__card" data-active={activeTemplate === index ? "1" : "0"} onClick={() => chooseTemplate(index)}><VideoLoop src={item.src} poster={item.poster} className="mv__card-video" /><span className="mv__card-shade" /><span className="mv__card-copy"><strong>{item.title}</strong><small>{item.theme} · 1080p</small></span><span className="mv__card-play"><Play size={14} fill="currentColor" /></span></button>)}</div>
        </section>
      </section>

      <style jsx global>{`
        .mv{min-height:100%;width:100%;display:grid;grid-template-columns:minmax(330px,36vw) minmax(0,1fr);background:#000;color:#f7f7f8;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mv button,.mv textarea{font:inherit}.mv__showcase{position:relative;min-height:100dvh;background:#050505;border-right:1px solid rgba(255,255,255,.08);overflow:hidden}.mv__showcase-media{position:sticky;top:0;height:100dvh;min-height:680px;overflow:hidden;background:#090909}.mv__showcase-video{width:100%;height:100%;object-fit:cover;display:block;background:#080808}.mv__showcase-vignette{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.35),transparent 28%,transparent 60%,rgba(0,0,0,.82)),linear-gradient(90deg,rgba(0,0,0,.2),transparent 35%)}.mv__showcase-top{position:absolute;top:24px;left:24px;display:flex;align-items:center;gap:10px;font-size:14px;font-weight:650}.mv__brand-mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#fff}.mv__brand-mark svg{width:22px;height:22px;fill:#080808}.mv__showcase-bottom{position:absolute;left:28px;right:28px;bottom:28px;display:flex;flex-direction:column;gap:5px}.mv__showcase-kicker{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.6);font-size:11px;text-transform:uppercase;letter-spacing:.16em}.mv__showcase-bottom strong{font-size:clamp(24px,2.4vw,40px);line-height:1.02;letter-spacing:-.05em}.mv__showcase-bottom>span:last-child{color:rgba(255,255,255,.62);font-size:12px}
        .mv__render-state{position:absolute;inset:0;z-index:5;display:grid;place-items:center;align-content:center;gap:22px;background:rgba(0,0,0,.72);backdrop-filter:blur(18px)}.mv__render-square{position:relative;width:min(55%,320px);aspect-ratio:1;border:1px solid rgba(255,255,255,.14);border-radius:30px;background:radial-gradient(circle at 50% 28%,rgba(255,255,255,.08),transparent 30%),#090909;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55);animation:mv-square-breathe 2.8s ease-in-out infinite}.mv__grid{position:absolute;inset:0;opacity:.3;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:28px 28px;animation:mv-grid 12s linear infinite}.mv__scan{position:absolute;top:-20%;bottom:-20%;width:25%;left:-30%;transform:skewX(-12deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);filter:blur(5px);animation:mv-scan 2.1s linear infinite}.mv__focus-corner{position:absolute;width:28px;height:28px;border-color:rgba(255,255,255,.82);border-style:solid}.mv__focus-corner--tl{top:16%;left:16%;border-width:2px 0 0 2px}.mv__focus-corner--tr{top:16%;right:16%;border-width:2px 2px 0 0}.mv__focus-corner--bl{bottom:16%;left:16%;border-width:0 0 2px 2px}.mv__focus-corner--br{bottom:16%;right:16%;border-width:0 2px 2px 0}.mv__camera{position:absolute;width:48%;height:36%;left:26%;top:34%;border-radius:22px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg,#1c1c1d,#0b0b0c);box-shadow:0 20px 45px rgba(0,0,0,.45);animation:mv-camera 2.5s ease-in-out infinite}.mv__camera-top{position:absolute;left:10%;top:-15%;width:34%;height:24%;border-radius:12px 12px 7px 7px;border:1px solid rgba(255,255,255,.12);background:#111}.mv__camera-lens{position:absolute;width:42%;aspect-ratio:1;left:29%;top:25%;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:radial-gradient(circle at 42% 40%,rgba(255,255,255,.42),rgba(255,255,255,.12) 13%,#111 36%,#030303 74%);box-shadow:0 0 0 9px rgba(255,255,255,.035);animation:mv-lens 1.7s ease-in-out infinite}.mv__camera-lens span{position:absolute;inset:22%;border:1px solid rgba(255,255,255,.13);border-radius:50%}.mv__camera>i{position:absolute;right:11%;top:14%;width:8px;height:8px;border-radius:50%;background:#fff;animation:mv-dot 1.2s ease-in-out infinite}.mv__render-copy{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px;max-width:85%;text-align:center}.mv__render-copy strong{width:100%;font-size:17px}.mv__render-copy small{color:rgba(255,255,255,.5);font-size:11px}.mv__render-dot{width:7px;height:7px;border-radius:50%;background:#fff;animation:mv-pulse 1.5s ease-in-out infinite}
        .mv__workspace{min-width:0;height:100dvh;overflow-y:auto;padding:34px clamp(26px,4vw,66px) 48px;background:#000}.mv__header{max-width:980px;margin:0 auto 28px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.mv__eyebrow{color:#6f6f78;font-size:10px;font-weight:700;letter-spacing:.16em}.mv__header h1{margin:10px 0 0;font-size:clamp(36px,4.4vw,64px);line-height:.96;letter-spacing:-.065em;font-weight:650}.mv__library-btn{height:38px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#111113;color:#d8d8dc;font-size:12px}.mv__composer-shell{position:relative;max-width:980px;margin:0 auto}.mv__notice{display:flex;min-height:48px;align-items:center;gap:10px;padding:0 16px;border:1px solid rgba(255,255,255,.09);border-bottom:0;border-radius:24px 24px 0 0;background:#121214;color:#dddde1;font-size:12px}.mv__notice>span{border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:3px 9px;font-size:10px}.mv__notice p{margin:0;color:#8c8c95;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mv__composer{border:1px solid rgba(255,255,255,.1);border-radius:0 0 24px 24px;background:#1a1b1e;padding:16px;box-shadow:0 24px 70px rgba(0,0,0,.35)}.mv__thumb{width:96px;height:64px;overflow:hidden;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#111}.mv__thumb-video{width:100%;height:100%;object-fit:cover}.mv__composer textarea{width:100%;min-height:118px;resize:none;border:0;outline:0;background:transparent;padding:16px 0 12px;color:#f5f5f6;font-size:18px;line-height:1.55}.mv__composer textarea::placeholder{color:#737681}.mv__composer-bottom{display:flex;align-items:center;justify-content:space-between}.mv__plus{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:#9a9ca5}.mv__plus:hover,.mv__quality:hover{background:rgba(255,255,255,.055);color:#fff}.mv__composer-actions{display:flex;align-items:center;gap:9px}.mv__quality{display:flex;height:36px;align-items:center;gap:6px;border-radius:10px;padding:0 11px;color:#d9d9dc;font-size:12px}.mv__send{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:#f5f5f5;color:#050505}.mv__send:disabled{opacity:.35}.mv__settings-popover{position:absolute;z-index:20;top:calc(100% - 54px);right:60px;min-width:360px;display:grid;grid-template-columns:1fr 1fr;gap:14px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:#121214;padding:14px;box-shadow:0 22px 55px rgba(0,0,0,.7)}.mv__settings-popover>div>span{display:block;margin-bottom:7px;color:#777780;font-size:10px}.mv__segmented{display:flex;gap:4px;padding:3px;border-radius:10px;background:#0b0b0c}.mv__segmented button{flex:1;height:30px;border-radius:7px;color:#8e8e96;font-size:11px}.mv__segmented button[data-active="1"]{background:#242426;color:#fff}.mv__fixed-setting{display:flex;align-items:center;gap:7px;color:#c9c9cf;font-size:11px}.mv__model-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:14px 0}.mv__model-row button{display:flex;height:39px;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#111113;padding:0 14px;color:#c8c8cd;font-size:12px}.mv__model-row button.is-active{background:#18181b;color:#fff}.mv__model-icon{width:23px;height:23px;display:grid;place-items:center;border-radius:7px;background:#f4f4f4;color:#111}
        .mv__statusbar{max-width:980px;min-height:36px;margin:16px auto 0;display:flex;align-items:center;gap:9px;flex-wrap:wrap;color:#777780;font-size:11px}.mv__statusbar strong{color:#d7d7db}.mv__status-dot{width:7px;height:7px;border-radius:50%;background:#76767e}.mv__statusbar[data-phase="queued"] .mv__status-dot,.mv__statusbar[data-phase="rendering"] .mv__status-dot{background:#fff;animation:mv-pulse 1.5s infinite}.mv__error{color:#d59a9a}.mv__discover{max-width:1120px;margin:54px auto 0}.mv__tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:14px;scrollbar-width:none}.mv__tabs button{height:36px;white-space:nowrap;border-radius:999px;padding:0 15px;color:#83838c;font-size:12px}.mv__tabs button[data-active="1"]{background:#171719;color:#fff}.mv__cards{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:170px;gap:10px}.mv__card{position:relative;min-width:0;overflow:hidden;border-radius:16px;border:1px solid rgba(255,255,255,.07);background:#0c0c0d;text-align:left}.mv__card:nth-child(1),.mv__card:nth-child(5){grid-column:span 4;grid-row:span 2}.mv__card:nth-child(2),.mv__card:nth-child(3),.mv__card:nth-child(4),.mv__card:nth-child(n+6){grid-column:span 4}.mv__card-video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .55s}.mv__card:hover .mv__card-video{transform:scale(1.035)}.mv__card-shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 48%,rgba(0,0,0,.85))}.mv__card-copy{position:absolute;left:14px;right:42px;bottom:13px;display:flex;flex-direction:column;gap:3px}.mv__card-copy strong{overflow:hidden;color:#fff;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.mv__card-copy small{color:rgba(255,255,255,.58);font-size:10px}.mv__card-play{position:absolute;right:13px;bottom:13px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.9);color:#0b0b0c;opacity:0;transition:.18s}.mv__card:hover .mv__card-play,.mv__card[data-active="1"] .mv__card-play{opacity:1}.mv__card[data-active="1"]{border-color:rgba(255,255,255,.24)}
        @keyframes mv-scan{from{left:-30%}to{left:115%}}@keyframes mv-grid{from{transform:translate(0,0)}to{transform:translate(28px,28px)}}@keyframes mv-square-breathe{50%{transform:scale(1.02)}}@keyframes mv-camera{50%{transform:translateY(-6px)}}@keyframes mv-lens{50%{transform:scale(1.06)}}@keyframes mv-dot{50%{opacity:.25}}@keyframes mv-pulse{50%{box-shadow:0 0 0 9px rgba(255,255,255,0)}}
        @media(max-width:1100px){.mv{grid-template-columns:300px minmax(0,1fr)}.mv__workspace{padding-left:24px;padding-right:24px}.mv__cards{grid-auto-rows:150px}}@media(max-width:820px){.mv{display:block;overflow:visible}.mv__showcase{min-height:auto;border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}.mv__showcase-media{position:relative;height:44vh;min-height:340px}.mv__workspace{height:auto;overflow:visible;padding:26px 16px 40px}.mv__header h1{font-size:40px}.mv__library-btn{display:none}.mv__settings-popover{position:static;min-width:0;margin-top:10px}.mv__cards{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:170px}.mv__card:nth-child(n){grid-column:span 1;grid-row:span 1}}@media(max-width:520px){.mv__showcase-media{height:38vh;min-height:300px}.mv__header h1{font-size:34px}.mv__notice p{display:none}.mv__composer{padding:12px}.mv__thumb{width:72px;height:48px}.mv__composer textarea{font-size:16px}.mv__settings-popover{grid-template-columns:1fr}.mv__cards{grid-template-columns:1fr;grid-auto-rows:210px}.mv__model-row{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap}}@media(prefers-reduced-motion:reduce){.mv *{animation-duration:.001ms!important;animation-iteration-count:1!important}}
      `}</style>
    </main>
  )
}

export default VideoGenerationStudio
