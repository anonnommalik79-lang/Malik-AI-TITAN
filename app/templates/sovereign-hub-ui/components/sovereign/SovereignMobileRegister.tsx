"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import "./sovereign-mobile-auth.css";

const PHRASES = [
  "Давайте изучать",
  "Находи главное",
  "Исследуй глубже",
  "Создавай быстрее",
  "Делай невозможное",
  "Malik AI",
] as const;

const TYPE_MS = 42;
const HOLD_MS = 420;
const FINAL_HOLD_MS = 980;
const GAP_MS = 105;

type HapticKind = "character" | "tap";

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.7 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.8-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1.1 8.4.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4 0 0-2.7-1-2.8-3.3ZM14.7 6.5c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1.1.1 2.1-.5 2.8-1.3Z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.4c-.2 1.2-.9 2.3-2 3v2.8h3.2c1.9-1.8 3-4.3 3-7.8Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.8c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.9C4.7 19.7 8.1 22 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V6.9H3.1C2.4 8.3 2 9.9 2 11.6s.4 3.3 1.1 4.7l3.3-2.8Z" />
      <path fill="#EA4335" d="M12 5.6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.6 14.7 1.6 12 1.6 8.1 1.6 4.7 3.9 3.1 6.9l3.3 2.8c.8-2.3 3-4.1 5.6-4.1Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.4 6.5h15.2c.8 0 1.4.6 1.4 1.4v8.2c0 .8-.6 1.4-1.4 1.4H4.4c-.8 0-1.4-.6-1.4-1.4V7.9c0-.8.6-1.4 1.4-1.4Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4.2 7.4 7.1 5.4c.4.3 1 .3 1.4 0l7.1-5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SovereignMobileRegister() {
  const [typed, setTyped] = useState("");
  const [restartKey, setRestartKey] = useState(0);
  const [navigating, setNavigating] = useState(false);

  const armedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const toneFilterRef = useRef<BiquadFilterNode | null>(null);

  const ensureAudio = useCallback(async () => {
    if (typeof window === "undefined") return;

    try {
      if (!audioRef.current) {
        const AudioCtor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (!AudioCtor) return;

        const ctx = new AudioCtor();
        const master = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        const toneFilter = ctx.createBiquadFilter();

        master.gain.value = 0.23;

        toneFilter.type = "lowpass";
        toneFilter.frequency.value = 920;
        toneFilter.Q.value = 0.45;

        compressor.threshold.value = -20;
        compressor.knee.value = 11;
        compressor.ratio.value = 2.7;
        compressor.attack.value = 0.001;
        compressor.release.value = 0.05;

        master.connect(toneFilter);
        toneFilter.connect(compressor);
        compressor.connect(ctx.destination);

        audioRef.current = ctx;
        masterRef.current = master;
        toneFilterRef.current = toneFilter;
      }

      if (audioRef.current.state === "suspended") {
        await audioRef.current.resume();
      }
    } catch {
      // Feedback is enhancement-only. Auth must never depend on it.
    }
  }, []);

  const playGentleDoubleTap = useCallback((kind: HapticKind) => {
    const ctx = audioRef.current;
    const master = masterRef.current;
    if (!armedRef.current || !ctx || !master || ctx.state !== "running") return;

    try {
      const now = ctx.currentTime;
      const strength = kind === "character" ? 0.86 : 1;

      const microTap = (at: number, level: number) => {
        const body = ctx.createOscillator();
        const bodyGain = ctx.createGain();

        body.type = "sine";
        body.frequency.setValueAtTime(236, at);
        body.frequency.exponentialRampToValueAtTime(184, at + 0.016);
        bodyGain.gain.setValueAtTime(0.0001, at);
        bodyGain.gain.exponentialRampToValueAtTime(0.082 * strength * level, at + 0.001);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.021);
        body.connect(bodyGain);
        bodyGain.connect(master);
        body.start(at);
        body.stop(at + 0.023);

        const edge = ctx.createOscillator();
        const edgeGain = ctx.createGain();

        edge.type = "triangle";
        edge.frequency.setValueAtTime(355, at);
        edge.frequency.exponentialRampToValueAtTime(286, at + 0.0065);
        edgeGain.gain.setValueAtTime(0.0001, at);
        edgeGain.gain.exponentialRampToValueAtTime(0.024 * strength * level, at + 0.0007);
        edgeGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.008);
        edge.connect(edgeGain);
        edgeGain.connect(master);
        edge.start(at);
        edge.stop(at + 0.009);
      };

      // Every visible character gets a soft “тук-тук”: first tap + lighter echo.
      microTap(now, 1);
      microTap(now + 0.012, 0.52);
    } catch {
      // Ignore browsers that reject an individual audio node.
    }
  }, []);

  const pulse = useCallback((kind: HapticKind) => {
    if (typeof window === "undefined") return;

    let nativeHandled = false;
    const bridge = window as typeof window & {
      nativeHapticTick?: () => void;
      nativeHapticTap?: () => void;
      webkit?: {
        messageHandlers?: {
          malikHaptics?: { postMessage: (payload: unknown) => void };
        };
      };
    };

    try {
      if (kind === "character" && bridge.nativeHapticTick) {
        bridge.nativeHapticTick();
        nativeHandled = true;
      } else if (kind === "tap" && bridge.nativeHapticTap) {
        bridge.nativeHapticTap();
        nativeHandled = true;
      } else if (bridge.webkit?.messageHandlers?.malikHaptics) {
        bridge.webkit.messageHandlers.malikHaptics.postMessage({
          type: kind,
          intensity: kind === "character" ? 0.36 : 0.58,
          sharpness: kind === "character" ? 0.5 : 0.66,
        });
        nativeHandled = true;
      }
    } catch {
      nativeHandled = false;
    }

    if (!nativeHandled && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(kind === "character" ? [3, 5, 3] : [7, 7, 7]);
      } catch {
        // iOS Safari ignores web vibration; sound still works after user gesture.
      }
    }

    playGentleDoubleTap(kind);
  }, [playGentleDoubleTap]);

  const armFeedback = useCallback(async () => {
    if (armedRef.current) return;

    // Mobile browsers require one real gesture before WebAudio may play.
    // Once armed, restart the intro so every following character has sound.
    armedRef.current = true;
    await ensureAudio();
    pulse("tap");
    setRestartKey((value) => value + 1);
  }, [ensureAudio, pulse]);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const later = (callback: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) callback();
      }, ms);
      timers.push(id);
    };

    const runPhrase = (phraseIndex: number) => {
      if (cancelled) return;

      const phrase = PHRASES[phraseIndex];
      setTyped("");
      let cursor = 0;

      const typeNext = () => {
        if (cancelled) return;

        cursor += 1;
        setTyped(phrase.slice(0, cursor));

        const character = phrase[cursor - 1];
        if (armedRef.current && character && character.trim()) {
          pulse("character");
        }

        if (cursor < phrase.length) {
          later(typeNext, TYPE_MS);
          return;
        }

        const hold = phraseIndex === PHRASES.length - 1 ? FINAL_HOLD_MS : HOLD_MS;
        later(() => {
          setTyped("");
          later(() => runPhrase((phraseIndex + 1) % PHRASES.length), GAP_MS);
        }, hold);
      };

      later(typeNext, 80);
    };

    runPhrase(0);

    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [pulse, restartKey]);

  useEffect(() => {
    return () => {
      try {
        toneFilterRef.current?.disconnect();
        void audioRef.current?.close();
      } catch {
        // no-op
      }
    };
  }, []);

  const openSignIn = useCallback(async () => {
    if (navigating) return;
    setNavigating(true);
    await ensureAudio();
    pulse("tap");
    window.location.assign("/sign-in");
  }, [ensureAudio, navigating, pulse]);

  const close = useCallback(async () => {
    await ensureAudio();
    pulse("tap");

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign("/");
    }
  }, [ensureAudio, pulse]);

  return (
    <main
      className="sma-root"
      aria-label="Malik AI mobile authentication"
      onPointerDownCapture={() => {
        void armFeedback();
      }}
    >
      <button className="sma-close" type="button" aria-label="Закрыть" onClick={() => void close()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7 7 17" />
        </svg>
      </button>

      <section className="sma-hero" aria-live="polite">
        <div className="sma-typewriter">
          <span className="sma-type-text">{typed}</span>
          <span className="sma-type-dot" aria-hidden="true" />
        </div>
      </section>

      <section className="sma-auth-panel" aria-label="Способы входа">
        <button
          className="sma-auth-button sma-auth-button--apple"
          type="button"
          disabled={navigating}
          onClick={() => void openSignIn()}
        >
          <span className="sma-auth-icon"><AppleIcon /></span>
          <span>Продолжить с Apple</span>
        </button>

        <button
          className="sma-auth-button sma-auth-button--dark"
          type="button"
          disabled={navigating}
          onClick={() => void openSignIn()}
        >
          <span className="sma-auth-icon"><GoogleIcon /></span>
          <span>Продолжить с Google</span>
        </button>

        <button
          className="sma-auth-button sma-auth-button--dark"
          type="button"
          disabled={navigating}
          onClick={() => void openSignIn()}
        >
          <span className="sma-auth-icon"><MailIcon /></span>
          <span>{navigating ? "Открываю..." : "Войти или зарегистрироваться"}</span>
        </button>
      </section>
    </main>
  );
}

export default SovereignMobileRegister;
