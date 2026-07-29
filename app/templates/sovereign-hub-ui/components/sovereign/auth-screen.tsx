"use client"

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Github,
  Globe2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  UserRound,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react"

export interface AuthScreenProps {
  onSuccess: (username: string, isPro: boolean) => void
}

type OAuthProvider = "google" | "github" | "apple" | "azure"
type AuthMode = "supabase" | "guest"
type NetworkState = "online" | "offline"
type FormMode = "login" | "register"
type AuthStage =
  | "boot"
  | "idle"
  | "submitting"
  | "oauth"
  | "guest"
  | "clearing"
  | "success"
  | "error"

type PasswordScore = {
  score: number
  label: string
  color: string
  hints: string[]
}

type AuthSnapshot = {
  email: string
  name: string
  avatar: string
  mode: AuthMode
  isAdmin: boolean
  lastLoginAt: string
}

const ADMINS: string[] = []

const STORAGE_KEYS = {
  user: "malik_user",
  userName: "malik_user_name",
  avatar: "malik_user_avatar",
  mode: "malik_auth_mode",
  admin: "malik_is_admin",
  lastLoginAt: "malik_last_login_at",
  authSnapshot: "malik_auth_snapshot",
  authHealth: "malik_auth_health",
  lastError: "malik_auth_last_error",
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
const AUTH_TIMEOUT_MS = 20_000
const BOOT_TIMEOUT_MS = 14_000
const LOGO_SRC = "/images/malik-logo-mark.svg"

const cn = (...classes: Array<string | false | null | undefined>) => {
  return classes.filter(Boolean).join(" ")
}

function normalizeEmail(value: string) {
  return (value || "").trim().toLowerCase()
}

function isAdminEmail(_email?: string | null) {
  // Privileged access must come from a server-signed session, never a browser email.
  return false
}

function getDisplayNameFromEmail(email: string) {
  const clean = normalizeEmail(email)
  if (!clean || clean === "гость" || clean === "guest") return "Гость"
  return clean.split("@")[0] || clean
}

function getNowIso() {
  try {
    return new Date().toISOString()
  } catch {
    return String(Date.now())
  }
}

function isBrowser() {
  return typeof window !== "undefined"
}

function safeLocalStorageGet(key: string): string | null {
  try {
    if (!isBrowser()) return null
    return window.localStorage.getItem(key)
  } catch (error) {
    console.error(`[AUTH STORAGE GET ERROR] ${key}`, error)
    return null
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    if (!isBrowser()) return
    window.localStorage.setItem(key, value)
  } catch (error) {
    console.error(`[AUTH STORAGE SET ERROR] ${key}`, error)
  }
}

function safeLocalStorageRemove(key: string) {
  try {
    if (!isBrowser()) return
    window.localStorage.removeItem(key)
  } catch (error) {
    console.error(`[AUTH STORAGE REMOVE ERROR] ${key}`, error)
  }
}

function dispatchAuthEvent(snapshot?: Partial<AuthSnapshot>) {
  try {
    if (!isBrowser()) return
    window.dispatchEvent(
      new CustomEvent("malik-auth-updated", {
        detail: snapshot || {},
      }),
    )
  } catch (error) {
    console.error("[AUTH EVENT ERROR]", error)
  }
}

function getAvatarFromUser(user: any): string {
  const meta = user?.user_metadata || {}
  const identities = Array.isArray(user?.identities) ? user.identities : []

  const identityAvatar =
    identities
      .map((identity: any) => {
        return (
          identity?.identity_data?.avatar_url ||
          identity?.identity_data?.picture ||
          identity?.identity_data?.photoURL ||
          ""
        )
      })
      .find(Boolean) || ""

  return (
    meta.avatar_url ||
    meta.picture ||
    meta.photoURL ||
    meta.image ||
    identityAvatar ||
    ""
  )
}

function getNameFromUser(user: any): string {
  const meta = user?.user_metadata || {}
  const identities = Array.isArray(user?.identities) ? user.identities : []

  const identityName =
    identities
      .map((identity: any) => {
        return (
          identity?.identity_data?.full_name ||
          identity?.identity_data?.name ||
          identity?.identity_data?.preferred_username ||
          ""
        )
      })
      .find(Boolean) || ""

  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    meta.user_name ||
    meta.preferred_username ||
    identityName ||
    getDisplayNameFromEmail(user?.email || "")
  )
}

function createAvatarFallback(email: string, name?: string) {
  const seed = encodeURIComponent(name || email || "Malik User")
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundType=gradientLinear&fontWeight=700`
}

function persistAuthSnapshot(snapshot: AuthSnapshot) {
  safeLocalStorageSet(STORAGE_KEYS.user, snapshot.email)
  safeLocalStorageSet(STORAGE_KEYS.userName, snapshot.name)
  safeLocalStorageSet(STORAGE_KEYS.mode, snapshot.mode)
  safeLocalStorageSet(STORAGE_KEYS.lastLoginAt, snapshot.lastLoginAt)
  safeLocalStorageSet(STORAGE_KEYS.authSnapshot, JSON.stringify(snapshot))

  if (snapshot.avatar) {
    safeLocalStorageSet(STORAGE_KEYS.avatar, snapshot.avatar)
  } else {
    safeLocalStorageRemove(STORAGE_KEYS.avatar)
  }

  if (snapshot.isAdmin) {
    safeLocalStorageSet(STORAGE_KEYS.admin, "true")
  } else {
    safeLocalStorageRemove(STORAGE_KEYS.admin)
  }

  dispatchAuthEvent(snapshot)
}

function persistGuestSnapshot(name = "Guest") {
  const snapshot: AuthSnapshot = {
    email: "guest@malik.ai",
    name,
    avatar: createAvatarFallback("guest@malik.ai", name),
    mode: "guest",
    isAdmin: false,
    lastLoginAt: getNowIso(),
  }

  persistAuthSnapshot(snapshot)
  return snapshot
}

function persistLocalEmailSnapshot(email: string, name?: string) {
  const cleanEmail = normalizeEmail(email) || "guest@malik.ai"
  const display = name?.trim() || getDisplayNameFromEmail(cleanEmail) || "User"
  const snapshot: AuthSnapshot = {
    email: cleanEmail,
    name: display,
    avatar: createAvatarFallback(cleanEmail, display),
    mode: "guest",
    isAdmin: false,
    lastLoginAt: getNowIso(),
  }

  persistAuthSnapshot(snapshot)
  return snapshot
}

function persistSupabaseUser(user: any) {
  const email = normalizeEmail(user?.email || "")
  if (!email) throw new Error("Не удалось получить email пользователя.")

  const name = getNameFromUser(user)
  const realAvatar = getAvatarFromUser(user)
  const avatar = realAvatar || createAvatarFallback(email, name)

  const snapshot: AuthSnapshot = {
    email,
    name,
    avatar,
    mode: "supabase",
    isAdmin: Boolean(user?.app_metadata?.role === "owner" || user?.app_metadata?.is_admin === true),
    lastLoginAt: getNowIso(),
  }

  persistAuthSnapshot(snapshot)
  return snapshot
}

function readStoredSnapshot(): AuthSnapshot | null {
  const raw = safeLocalStorageGet(STORAGE_KEYS.authSnapshot)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AuthSnapshot
      if (parsed?.email && parsed?.mode) return parsed
    } catch {
      safeLocalStorageRemove(STORAGE_KEYS.authSnapshot)
    }
  }

  const email = safeLocalStorageGet(STORAGE_KEYS.user)
  const name = safeLocalStorageGet(STORAGE_KEYS.userName) || email || ""
  const avatar = safeLocalStorageGet(STORAGE_KEYS.avatar) || ""
  const modeRaw = safeLocalStorageGet(STORAGE_KEYS.mode)
  const lastLoginAt = safeLocalStorageGet(STORAGE_KEYS.lastLoginAt) || ""

  if (!email || !modeRaw) return null

  const mode: AuthMode = modeRaw === "guest" ? "guest" : "supabase"

  return {
    email,
    name,
    avatar,
    mode,
    isAdmin: safeLocalStorageGet(STORAGE_KEYS.admin) === "true",
    lastLoginAt,
  }
}

function clearAuthStorage() {
  Object.values(STORAGE_KEYS).forEach((key) => safeLocalStorageRemove(key))

  try {
    if (isBrowser()) {
      const clearFrom = (storage: Storage) => {
        Object.keys(storage).forEach((key) => {
          const clean = key.toLowerCase()
          if (
            clean === "sovereign_v7_auth" ||
            clean.startsWith("sb-") ||
            clean.includes("supabase") ||
            clean.includes("gotrue") ||
            clean.includes("auth-token") ||
            clean.includes("refresh-token") ||
            clean.includes("pkce")
          ) {
            storage.removeItem(key)
          }
        })
      }
      clearFrom(window.localStorage)
      clearFrom(window.sessionStorage)
    }
  } catch (error) {
    console.warn("[AUTH STORAGE DEEP CLEAR ERROR]", error)
  }

  safeLocalStorageRemove("sovereign_v7_auth")
  safeLocalStorageRemove("sb-auth-token")
  safeLocalStorageRemove("supabase.auth.token")
  dispatchAuthEvent({})
}

function isRefreshTokenReuseError(err: unknown) {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String((err as any)?.message || (err as any)?.error_description || err || "")
  const msg = raw.toLowerCase()
  return (
    msg.includes("refresh token") ||
    msg.includes("already used") ||
    msg.includes("token has been used") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh_token_not_found") ||
    msg.includes("session_not_found")
  )
}


async function withTimeout<T>(
  promise: Promise<T>,
  ms = AUTH_TIMEOUT_MS,
  label = "AUTH_TIMEOUT",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label}: request took too long`))
    }, ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function normalizeError(err: unknown) {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Ошибка авторизации. Попробуйте позже."

  const msg = raw.toLowerCase()

  if (isRefreshTokenReuseError(err)) {
    return "Сессия устарела или refresh token уже использован. Нажмите «Очистить auth» и войдите заново."
  }
  if (msg.includes("invalid login credentials")) {
    return "Неверный email или пароль. Проверьте пароль или создайте новый аккаунт."
  }
  if (msg.includes("email not confirmed")) {
    return "Email ещё не подтверждён. Проверьте почту или отключите Confirm email в Supabase."
  }
  if (msg.includes("already registered") || msg.includes("user already registered")) {
    return "Пользователь уже зарегистрирован. Переключитесь на вход."
  }
  if (msg.includes("signup disabled")) {
    return "Регистрация отключена в Supabase. Включите Allow new users to sign up."
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Слишком много попыток. Подождите немного и попробуйте снова."
  }
  if (msg.includes("timeout") || msg.includes("took too long")) {
    return "Auth долго не отвечает. Проверьте сеть или войдите как гость."
  }
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch")) {
    return "Проблема сети или Supabase URL. Проверьте Render Environment."
  }
  if (msg.includes("provider is not enabled")) {
    return "Этот OAuth-провайдер пока не включён в Supabase."
  }
  if (msg.includes("supabase")) {
    return "Auth временно недоступен. Используйте гостевой вход или проверьте ключи Supabase."
  }
  if (msg.includes("password")) {
    return "Проверьте пароль. Минимум 6 символов."
  }

  return raw || "Ошибка авторизации. Попробуйте позже."
}

function getPasswordScore(password: string): PasswordScore {
  const hints: string[] = []
  let score = 0

  if (password.length >= 6) score += 1
  else hints.push("минимум 6 символов")

  if (password.length >= 10) score += 1
  else hints.push("лучше 10+ символов")

  if (/[A-ZА-Я]/.test(password)) score += 1
  else hints.push("добавьте заглавную букву")

  if (/[0-9]/.test(password)) score += 1
  else hints.push("добавьте цифру")

  if (/[^A-Za-zА-Яа-я0-9]/.test(password)) score += 1
  else hints.push("добавьте спецсимвол")

  if (!password) {
    return {
      score: 0,
      label: "Введите пароль",
      color: "bg-gray-700",
      hints: ["минимум 6 символов"],
    }
  }

  if (score <= 1) {
    return { score, label: "Слабый", color: "bg-red-500", hints }
  }
  if (score <= 3) {
    return { score, label: "Нормальный", color: "bg-amber-500", hints }
  }
  if (score <= 4) {
    return { score, label: "Сильный", color: "bg-violet-500", hints }
  }
  return { score, label: "Терминатор", color: "bg-emerald-500", hints: [] }
}

function validateForm(email: string, password: string, mode: FormMode, confirmPassword: string) {
  if (!email || !password) return "Заполните email и пароль."
  if (!EMAIL_RE.test(email)) return "Введите нормальный email."
  if (password.length < 6) return "Пароль должен быть минимум 6 символов."
  if (password.length > 128) return "Пароль слишком длинный."
  if (mode === "register" && password !== confirmPassword.trim()) return "Passwords do not match."
  return null
}

function getClientFriendlyDebugText() {
  const urlExists = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const keyExists = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (!urlExists || !keyExists) {
    return "Supabase env не найдены: проверь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY."
  }

  return "Supabase env найдены. Если вход не работает — проверь URL, anon/publishable key и пользователя."
}

function LogoMark({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white text-black shadow-2xl shadow-violet-500/20",
        className,
      )}
    >
      {!failed ? (
        <img
          src={LOGO_SRC}
          alt="Malik AI"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Sparkles className="h-7 w-7" />
      )}
    </div>
  )
}

function AmbientBackground() {
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-[-160px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-[-160px] right-[-120px] h-[420px] w-[420px] rounded-full bg-fuchsia-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-120px] left-[-160px] h-[360px] w-[360px] rounded-full bg-cyan-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.14),transparent_35%),linear-gradient(to_bottom,rgba(255,255,255,0.035),transparent)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:46px_46px]" />
    </>
  )
}

function CyberTitanBackdrop() {
  const mane = Array.from({ length: 18 })
  const particles = Array.from({ length: 28 })

  return (
    <div className="auth-cyber-titan" aria-hidden="true">
      <div className="auth-titan-brand">
        <div className="auth-titan-mark">
          <span />
          <span />
        </div>
        <div>
          <strong>Sovereign Hun</strong>
          <b>Malik AI V6.5 Titan</b>
        </div>
      </div>
      <div className="auth-titan-circuit auth-titan-circuit-left" />
      <div className="auth-titan-circuit auth-titan-circuit-right" />
      <div className="auth-titan-creature">
        <div className="auth-titan-aura" />
        <div className="auth-titan-horn auth-titan-horn-one" />
        <div className="auth-titan-horn auth-titan-horn-two" />
        <div className="auth-titan-mane">
          {mane.map((_, index) => <span key={index} style={{ ["--strand" as string]: index }} />)}
        </div>
        <div className="auth-titan-head">
          <span className="auth-titan-eye" />
          <span className="auth-titan-jaw" />
          <span className="auth-titan-mouth-glow" />
        </div>
        <div className="auth-titan-neck" />
        <div className="auth-titan-grid-lines" />
      </div>
      <div className="auth-titan-particles">
        {particles.map((_, index) => <span key={index} style={{ ["--dot" as string]: index }} />)}
      </div>
    </div>
  )
}

function StatusPill({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: "neutral" | "good" | "warn" | "bad"
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
        : tone === "bad"
          ? "border-red-500/20 bg-red-500/10 text-red-200"
          : "border-white/10 bg-white/[0.04] text-gray-300"

  return (
    <div className={cn("rounded-2xl border p-4", toneClass)}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/30">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="truncate text-sm font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}

function SecurityGrid({
  networkState,
  oauthReady,
}: {
  networkState: NetworkState
  oauthReady: boolean
}) {
  return (
    <div className="auth-security-grid grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatusPill
        icon={networkState === "online" ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        label="Network"
        value={networkState === "online" ? "Online" : "Offline"}
        tone={networkState === "online" ? "good" : "warn"}
      />
      <StatusPill
        icon={<ShieldCheck className="h-4 w-4" />}
        label="Session"
        value="Auto restore"
        tone="good"
      />
      <StatusPill
        icon={<Globe2 className="h-4 w-4" />}
        label="OAuth"
        value={oauthReady ? "Enabled" : "Setup ready"}
        tone={oauthReady ? "good" : "neutral"}
      />
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const score = getPasswordScore(password)
  const bars = [1, 2, 3, 4, 5]

  return (
    <div className="auth-password-strength space-y-2">
      <div className="flex gap-1">
        {bars.map((bar) => (
          <div key={bar} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full transition-all duration-300",
                bar <= Math.max(1, score.score) ? score.color : "bg-transparent",
              )}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-bold text-gray-300">{score.label}</span>
        {score.hints.length > 0 ? (
          <span className="truncate text-gray-500">{score.hints.slice(0, 2).join(" • ")}</span>
        ) : (
          <span className="text-emerald-300">готово</span>
        )}
      </div>
    </div>
  )
}

function AuthModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: FormMode
  onChange: (mode: FormMode) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-black/30 p-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("login")}
        className={cn(
          "rounded-xl px-4 py-2.5 text-sm font-black transition",
          mode === "login"
            ? "bg-white text-black shadow-lg"
            : "text-gray-400 hover:bg-white/5 hover:text-white",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        Войти
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("register")}
        className={cn(
          "rounded-xl px-4 py-2.5 text-sm font-black transition",
          mode === "register"
            ? "bg-white text-black shadow-lg"
            : "text-gray-400 hover:bg-white/5 hover:text-white",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        Регистрация
      </button>
    </div>
  )
}

function AuthActivity({
  stage,
  bootChecking,
  lastSnapshot,
}: {
  stage: AuthStage
  bootChecking: boolean
  lastSnapshot: AuthSnapshot | null
}) {
  const rows = [
    {
      label: "Auth Core",
      value: bootChecking ? "проверка" : "готов",
      icon: <Shield className="h-4 w-4" />,
    },
    {
      label: "Last user",
      value: lastSnapshot?.email || "нет",
      icon: <UserRound className="h-4 w-4" />,
    },
    {
      label: "Stage",
      value: stage,
      icon: <Terminal className="h-4 w-4" />,
    },
  ]

  return (
    <div className="hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 lg:block">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-black text-white">Auth telemetry</p>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
          live
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-violet-200">
              {row.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{row.label}</p>
              <p className="truncate text-sm font-bold text-gray-200">{row.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
          <p className="text-xs leading-5 text-violet-100/80">
            Сессия восстанавливается автоматически. Guest работает даже при недоступном Supabase.
          </p>
        </div>
      </div>
    </div>
  )
}

function AuthTipsPanel() {
  const tips = [
    "Email/password создаёт реальных Supabase users.",
    "Guest режим нужен для демо и проверки UI.",
    "Google/GitHub/Apple/Microsoft запускают official OAuth flow.",
    "Owner email получает ROOT-доступ в Dashboard.",
  ]

  return (
    <div className="hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 xl:block">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black">
          <Star className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-white">SaaS Shield</p>
          <p className="text-xs text-gray-500">world-product auth flow</p>
        </div>
      </div>

      <div className="space-y-3">
        {tips.map((tip) => (
          <div key={tip} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <p className="text-xs leading-5 text-gray-300">{tip}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [formMode, setFormMode] = useState<FormMode>("register")
  const [displayName, setDisplayName] = useState("Abdumalik")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [bootChecking, setBootChecking] = useState(true)
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [networkState, setNetworkState] = useState<NetworkState>("online")
  const [stage, setStage] = useState<AuthStage>("boot")
  const [lastSnapshot, setLastSnapshot] = useState<AuthSnapshot | null>(null)

  const mountedRef = useRef(true)
  const submitLockRef = useRef(false)

  const googleOAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH !== "false"
  const githubOAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GITHUB_OAUTH !== "false"
  const appleOAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_APPLE_OAUTH !== "false"
  const microsoftOAuthEnabled =
    process.env.NEXT_PUBLIC_ENABLE_MICROSOFT_OAUTH !== "false" &&
    process.env.NEXT_PUBLIC_ENABLE_AZURE_OAUTH !== "false"
  const oauthReady = googleOAuthEnabled || githubOAuthEnabled || appleOAuthEnabled || microsoftOAuthEnabled

  const isLogin = formMode === "login"
  const busy = isLoading || Boolean(oauthLoading) || bootChecking

  const isOAuthEnabled = useCallback(
    (provider: OAuthProvider) => {
      if (provider === "google") return googleOAuthEnabled
      if (provider === "github") return githubOAuthEnabled
      if (provider === "apple") return appleOAuthEnabled
      if (provider === "azure") return microsoftOAuthEnabled
      return false
    },
    [appleOAuthEnabled, githubOAuthEnabled, googleOAuthEnabled, microsoftOAuthEnabled],
  )

  const resetMessages = useCallback(() => {
    setError(null)
    setSuccessMsg(null)
    safeLocalStorageRemove(STORAGE_KEYS.lastError)
  }, [])

  const getClient = useCallback(async () => {
    try {
      const mod = await import("@/lib/supabase")
      const client = mod.getSupabaseClient?.()

      if (!client) {
        const message = getClientFriendlyDebugText()
        safeLocalStorageSet(STORAGE_KEYS.authHealth, "supabase_unconfigured")
        setError(`Auth временно недоступен. ${message}`)
        return null
      }

      safeLocalStorageSet(STORAGE_KEYS.authHealth, "supabase_ready")
      return client
    } catch (err) {
      console.error("[SUPABASE IMPORT ERROR]", err)
      safeLocalStorageSet(STORAGE_KEYS.authHealth, "supabase_import_error")
      setError("Auth временно недоступен. Проверьте lib/supabase.ts.")
      return null
    }
  }, [])

  const completeSession = useCallback(
    (snapshot: AuthSnapshot) => {
      setLastSnapshot(snapshot)
      setStage("success")
      setSuccessMsg("Сессия активирована. Запускаем Malik AI...")
      window.setTimeout(() => {
        onSuccess(snapshot.email, snapshot.isAdmin)
      }, 150)
    },
    [onSuccess],
  )

  const completeSupabaseSession = useCallback(
    (user: any) => {
      const snapshot = persistSupabaseUser(user)
      completeSession(snapshot)
    },
    [completeSession],
  )

  useEffect(() => {
    mountedRef.current = true

    const updateNetwork = () => {
      if (typeof navigator !== "undefined") {
        setNetworkState(navigator.onLine ? "online" : "offline")
      }
    }

    updateNetwork()
    window.addEventListener("online", updateNetwork)
    window.addEventListener("offline", updateNetwork)

    return () => {
      mountedRef.current = false
      window.removeEventListener("online", updateNetwork)
      window.removeEventListener("offline", updateNetwork)
    }
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    const restoreExistingSession = async () => {
      setBootChecking(true)
      setStage("boot")

      try {
        const savedSnapshot = readStoredSnapshot()
        if (savedSnapshot) setLastSnapshot(savedSnapshot)

        if (savedSnapshot?.mode === "guest" && savedSnapshot.email) {
          completeSession(savedSnapshot)
          return
        }

        const supabase = await getClient()

        if (supabase) {
          const { data, error: sessionError } = await withTimeout(
            supabase.auth.getSession(),
            BOOT_TIMEOUT_MS,
            "AUTH_SESSION_TIMEOUT",
          )

          if (sessionError) {
            console.error("[AUTH SESSION RESTORE ERROR]", sessionError)
            if (isRefreshTokenReuseError(sessionError)) {
              clearAuthStorage()
              setError("Старая сессия сброшена: refresh token был уже использован. Войдите заново.")
              setStage("idle")
              return
            }
          }

          const sessionUser = data?.session?.user
          if (sessionUser?.email) {
            completeSupabaseSession(sessionUser)
            return
          }

          const { data: listenerData } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
            const user = session?.user
            if (user?.email) {
              try {
                completeSupabaseSession(user)
              } catch (err) {
                console.error("[AUTH STATE SYNC ERROR]", err)
              }
            }
          })

          unsubscribe = () => listenerData?.subscription?.unsubscribe?.()
        }

      } catch (err) {
        console.error("[AUTH BOOT CHECK ERROR]", err)

        const savedSnapshot = readStoredSnapshot()
        if (savedSnapshot?.mode === "guest" && savedSnapshot.email) {
          completeSession(savedSnapshot)
          return
        }
      } finally {
        if (mountedRef.current) {
          setBootChecking(false)
          setStage("idle")
        }
      }
    }

    restoreExistingSession()

    return () => {
      unsubscribe?.()
    }
  }, [completeSession, completeSupabaseSession, getClient])

  const handleGuestLogin = useCallback(() => {
    resetMessages()
    setStage("guest")

    clearAuthStorage()
    const snapshot = persistGuestSnapshot("Guest")
    completeSession(snapshot)
  }, [completeSession, resetMessages])

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()

      if (submitLockRef.current) return
      submitLockRef.current = true

      resetMessages()

      const cleanEmail = normalizeEmail(email)
      const cleanPassword = password.trim()
      const validationError = validateForm(cleanEmail, cleanPassword, formMode, confirmPassword)

      if (validationError) {
        setError(validationError)
        setStage("error")
        submitLockRef.current = false
        return
      }

      if (networkState === "offline") {
        setError("Вы офлайн. Проверьте интернет или войдите как гость.")
        setStage("error")
        submitLockRef.current = false
        return
      }

      setIsLoading(true)
      setStage("submitting")

      try {
        const supabase = await getClient()
        if (!supabase) {
          setError("Авторизация временно недоступна. Используйте безопасный гостевой вход.")
          setStage("error")
          return
        }

        if (isLogin) {
          const { data, error: loginError } = await withTimeout(
            supabase.auth.signInWithPassword({
              email: cleanEmail,
              password: cleanPassword,
            }),
            AUTH_TIMEOUT_MS,
            "LOGIN_TIMEOUT",
          )

          if (loginError) throw loginError
          if (!data?.user?.email) throw new Error("Не удалось получить email пользователя.")

          completeSupabaseSession(data.user)
          return
        }

        const { data, error: registerError } = await withTimeout(
          supabase.auth.signUp({
            email: cleanEmail,
            password: cleanPassword,
            options: {
              data: {
                display_name: displayName.trim() || getDisplayNameFromEmail(cleanEmail),
                name: displayName.trim() || getDisplayNameFromEmail(cleanEmail),
                created_from: "malik_ai_sovereign",
                product: "Malik AI",
              },
            },
          }),
          AUTH_TIMEOUT_MS,
          "REGISTER_TIMEOUT",
        )

        if (registerError) throw registerError

        if (data?.session?.user?.email) {
          completeSupabaseSession(data.session.user)
          return
        }

        if (data?.user) {
          setSuccessMsg("Аккаунт создан. Проверьте email, если в Supabase включено подтверждение.")
          setFormMode("login")
          setPassword("")
          setConfirmPassword("")
          setAcceptedTerms(true)
          setStage("success")
        } else {
          setSuccessMsg("Регистрация отправлена. Завершите подтверждение email.")
          setStage("success")
        }
      } catch (err) {
        console.error("[AUTH ERROR]", err instanceof Error ? err.message : err)
        const normalized = normalizeError(err)
        safeLocalStorageSet(STORAGE_KEYS.lastError, normalized)
        setError(normalized)
        setStage("error")
      } finally {
        if (mountedRef.current) setIsLoading(false)
        submitLockRef.current = false
      }
    },
    [
      completeSupabaseSession,
      confirmPassword,
      displayName,
      email,
      formMode,
      getClient,
      isLogin,
      networkState,
      password,
      resetMessages,
    ],
  )

  const handleOAuthLogin = useCallback(
    async (provider: OAuthProvider) => {
      resetMessages()

      if (!isOAuthEnabled(provider)) {
        const providerName = provider === "azure" ? "Microsoft" : provider.charAt(0).toUpperCase() + provider.slice(1)
        setError(`${providerName} OAuth disabled by env flag. Set provider flag to true or remove false value.`)
        setStage("error")
        return
      }

      if (networkState === "offline") {
        setError("Вы офлайн. OAuth не запустится без интернета.")
        setStage("error")
        return
      }

      setOauthLoading(provider)
      setStage("oauth")

      try {
        const supabase = await getClient()
        if (!supabase) return

        const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined

        const { error: oauthError } = await withTimeout(
          supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo,
              queryParams:
                provider === "google"
                  ? {
                      access_type: "offline",
                      prompt: "consent",
                    }
                  : undefined,
            },
          }),
          AUTH_TIMEOUT_MS,
          "OAUTH_TIMEOUT",
        )

        if (oauthError) throw oauthError
      } catch (err) {
        console.error("[OAUTH ERROR]", err instanceof Error ? err.message : err)
        const normalized = normalizeError(err)
        setError(normalized)
        safeLocalStorageSet(STORAGE_KEYS.lastError, normalized)
        setStage("error")
        setOauthLoading(null)
      }
    },
    [getClient, isOAuthEnabled, networkState, resetMessages],
  )

  const clearBrokenAuth = useCallback(async () => {
    resetMessages()
    setIsLoading(true)
    setStage("clearing")

    try {
      const supabase = await getClient()
      await withTimeout(
        Promise.resolve(supabase?.auth?.signOut?.()),
        8000,
        "CLEAR_AUTH_TIMEOUT",
      )
    } catch (err) {
      console.error("[AUTH CLEAR SIGNOUT ERROR]", err)
    } finally {
      clearAuthStorage()
      setEmail("")
      setPassword("")
      setConfirmPassword("")
      setAcceptedTerms(true)
      setShowPassword(false)
      setLastSnapshot(null)
      setSuccessMsg("Auth кэш очищен. Можно войти заново.")
      setStage("idle")
      setIsLoading(false)
    }
  }, [getClient, resetMessages])

  const heroSubtitle = useMemo(() => {
    if (bootChecking) return "Проверяем защищённую сессию..."
    if (formMode === "login") return "Войдите в рабочее пространство"
    return "Создайте новый аккаунт Malik AI"
  }, [bootChecking, formMode])

  const primaryButtonText = useMemo(() => {
    if (isLoading) return isLogin ? "Проверка..." : "Создание..."
    return isLogin ? "Войти" : "Зарегистрироваться"
  }, [isLoading, isLogin])

  if (bootChecking) {
    return (
      <div className="auth-titan-screen relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#030303] p-4 font-sans text-white">
        <AmbientBackground />

        <div className="auth-titan-boot-card relative z-10 w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
          <LogoMark className="mx-auto mb-5 h-16 w-16" />
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10">
            <Loader2 className="h-6 w-6 animate-spin text-violet-200" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Malik AI Auth Shield</h1>
          <p className="mt-2 text-sm text-gray-500">Синхронизация сессии...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-titan-screen relative min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-[#030303] p-4 font-sans text-white sm:p-6">
      <AmbientBackground />

      <div className="auth-titan-content relative z-10 mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-7xl items-center justify-center">
        <div className="auth-poster-brand" aria-hidden="true">
          <div className="auth-poster-mark">
            <span />
            <span />
          </div>
          <div>
            <strong>Sovereign Hub</strong>
            <b>Malik AI V6.5 Titan</b>
          </div>
        </div>

        <div className="auth-titan-grid grid w-full max-w-full gap-5 lg:grid-cols-[1fr_520px_1fr]">
          <div className="auth-titan-side-panel">
            <AuthActivity stage={stage} bootChecking={bootChecking} lastSnapshot={lastSnapshot} />
          </div>

          <div className="auth-titan-form-column w-full">
            <div className="auth-titan-form-head mb-8 text-center">
              <LogoMark className="mx-auto mb-5 h-20 w-20" />

              <div className="auth-titan-form-badge mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-violet-200">
                <Sparkles className="h-3.5 w-3.5" />
                Sovereign Auth Core
              </div>

              <h1 className="auth-titan-title text-4xl font-black tracking-tight sm:text-5xl">
                {isLogin ? "SIGN IN" : "SIGN UP"}
              </h1>

              <p className="auth-titan-subtitle mt-3 text-sm text-gray-500">{heroSubtitle}</p>
            </div>

            <div className="auth-titan-form-card rounded-[2rem] border border-white/10 bg-[#0a0a0a]/90 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7">
              <SecurityGrid networkState={networkState} oauthReady={oauthReady} />

              {networkState === "offline" && (
                <div className="mt-4 flex gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Нет соединения. Гостевой вход доступен локально.</span>
                </div>
              )}

              {error && (
                <div className="mt-4 flex gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="mt-4 flex gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="auth-mode-switch-wrap mt-5">
                <AuthModeSwitch
                  mode={formMode}
                  disabled={busy}
                  onChange={(mode) => {
                    setFormMode(mode)
                    setPassword("")
                    setConfirmPassword("")
                    setAcceptedTerms(true)
                    resetMessages()
                  }}
                />
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {!isLogin && (
                  <div className="auth-username-field space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Username
                    </label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                          setDisplayName(e.target.value)
                          if (error) setError(null)
                        }}
                        placeholder="Abdumalik"
                        autoComplete="name"
                        disabled={busy}
                        className="w-full rounded-2xl border border-white/10 bg-[#050505] py-3.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (error) setError(null)
                      }}
                      placeholder="name@domain.com"
                      autoComplete="email"
                      disabled={busy}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] py-3.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Пароль
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (error) setError(null)
                      }}
                      placeholder="Минимум 6 символов"
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      disabled={busy}
                      className="w-full rounded-2xl border border-white/10 bg-[#050505] py-3.5 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={busy}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-white disabled:opacity-50"
                      aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {!isLogin && <PasswordStrength password={password} />}
                </div>

                {!isLogin && (
                  <div className="auth-confirm-password-field space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value)
                          if (error) setError(null)
                        }}
                        placeholder="Repeat password"
                        autoComplete="new-password"
                        disabled={busy}
                        className="w-full rounded-2xl border border-white/10 bg-[#050505] py-3.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                      />
                    </div>
                  </div>
                )}

                {!isLogin && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-gray-400">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      disabled={busy}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-violet-500"
                    />
                    <span>
                      Я понимаю, что аккаунт создаётся в Supabase Auth, а Malik AI сохраняет
                      только рабочие данные сессии для стабильного входа.
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-black text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {primaryButtonText}
                    </>
                  ) : (
                    <>
                      {primaryButtonText}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleOAuthLogin("google")}
                  disabled={busy || !googleOAuthEnabled}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-bold text-gray-200 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="inline-flex items-center gap-2">
                    {oauthLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                    Google
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOAuthLogin("github")}
                  disabled={busy || !githubOAuthEnabled}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-bold text-gray-200 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="inline-flex items-center gap-2">
                    {oauthLoading === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                    GitHub
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOAuthLogin("apple")}
                  disabled={busy || !appleOAuthEnabled}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-bold text-gray-200 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="inline-flex items-center gap-2">
                    {oauthLoading === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                    Apple
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOAuthLogin("azure")}
                  disabled={busy || !microsoftOAuthEnabled}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-bold text-gray-200 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="inline-flex items-center gap-2">
                    {oauthLoading === "azure" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    Microsoft
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={busy}
                className="mt-5 w-full rounded-2xl border border-violet-500/30 bg-violet-500/10 py-3 text-sm font-bold text-violet-200 transition hover:border-violet-400/60 hover:bg-violet-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Войти как гость
                </span>
              </button>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={clearBrokenAuth}
                  disabled={busy}
                  className="rounded-2xl border border-white/10 py-3 text-xs font-bold text-gray-400 transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Очистить auth
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormMode((value) => (value === "login" ? "register" : "login"))
                    setError(null)
                    setSuccessMsg(null)
                    setPassword("")
                    setConfirmPassword("")
                    setAcceptedTerms(true)
                  }}
                  disabled={busy}
                  className="rounded-2xl border border-white/10 py-3 text-xs font-bold text-violet-300 transition hover:border-violet-400/40 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLogin ? "Создать аккаунт" : "У меня есть аккаунт"}
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  <p className="text-xs leading-5 text-gray-500">
                    Email/password работает через Supabase. Google/GitHub/Apple/Microsoft запускают
                    official OAuth redirect, если провайдер включён в Supabase.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-titan-tips-panel">
            <AuthTipsPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

