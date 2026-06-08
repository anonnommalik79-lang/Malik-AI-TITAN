"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { loginWithSocialProvider, type SocialProviderId } from "@/lib/auth/social-providers";
import { isSupabaseConfigured, persistGuestUser } from "@/lib/supabase";
import SovereignMobileRegister from "@/components/sovereign/SovereignMobileRegister";
import { AUTH_DRAGON_BACKGROUND, AUTH_DRAGON_JPG } from "@/lib/brand-assets";

type Provider = "email" | "google" | "github" | "apple" | "discord" | "microsoft" | "guest";

const T = {
  pill: "\u041f\u0420\u0418\u0412\u0410\u0422\u041d\u042b\u0419 \u0414\u041e\u0421\u0422\u0423\u041f",
  titleSignUp: "\u0421\u043e\u0437\u0434\u0430\u0442\u044c Sovereign ID.",
  titleSignIn: "\u0412\u043e\u0439\u0442\u0438 \u0432 Sovereign Hub.",
  toggleSignIn: "\u0423\u0436\u0435 \u0435\u0441\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442? \u0412\u043e\u0439\u0442\u0438",
  toggleSignUp: "\u041d\u0435\u0442 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430? \u0421\u043e\u0437\u0434\u0430\u0442\u044c",
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
  badName: "\u0418\u043c\u044f \u043c\u0438\u043d\u0438\u043c\u0443\u043c 2 \u0441\u0438\u043c\u0432\u043e\u043b\u0430.",
  badEmail: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email.",
  badPass: "\u041f\u0430\u0440\u043e\u043b\u044c \u043c\u0438\u043d\u0438\u043c\u0443\u043c 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.",
  badRepeat: "\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442.",
};

function read(ref: React.RefObject<HTMLInputElement | null>) {
  return ref.current?.value?.trim() || "";
}

type OAuthProviderState = { id: SocialProviderId; name: string; enabled: boolean; configured: boolean }

async function loadOAuthProviders(): Promise<OAuthProviderState[]> {
  try {
    const response = await fetch("/api/health/auth", { cache: "no-store" });
    if (!response.ok) throw new Error("auth health unavailable");
    const data = await response.json();
    return Array.isArray(data?.oauthProviders) ? data.oauthProviders : [];
  } catch {
    return [];
  }
}

function ProviderIcon({ type }: { type: Provider }) {
  if (type === "google") {
    return (
      <svg viewBox="0 0 24 24" className="sva-provider-svg" aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.4c-.2 1.2-.9 2.3-2 3v2.8h3.2c1.9-1.8 3-4.3 3-7.8Z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.8c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.9C4.7 19.7 8.1 22 12 22Z" />
        <path fill="#FBBC05" d="M6.4 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V6.9H3.1C2.4 8.3 2 9.9 2 11.6s.4 3.3 1.1 4.7l3.3-2.8Z" />
        <path fill="#EA4335" d="M12 5.6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.6 14.7 1.6 12 1.6 8.1 1.6 4.7 3.9 3.1 6.9l3.3 2.8c.8-2.3 3-4.1 5.6-4.1Z" />
      </svg>
    );
  }

  if (type === "github") {
    return (
      <svg viewBox="0 0 24 24" className="sva-provider-svg" aria-hidden="true">
        <path fill="currentColor" d="M12 2.3c-5.5 0-10 4.5-10 10 0 4.4 2.9 8.2 6.9 9.5.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.5 2.4 1.1 2.9.8.1-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1 .8-.2 1.6-.3 2.5-.3s1.7.1 2.5.3c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.8 1 .8 2v2.9c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.5 0-5.5-4.5-10-10-10Z" />
      </svg>
    );
  }

  if (type === "apple") {
    return (
      <svg viewBox="0 0 24 24" className="sva-provider-svg" aria-hidden="true">
        <path fill="currentColor" d="M16.7 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.8-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1.1 8.4.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4 0 0-2.7-1-2.8-3.3ZM14.7 6.5c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1.1.1 2.1-.5 2.8-1.3Z" />
      </svg>
    );
  }

  if (type === "discord") {
    return (
      <svg viewBox="0 0 24 24" className="sva-provider-svg" aria-hidden="true">
        <path fill="#5865F2" d="M19.5 4.5A16.7 16.7 0 0 0 15.7 3c-.2.4-.5 1-.7 1.5a15.4 15.4 0 0 0-6 0C8.8 4 8.5 3.4 8.3 3A16.8 16.8 0 0 0 4.5 4.5 27.7 27.7 0 0 0 .7 16.2 16.9 16.9 0 0 0 5 19.2c.4-.6.8-1.1 1.1-1.7-.6-.2-1.2-.5-1.7-.8l.4-.3c3.3 1.5 6.9 1.5 10.1 0l.4.3c-.5.3-1.1.6-1.7.8.3.6.7 1.2 1.1 1.7a16.8 16.8 0 0 0 4.3-3 27.5 27.5 0 0 0-3.8-11.7ZM8.2 13.8c-.9 0-1.7-.8-1.7-1.8s.7-1.8 1.7-1.8 1.7.8 1.7 1.8-.8 1.8-1.7 1.8Zm7.6 0c-.9 0-1.7-.8-1.7-1.8s.7-1.8 1.7-1.8 1.7.8 1.7 1.8-.8 1.8-1.7 1.8Z" />
      </svg>
    );
  }

  if (type === "microsoft") {
    return (
      <svg viewBox="0 0 24 24" className="sva-provider-svg" aria-hidden="true">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
      </svg>
    );
  }

  return null;
}

export function SovereignVideoAuth() {
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [isOpening, setIsOpening] = useState(false);
  const [message, setMessage] = useState("");
  const [bgFailed, setBgFailed] = useState(false);
  const [bgSrc, setBgSrc] = useState(AUTH_DRAGON_JPG);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [usernameValue, setUsernameValue] = useState("Abdumalik");
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderState[]>([]);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    void loadOAuthProviders().then(setOauthProviders);
  }, []);

  const openGuest = useCallback(() => {
    if (isOpening) return;
    setIsOpening(true);
    persistGuestUser();
    router.push("/dashboard");
  }, [isOpening, router]);

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const username = authMode === "signup" ? usernameValue.trim() : read(usernameRef);
    const email = read(emailRef).toLowerCase();
    const password = read(passwordRef);
    const confirm = read(confirmRef);

    if (authMode === "signup" && username.length < 2) return setMessage(T.badName);
    if (!email.includes("@") || !email.includes(".")) return setMessage(T.badEmail);
    if (password.length < 6) return setMessage(T.badPass);
    if (authMode === "signup" && password !== confirm) return setMessage(T.badRepeat);

    setIsOpening(true);
    setMessage("");
    try {
      const mod = await import("@/lib/supabase");
      const supabase = mod.getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured. Use guest mode.");
      if (authMode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session?.user) throw new Error("No session returned");
        mod.persistSupabaseUser(data.session.user);
        await mod.syncProfile(data.session);
        router.push("/dashboard");
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: username, full_name: username }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      if (!data.session) {
        setMessage("Check your email to confirm the account, then return to MALIK AI.");
        setIsOpening(false);
        return;
      }
      mod.persistSupabaseUser(data.session.user);
      await mod.syncProfile(data.session);
      router.push("/dashboard");
    } catch {
      setMessage(supabaseReady
        ? "Email auth failed. Check credentials or use guest mode."
        : "Supabase is not configured. Continue as guest.");
      setIsOpening(false);
    }
  }, [router, authMode, supabaseReady, usernameValue]);

  const openOAuth = useCallback(async (provider: SocialProviderId | "microsoft") => {
    if (isOpening) return;
    if (!supabaseReady) {
      setMessage("Configure Supabase to enable OAuth.");
      return;
    }
    setIsOpening(true);
    setMessage("");
    try {
      if (provider === "microsoft") {
        const mod = await import("@/lib/supabase");
        const client = mod.getSupabaseClient();
        if (!client) throw new Error("Supabase client missing");
        const { error } = await client.auth.signInWithOAuth({
          provider: "azure",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        return;
      }
      const row = oauthProviders.find((item) => item.id === provider);
      if (!row?.enabled) {
        setMessage(row?.configured === false ? "Configure Supabase to enable OAuth." : "This provider is disabled.");
        setIsOpening(false);
        return;
      }
      await loginWithSocialProvider(provider);
    } catch {
      setMessage("Secure social login is temporarily unavailable. Please use guest mode or try again later.");
      setIsOpening(false);
    }
  }, [isOpening, oauthProviders, supabaseReady]);

  return (
    <>
      <SovereignMobileRegister />
      <main className="sva-root sva-desktop-only">
      <div className="sva-bg-layer" aria-hidden="true" />
      <img
        className="sva-bg"
        src={bgSrc}
        alt=""
        draggable={false}
        onError={() => {
          if (bgSrc !== AUTH_DRAGON_BACKGROUND) setBgSrc(AUTH_DRAGON_BACKGROUND)
          else setBgFailed(true)
        }}
      />
      {bgFailed && <div className="sva-bg-fallback" />}

      <div className="sva-left-shadow" />
      <div className="sva-top-clear" />
      <div className="sva-dragon-aura" />
      <div className="sva-wind sva-wind-a" />
      <div className="sva-wind sva-wind-b" />

      <div className="sva-shell">
        <section className="sva-card">
          <div className="sva-card-header-veil" aria-hidden="true" />
          <div className="sva-card-corner-mask" aria-hidden="true" />
          <div className="sva-card-glow" aria-hidden="true" />
          <div className="sva-card-aura" />
          <div className="sva-card-line" />

          <div className="sva-hero">
            <span className="sva-pill"><Lock size={11} strokeWidth={2.2} />{T.pill}</span>
            <h1 className="sva-h1">
              {authMode === "signin" ? (
                T.titleSignIn
              ) : (
                <>
                  Создать <span className="sva-h1-accent">Sovereign ID.</span>
                </>
              )}
            </h1>
            <p className="sva-tagline">{T.tagline}</p>
            <button type="button" className="sva-mode-toggle" onClick={() => setAuthMode((m) => (m === "signin" ? "signup" : "signin"))}>
              {authMode === "signin" ? T.toggleSignUp : T.toggleSignIn}
            </button>
          </div>

          <form className="sva-form" onSubmit={submit}>
            {authMode === "signup" && (
              <label className="sva-field" htmlFor="sva-username">
                <span>{T.username}</span>
                <div className="sva-input-shell">
                  <User className="sva-input-icon" size={16} strokeWidth={2.2} />
                  <input
                    id="sva-username"
                    ref={usernameRef}
                    value={usernameValue}
                    onChange={(e) => setUsernameValue(e.target.value)}
                    autoComplete="username"
                  />
                  {usernameValue.trim().length >= 2 && <Check className="sva-input-valid" size={16} strokeWidth={2.4} />}
                </div>
              </label>
            )}

            <label className="sva-field" htmlFor="sva-email">
              <span>Email</span>
              <div className="sva-input-shell">
                <Mail className="sva-input-icon" size={16} strokeWidth={2.2} />
                <input id="sva-email" ref={emailRef} type="email" placeholder="name@domain.com" autoComplete="email" />
              </div>
            </label>

            <div className="sva-duo">
              <label className="sva-field" htmlFor="sva-password">
                <span>{T.password}</span>
                <div className="sva-input-shell">
                  <Lock className="sva-input-icon" size={16} strokeWidth={2.2} />
                  <input
                    id="sva-password"
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    placeholder={T.passPh}
                    autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                  />
                  <button type="button" className="sva-eye" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {authMode === "signup" && (
                <label className="sva-field" htmlFor="sva-confirm">
                  <span>{T.repeat}</span>
                  <div className="sva-input-shell">
                    <Lock className="sva-input-icon" size={16} strokeWidth={2.2} />
                    <input
                      id="sva-confirm"
                      ref={confirmRef}
                      type={showConfirm ? "text" : "password"}
                      placeholder={T.repeatPh}
                      autoComplete="new-password"
                    />
                    <button type="button" className="sva-eye" onClick={() => setShowConfirm((v) => !v)} aria-label="Toggle confirm password">
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              )}
            </div>

            <button className="sva-cta" type="submit" disabled={isOpening || !supabaseReady}>
              <span>{isOpening ? T.opening : T.cont}</span>
              <ChevronRight className="sva-cta-chevron" size={18} strokeWidth={2.6} />
            </button>

            <div className="sva-divider">
              <i />
              <small>{T.divider}</small>
              <i />
            </div>

            <div className="sva-socials">
              {([
                { id: "google" as const, label: "Google", type: "google" as Provider },
                { id: "github" as const, label: "GitHub", type: "github" as Provider },
                { id: "apple" as const, label: "Apple", type: "apple" as Provider },
                { id: "microsoft" as const, label: "Microsoft", type: "microsoft" as Provider },
              ]).map((item) => {
                const row = item.id === "microsoft" ? null : oauthProviders.find((p) => p.id === item.id);
                const disabled = isOpening || (item.id === "microsoft" ? !supabaseReady : !row?.enabled);
                const tooltip = item.id === "microsoft"
                  ? (supabaseReady ? "Microsoft / Azure OAuth" : "Configure Supabase")
                  : !row?.configured ? "Configure Supabase URL and anon key" : !row?.enabled ? "Provider disabled in env" : "";
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={tooltip}
                    onClick={() => openOAuth(item.id)}
                    disabled={disabled}
                  >
                    <ProviderIcon type={item.type} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <button className="sva-guest" type="button" onClick={openGuest} disabled={isOpening}>
              <User size={15} strokeWidth={2.2} />
              <span>{T.guest}</span>
            </button>

            {message && <p className="sva-message">{message}</p>}
          </form>
        </section>
      </div>

      <style>{styles}</style>
    </main>
    </>
  );
}

export default SovereignVideoAuth;

const styles = `
* { box-sizing: border-box; }
html, body { margin: 0; background: #000; }
@media (min-width: 981px) { html, body { overflow: hidden; } }

.sva-root {
  position: fixed;
  inset: 0;
  z-index: 5;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", system-ui, sans-serif;
  background: #01030a;
}

.sva-bg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #01030a;
}

.sva-bg {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 62% 44%;
  filter: brightness(1.05) contrast(1.06) saturate(1.08);
}


.sva-bg-fallback {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(circle at 70% 40%, rgba(0, 140, 255, 0.25), transparent 40%), #02040c;
}

.sva-left-shadow,
.sva-top-clear,
.sva-dragon-aura,
.sva-wind {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.sva-left-shadow {
  z-index: 3;
  background:
    radial-gradient(ellipse 420px 220px at 0% 0%, rgba(1, 3, 10, .72) 0%, rgba(1, 3, 10, .38) 42%, transparent 72%),
    linear-gradient(105deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.05) 28%, transparent 58%);
}

.sva-top-clear {
  z-index: 4;
  background: linear-gradient(to bottom, rgba(255,255,255,.02), transparent 22%, transparent 82%, rgba(0,0,0,.04));
}

.sva-dragon-aura {
  z-index: 5;
  background:
    radial-gradient(ellipse 42% 48% at 78% 36%, rgba(80, 180, 255, .08), transparent),
    radial-gradient(ellipse 34% 42% at 86% 65%, rgba(155, 70, 255, .06), transparent);
}

.sva-wind {
  z-index: 6;
  background-image: url("/auth-titan-poster.svg");
  background-size: cover;
  background-position: center right;
  background-size: cover;
  background-position: 62% 44%;
  mix-blend-mode: screen;
  -webkit-mask-image: linear-gradient(105deg, transparent 0%, transparent 54%, #000 68%);
  mask-image: linear-gradient(105deg, transparent 0%, transparent 54%, #000 68%);
}

.sva-wind-a {
  opacity: .038;
  clip-path: polygon(60% 0%, 100% 0%, 100% 26%, 84% 24%, 72% 14%, 60% 6%);
  filter: blur(.55px);
  animation: windA 5.8s ease-in-out infinite;
}

.sva-wind-b {
  opacity: .024;
  clip-path: polygon(78% 2%, 100% 0%, 100% 86%, 80% 90%, 83% 54%, 80% 26%);
  filter: blur(.65px);
  animation: windB 7.6s ease-in-out infinite;
}

.sva-hero-plate,
.sva-brand-cover {
  display: none;
}

.sva-hero-brand {
  position: absolute;
  z-index: 16;
  top: clamp(34px, 4.8vh, 50px);
  left: clamp(42px, 3.35vw, 62px);
  display: flex;
  align-items: flex-start;
  gap: 14px;
  pointer-events: none;
}

.sva-logo {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(255,255,255,.24);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
  margin-top: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, .4);
}

.sva-logo-left,
.sva-logo-right {
  position: absolute;
  display: block;
  background: #05070c;
  filter: drop-shadow(0 0 8px rgba(90, 210, 255, .18));
}

.sva-logo-left {
  width: 26px;
  height: 25px;
  left: 10px;
  bottom: 14px;
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}

.sva-logo-right {
  width: 27px;
  height: 28px;
  right: 9px;
  top: 13px;
  clip-path: polygon(0 0, 100% 0, 0 100%);
}

.sva-hero-brand-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: rgba(245, 250, 255, .96);
}

.sva-hero-brand-name {
  margin: 8px 0 0;
  font-size: clamp(30px, 3.4vw, 44px);
  font-weight: 900;
  line-height: .9;
  letter-spacing: .03em;
  text-transform: uppercase;
  white-space: nowrap;
}

.sva-hero-brand-malik {
  background: linear-gradient(90deg, #5ce1ff 0%, #8f7dff 52%, #ff5cff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.sva-hero-brand-titan {
  color: rgba(225, 242, 255, .9);
  font-weight: 820;
}

.sva-shell {
  position: absolute;
  inset: 0;
  z-index: 14;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: clamp(48px, 3.65vw, 68px);
  padding-right: clamp(24px, 3vw, 40px);
  box-sizing: border-box;
  pointer-events: none;
}

.sva-brand-mobile { display: none; }

.sva-card {
  position: relative;
  z-index: 14;
  top: auto;
  left: auto;
  width: min(548px, calc(100vw - 80px));
  max-height: calc(100dvh - 168px);
  pointer-events: auto;
  overflow: hidden auto;
  padding: 30px 34px 32px;
  border: 1px solid rgba(95,165,255,.22);
  border-radius: 25px;
  background: linear-gradient(168deg, rgba(8,12,28,.88) 0%, rgba(6,8,22,.78) 38%, rgba(10,6,24,.72) 100%);
  backdrop-filter: blur(36px) saturate(1.36);
  -webkit-backdrop-filter: blur(36px) saturate(1.36);
  box-shadow: 0 0 0 1px rgba(60,140,255,.05) inset, 0 54px 140px rgba(0,0,0,.66), 0 0 110px rgba(60,120,255,.04);
  animation: cardIn 560ms cubic-bezier(.14,.88,.22,1) both;
}

.sva-card-header-veil {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  height: 18px;
  margin: -30px -34px 6px;
  z-index: 4;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(6, 8, 22, .98) 0%, rgba(8, 12, 28, .92) 70%, transparent 100%);
}

.sva-card-corner-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 240px;
  height: 72px;
  z-index: 3;
  pointer-events: none;
  border-radius: 25px 0 0 0;
  background: linear-gradient(135deg, rgba(5, 7, 18, .99) 0%, rgba(7, 10, 24, .94) 55%, transparent 100%);
}

.sva-card-glow {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(0,210,255,.42), rgba(155,70,255,.34), rgba(255,0,255,.22));
  opacity: .55;
  z-index: 0;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  padding: 1px;
}

.sva-card-aura {
  position: absolute;
  top: -58px;
  left: -20px;
  right: -20px;
  height: 170px;
  pointer-events: none;
  background: radial-gradient(ellipse 70% 60% at 50% 0%, rgba(80,160,255,.105), rgba(120,80,255,.045) 52%, transparent);
}

.sva-card-line {
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(100,180,255,.42), rgba(190,225,255,.55), rgba(100,180,255,.42), transparent);
}

.sva-hero,
.sva-form {
  position: relative;
  z-index: 5;
}

.sva-hero { margin-bottom: 13px; }

.sva-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(80,160,255,.24);
  border-radius: 999px;
  padding: 5px 12px;
  background: rgba(60,120,255,.10);
  color: rgba(135,200,255,.78);
  font-size: 10px;
  font-weight: 740;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.sva-h1-accent {
  background: linear-gradient(90deg, #7dd3fc 0%, #c4b5fd 45%, #f0abfc 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.sva-mode-toggle {
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: rgba(140,190,255,.62);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sva-h1 {
  margin: 10px 0 0;
  max-width: 460px;
  color: #f2f7ff;
  font-size: clamp(36px, 3.4vw, 46px);
  line-height: .98;
  font-weight: 860;
  letter-spacing: -.065em;
  text-shadow: 0 0 40px rgba(80,160,255,.14);
}

.sva-tagline {
  margin: 8px 0 0;
  color: rgba(175,210,255,.52);
  font-size: 12.5px;
  line-height: 1.42;
}

.sva-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 8px;
}

.sva-field span {
  color: rgba(135,190,255,.72);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.sva-input-shell {
  position: relative;
  display: flex;
  align-items: center;
}

.sva-input-icon {
  position: absolute;
  left: 12px;
  color: rgba(130,180,255,.55);
  pointer-events: none;
}

.sva-input-valid {
  position: absolute;
  right: 12px;
  color: #c084fc;
  pointer-events: none;
}

.sva-eye {
  position: absolute;
  right: 10px;
  border: 0;
  background: transparent;
  color: rgba(130,170,230,.55);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 2px;
}

.sva-field input {
  width: 100%;
  height: 46px;
  padding: 0 40px 0 38px;
  outline: none;
  border: 1px solid rgba(70,140,230,.23);
  border-radius: 12px;
  background: rgba(20,30,60,.50);
  color: rgba(225,240,255,.94);
  font: inherit;
  font-size: 14px;
  font-weight: 580;
}

.sva-field input::placeholder { color: rgba(130,170,230,.38); }

.sva-input-shell:focus-within input {
  border-color: rgba(90,170,255,.50);
  background: rgba(24,38,80,.58);
  box-shadow: 0 0 0 3px rgba(60,130,255,.12);
}

.sva-duo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.sva-cta {
  width: 100%;
  height: 46px;
  margin-top: 6px;
  padding: 0 16px 0 18px;
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  font: inherit;
  color: #060810;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, #00D2FF 0%, #8B5CF6 52%, #FF00FF 100%);
  box-shadow: 0 0 24px rgba(0, 210, 255, .22), 0 0 36px rgba(255, 0, 255, .14), 0 10px 34px rgba(0,0,0,.30);
}

.sva-cta span {
  font-size: 14px;
  font-weight: 840;
}

.sva-cta-chevron {
  flex-shrink: 0;
  color: rgba(6, 8, 16, .72);
}

.sva-divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  margin: 11px 0 10px;
}

.sva-divider i {
  height: 1px;
  background: rgba(80,140,255,.15);
}

.sva-divider small {
  color: rgba(120,180,255,.52);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sva-socials {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.sva-socials button,
.sva-guest {
  height: 36px;
  border: 1px solid rgba(70,140,230,.24);
  border-radius: 11px;
  background: rgba(16,24,56,.56);
  color: rgba(205,232,255,.88);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 740;
}

.sva-socials button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.sva-provider-svg {
  width: 18px;
  height: 18px;
  display: block;
  flex: 0 0 auto;
}


.sva-guest {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
  margin-bottom: 4px;
  line-height: 1;
  background: rgba(80,145,255,.13);
  color: rgba(232,247,255,.96);
  border-color: rgba(110,180,255,.34);
  font-size: 13px;
  font-weight: 820;
}

.sva-guest svg {
  flex-shrink: 0;
  display: block;
  margin: 0;
}

.sva-guest span {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.sva-message {
  margin: 8px 0 0;
  padding: 8px 13px;
  border: 1px solid rgba(60,130,220,.16);
  border-radius: 10px;
  background: rgba(10,18,50,.42);
  color: rgba(150,200,255,.74);
  font-size: 11px;
  font-weight: 700;
}

button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

@keyframes cardIn {
  from { opacity: 0; transform: translate3d(-14px,10px,0) scale(.99); filter: blur(2px); }
  to { opacity: 1; transform: translate3d(0,0,0) scale(1); filter: blur(0); }
}

@keyframes windA {
  0% { transform: translate3d(-.5%, .04%, 0) scale(1.004); opacity: .034; }
  50% { transform: translate3d(1%, -.15%, 0) scale(1.009); opacity: .052; }
  100% { transform: translate3d(-.3%, .06%, 0) scale(1.005); opacity: .036; }
}

@keyframes windB {
  0% { transform: translate3d(-.2%, 0, 0) scale(1.004); opacity: .020; }
  52% { transform: translate3d(1.3%, -.05%, 0) scale(1.011); opacity: .034; }
  100% { transform: translate3d(-.1%, .02%, 0) scale(1.005); opacity: .022; }
}

@media (max-height: 820px) and (min-width: 981px) {
  .sva-card { width: 548px; max-height: calc(100dvh - 120px); padding: 24px 30px 26px; border-radius: 22px; }
  .sva-card-header-veil { margin: -17px -25px 4px; height: 14px; }
  .sva-card-corner-mask { width: 200px; height: 58px; border-radius: 22px 0 0 0; }
  .sva-tagline { display: none; }
  .sva-h1 { margin-top: 8px; font-size: clamp(25px, 2.55vw, 34px); line-height: .96; }
  .sva-field { gap: 4px; margin-bottom: 6px; }
  .sva-field input { height: 34px; border-radius: 9px; font-size: 13px; }
  .sva-cta { height: 40px; }
  .sva-socials button, .sva-guest { height: 31px; border-radius: 9px; font-size: 11.5px; }
}

@media (max-width: 980px) {
  .sva-desktop-only { display: none !important; }
}

@media (min-width: 981px) {
  .sva-shell {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .sva-card {
    pointer-events: auto;
  }
}
`;

