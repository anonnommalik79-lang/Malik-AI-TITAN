"use client";

import React, { useCallback, useEffect, useState } from "react";
import "./sovereign-mobile-auth.css";
import "./sovereign-mobile-auth-black.css";

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

function GuestIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.2 20c.7-3.3 3.1-5.2 6.8-5.2s6.1 1.9 6.8 5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SovereignMobileRegister() {
  const [typed, setTyped] = useState("");
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers = new Set<number>();

    const later = (callback: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!cancelled) callback();
      }, ms);
      timers.add(id);
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
        if (cursor < phrase.length) {
          later(typeNext, TYPE_MS);
          return;
        }
        later(() => {
          setTyped("");
          later(() => runPhrase((phraseIndex + 1) % PHRASES.length), GAP_MS);
        }, phraseIndex === PHRASES.length - 1 ? FINAL_HOLD_MS : HOLD_MS);
      };

      later(typeNext, 80);
    };

    runPhrase(0);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const go = useCallback((path: string) => {
    if (navigating) return;
    setNavigating(true);
    window.location.assign(path);
  }, [navigating]);

  const close = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/");
  }, []);

  return (
    <main className="sma-root" data-auth-surface="black" aria-label="Malik AI mobile authentication">
      <button className="sma-close" type="button" aria-label="Закрыть" onClick={close}>
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
          className="sma-auth-button sma-auth-button--dark"
          type="button"
          disabled={navigating}
          onClick={() => go("/sign-in")}
        >
          <span className="sma-auth-icon"><GoogleIcon /></span>
          <span>{navigating ? "Открываю..." : "Продолжить с Google"}</span>
        </button>

        <button
          className="sma-auth-button sma-auth-button--apple"
          type="button"
          disabled={navigating}
          onClick={() => go("/sign-in")}
        >
          <span className="sma-auth-icon"><AppleIcon /></span>
          <span>{navigating ? "Открываю..." : "Продолжить с Apple"}</span>
        </button>

        <button
          className="sma-auth-button sma-auth-button--dark"
          type="button"
          disabled={navigating}
          onClick={() => go("/guest")}
        >
          <span className="sma-auth-icon"><GuestIcon /></span>
          <span>{navigating ? "Открываю..." : "Войти через гостя"}</span>
        </button>
      </section>
    </main>
  );
}

export default SovereignMobileRegister;
