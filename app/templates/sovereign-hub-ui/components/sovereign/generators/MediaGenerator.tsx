"use client";

import { useMemo, useState } from "react";
import { ImageIcon, Loader2, Lock, Sparkles, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MediaKind = "image" | "video";

type Result = {
  url: string;
  engine: string;
  kind: MediaKind;
};

const styles = ["Premium cinematic", "Luxury product", "Futuristic clean", "Instagram viral", "Ultra realistic"];
const ratios = ["1:1", "9:16", "16:9"];
const durations = ["5", "8", "12"];

export function MediaGenerator() {
  const [kind, setKind] = useState<MediaKind>("image");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(styles[0]);
  const [aspectRatio, setAspectRatio] = useState(ratios[0]);
  const [duration, setDuration] = useState(durations[0]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [freeUsed, setFreeUsed] = useState(false);

  const canSubmit = useMemo(() => prompt.trim().length >= 8 && !loading, [prompt, loading]);

  async function generate() {
    setError("");
    setResult(null);

    if (!canSubmit) {
      setError("Напишите идею минимум на 8 символов.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, prompt, style, aspectRatio, duration })
      });
      const json = await response.json();

      if (!response.ok) {
        if (json.code === "PRO_REQUIRED") setFreeUsed(true);
        throw new Error(json.message ?? "Generation failed");
      }

      setResult(json.result);
      setFreeUsed(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сгенерировать медиа.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="glass rounded-[8px] p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap gap-2">
          <ModeButton active={kind === "image"} onClick={() => setKind("image")} icon="image">
            Фото
          </ModeButton>
          <ModeButton active={kind === "video"} onClick={() => setKind("video")} icon="video">
            Видео
          </ModeButton>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-200">
          Идея генерации
          <textarea
            className="min-h-36 resize-none rounded-[8px] border border-white/12 bg-white/[0.06] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-electric"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Например: premium AI bot mascot for business studio, clean dark blue luxury style"
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select label="Стиль" value={style} onChange={setStyle} options={styles} />
          <Select label="Формат" value={aspectRatio} onChange={setAspectRatio} options={ratios} />
          {kind === "video" ? <Select label="Длительность" value={duration} onChange={setDuration} options={durations} /> : null}
        </div>

        {freeUsed ? (
          <div className="mt-4 flex gap-3 rounded-[8px] border border-blue-primary/25 bg-blue-primary/10 p-4 text-sm leading-6 text-slate-300">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-blue-electric" />
            Бесплатная генерация уже использована. Для следующих генераций нужен активный план.
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Обычный пользователь получает 1 бесплатную генерацию. Дальше нужен Pro доступ.</p>
        )}

        {error ? <p className="mt-4 rounded-[8px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}

        <Button type="button" onClick={generate} disabled={!canSubmit} className="mt-5 w-full">
          {loading ? (
            <>
              <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Генерируем
            </>
          ) : (
            <>
              <Sparkles aria-hidden className="mr-2 size-4" /> Сгенерировать {kind === "image" ? "фото" : "видео"}
            </>
          )}
        </Button>
      </section>

      <section className="glass min-h-[520px] rounded-[8px] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Preview</p>
            <p className="text-xs text-slate-500">Ротация провайдеров и fallback работают на сервере</p>
          </div>
          {result ? <Badge>{result.engine || "MALIK Engine"}</Badge> : null}
        </div>

        <div className="grid min-h-[440px] place-items-center overflow-hidden rounded-[8px] border border-white/10 bg-[#050816]">
          {result?.kind === "image" ? (
            <img src={result.url} alt="AI generated result" className="h-full max-h-[640px] w-full object-contain" />
          ) : null}
          {result?.kind === "video" ? (
            <video src={result.url} controls className="h-full max-h-[640px] w-full object-contain" />
          ) : null}
          {!result ? (
            <div className="max-w-sm p-8 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-blue-primary/15 text-blue-electric">
                {kind === "image" ? <ImageIcon aria-hidden className="size-6" /> : <Video aria-hidden className="size-6" />}
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-white">God-tier media generator</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">MALIK Vision и MALIK Cinema автоматически выбирают доступный серверный engine и безопасный fallback.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ModeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: MediaKind; children: React.ReactNode }) {
  const Icon = icon === "image" ? ImageIcon : Video;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
        active ? "border-blue-primary/50 bg-blue-primary/20 text-white" : "border-white/12 bg-white/[0.06] text-slate-300 hover:text-white"
      }`}
    >
      <Icon aria-hidden className="size-4" />
      {children}
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-200">
      {label}
      <select
        className="min-h-12 rounded-[8px] border border-white/12 bg-[#0b1220] px-4 text-white outline-none transition focus:border-blue-electric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

