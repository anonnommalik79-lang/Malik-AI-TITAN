"use client";

import React, { useEffect, useRef } from "react";
import type { MalikSpaceMode } from "./MalikSpaceV9999999X";

type Star = {
  x: number;
  y: number;
  z: number;
  r: number;
  alpha: number;
  phase: number;
  vx: number;
  vy: number;
  hue: number;
};

type Particle = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  vx: number;
  vy: number;
};

type Streak = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  len: number;
  w: number;
  kind: "star" | "meteor" | "comet" | "fire";
};

const SETTINGS = {
  clean: { stars: 160, dust: 28, maxStreaks: 4, streakChance: 0.010, cometChance: 0.0012, drift: 0.08 },
  nasa: { stars: 260, dust: 48, maxStreaks: 6, streakChance: 0.018, cometChance: 0.0022, drift: 0.12 },
  titan: { stars: 380, dust: 72, maxStreaks: 8, streakChance: 0.026, cometChance: 0.0032, drift: 0.16 },
  omega: { stars: 520, dust: 92, maxStreaks: 10, streakChance: 0.036, cometChance: 0.0044, drift: 0.20 },
} as const;

function getReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function star(width: number, height: number, drift: number): Star {
  const z = Math.random() * 0.94 + 0.06;
  const colorRoll = Math.random();

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    z,
    r: Math.random() * 1.4 + 0.22,
    alpha: Math.random() * 0.7 + 0.16,
    phase: Math.random() * Math.PI * 2,
    vx: (Math.random() - 0.5) * drift * z,
    vy: (Math.random() * 0.34 + 0.04) * drift * z,
    hue: colorRoll > 0.92 ? 45 : colorRoll > 0.76 ? 258 : 210 + Math.random() * 30,
  };
}

function particle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 2.7 + 0.3,
    alpha: Math.random() * 0.05 + 0.012,
    vx: (Math.random() - 0.5) * 0.025,
    vy: (Math.random() - 0.5) * 0.025,
  };
}

function spawnStreak(width: number, height: number, kind?: Streak["kind"]): Streak {
  const types: Streak["kind"][] = ["star", "meteor", "comet", "fire"];
  const selected = kind || types[Math.floor(Math.random() * types.length)];
  const side = Math.floor(Math.random() * 4);

  let x = Math.random() * width;
  let y = Math.random() * height;

  if (side === 0) { x = -180; y = Math.random() * height * 0.78; }
  if (side === 1) { x = width + 180; y = Math.random() * height * 0.78; }
  if (side === 2) { x = Math.random() * width; y = -120; }
  if (side === 3) { x = Math.random() * width; y = height + 120; }

  const targetX = width * (0.15 + Math.random() * 0.7);
  const targetY = height * (0.14 + Math.random() * 0.72);
  const dx = targetX - x;
  const dy = targetY - y;
  const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));

  const speed =
    selected === "star" ? 6 + Math.random() * 7 :
    selected === "meteor" ? 8 + Math.random() * 8 :
    selected === "comet" ? 5 + Math.random() * 6 :
    7 + Math.random() * 7;

  return {
    x,
    y,
    vx: (dx / d) * speed,
    vy: (dy / d) * speed,
    life: 0,
    maxLife:
      selected === "star" ? 42 + Math.random() * 30 :
      selected === "meteor" ? 56 + Math.random() * 34 :
      selected === "comet" ? 90 + Math.random() * 64 :
      68 + Math.random() * 42,
    len:
      selected === "star" ? 90 + Math.random() * 120 :
      selected === "meteor" ? 140 + Math.random() * 150 :
      selected === "comet" ? 230 + Math.random() * 260 :
      180 + Math.random() * 200,
    w:
      selected === "star" ? 1 + Math.random() * 1.2 :
      selected === "meteor" ? 1.6 + Math.random() * 1.7 :
      selected === "comet" ? 2.5 + Math.random() * 2.8 :
      2.2 + Math.random() * 2.4,
    kind: selected,
  };
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  alpha: number,
  kind: Streak["kind"]
) {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);

  if (kind === "fire") {
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.18, `rgba(255, 84, 33, ${0.10 * alpha})`);
    g.addColorStop(0.52, `rgba(255, 157, 64, ${0.56 * alpha})`);
    g.addColorStop(0.82, `rgba(255, 255, 240, ${0.98 * alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
  } else if (kind === "comet") {
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.25, `rgba(94, 234, 212, ${0.14 * alpha})`);
    g.addColorStop(0.60, `rgba(147, 197, 253, ${0.50 * alpha})`);
    g.addColorStop(0.86, `rgba(255,255,255, ${0.98 * alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.34, `rgba(80, 170, 255, ${0.18 * alpha})`);
    g.addColorStop(0.78, `rgba(235, 250, 255, ${0.92 * alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  if (kind === "fire" || kind === "comet") {
    ctx.lineWidth = width * 4.8;
    ctx.globalAlpha = alpha * 0.22;
    ctx.stroke();
  }

  ctx.restore();
}

export function SpaceDeepCanvas({ mode = "omega" }: { mode?: MalikSpaceMode }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const stars = useRef<Star[]>([]);
  const dust = useRef<Particle[]>([]);
  const streaks = useRef<Streak[]>([]);
  const size = useRef({ width: 0, height: 0, dpr: 1 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const canvasEl = canvas;
    const ctx2d = ctx;
    const set = SETTINGS[mode];
    const reduced = getReducedMotion();

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (width === size.current.width && height === size.current.height && dpr === size.current.dpr) {
        return;
      }

      size.current = { width, height, dpr };
      canvasEl.width = Math.floor(width * dpr);
      canvasEl.height = Math.floor(height * dpr);
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars.current = Array.from({ length: set.stars }, () => star(width, height, set.drift));
      dust.current = Array.from({ length: set.dust }, () => particle(width, height));
      streaks.current = [];
    }

    function draw(t: number) {
      const { width, height } = size.current;
      if (!width || !height) {
        raf.current = window.requestAnimationFrame(draw);
        return;
      }

      ctx2d.clearRect(0, 0, width, height);

      const blue = ctx2d.createRadialGradient(width * 0.5, height * 0.92, 0, width * 0.5, height * 0.92, Math.max(width, height) * 0.72);
      blue.addColorStop(0, "rgba(48, 130, 255, 0.080)");
      blue.addColorStop(0.38, "rgba(52, 74, 180, 0.040)");
      blue.addColorStop(1, "rgba(0,0,0,0)");
      ctx2d.fillStyle = blue;
      ctx2d.fillRect(0, 0, width, height);

      for (const p of dust.current) {
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }

        ctx2d.beginPath();
        ctx2d.fillStyle = `rgba(120, 210, 255, ${p.alpha})`;
        ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx2d.fill();
      }

      for (const s of stars.current) {
        if (!reduced) {
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < -8) s.x = width + 8;
          if (s.x > width + 8) s.x = -8;
          if (s.y < -8) s.y = height + 8;
          if (s.y > height + 8) s.y = -8;
        }

        const tw = reduced ? 0.78 : 0.70 + Math.sin(t * 0.0017 + s.phase) * 0.30;
        const alpha = Math.max(0.06, s.alpha * tw);
        const r = s.r * (0.62 + s.z * 1.45);

        ctx2d.beginPath();
        ctx2d.fillStyle = `hsla(${s.hue}, 92%, 90%, ${alpha})`;
        ctx2d.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx2d.fill();

        if (s.z > 0.80 && alpha > 0.38) {
          ctx2d.beginPath();
          ctx2d.fillStyle = `rgba(100, 210, 255, ${alpha * 0.14})`;
          ctx2d.arc(s.x, s.y, r * 5.2, 0, Math.PI * 2);
          ctx2d.fill();
        }
      }

      if (!reduced) {
        if (Math.random() < set.streakChance && streaks.current.length < set.maxStreaks) {
          streaks.current.push(spawnStreak(width, height, "star"));
        }
        if (Math.random() < set.cometChance && streaks.current.length < set.maxStreaks + 2) {
          streaks.current.push(spawnStreak(width, height, Math.random() > 0.45 ? "fire" : "comet"));
        }
      }

      streaks.current = streaks.current.filter((st) => {
        st.life += 1;
        st.x += st.vx;
        st.y += st.vy;

        const p = st.life / st.maxLife;
        const alpha = Math.sin(Math.min(1, p) * Math.PI);
        const a = Math.atan2(st.vy, st.vx);
        const x2 = st.x - Math.cos(a) * st.len;
        const y2 = st.y - Math.sin(a) * st.len;

        line(ctx2d, x2, y2, st.x, st.y, st.w, alpha, st.kind);

        return st.life < st.maxLife && st.x > -600 && st.x < width + 600 && st.y > -600 && st.y < height + 600;
      });

      raf.current = window.requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    raf.current = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    };
  }, [mode]);

  return <canvas ref={ref} className="malik-space-x__canvas" />;
}

export default SpaceDeepCanvas;
