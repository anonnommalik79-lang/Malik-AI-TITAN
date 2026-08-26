"use client";

import React, { FormEvent, useCallback, useRef, useState } from "react";
import { Check, ChevronRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import "./sovereign-mobile-auth.css";

type Provider = "google" | "github" | "apple" | "microsoft";

const T = {
  pill: "\u041f\u0420\u0418\u0412\u0410\u0422\u041d\u042b\u0419 \u0414\u041e\u0421\u0422\u0423\u041f",
  tagline: "\u0422\u0432\u043e\u044f \u0438\u043d\u0442\u0435\u043b\u043b\u0435\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u0440\u0430\u0431\u043e\u0447\u0430\u044f \u0437\u043e\u043d\u0430 \u0443\u0436\u0435 \u0433\u043e\u0442\u043e\u0432\u0430.",
  username: "\u0418\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f",
  password: "\u041f\u0430\u0440\u043e\u043b\u044c",
  repeat: "\u041f\u043e\u0432\u0442\u043e\u0440",
  passPh: "\u041c\u0438\u043d. 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432",
  repeatPh: "\u0415\u0449\u0451 \u0440\u0430\u0437",
  opening: "\u041e\u0442\u043a\u0440\u044b\u0432\u0430\u044e...",
  cont: "\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c",
  divider: "\u0438\u043b\u0438 \u0432\u043e\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437",
  guest: "\u0412\u043e\u0439\u0442\u0438 \u043a\u0430\u043a \u0433\u043e\u0441\u0442\u044c",
  toggleSignIn: "\u0423\u0436\u0435 \u0435\u0441\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442? \u0412\u043e\u0439\u0442\u0438",
  toggleSignUp: "\u041d\u0435\u0442 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430? \u0421\u043e\u0437\u0434\u0430\u0442\u044c",
  badName: "\u0418\u043c\u044f \u043c\u0438\u043d\u0438\u043c\u0443\u043c 2 \u0441\u0438\u043c\u0432\u043e\u043b\u0430.",
  badEmail: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email.",
  badPass: "\u041f\u0430\u0440\u043e\u043b\u044c \u043c\u0438\u043d\u0438\u043c\u0443\u043c 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.",
  badRepeat: "\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442.",
};

function read(ref: React.RefObject<HTMLInputElement | null>) {
  return ref.current?.value?.trim() || "";
}

function ProviderIcon({ type }: { type: Provider }) {
  if (type === "google") {
    return (
      <svg viewBox="0 0 24 24" className="sma-provider-svg" aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.4c-.2 1.2-.9 2.3-2 3v2.8h3.2c1.9-1.8 3-4.3 3-7.8Z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.8c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.9C4.7 19.7 8.1 22 12 22Z" />
        <path fill="#FBBC05" d="M6.4 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V6.9H3.1C2.4 8.3 2 9.9 2 11.6s.4 3.3 1.1 4.7l3.3-2.8Z" />
        <path fill="#EA4335" d="M12 5.6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.6 14.7 1.6 12 1.6 8.1 1.6 4.7 3.9 3.1 6.9l3.3 2.8c.8-2.3 3-4.1 5.6-4.1Z" />
      </svg>
    );
  }
  if (type === "github") {
    return (
      <svg viewBox="0 0 24 24" className="sma-provider-svg" aria-hidden="true">
        <path fill="currentColor" d="M12 2.3c-5.5 0-10 4.5-10 10 0 4.4 2.9 8.2 6.9 9.5.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.5 2.4 1.1 2.9.8.1-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1 .8-.2 1.6-.3 2.5-.3s1.7.1 2.5.3c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.8 1 .8 2v2.9c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.5 0-5.5-4.5-10-10-10Z" />
      </svg>
    );
  }
  if (type === "apple") {
    return (
      <svg viewBox="0 0 24 24" className="sma-provider-svg" aria-hidden="true">
        <path fill="currentColor" d="M16.7 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.8-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1.1 8.4.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4 0 0-2.7-1-2.8-3.3ZM14.7 6.5c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1.1.1 2.1-.5 2.8-1.3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="sma-provider-svg" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

export function SovereignMobileRegister() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [isOpening, setIsOpening] = useState(false);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [usernameValue, setUsernameValue] = useState("Abdumalik");
  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = usernameValue.trim();
    const email = read(emailRef).toLowerCase();
    const password = read(passwordRef);
    const confirm = read(confirmRef);

    if (authMode === "signup" && username.length < 2) return setMessage(T.badName);
    if (!email.includes("@") || !email.includes(".")) return setMessage(T.badEmail);
    if (password.length < 6) return setMessage(T.badPass);
    if (authMode === "signup" && password !== confirm) return setMessage(T.badRepeat);

    setIsOpening(true);
    setMessage("");
    window.location.assign("/sign-in");
  }, [authMode, usernameValue]);

  const openOAuth = useCallback((_provider: "google" | "github") => {
    if (isOpening) return;
    setIsOpening(true);
    setMessage("");
    window.location.assign("/sign-in");
  }, [isOpening]);

  return (
    <main className="sma-root" aria-label="Sovereign mobile registration">
      <div className="sma-bg-mesh" aria-hidden="true" />
      <div className="sma-bg-particles" aria-hidden="true" />
      <div className="sma-bg-glow" aria-hidden="true" />
      <div className="sma-bg-veil" aria-hidden="true" />

      <div className="sma-scroll">
        <section className="sma-card">
          <div className="sma-card-ring" aria-hidden="true" />

          <span className="sma-pill"><Lock size={11} strokeWidth={2.2} />{T.pill}</span>

          <h1 className="sma-title">
            {authMode === "signin" ? (
              <>Войти в <span className="sma-title-accent">Sovereign Hub.</span></>
            ) : (
              <>Создать <span className="sma-title-accent">Sovereign ID.</span></>
            )}
          </h1>
          <p className="sma-tagline">{T.tagline}</p>

          <form className="sma-form" onSubmit={submit}>
            {authMode === "signup" && (
              <label className="sma-field" htmlFor="sma-username">
                <span>{T.username}</span>
                <div className="sma-input-wrap">
                  <User className="sma-input-icon" size={16} strokeWidth={2.2} />
                  <input
                    id="sma-username"
                    value={usernameValue}
                    onChange={(e) => setUsernameValue(e.target.value)}
                    autoComplete="username"
                  />
                  {usernameValue.trim().length >= 2 && <Check className="sma-input-valid" size={16} strokeWidth={2.4} />}
                </div>
              </label>
            )}

            <label className="sma-field" htmlFor="sma-email">
              <span>Email</span>
              <div className="sma-input-wrap">
                <Mail className="sma-input-icon" size={16} strokeWidth={2.2} />
                <input id="sma-email" ref={emailRef} type="email" placeholder="name@domain.com" autoComplete="email" />
              </div>
            </label>

            <label className="sma-field" htmlFor="sma-password">
              <span>{T.password}</span>
              <div className="sma-input-wrap">
                <Lock className="sma-input-icon" size={16} strokeWidth={2.2} />
                <input
                  id="sma-password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  placeholder={T.passPh}
                  autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                />
                <button type="button" className="sma-eye" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {authMode === "signup" && (
              <label className="sma-field" htmlFor="sma-confirm">
                <span>{T.repeat}</span>
                <div className="sma-input-wrap">
                  <Lock className="sma-input-icon" size={16} strokeWidth={2.2} />
                  <input
                    id="sma-confirm"
                    ref={confirmRef}
                    type={showConfirm ? "text" : "password"}
                    placeholder={T.repeatPh}
                    autoComplete="new-password"
                  />
                  <button type="button" className="sma-eye" onClick={() => setShowConfirm((v) => !v)} aria-label="Toggle confirm password">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            )}

            <button className="sma-cta" type="submit" disabled={isOpening}>
              <span>{isOpening ? T.opening : T.cont}</span>
              <ChevronRight size={18} strokeWidth={2.6} />
            </button>

            <div className="sma-divider">
              <i />
              <small>{T.divider}</small>
              <i />
            </div>

            <div className="sma-socials">
              {([
                { id: "google" as const, label: "Google", type: "google" as Provider },
                { id: "github" as const, label: "GitHub", type: "github" as Provider },
              ]).map((item) => {
                const disabled = isOpening;
                return (
                  <button key={item.id} type="button" onClick={() => openOAuth(item.id)} disabled={disabled}>
                    <ProviderIcon type={item.type} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {message && <p className="sma-message">{message}</p>}

            <button type="button" className="sma-toggle" onClick={() => setAuthMode((m) => (m === "signin" ? "signup" : "signin"))}>
              {authMode === "signin" ? T.toggleSignUp : T.toggleSignIn}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default SovereignMobileRegister;
