"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { playImageGenerationCompleteSound, playImageGenerationStartSound } from "@/lib/media/image-generation-sound"
import { resolveGeneratedImageUrl } from "@/lib/media/client-generated-image-store"

type Status = "queued" | "thinking" | "generating" | "rendering" | "ready" | "failed"
type ImageGenerationMotionProps = {
  prompt?: string
  resultUrl?: string
  fallbackUrl?: string
  status?: Status
  startedAt?: string
  provider?: string
  understood?: string
  failed?: boolean
  error?: string
  progress?: number
}

const GENERATION_WATCHDOG_MS = 3 * 60 * 1000
const READY_RESULT_GRACE_MS = 8_000
const DEMOS = Array.from({ length: 8 }, (_, i) => `/library/gallery/${String(i + 1).padStart(3, "0")}.webp`)
const HAND = "/malik/image-loader/hand.webp"
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))
const smooth = (n: number) => n * n * (3 - 2 * n)
const ease = (n: number) => 1 - (1 - n) * (1 - n)

function statusProgress(status?: Status) {
  if (status === "ready") return 96
  if (status === "rendering") return 72
  if (status === "generating") return 36
  if (status === "thinking") return 14
  if (status === "queued") return 6
  return 4
}
function statusText(status?: Status, done = false) {
  if (done) return "Готово"
  if (status === "rendering" || status === "ready") return "Финальная детализация"
  if (status === "generating") return "Прорисовка изображения"
  if (status === "thinking") return "Анализ промпта"
  if (status === "queued") return "Подготовка модели"
  return "Генерация изображения"
}
function loadImage(src: string, timeout = 25_000) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    const timer = window.setTimeout(() => reject(new Error("image timeout")), timeout)
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); reject(new Error("image failed")) }
    image.src = src
  })
}

export function ImageGenerationMotion({ resultUrl, fallbackUrl, status, startedAt, failed, error, progress }: ImageGenerationMotionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const finalUrlRef = useRef("")
  const failedRef = useRef(false)
  const [resolvedResultUrl, setResolvedResultUrl] = useState("")
  const [imageLoaded, setImageLoaded] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [readyWithoutResult, setReadyWithoutResult] = useState(false)
  const [assetError, setAssetError] = useState("")

  const missingReadyResult = status === "ready" && !resultUrl && !fallbackUrl
  const actuallyFailed = Boolean(failed || status === "failed" || timedOut || readyWithoutResult)

  useEffect(() => {
    const start = Number.isFinite(Date.parse(startedAt || "")) ? Date.parse(startedAt || "") : Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      setSeconds(Math.max(0, Math.floor(elapsed / 1000)))
      if (!imageLoaded && !actuallyFailed && elapsed >= GENERATION_WATCHDOG_MS) setTimedOut(true)
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, imageLoaded, actuallyFailed])

  useEffect(() => {
    if (!missingReadyResult) { setReadyWithoutResult(false); return }
    const timer = window.setTimeout(() => setReadyWithoutResult(true), READY_RESULT_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [missingReadyResult])

  useEffect(() => {
    let cancelled = false
    const candidate = resultUrl || fallbackUrl || ""
    if (!candidate) { setResolvedResultUrl(""); setImageLoaded(false); return }
    resolveGeneratedImageUrl(candidate).then((url) => {
      if (!cancelled) { setResolvedResultUrl(url); setAssetError("") }
    }).catch(() => {
      if (!cancelled && fallbackUrl && fallbackUrl !== candidate) setResolvedResultUrl(fallbackUrl)
      else if (!cancelled) setAssetError("Сохранённое изображение недоступно.")
    })
    return () => { cancelled = true }
  }, [resultUrl, fallbackUrl])

  useEffect(() => { finalUrlRef.current = resolvedResultUrl }, [resolvedResultUrl])
  useEffect(() => { failedRef.current = actuallyFailed }, [actuallyFailed])
  useEffect(() => { if (!actuallyFailed && !imageLoaded) playImageGenerationStartSound() }, [actuallyFailed, imageLoaded])
  useEffect(() => { if (imageLoaded) playImageGenerationCompleteSound() }, [imageLoaded])

  const shownProgress = useMemo(() => {
    if (imageLoaded || actuallyFailed) return 100
    if (typeof progress === "number" && Number.isFinite(progress)) return Math.round(clamp(progress, 4, 96))
    return statusProgress(status)
  }, [imageLoaded, actuallyFailed, progress, status])
  const shownStage = actuallyFailed ? "Генерация остановлена" : statusText(status, imageLoaded)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || actuallyFailed) return
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
    if (!ctx) return

    const source = document.createElement("canvas"), sourceCtx = source.getContext("2d", { alpha: false })!
    const mask = document.createElement("canvas"), maskCtx = mask.getContext("2d", { alpha: true })!
    const reveal = document.createElement("canvas"), revealCtx = reveal.getContext("2d", { alpha: true })!
    const brush = document.createElement("canvas"), brushCtx = brush.getContext("2d", { alpha: true })!
    let disposed = false, token = 1, width = 1, height = 1, dpr = 1, lastDemo = -1
    let hand: HTMLImageElement | null = null, demos: HTMLImageElement[] = [], lastPoint: { x: number; y: number } | null = null
    let particles: Array<{x:number;y:number;vx:number;vy:number;r:number;life:number}> = []
    const reduced = (navigator.hardwareConcurrency || 8) <= 4

    const roundRect = (c: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number) => {
      c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath()
    }
    const border = () => { ctx.save(); roundRect(ctx,.5,.5,width-1,height-1,28); ctx.strokeStyle="rgba(218,174,76,.94)"; ctx.lineWidth=1; ctx.stroke(); ctx.restore() }
    const black = () => { ctx.fillStyle="#000"; ctx.fillRect(0,0,width,height); border() }
    const makeBrush = () => {
      brush.width = brush.height = 256
      const g = brushCtx.createRadialGradient(128,128,0,128,128,128)
      g.addColorStop(0,"#fff"); g.addColorStop(.58,"rgba(255,255,255,.98)"); g.addColorStop(.84,"rgba(255,255,255,.55)"); g.addColorStop(1,"rgba(255,255,255,0)")
      brushCtx.clearRect(0,0,256,256); brushCtx.fillStyle=g; brushCtx.fillRect(0,0,256,256)
    }
    const resize = () => {
      const r = canvas.parentElement?.getBoundingClientRect(); if (!r) return
      width=Math.max(1,Math.round(r.width)); height=Math.max(1,Math.round(r.height)); dpr=Math.min(devicePixelRatio||1,1.45)
      for (const c of [canvas,source,mask,reveal]) { c.width=Math.round(width*dpr); c.height=Math.round(height*dpr) }
      for (const c of [ctx,sourceCtx,maskCtx,revealCtx]) { c.setTransform(dpr,0,0,dpr,0,0); c.imageSmoothingEnabled=true; c.imageSmoothingQuality="high" }
      makeBrush(); black()
    }
    const contain = (img:HTMLImageElement) => {
      const k=Math.min(width/img.naturalWidth,height/img.naturalHeight), w=img.naturalWidth*k, h=img.naturalHeight*k
      return {x:(width-w)/2,y:(height-h)/2,w,h}
    }
    const prepare = (img:HTMLImageElement) => {
      sourceCtx.fillStyle="#000"; sourceCtx.fillRect(0,0,width,height); const q=contain(img); sourceCtx.drawImage(img,q.x,q.y,q.w,q.h)
      maskCtx.clearRect(0,0,width,height); lastPoint=null; particles=[]
    }
    const stamp = (x:number,y:number,size=1) => { const z=(reduced?154:172)*size; maskCtx.drawImage(brush,x-z/2,y-z/2,z,z) }
    const lineStamp = (x:number,y:number,size=1) => {
      if (!lastPoint) { stamp(x,y,size); lastPoint={x,y}; return }
      const dx=x-lastPoint.x,dy=y-lastPoint.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/(reduced?19:14)))
      for(let i=1;i<=n;i++){const t=i/n;stamp(lastPoint.x+dx*t,lastPoint.y+dy*t,size)} lastPoint={x,y}
    }
    const spawn = (x:number,y:number,dir:number) => {
      for(let i=0;i<(reduced?4:7);i++) particles.push({x,y,vx:-dir*(.4+Math.random()*1.4),vy:(Math.random()-.5)*1.4,r:.7+Math.random()*2,life:18+Math.random()*18})
      if(particles.length>(reduced?70:120)) particles.splice(0,particles.length-(reduced?70:120))
    }
    const drawParticles = () => {
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.life--;if(p.life<=0){particles.splice(i,1);continue}ctx.fillStyle=`rgba(255,214,119,${clamp(p.life/20)})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}
    }
    const drawHand = (x:number,y:number,dir:number,phase:number,alpha=1) => {
      if(!hand)return; const w=width*(reduced?.285:.31),h=w*(hand.naturalHeight/hand.naturalWidth)
      ctx.save();ctx.translate(x,y);ctx.scale(dir,1);ctx.rotate(dir*Math.sin(phase*Math.PI*2)*.018);ctx.globalAlpha=alpha;ctx.drawImage(hand,-.242*w,-.045*h,w,h);ctx.restore()
    }
    const composite = (x:number,y:number,dir:number,t:number,handAlpha=1) => {
      revealCtx.clearRect(0,0,width,height); revealCtx.globalCompositeOperation="source-over"; revealCtx.drawImage(source,0,0,width,height); revealCtx.globalCompositeOperation="destination-in"; revealCtx.drawImage(mask,0,0,width,height); revealCtx.globalCompositeOperation="source-over"
      ctx.fillStyle="#000";ctx.fillRect(0,0,width,height);ctx.save();roundRect(ctx,0,0,width,height,28);ctx.clip();ctx.drawImage(reveal,0,0,width,height);drawParticles();drawHand(x,y,dir,t,handAlpha);ctx.restore();border()
    }
    const lane = (t:number,lanes=6) => {
      const raw=clamp(t)*lanes,index=Math.min(lanes-1,Math.floor(raw)),local=smooth(raw-index),dir=index%2===0?-1:1,left=width*.07,right=width*.93,top=height*.075,bottom=height*.925
      return {x:dir===-1?right+(left-right)*local:left+(right-left)*local,y:top+(bottom-top)*(index/(lanes-1)),dir,index}
    }
    const still = (img:HTMLImageElement,alpha=1) => { ctx.fillStyle="#000";ctx.fillRect(0,0,width,height);const q=contain(img);ctx.save();roundRect(ctx,0,0,width,height,28);ctx.clip();ctx.globalAlpha=alpha;ctx.drawImage(img,q.x,q.y,q.w,q.h);ctx.restore();border() }
    const cycle = (img:HTMLImageElement,duration:number,final=false,hold=430) => new Promise<void>((resolve) => {
      const local=token,start=performance.now();let lastLane=-1;prepare(img)
      const frame=(now:number)=>{if(disposed||local!==token||failedRef.current)return resolve();const t=clamp((now-start)/duration),p=lane(ease(t),final?5:6);if(p.index!==lastLane){lastPoint=null;lastLane=p.index}lineStamp(p.x,p.y,final?1.1:1.04);if(t>.82){const fill=clamp((t-.82)/.18);for(let i=0;i<Math.floor(fill*25);i++){const col=i%5,row=Math.floor(i/5);stamp(width*(col+.5)/5,height*(row+.5)/5,1.3)}}if(t>=.995){maskCtx.fillStyle="#fff";maskCtx.fillRect(0,0,width,height)}spawn(p.x,p.y,p.dir);composite(p.x,p.y,p.dir,t,t>.97?clamp((1-t)/.03):1);if(t<1)return requestAnimationFrame(frame);still(img);window.setTimeout(resolve,hold)};requestAnimationFrame(frame)
    })
    const fade = (img:HTMLImageElement) => new Promise<void>((resolve)=>{const start=performance.now();const f=(now:number)=>{const t=clamp((now-start)/190);still(img,1-smooth(t));if(t<1)requestAnimationFrame(f);else{black();resolve()}};requestAnimationFrame(f)})
    const pickDemo=()=>{let i=Math.floor(Math.random()*demos.length);while(demos.length>1&&i===lastDemo)i=Math.floor(Math.random()*demos.length);lastDemo=i;return demos[i]}

    const run=async()=>{
      resize()
      try{[hand,...demos]=await Promise.all([loadImage(HAND),...DEMOS.map((s)=>loadImage(s))]);setAssetError("")}catch{setAssetError("Не удалось загрузить анимацию изображения.");return}
      while(!disposed&&!failedRef.current){
        const demo=pickDemo(); if(!demo) return
        await cycle(demo,reduced?3900:3400,false,460)
        if(disposed||failedRef.current)return
        if(finalUrlRef.current){
          try{const final=await loadImage(finalUrlRef.current);await cycle(final,reduced?2350:1950,true,0);if(disposed)return;still(final);setImageLoaded(true);return}catch{ /* keep cycling until the final file is reachable */ }
        }
        await fade(demo)
      }
    }
    const observer=new ResizeObserver(resize);observer.observe(canvas.parentElement||canvas);void run()
    return()=>{disposed=true;token++;observer.disconnect()}
  }, [actuallyFailed])

  const failureText = error || assetError || (timedOut ? "Генерация заняла больше трёх минут и была остановлена. Повторите запрос." : readyWithoutResult ? "Провайдер завершил задачу, но не вернул файл изображения." : "Генерация изображения не завершилась.")

  return <section className="malik-photo-motion malik-hand-loader-v7" data-malik-image-ready={imageLoaded?"1":"0"}>
    <div className={`malik-photo-stage malik-art-stage ${imageLoaded?"is-finished":"is-generating"}`}>
      {!actuallyFailed&&!imageLoaded?<canvas ref={canvasRef} className="malik-hand-loader-v7__canvas"/>:null}
      {imageLoaded&&resolvedResultUrl?<img className="malik-art-result is-visible" src={resolvedResultUrl} alt="Сгенерированное изображение Malik AI" draggable={false}/>:null}
      {actuallyFailed?<div className="malik-hand-loader-v7__failure"><strong>Генерация остановлена</strong><span>{failureText}</span></div>:null}
    </div>
    <div className="malik-hand-loader-v7__progress malik-art-report" aria-live="polite">
      <div className="malik-hand-loader-v7__meta"><span>{shownStage}</span><strong>{shownProgress}%</strong></div>
      <div className="malik-hand-loader-v7__track"><span style={{width:`${shownProgress}%`}}/></div>
      <div className="malik-hand-loader-v7__status">{imageLoaded?`Готово за ${seconds} с`:actuallyFailed?failureText:`${seconds} с · ${shownStage}`}</div>
    </div>
    <style jsx global>{`
      .malik-photo-motion.malik-hand-loader-v7{width:min(100%,680px)!important;max-width:680px!important;margin:2px 0 0!important;padding:0!important;display:grid!important;gap:12px!important;background:#000!important;border:0!important;box-shadow:none!important;color:#fff!important}
      .malik-hand-loader-v7 .malik-photo-stage,.malik-hand-loader-v7 .malik-art-stage{position:relative!important;width:100%!important;aspect-ratio:1/1!important;min-height:0!important;overflow:hidden!important;border-radius:28px!important;border:1px solid rgba(218,174,76,.94)!important;background:#000!important;box-shadow:0 0 0 1px rgba(255,227,163,.04) inset!important;isolation:isolate!important}
      .malik-hand-loader-v7__canvas,.malik-hand-loader-v7 .malik-art-result{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;border:0!important;border-radius:27px!important;background:#000!important;object-fit:contain!important;object-position:50% 50%!important}
      .malik-hand-loader-v7__canvas{will-change: transform;transform:translateZ(0)}
      .malik-hand-loader-v7 .malik-art-result{opacity:1!important;filter:none!important;transform:none!important;animation:malik-v7-in 180ms ease-out both!important}@keyframes malik-v7-in{from{opacity:.82}to{opacity:1}}
      .malik-hand-loader-v7__progress{width:100%!important;display:grid!important;gap:7px!important;padding:0 1px!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important}
      .malik-hand-loader-v7__meta{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;font-size:12px!important;line-height:1.2!important;color:rgba(255,255,255,.88)!important}.malik-hand-loader-v7__meta strong{font-size:12px!important;font-weight:650!important;color:#fff!important;font-variant-numeric:tabular-nums!important}
      .malik-hand-loader-v7__track{width:100%!important;height:3px!important;overflow:hidden!important;border-radius:999px!important;background:rgba(255,255,255,.16)!important}.malik-hand-loader-v7__track>span{display:block!important;height:100%!important;border-radius:inherit!important;background:#fff!important;transition:width 220ms linear!important}
      .malik-hand-loader-v7__status{min-height:16px!important;font-size:11px!important;line-height:1.35!important;color:rgba(255,255,255,.58)!important}.malik-hand-loader-v7__failure{position:absolute!important;inset:0!important;display:grid!important;place-content:center!important;gap:8px!important;padding:28px!important;text-align:center!important;background:#000!important;color:#fff!important}.malik-hand-loader-v7__failure span{max-width:440px!important;font-size:12px!important;line-height:1.55!important;color:rgba(255,255,255,.58)!important}
      @media(max-width:640px){.malik-photo-motion.malik-hand-loader-v7{width:100%!important;max-width:none!important;gap:10px!important}.malik-hand-loader-v7 .malik-photo-stage,.malik-hand-loader-v7 .malik-art-stage{border-radius:22px!important}.malik-hand-loader-v7__canvas,.malik-hand-loader-v7 .malik-art-result{border-radius:21px!important}}
      @media(prefers-reduced-motion:reduce){.malik-hand-loader-v7__track>span,.malik-hand-loader-v7 .malik-art-result{transition:none!important;animation:none!important}}
    `}</style>
  </section>
}

export default ImageGenerationMotion
