"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Code, Layers, Loader2, Sparkles, Terminal, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface GenerationAnimationProps {
  isActive: boolean
  progress?: number
  phase?: "thinking" | "generating" | "rendering" | "complete"
  onComplete?: () => void
  title?: string
  type?: "text" | "image" | "video" | "file" | "code" | "website" | "codex"
}

const generationStepMap = {
  text: ["Reading request", "Finding intent", "Structuring answer", "Checking clarity", "Writing response", "Final polish"],
  image: ["Reading image", "Scanning details", "Extracting visual cues", "Matching prompt", "Preparing insight", "Returning analysis"],
  video: ["Loading frames", "Reading timeline", "Detecting motion", "Mapping scenes", "Summarizing video", "Returning analysis"],
  file: ["Opening file", "Parsing structure", "Extracting facts", "Finding tasks", "Building summary", "Returning result"],
  code: ["Understanding bug", "Planning fix", "Generating code", "Connecting actions", "Checking edge cases", "Returning patch"],
  website: ["Understanding prompt", "Planning layout", "Generating components", "Connecting actions", "Building preview", "Sending to canvas"],
  codex: ["Reading project", "Planning files", "Detecting risks", "Preparing task plan", "Previewing changes", "Waiting approval"],
} as const

export function GenerationAnimation({
  isActive,
  progress,
  phase,
  title = "Generating production preview",
  type = "website",
}: GenerationAnimationProps) {
  const [internalProgress, setInternalProgress] = useState(8)

  useEffect(() => {
    if (!isActive) {
      setInternalProgress(8)
      return
    }
    const timer = window.setInterval(() => {
      setInternalProgress((value) => (value >= 94 ? 38 : Math.min(94, value + 7)))
    }, 520)
    return () => window.clearInterval(timer)
  }, [isActive])

  if (!isActive) return null

  const currentProgress = Math.round(progress ?? internalProgress)
  const currentPhase =
    phase ??
    (currentProgress > 88 ? "rendering" : currentProgress > 58 ? "generating" : "thinking")
  const generationSteps = generationStepMap[type]
  const activeStep = Math.min(generationSteps.length - 1, Math.floor((currentProgress / 100) * generationSteps.length))

  return (
    <div className="relative flex h-full min-h-[520px] w-full overflow-hidden bg-[#030303] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.24),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,.16),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-300" />

      <div className="relative grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <section className="flex min-h-0 flex-col rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">v0 style generation</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">{title}</h3>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
              {currentPhase === "thinking" && <Sparkles className="h-6 w-6 animate-pulse" />}
              {currentPhase === "generating" && <Code className="h-6 w-6 animate-pulse" />}
              {currentPhase === "rendering" && <Layers className="h-6 w-6 animate-pulse" />}
              {currentPhase === "complete" && <CheckCircle2 className="h-6 w-6" />}
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-300 transition-all duration-500"
              style={{ width: `${currentProgress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-bold text-zinc-500">
            <span>{currentPhase}</span>
            <span>{currentProgress}%</span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {generationSteps.map((step, index) => {
              const done = index < activeStep
              const active = index === activeStep
              return (
                <div
                  key={step}
                  className={cn(
                    "rounded-2xl border p-4 transition",
                    done && "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
                    active && "border-violet-400/30 bg-violet-500/15 text-violet-100 shadow-lg shadow-violet-950/30",
                    !done && !active && "border-white/10 bg-black/30 text-zinc-500",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/35 text-xs font-black">
                      {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : index + 1}
                    </span>
                    <span className="text-sm font-black">{step}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_1.15fr]">
            <div className="rounded-2xl border border-white/10 bg-black/50 p-4 font-mono text-xs leading-6 text-cyan-100">
              <div className="mb-3 flex items-center gap-2 text-zinc-500">
                <Terminal className="h-4 w-4" />
                build logs
              </div>
              {[
                "$ malik plan --canvas=right",
                "ok prompt intent detected",
                "ok layout sections prepared",
                "ok actions connected",
                "ok preview artifact compiling",
              ].map((line, index) => (
                <p key={line} className={cn("truncate", index === activeStep % 5 && "text-violet-200")}>{line}</p>
              ))}
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-4">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.055] to-transparent animate-shimmer" />
              <div className="relative grid h-full min-h-[210px] gap-3">
                <div className="h-10 rounded-2xl bg-white/10" />
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-24 rounded-2xl bg-violet-400/15" />
                  <div className="h-24 rounded-2xl bg-cyan-400/15" />
                  <div className="h-24 rounded-2xl bg-white/10" />
                </div>
                <div className="grid grid-cols-[1.2fr_.8fr] gap-3">
                  <div className="h-28 rounded-2xl bg-white/10" />
                  <div className="h-28 rounded-2xl bg-violet-400/10" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 rounded-[1.5rem] border border-white/10 bg-black/45 p-4 lg:block">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Preview skeleton</p>
          <div className="mt-4 space-y-3">
            <div className="h-28 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-400/10" />
            <div className="h-4 w-3/4 rounded-full bg-white/15" />
            <div className="h-4 w-1/2 rounded-full bg-white/10" />
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div className="h-24 rounded-2xl bg-white/10" />
              <div className="h-24 rounded-2xl bg-white/10" />
            </div>
            <div className="h-32 rounded-2xl bg-cyan-400/10" />
          </div>
        </aside>
      </div>
    </div>
  )
}

export function TypewriterCode({ code, isActive, speed = 10 }: { code: string; isActive: boolean; speed?: number }) {
  const [displayedCode, setDisplayedCode] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isActive && currentIndex < code.length) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1
          if (next >= code.length && intervalRef.current) clearInterval(intervalRef.current)
          return next
        })
      }, speed)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive, code.length, currentIndex, speed])

  useEffect(() => {
    setDisplayedCode(code.slice(0, currentIndex))
  }, [code, currentIndex])

  useEffect(() => {
    if (!isActive) {
      setDisplayedCode("")
      setCurrentIndex(0)
    }
  }, [isActive])

  return (
    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-[#e5e5e5]">
      {displayedCode}
      {isActive && currentIndex < code.length && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-violet-400" />}
    </pre>
  )
}

export function ShimmerSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-[#1F2937]", className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  )
}

export function BuildingBlocks({ isActive }: { isActive: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2 p-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "aspect-square rounded-lg transition-all duration-500",
            isActive ? "scale-100 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 opacity-100" : "scale-75 bg-[#1F2937] opacity-30",
          )}
          style={{ transitionDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  )
}

export function StreamingText({ text, isActive, onComplete }: { text: string; isActive: boolean; onComplete?: () => void }) {
  const [words, setWords] = useState<string[]>([])
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const allWords = text.split(" ")

  useEffect(() => {
    if (isActive && currentWordIndex < allWords.length) {
      const timeout = setTimeout(() => {
        setWords((prev) => [...prev, allWords[currentWordIndex]])
        setCurrentWordIndex((prev) => prev + 1)
      }, 50)
      return () => clearTimeout(timeout)
    }
    if (currentWordIndex >= allWords.length) onComplete?.()
  }, [isActive, currentWordIndex, allWords, onComplete])

  useEffect(() => {
    if (!isActive) {
      setWords([])
      setCurrentWordIndex(0)
    }
  }, [isActive])

  return (
    <p className="text-sm leading-relaxed text-[#e5e5e5]">
      {words.join(" ")}
      {isActive && currentWordIndex < allWords.length && <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-violet-400 align-middle" />}
    </p>
  )
}

