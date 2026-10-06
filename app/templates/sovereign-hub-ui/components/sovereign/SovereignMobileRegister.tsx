"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronRight, Code2, ImageIcon, LockKeyhole, Mail, MessageCircle, Music2, Play, UserRound, Users, Zap } from "lucide-react";
import "./sovereign-mobile-auth.css";
import "./sovereign-mobile-auth-black.css";

const PHRASES = [
  "Создавай быстрее",
  "Давайте изучать",
  "Находи главное",
  "Исследуй глубже",
  "Делай невозможное",
  "Malik AI",
] as const;

const TYPE_MS = 42;
const HOLD_MS = 420;
const FINAL_HOLD_MS = 980;
const GAP_MS = 105;

const FEATURES = [
  { id: "chat", title: "Чат", detail: "Топ-модели", icon: MessageCircle },
  { id: "images", title: "Изображения", detail: "Высокое качество", icon: ImageIcon },
  { id: "video", title: "Видео", detail: "Идеи в движении", icon: Play },
  { id: "music", title: "Музыка", detail: "Треки и лирика", icon: Music2 },
  { id: "work", title: "Malik Work", detail: "Код и проекты", icon: Code2 },
] as const;

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

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

export function SovereignMobileRegister() {
  const [typed, setTyped] = useState("");
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    // Safari can restore this exact page from its back/forward cache.
    const restore = () => setNavigating(false);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

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

  const wordBreak = typed.indexOf(" ");
  const firstLine = wordBreak < 0 ? typed : typed.slice(0, wordBreak);
  const secondLine = wordBreak < 0 ? "" : typed.slice(wordBreak + 1);

  return (
    <main className="sma-root" data-auth-surface="orbit" data-preserve-brand-color="true" aria-label="Вход в Malik AI">
      <img className="sma-orbit-background" src="/images/auth-mobile-orbit.jpg" alt="" fetchPriority="high" aria-hidden="true" />
      <div className="sma-orbit-shade" aria-hidden="true" />
      <div className="sma-content">
        <section className="sma-hero">
          <div className="sma-brand" aria-label="Malik AI — Sovereign AI Labs">
            <img className="sma-brand-mark" src="/brand/malik-mark.svg" alt="" />
            <div className="sma-brand-name">MALIK <span>AI</span></div>
            <div className="sma-brand-tagline">SOVEREIGN AI LABS</div>
          </div>
          <h1 className="sma-typewriter" aria-label="Создавай быстрее с Malik AI">
            <span className="sma-type-text" aria-hidden="true">
              <span className="sma-type-first">{firstLine}</span>
              <span className="sma-type-second">{secondLine}<span className="sma-type-caret" /></span>
            </span>
          </h1>
          <p className="sma-description">Malik AI помогает создавать, анализировать<br className="sma-wide-break" /> и работать быстрее с помощью<br className="sma-wide-break" /> искусственного интеллекта.</p>
        </section>

        <nav className="sma-features" aria-label="Возможности Malik AI">
          {FEATURES.map(({ id, title, detail, icon: Icon }) => (
            <button key={id} className="sma-feature" type="button" disabled={navigating} onClick={() => go(`/guest?feature=${id}`)}>
              <Icon aria-hidden="true" />
              <span className="sma-feature-title">{title}</span>
              <span className="sma-feature-detail">{detail}</span>
            </button>
          ))}
        </nav>

        <section className="sma-auth-panel" aria-label="Способы входа" aria-busy={navigating}>
          <button
            className="sma-auth-button"
            type="button"
            disabled={navigating}
            onClick={() => go("/sign-in?provider=google")}
          >
            <span className="sma-auth-icon"><GoogleIcon /></span>
            <span>Продолжить с Google</span>
            <ChevronRight className="sma-chevron" aria-hidden="true" />
          </button>

          <button
            className="sma-auth-button"
            type="button"
            disabled={navigating}
            onClick={() => go("/sign-in?provider=apple")}
          >
            <span className="sma-auth-icon"><AppleIcon /></span>
            <span>Продолжить с Apple</span>
            <ChevronRight className="sma-chevron" aria-hidden="true" />
          </button>

          <button
            className="sma-auth-button"
            type="button"
            disabled={navigating}
            onClick={() => go("/sign-in?provider=microsoft")}
          >
            <span className="sma-auth-icon"><MicrosoftIcon /></span>
            <span>Продолжить с Microsoft</span>
            <ChevronRight className="sma-chevron" aria-hidden="true" />
          </button>
          <div className="sma-divider"><span>или</span></div>
          <div className="sma-secondary-actions">
            <button className="sma-auth-button" type="button" disabled={navigating} onClick={() => go("/sign-in?provider=email")}>
              <span className="sma-auth-icon"><Mail aria-hidden="true" /></span>
              <span>Войти по Email</span><ChevronRight className="sma-chevron" aria-hidden="true" />
            </button>
            <button className="sma-auth-button" type="button" disabled={navigating} onClick={() => go("/guest")}>
              <span className="sma-auth-icon"><UserRound aria-hidden="true" /></span>
              <span>Войти как гость</span><ChevronRight className="sma-chevron" aria-hidden="true" />
            </button>
          </div>
          <p className="sma-navigation-status" role="status">{navigating ? "Открываю выбранный раздел…" : ""}</p>
        </section>

        <footer className="sma-footer">
          <div className="sma-benefits">
            <div><Users aria-hidden="true" /><p><strong>5 режимов</strong><span>для ваших идей</span></p></div>
            <div><Zap aria-hidden="true" /><p><strong>Топ-модели</strong><span>в одном месте</span></p></div>
            <div><LockKeyhole aria-hidden="true" /><p><strong>Защищённый</strong><span>вход в аккаунт</span></p></div>
          </div>
          <p className="sma-legal">Malik AI · Sovereign AI Labs<br /><a href="/security">Безопасность и конфиденциальность</a></p>
        </footer>
      </div>
    </main>
  );
}

export default SovereignMobileRegister;
