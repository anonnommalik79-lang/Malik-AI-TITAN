import type { DirectionId } from "./blueprints"

/**
 * Malik Site Forge — art directions.
 *
 * Seven looks, each chosen from its subject rather than from habit: a coffee
 * roastery with a printed menu board, an atelier with arched frames for
 * beauty and flowers, a hard-edged look for barbers and gyms, a calm clinic,
 * a lively food market, an editorial gallery for shops and studios, and a
 * coastal one for hotels with a booking bar over the photograph. They share
 * one structure, so every site works the same way and only looks different.
 */

type Tokens = {
  bg: string; surface: string; ink: string; muted: string; line: string; accent: string; accentInk: string; second: string
  dark: string; darkInk: string; radius: string; radiusLg: string; display: string; body: string; displayWeight: number
  displayTracking: string; fonts: string
}

export const DIRECTION_TOKENS: Record<DirectionId, Tokens> = {
  roastery: {
    bg: "#FBFAF8", surface: "#FFFFFF", ink: "#1D1915", muted: "#6E655D", line: "#E6E0D8", accent: "#2F5D50", accentInk: "#FFFFFF", second: "#B07A3E",
    dark: "#201B17", darkInk: "#F4EFE9", radius: "14px", radiusLg: "28px", display: "'Unbounded', 'Golos Text', system-ui, sans-serif", body: "'Golos Text', system-ui, -apple-system, 'Segoe UI', sans-serif",
    displayWeight: 600, displayTracking: "-0.02em", fonts: "family=Unbounded:wght@500;600;700&family=Golos+Text:wght@400;500;600",
  },
  atelier: {
    bg: "#F8F4F2", surface: "#FFFFFF", ink: "#2B2124", muted: "#7B6B6F", line: "#EADFDC", accent: "#8E4A5A", accentInk: "#FFFFFF", second: "#7C8B6F",
    dark: "#2B2124", darkInk: "#F8F1EF", radius: "18px", radiusLg: "32px", display: "'Cormorant Garamond', Georgia, serif", body: "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif",
    displayWeight: 600, displayTracking: "-0.01em", fonts: "family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700",
  },
  edge: {
    bg: "#16171A", surface: "#1F2125", ink: "#EEE9E1", muted: "#A39E96", line: "#2F3237", accent: "#C99A5B", accentInk: "#16171A", second: "#8C929C",
    dark: "#0E0F11", darkInk: "#EEE9E1", radius: "6px", radiusLg: "10px", display: "'Oswald', 'Inter', system-ui, sans-serif", body: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    displayWeight: 600, displayTracking: "0", fonts: "family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600",
  },
  clinic: {
    bg: "#F4F7F9", surface: "#FFFFFF", ink: "#11263A", muted: "#5A6B7C", line: "#DFE7ED", accent: "#0F766E", accentInk: "#FFFFFF", second: "#2563A8",
    dark: "#0F2436", darkInk: "#EAF1F6", radius: "16px", radiusLg: "26px", display: "'Onest', system-ui, sans-serif", body: "'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif",
    displayWeight: 650, displayTracking: "-0.02em", fonts: "family=Onest:wght@400;500;600;700",
  },
  market: {
    bg: "#FFFFFF", surface: "#FFF7EC", ink: "#1F1A16", muted: "#6D635A", line: "#F0E4D4", accent: "#D23F2A", accentInk: "#FFFFFF", second: "#E9A23B",
    dark: "#1F1A16", darkInk: "#FFF7EC", radius: "20px", radiusLg: "30px", display: "'Rubik', system-ui, sans-serif", body: "'Rubik', system-ui, -apple-system, 'Segoe UI', sans-serif",
    displayWeight: 700, displayTracking: "-0.02em", fonts: "family=Rubik:wght@400;500;600;700;800",
  },
  gallery: {
    bg: "#F3F3F1", surface: "#FFFFFF", ink: "#121212", muted: "#62625F", line: "#DCDCD8", accent: "#2747C9", accentInk: "#FFFFFF", second: "#121212",
    dark: "#121212", darkInk: "#F3F3F1", radius: "4px", radiusLg: "6px", display: "'Geologica', 'Inter', system-ui, sans-serif", body: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    displayWeight: 600, displayTracking: "-0.035em", fonts: "family=Geologica:wght@400;500;600;700&family=Inter:wght@400;500;600",
  },
  coast: {
    bg: "#F2F6F5", surface: "#FFFFFF", ink: "#0F2A31", muted: "#56717A", line: "#D9E4E3", accent: "#1F6F80", accentInk: "#FFFFFF", second: "#C8A97A",
    dark: "#0F2A31", darkInk: "#EEF4F3", radius: "14px", radiusLg: "24px", display: "'Forum', Georgia, serif", body: "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif",
    displayWeight: 400, displayTracking: "0", fonts: "family=Forum&family=Manrope:wght@400;500;600;700",
  },
}

/** Relative luminance, for picking readable text on a custom accent. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** A custom accent is used only when buttons stay readable on this direction's background. */
export function resolveAccent(direction: DirectionId, accent: string | null) {
  const tokens = DIRECTION_TOKENS[direction]
  if (!accent || !/^#[0-9a-f]{6}$/i.test(accent)) return { accent: tokens.accent, accentInk: tokens.accentInk }
  if (contrast(accent, tokens.bg) < 2.6) return { accent: tokens.accent, accentInk: tokens.accentInk }
  return { accent, accentInk: contrast(accent, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#141414" }
}

export function fontLink(direction: DirectionId) {
  return `https://fonts.googleapis.com/css2?${DIRECTION_TOKENS[direction].fonts}&display=swap`
}

export function siteCss(direction: DirectionId, accent: string | null) {
  const t = DIRECTION_TOKENS[direction]
  const a = resolveAccent(direction, accent)
  const dark = direction === "edge"
  return `:root{--bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};--line:${t.line};--accent:${a.accent};--accent-ink:${a.accentInk};--second:${t.second};--dark:${t.dark};--dark-ink:${t.darkInk};--r:${t.radius};--r-lg:${t.radiusLg};--display:${t.display};--body:${t.body};--dw:${t.displayWeight};--dt:${t.displayTracking};--wrap:1180px;--hdr:72px;color-scheme:${dark ? "dark" : "light"};--accent-2:color-mix(in oklab,var(--accent) 6%,var(--bg));--accent-3:color-mix(in oklab,var(--accent) 12%,var(--bg));--accent-6:color-mix(in oklab,var(--accent) 32%,var(--bg));--accent-11:color-mix(in oklab,var(--accent) 78%,var(--ink));--ease-out:cubic-bezier(.2,.7,.2,1);--shadow-1:0 1px 2px rgb(0 0 0/.06);--shadow-2:0 2px 6px rgb(0 0 0/.05),0 14px 32px rgb(0 0 0/.09);--shadow-3:0 4px 12px rgb(0 0 0/.08),0 30px 64px rgb(0 0 0/.18)}
${BASE_CSS}
${SIGNATURE[direction]}`
}

const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit}
button,input,select,textarea{font:inherit;color:inherit}
h1,h2,h3{font-family:var(--display);font-weight:var(--dw);letter-spacing:var(--dt);line-height:1.08;margin:0;text-wrap:balance}
h1{font-size:clamp(40px,6.4vw,84px)}
h2{font-size:clamp(30px,3.8vw,50px)}
h3{font-size:clamp(19px,1.6vw,22px);line-height:1.25}
p{margin:0}
.wrap{width:min(var(--wrap),100% - 40px);margin-inline:auto}
.skip{position:absolute;left:-999px;top:8px;z-index:100;padding:10px 16px;background:var(--ink);color:var(--bg);border-radius:8px}
.skip:focus{left:12px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.muted{color:var(--muted)}
.lead{font-size:clamp(18px,1.6vw,21px);color:var(--muted);max-width:60ch}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;border-radius:999px;border:1.5px solid var(--ink);background:transparent;color:var(--ink);font-weight:600;font-size:16px;text-decoration:none;cursor:pointer;transition:background .2s,color .2s,transform .2s,border-color .2s;white-space:nowrap}
.btn:hover{transform:translateY(-1px)}
.btn--accent{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn--accent:hover{filter:brightness(1.06)}
.btn--light{border-color:rgba(255,255,255,.7);color:#fff}
.btn--light:hover{background:#fff;color:#111}
.btn--block{width:100%}
.btn svg{width:18px;height:18px}
.icon{width:22px;height:22px;flex:none}
.hdr{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid transparent;transition:border-color .2s}
.hdr.is-scrolled{border-bottom-color:var(--line)}
.hdr__in{height:var(--hdr);display:flex;align-items:center;gap:28px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-family:var(--display);font-weight:var(--dw);font-size:21px;letter-spacing:var(--dt);flex:none}
.logo__mark{display:grid;place-items:center;width:38px;height:38px;border-radius:var(--r);background:var(--accent);color:var(--accent-ink);font-size:18px}
.nav{display:flex;gap:4px;margin-inline:auto}
.nav a{padding:9px 14px;border-radius:999px;text-decoration:none;font-size:15px;font-weight:500;color:var(--muted);transition:color .2s,background .2s}
.nav a:hover{color:var(--ink)}
.nav a[aria-current="page"]{color:var(--ink);background:color-mix(in srgb,var(--ink) 8%,transparent)}
.hdr__actions{display:flex;align-items:center;gap:10px;margin-left:auto}
.hdr__phone{font-weight:600;font-size:15px;text-decoration:none;white-space:nowrap}
.hdr__cta{min-height:44px;padding:0 20px;font-size:15px}
.cartbtn{position:relative;display:grid;place-items:center;width:46px;height:46px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);cursor:pointer}
.cartbtn .count{position:absolute;top:-4px;right:-4px;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:700;display:grid;place-items:center}
.cartbtn .count[data-zero]{display:none}
.burger{display:none;width:46px;height:46px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);cursor:pointer;place-items:center}
.burger span,.burger span::before,.burger span::after{display:block;width:18px;height:2px;background:var(--ink);border-radius:2px;transition:transform .25s,opacity .2s;content:"";position:relative}
.burger span::before{position:absolute;top:-6px}.burger span::after{position:absolute;top:6px}
.menu-open .burger span{background:transparent}.menu-open .burger span::before{transform:translateY(6px) rotate(45deg)}.menu-open .burger span::after{transform:translateY(-6px) rotate(-45deg)}
.mnav{position:fixed;inset:var(--hdr) 0 0;z-index:39;background:var(--bg);padding:24px 20px 40px;display:flex;flex-direction:column;gap:6px;overflow:auto;opacity:0;transform:translateY(-8px);transition:opacity .2s,transform .2s}
.mnav[hidden]{display:none}
.menu-open .mnav{opacity:1;transform:none}
.mnav a.mnav__link{font-family:var(--display);font-weight:var(--dw);font-size:30px;letter-spacing:var(--dt);text-decoration:none;padding:10px 0;border-bottom:1px solid var(--line)}
.mnav a.mnav__link[aria-current="page"]{color:var(--accent)}
.mnav__foot{margin-top:auto;display:grid;gap:12px;padding-top:24px}
.page{display:none}
.page.is-active{display:block;animation:page-in .35s ease both}
@keyframes page-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.section{padding:clamp(64px,9vw,120px) 0}
.section--tight{padding:clamp(40px,6vw,72px) 0}
.section--dark{background:var(--dark);color:var(--dark-ink)}
.section--dark .muted,.section--dark .lead{color:color-mix(in srgb,var(--dark-ink) 70%,transparent)}
.section__head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:clamp(28px,4vw,48px);flex-wrap:wrap}
.section__head p{max-width:52ch}
.link{font-weight:600;text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:5px}
.hero{position:relative;min-height:calc(100svh - var(--hdr));display:grid;align-items:end;color:#fff;overflow:hidden;isolation:isolate}
.hero__media{position:absolute;inset:0;z-index:-2}
.hero__media img,.hero__media .art{width:100%;height:100%;object-fit:cover}
.hero__media .art svg{display:none}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,.14) 34%,rgba(0,0,0,.76))}
.hero h1,.hero__sub,.eyebrow{text-shadow:0 2px 24px rgba(0,0,0,.18)}
.hero__in{padding:0 0 clamp(36px,7vw,84px);max-width:760px}
.hero h1{max-width:13ch;animation:rise .9s cubic-bezier(.2,.7,.2,1) both}
.hero__sub{margin-top:20px;max-width:46ch;font-size:clamp(18px,1.7vw,21px);color:rgba(255,255,255,.88);animation:rise .9s .12s cubic-bezier(.2,.7,.2,1) both}
.hero__ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px;animation:rise .9s .22s cubic-bezier(.2,.7,.2,1) both}
.hero__facts{display:flex;flex-wrap:wrap;gap:8px 28px;margin:36px 0 0;padding:20px 0 0;border-top:1px solid rgba(255,255,255,.25);list-style:none;font-size:15px;color:rgba(255,255,255,.85)}
.hero__facts li{display:flex;align-items:center;gap:8px}
.hero__facts .icon{width:18px;height:18px}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.reasons{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0;border-top:1px solid var(--line)}
.reason{padding:28px 28px 30px 0;border-bottom:1px solid var(--line)}
.reason .icon{width:28px;height:28px;color:var(--accent);margin-bottom:18px}
.reason h3{margin-bottom:8px}
.reason p{color:var(--muted)}
.split{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(28px,6vw,80px);align-items:center}
.split--flip>:first-child{order:2}
.split__media{border-radius:var(--r-lg);overflow:hidden;aspect-ratio:4/5}
.split__media img,.split__media .art{width:100%;height:100%;object-fit:cover}
.split__text>*+*{margin-top:18px}
.values{display:grid;gap:14px;margin-top:28px;padding:0;list-style:none}
.values li{display:grid;grid-template-columns:22px 1fr;gap:12px}
.values li .icon{width:20px;height:20px;color:var(--accent);margin-top:4px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:clamp(18px,3vw,36px);counter-reset:step;padding:0;margin:0;list-style:none}
.steps li{counter-increment:step;padding-top:22px;border-top:2px solid currentColor}
.steps li::before{content:counter(step);display:block;font-family:var(--display);font-weight:var(--dw);font-size:44px;line-height:1;margin-bottom:16px;color:var(--accent)}
.section--dark .steps li{border-top-color:color-mix(in srgb,var(--dark-ink) 30%,transparent)}
.steps p{margin-top:8px;opacity:.8}
.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:28px}
.search{flex:1 1 260px;display:flex;align-items:center;gap:10px;min-height:50px;padding:0 18px;border:1.5px solid var(--line);border-radius:999px;background:var(--surface)}
.search input{flex:1;border:0;background:transparent;outline:0;min-width:0;font-size:16px}
.chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;min-height:42px;padding:0 18px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);cursor:pointer;font-weight:500;font-size:15px}
.chip[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.select{min-height:50px;padding:0 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface)}
.items{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:22px}
.item{display:flex;flex-direction:column;background:var(--surface);border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--line)}
.item[hidden]{display:none}
.item__ph{margin:0;aspect-ratio:4/3;overflow:hidden;background:var(--line)}
.item__ph img,.item__ph .art{width:100%;height:100%;object-fit:cover;transition:transform .5s}
.item:hover .item__ph img{transform:scale(1.04)}
.item__body{display:flex;flex-direction:column;gap:10px;padding:20px 20px 22px;flex:1}
.item__top{display:flex;align-items:baseline;gap:12px}
.item__name{font-size:19px}
.item__lead{flex:1;border-bottom:1.5px dotted var(--line);transform:translateY(-5px);min-width:12px}
.item__price{font-weight:700;white-space:nowrap}
.item__desc{color:var(--muted);font-size:15px;flex:1}
.item__foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px}
.badge{display:inline-flex;align-items:center;min-height:26px;padding:0 10px;border-radius:999px;background:color-mix(in srgb,var(--second) 18%,transparent);color:color-mix(in srgb,var(--second) 80%,var(--ink));font-size:13px;font-weight:600}
.add{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 16px;border-radius:999px;border:0;background:var(--accent);color:var(--accent-ink);font-weight:600;font-size:15px;cursor:pointer;margin-left:auto}
.add svg{width:16px;height:16px}
.qty{display:inline-flex;align-items:center;border:1.5px solid var(--line);border-radius:999px;margin-left:auto}
.qty button{width:40px;height:40px;border:0;background:transparent;font-size:20px;cursor:pointer}
.qty output{min-width:24px;text-align:center;font-weight:700}
.empty{padding:48px 20px;text-align:center;color:var(--muted);border:1.5px dashed var(--line);border-radius:var(--r-lg)}
.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.strip figure,.masonry figure{margin:0;border-radius:var(--r);overflow:hidden;cursor:zoom-in;background:var(--line)}
.strip figure{aspect-ratio:3/4}
.strip img,.masonry img,.strip .art,.masonry .art{width:100%;height:100%;object-fit:cover;transition:transform .5s}
.strip figure:hover img,.masonry figure:hover img{transform:scale(1.04)}
.masonry{columns:3 280px;column-gap:16px}
.masonry figure{break-inside:avoid;margin-bottom:16px}
.masonry figcaption{padding:10px 4px 0;font-size:14px;color:var(--muted);background:var(--bg)}
.band{border-radius:var(--r-lg);padding:clamp(32px,6vw,72px);background:var(--accent);color:var(--accent-ink);display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center}
.band h2{max-width:18ch}
.band p{opacity:.85;margin-top:12px;max-width:50ch}
.band .btn{background:var(--accent-ink);border-color:var(--accent-ink);color:var(--accent)}
.faq{display:grid;gap:0;border-top:1px solid var(--line)}
.faq details{border-bottom:1px solid var(--line)}
.faq summary{display:flex;justify-content:space-between;gap:20px;padding:22px 0;cursor:pointer;list-style:none;font-weight:600;font-size:18px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:26px;line-height:1;color:var(--accent);transition:transform .2s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{padding:0 0 22px;color:var(--muted);max-width:70ch}
.visit{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,4vw,56px);align-items:start}
.hours{width:100%;border-collapse:collapse}
.hours td{padding:12px 0;border-bottom:1px solid var(--line)}
.hours td:last-child{text-align:right;font-weight:600}
.hours tr.is-today td{color:var(--accent);font-weight:700}
.status{display:inline-flex;align-items:center;gap:8px;font-weight:600}
.status::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--muted)}
.status[data-open="true"]::before{background:#22A06B;box-shadow:0 0 0 4px rgba(34,160,107,.18)}
.contact-list{display:grid;gap:18px;margin:0;padding:0;list-style:none}
.contact-list li{display:grid;grid-template-columns:24px 1fr;gap:14px;align-items:start}
.contact-list .icon{color:var(--accent);margin-top:2px}
.contact-list a{text-decoration:none;font-weight:600}
.contact-list small{display:block;color:var(--muted);font-size:14px}
.copy{border:0;background:none;padding:0;color:var(--accent);font-weight:600;cursor:pointer;font-size:14px}
.map{border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--line);aspect-ratio:16/11;background:var(--line);position:relative}
.map iframe{width:100%;height:100%;border:0}
.map__links{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.map__links a{font-size:14px;font-weight:600;padding:8px 14px;border-radius:999px;border:1px solid var(--line);text-decoration:none;background:var(--surface)}
.form{display:grid;gap:16px}
.form__row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.field{display:grid;gap:7px}
.field label{font-size:14px;font-weight:600}
.field input,.field select,.field textarea{width:100%;min-height:52px;padding:12px 16px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--surface);font-size:16px;outline:0;transition:border-color .2s}
.field textarea{min-height:110px;resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--accent)}
.field[data-invalid] input,.field[data-invalid] select{border-color:#D33A2C}
.field__error{color:#D33A2C;font-size:13px;min-height:0}
.seg{display:inline-flex;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--ink) 7%,transparent)}
.seg button{min-height:40px;padding:0 18px;border:0;border-radius:999px;background:transparent;font-weight:600;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--surface);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.stepper{display:inline-flex;align-items:center;gap:6px}
.stepper button{width:44px;height:44px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);font-size:20px;cursor:pointer}
.stepper output{min-width:34px;text-align:center;font-weight:700;font-size:18px}
.booking{display:grid;grid-template-columns:1.2fr .8fr;gap:clamp(24px,4vw,56px);align-items:start}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:clamp(22px,3vw,34px)}
.aside{display:grid;gap:22px;position:sticky;top:calc(var(--hdr) + 20px)}
.aside__ph{border-radius:var(--r-lg);overflow:hidden;aspect-ratio:4/3}
.aside__ph img,.aside__ph .art{width:100%;height:100%;object-fit:cover}
.done{display:grid;gap:18px;text-align:left}
.done[hidden]{display:none}
.done__mark{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,#22A06B 16%,transparent);color:#1B7F55}
.done__mark svg{width:28px;height:28px}
.summary{margin:0;padding:16px 18px;border-radius:var(--r);background:color-mix(in srgb,var(--ink) 5%,transparent);white-space:pre-wrap;font:15px/1.55 var(--body)}
.send{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:22px;margin-top:40px;padding:0;list-style:none}
.facts li{padding-top:18px;border-top:1px solid var(--line)}
.facts strong{display:block;font-family:var(--display);font-weight:var(--dw);font-size:34px;letter-spacing:var(--dt);line-height:1.1}
.collage{display:grid;grid-template-columns:1.3fr 1fr;grid-template-rows:1fr 1fr;gap:14px;aspect-ratio:5/4}
.collage figure{margin:0;border-radius:var(--r-lg);overflow:hidden}
.collage figure:first-child{grid-row:span 2}
.collage img,.collage .art{width:100%;height:100%;object-fit:cover}
.pagehead{padding:clamp(48px,7vw,96px) 0 clamp(24px,3vw,40px)}
.pagehead p{margin-top:16px}
.notfound{min-height:60vh;display:grid;place-items:center;text-align:center}
.notfound p{margin:16px 0 28px}
.ftr{background:var(--dark);color:var(--dark-ink);padding:clamp(56px,7vw,88px) 0 32px;margin-top:0}
.ftr__grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:32px}
.ftr h3{font-size:16px;margin-bottom:14px;font-family:var(--body);font-weight:700;letter-spacing:0}
.ftr ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.ftr a{text-decoration:none;opacity:.8}
.ftr a:hover{opacity:1}
.ftr .logo{color:var(--dark-ink);margin-bottom:14px}
.ftr p{opacity:.75;max-width:34ch}
.ftr__bottom{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:48px;padding-top:24px;border-top:1px solid color-mix(in srgb,var(--dark-ink) 18%,transparent);font-size:14px;opacity:.7}
.socials{display:flex;gap:10px;margin-top:18px}
.socials a{display:grid;place-items:center;width:42px;height:42px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dark-ink) 25%,transparent);opacity:1}
.drawer{position:fixed;inset:0;z-index:60;display:flex;justify-content:flex-end;background:rgba(10,10,10,.45);opacity:0;transition:opacity .2s}
.drawer[hidden]{display:none}
.drawer.is-open{opacity:1}
.drawer__panel{width:min(460px,100%);height:100%;background:var(--bg);color:var(--ink);display:flex;flex-direction:column;transform:translateX(30px);transition:transform .25s}
.drawer.is-open .drawer__panel{transform:none}
.drawer__head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid var(--line)}
.drawer__body{flex:1;overflow:auto;padding:16px 22px}
.drawer__foot{padding:18px 22px 22px;border-top:1px solid var(--line);display:grid;gap:12px}
.x{width:44px;height:44px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);cursor:pointer;display:grid;place-items:center}
.x svg{width:18px;height:18px}
.line{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
.line img,.line .art{width:64px;height:64px;border-radius:12px;object-fit:cover}
.line__name{font-weight:600}
.line__price{color:var(--muted);font-size:14px}
.line__remove{border:0;background:none;color:var(--muted);font-size:13px;cursor:pointer;padding:0;text-decoration:underline}
.total{display:flex;justify-content:space-between;font-size:19px;font-weight:700}
.lightbox{position:fixed;inset:0;z-index:70;background:rgba(8,8,8,.92);display:grid;place-items:center;padding:60px 16px}
.lightbox[hidden]{display:none}
.lightbox img{max-width:min(1100px,100%);max-height:80vh;border-radius:10px;object-fit:contain}
.lightbox figcaption{color:#ddd;text-align:center;margin-top:12px;font-size:15px}
.lightbox .x{position:absolute;top:16px;right:16px;background:#fff;border-color:#fff;color:#111}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:999px;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;font-size:24px}
.lb-prev{left:16px}.lb-next{right:16px}
.toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:80;display:grid;gap:8px;width:min(420px,calc(100% - 32px))}
.toast{padding:14px 18px;border-radius:14px;background:var(--ink);color:var(--bg);font-weight:500;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:toast .25s ease both}
@keyframes toast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.art{display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 85%,#000),color-mix(in srgb,var(--second) 70%,var(--accent)));color:color-mix(in srgb,var(--accent-ink) 80%,transparent)}
.art svg{width:min(28%,64px);height:auto;opacity:.75}
.credits{font-size:12px;opacity:.6;margin-top:6px}
.credits a{text-decoration:underline}
.sticky-cta{display:none}
.sticky-cta [data-cart-count][data-zero]{display:none}
body[data-current="booking"] .sticky-cta{display:none!important}
.eyebrow{display:flex;align-items:center;gap:12px;margin:0 0 18px;font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.88);animation:rise .9s cubic-bezier(.2,.7,.2,1) both}
.eyebrow::before{content:"";width:28px;height:1.5px;background:currentColor;opacity:.7}
.hero__card{position:absolute;right:max(20px,calc((100% - var(--wrap)) / 2));bottom:clamp(36px,7vw,84px);z-index:2;display:grid;gap:6px;width:min(300px,40%);padding:18px 20px;border-radius:var(--r-lg);background:color-mix(in srgb,var(--surface) 88%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:var(--ink);box-shadow:var(--shadow-3);font-size:15px;line-height:1.45;animation:rise .9s .35s var(--ease-out) both}
.hero__card p{color:var(--muted)}
.hero__card .link{font-size:14px;justify-self:start;margin-top:4px}
.kicker{display:flex;align-items:center;gap:12px;margin:0 0 14px;font:600 13px/1 var(--body);letter-spacing:.16em;color:var(--accent-11)}
.kicker::after{content:"";width:40px;height:1.5px;background:currentColor;opacity:.5}
.section--dark .kicker{color:color-mix(in srgb,var(--accent) 45%,var(--dark-ink))}
.marquee{overflow:hidden;border-block:1px solid var(--line);background:var(--surface);padding:18px 0;-webkit-mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent);mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent)}
.marquee__track{display:flex;width:max-content;align-items:center;animation:marquee 40s linear infinite;font-family:var(--display);font-weight:var(--dw);font-size:clamp(20px,2.2vw,30px);letter-spacing:var(--dt);white-space:nowrap}
.marquee__track span,.marquee__track i{padding-right:28px}
.marquee__track i{font-style:normal;color:var(--accent);font-size:.7em}
.marquee:hover .marquee__track{animation-play-state:paused}
@keyframes marquee{to{transform:translateX(-50%)}}
.bento{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(212px,auto);gap:16px}
.tile{grid-column:span var(--span,1);position:relative;display:flex;flex-direction:column;gap:10px;padding:26px;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--line);overflow:hidden;transition:transform .3s var(--ease-out),box-shadow .3s var(--ease-out)}
.tile:hover,.js .tile[data-reveal].is-in:hover{transform:translateY(-3px);box-shadow:var(--shadow-2)}
.tile>.icon{width:30px;height:30px;color:var(--accent);margin-bottom:auto}
.tile h3{margin-top:18px}
.tile p{color:var(--muted);font-size:15px}
.tile--photo{grid-column:span 2;grid-row:span 2;padding:0;border:0;color:#fff;min-height:440px;background:var(--dark)}
.tile--photo>img,.tile--photo>.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .8s var(--ease-out)}
.tile--photo>.art svg{display:none}
.tile--photo:hover>img{transform:scale(1.04)}
.tile--photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,.74))}
.tile__in{position:relative;z-index:1;margin-top:auto;padding:30px;display:grid;gap:10px}
.tile__in .icon{width:30px;height:30px;color:#fff}
.tile--photo h3{font-size:clamp(24px,2.4vw,32px);margin:0}
.tile--photo p{color:rgba(255,255,255,.88);font-size:16px;max-width:46ch}
.tile--stat{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.tile--stat strong{font-family:var(--display);font-weight:var(--dw);font-size:clamp(52px,5.4vw,76px);line-height:1;letter-spacing:var(--dt)}
.tile--stat>span:not(.status){font-weight:600;max-width:20ch}
.tile--stat .status{margin-top:auto;font-size:14px;font-weight:500;opacity:.92}
.tile--stat .status::before{background:currentColor}
.tile--stat .status[data-open="true"]::before{background:#3DD68C;box-shadow:0 0 0 4px rgba(61,214,140,.25)}
.rail{position:relative}
.rail__track{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 66px) / 4);gap:22px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;padding:4px 2px 18px;overscroll-behavior-x:contain}
.rail__track::-webkit-scrollbar{display:none}
.rail__track>.item{scroll-snap-align:start}
.rail__nav{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}
.rail__btn{width:48px;height:48px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);display:grid;place-items:center;cursor:pointer;transition:border-color .2s,opacity .2s}
.rail__btn:hover{border-color:var(--ink)}
.rail__btn[disabled]{opacity:.35;cursor:default}
.rail__btn[data-rail-prev] svg{transform:rotate(180deg)}
.rail.is-static .rail__nav{display:none}
.item{transition:box-shadow .3s var(--ease-out)}
.item:hover{box-shadow:var(--shadow-2)}
.items--board .item:hover{box-shadow:none}
.steps--line li{position:relative;border-top:0;padding-top:0}
.steps--line li::before{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--accent);color:var(--accent-ink);font-size:20px;margin-bottom:20px;position:relative;z-index:1}
.steps--line li::after{content:"";position:absolute;top:26px;left:64px;right:calc(-1 * clamp(18px,3vw,36px) + 12px);height:1.5px;background:var(--line)}
.steps--line li:last-child::after{display:none}
.mosaic{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:clamp(150px,17vw,250px);gap:14px}
.mosaic figure{margin:0;border-radius:var(--r);overflow:hidden;cursor:zoom-in;background:var(--line);position:relative}
.mosaic figure:first-child{grid-column:span 2;grid-row:span 2}
.mosaic--4 figure:last-child{grid-column:span 2}
.mosaic img,.mosaic .art{width:100%;height:100%;object-fit:cover;transition:transform .6s var(--ease-out)}
.mosaic figure:hover img{transform:scale(1.05)}
.mosaic figcaption{position:absolute;left:14px;right:14px;bottom:12px;color:#fff;font-size:14px;font-weight:500;text-shadow:0 1px 10px rgba(0,0,0,.7)}
.cta{position:relative;display:grid;align-items:end;min-height:clamp(360px,40vw,520px);border-radius:var(--r-lg);overflow:hidden;color:#fff;isolation:isolate;background:var(--dark)}
.cta__media{position:absolute;inset:0;z-index:-2}
.cta__media img,.cta__media .art{width:100%;height:100%;object-fit:cover}
.cta__media .art svg{display:none}
.cta::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(0,0,0,.76),rgba(0,0,0,.2) 75%)}
.cta__in{padding:clamp(28px,5vw,64px);max-width:640px;display:grid;gap:14px}
.cta__in h2{max-width:16ch}
.cta__in p{color:rgba(255,255,255,.88);max-width:50ch}
.cta__actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px}
.faqwrap{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(28px,5vw,72px);align-items:start}
.ftr__word{font-family:var(--display);font-weight:var(--dw);letter-spacing:-.03em;line-height:.85;text-align:center;white-space:nowrap;overflow:hidden;color:color-mix(in srgb,var(--dark-ink) 11%,transparent);margin-top:44px;user-select:none}
.totop{position:fixed;right:20px;bottom:20px;z-index:31;width:48px;height:48px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);display:grid;place-items:center;box-shadow:var(--shadow-2);cursor:pointer}
.totop[hidden]{display:none}
.totop svg{transform:rotate(-90deg)}
.field{position:relative}
.errsum{padding:16px 18px;border:2px solid #D33A2C;border-radius:var(--r);background:color-mix(in srgb,#D33A2C 7%,var(--surface))}
.errsum[hidden]{display:none}
.errsum ul{margin:8px 0 0;padding-left:20px;display:grid;gap:4px}
.errsum button{border:0;background:none;padding:0;color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer;text-align:left}
.slots__select{position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;max-height:240px;overflow:auto;padding:2px}
.slot{min-height:44px;border-radius:var(--r);border:1.5px solid var(--line);background:var(--surface);font-weight:600;cursor:pointer;transition:border-color .15s,background .15s}
.slot:hover{border-color:var(--accent)}
.slot[aria-checked="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.slots__none{grid-column:1/-1;color:var(--muted);padding:10px 0}
.field[data-invalid] .slots{outline:2px solid #D33A2C;outline-offset:2px;border-radius:var(--r)}
.lb-count{position:absolute;top:28px;left:22px;color:#ddd;font-size:14px}
.item__price,.total,.hours td,.line__price,.slot,[data-count],.facts strong{font-variant-numeric:tabular-nums}
.js [data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s var(--ease-out),transform .7s var(--ease-out);transition-delay:calc(var(--i,0) * 80ms)}
.js [data-reveal].is-in{opacity:1;transform:none}
@media (max-width:1060px){.rail__track{grid-auto-columns:calc((100% - 44px) / 3)}}
@media (max-width:980px){.bento{grid-template-columns:repeat(2,minmax(0,1fr))}.tile{grid-column:span 1}.tile--photo{grid-column:span 2;grid-row:auto;min-height:380px}.tile[style*="--span"]{grid-column:span 2}}
@media (max-width:1060px){.nav,.hdr__phone{display:none}.burger{display:grid}.ftr__grid{grid-template-columns:1fr 1fr}}
@media (max-width:820px){
  body{font-size:16px}
  .split,.visit,.booking{grid-template-columns:1fr}
  .split--flip>:first-child{order:0}
  .split__media{aspect-ratio:4/3}
  .aside{position:static}
  .strip{grid-template-columns:repeat(2,1fr)}
  .band{grid-template-columns:1fr}
  .form__row{grid-template-columns:1fr}
  .hdr__cta{display:none}
  .sticky-cta{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:30;gap:10px}
  .sticky-cta .btn{flex:1;min-height:54px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  .ftr{padding-bottom:96px}
  .hero__card{display:none}
  .rail__track{grid-auto-columns:calc((100% - 22px) / 2)}
  .mosaic{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:150px}
  .faqwrap{grid-template-columns:1fr}
  .steps--line li::after{display:none}
  .totop{bottom:84px}
  .collage{aspect-ratio:auto;grid-template-rows:200px 200px}
}
@media (max-width:560px){.ftr__grid{grid-template-columns:1fr}.items{grid-template-columns:1fr}.masonry{columns:2 140px}.hero h1{max-width:none}.bento{grid-template-columns:1fr}.tile,.tile--photo,.tile[style*="--span"]{grid-column:auto}.tile--photo{min-height:340px}.bento{grid-auto-rows:auto}.tile{padding:22px}.tile>.icon{margin-bottom:0}.tile h3{margin-top:8px}.rail__track{grid-auto-columns:84%}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.js [data-reveal]{opacity:1!important;transform:none!important}}`

/** The one memorable thing in each direction. */
const SIGNATURE: Record<DirectionId, string> = {
  // A printed menu board: names, dotted leaders, prices; photos as small round chips.
  roastery: `.hero h1{font-size:clamp(38px,6vw,78px);max-width:14ch}
.items--board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 56px}
.tile--stat{background:var(--dark);color:var(--dark-ink);border-color:var(--dark)}
.tile--stat strong{color:var(--second)}
.items--board .item{flex-direction:row;align-items:flex-start;gap:18px;background:none;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:22px 0;overflow:visible}
.items--board .item__ph{flex:none;width:84px;height:84px;aspect-ratio:auto;border-radius:50%}
.items--board .item__body{padding:0;gap:6px}
.items--board .item__price{color:var(--second);font-size:18px}
.items--board .add{min-height:36px;padding:0 14px;font-size:14px}
.cat-title{grid-column:1/-1;font-family:var(--display);font-weight:var(--dw);font-size:22px;padding:28px 0 4px;color:var(--accent)}
@media (max-width:820px){.items--board{grid-template-columns:1fr}}`,
  // Arched frames, like salon mirrors.
  atelier: `.hero{align-items:center;color:var(--ink);min-height:auto;padding:clamp(40px,6vw,80px) 0}
.hero::after{display:none}
.hero__media{position:relative;inset:auto;z-index:0;order:2;border-radius:999px 999px var(--r-lg) var(--r-lg);overflow:hidden;aspect-ratio:3/4;max-height:78vh}
.hero__grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(28px,6vw,90px);align-items:center}
.hero__in{padding:0}
.hero__sub{color:var(--muted)}
.hero__facts{border-top-color:var(--line);color:var(--muted)}
.hero h1{font-size:clamp(46px,7vw,96px);font-weight:600}
.hero .btn--light{border-color:var(--ink);color:var(--ink)}
.hero .btn--light:hover{background:var(--ink);color:var(--bg)}
.eyebrow{color:var(--accent)}
.hero h1,.hero__sub,.eyebrow{text-shadow:none}
.split__media,.aside__ph{border-radius:999px 999px var(--r-lg) var(--r-lg)}
.tile--photo{border-radius:999px 999px var(--r-lg) var(--r-lg)}
.mosaic figure:first-child{border-radius:999px 999px var(--r) var(--r)}
.item__ph{border-radius:999px 999px 0 0;margin:14px 14px 0;aspect-ratio:1/1}
.item{border-color:transparent}
@media (max-width:820px){.hero__grid{grid-template-columns:1fr}.hero__media{order:0;max-height:60vh;aspect-ratio:4/5}}`,
  // Hard edges: a diagonal cut under the hero and price tags you can't miss.
  edge: `.hero{clip-path:polygon(0 0,100% 0,100% calc(100% - 6vw),0 100%)}
.hero__in{padding-bottom:clamp(64px,11vw,140px)}
.hero h1{font-size:clamp(42px,6.4vw,92px);line-height:1;max-width:13ch}
.hero__card{bottom:calc(6vw + 36px)}
.marquee{background:var(--accent);border:0;color:var(--accent-ink)}
.marquee__track{text-transform:uppercase}
.marquee__track i{color:var(--accent-ink)}
.tile{border-radius:var(--r)}
.steps--line li::before{border-radius:var(--r)}
.item{background:var(--surface);border-color:var(--line)}
.item__price{font-family:var(--display);font-size:24px;color:var(--accent)}
.item__lead{display:none}
.item__top{justify-content:space-between}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.reason .icon{color:var(--accent)}
.band{background:repeating-linear-gradient(-45deg,var(--accent) 0 22px,color-mix(in srgb,var(--accent) 88%,#000) 22px 44px)}
.nav a[aria-current="page"]{background:none;color:var(--accent)}
.field input,.field select,.field textarea,.search,.select,.chip,.cartbtn,.burger,.x{background:var(--surface)}`,
  // Calm and clear: a trust panel with today's hours over the hero.
  clinic: `.hero{min-height:auto;padding:clamp(40px,6vw,80px) 0 0;color:var(--ink);align-items:start}
.hero::after{display:none}
.hero__media{position:relative;inset:auto;z-index:0;border-radius:var(--r-lg);overflow:hidden;aspect-ratio:21/9;margin-top:40px}
.hero__in{padding:0}
.hero__sub{color:var(--muted)}
.hero__facts{color:var(--ink);border-top:0;padding:0;margin-top:28px}
.hero__facts li{padding:10px 16px;border-radius:999px;background:var(--surface);border:1px solid var(--line)}
.hero__facts .icon{color:var(--accent)}
.hero .btn--light{border-color:var(--ink);color:var(--ink)}
.hero h1{max-width:16ch;font-size:clamp(38px,5.4vw,70px)}
.eyebrow{color:var(--accent)}
.hero h1,.hero__sub,.eyebrow{text-shadow:none}
.items{grid-template-columns:1fr;gap:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden}
.items .item{flex-direction:row;align-items:center;border:0;border-bottom:1px solid var(--line);border-radius:0}
.items .item__ph{width:120px;flex:none;aspect-ratio:1/1}
.items .item__body{flex-direction:row;align-items:center;gap:20px}
.items .item__top{flex-direction:column;align-items:flex-start;gap:4px;flex:1}
.items .item__lead{display:none}
.items .item__desc{flex:2}
.items .item__foot{margin:0}
@media (max-width:820px){.items .item{flex-direction:column;align-items:stretch}.items .item__ph{width:100%;aspect-ratio:16/9}.items .item__body{flex-direction:column;align-items:stretch}}`,
  // Food first: big photographs, quick add, a sticky row of categories.
  market: `.hero h1{font-size:clamp(44px,7vw,96px);max-width:12ch;font-weight:800}
.item{border:0;background:var(--surface)}
.item__ph{aspect-ratio:1/1;margin:10px 10px 0;border-radius:calc(var(--r-lg) - 8px)}
.item__name{font-weight:700}
.item__lead{display:none}
.item__top{justify-content:space-between}
.item__price{font-size:20px;color:var(--accent)}
.toolbar{position:sticky;top:var(--hdr);z-index:20;background:var(--bg);padding:12px 0;margin-top:-12px}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.badge{background:var(--second);color:#1F1A16}`,
  // Editorial: square corners, photographs carry the page, one cobalt accent.
  gallery: `.hero{align-items:end}
.hero h1{font-size:clamp(46px,8.4vw,120px);line-height:.95;max-width:11ch;font-weight:600}
.item{border:0;background:none}
.item__ph{aspect-ratio:4/5;border-radius:var(--r)}
.item__body{padding:16px 2px 6px}
.item__lead{display:none}
.item__top{justify-content:space-between}
.btn{border-radius:var(--r)}
.chip,.search,.select,.seg,.seg button,.cartbtn,.burger,.x,.add,.qty,.map__links a{border-radius:var(--r)}
.reasons{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));border-top:2px solid var(--ink)}
.marquee{background:var(--bg);border-color:var(--ink)}
.tile--stat{background:var(--ink);border-color:var(--ink);color:var(--bg)}`,
  // Coastal: a panoramic photograph with the booking bar sitting on it.
  coast: `.hero{min-height:calc(92svh - var(--hdr))}
.hero h1{font-size:clamp(46px,7.4vw,104px);font-weight:400;max-width:12ch}
.quickbook{position:relative;z-index:2;margin-top:-56px}
.quickbook form{display:grid;grid-template-columns:repeat(3,1fr) auto;gap:12px;align-items:end;background:var(--surface);border-radius:var(--r-lg);padding:18px;box-shadow:0 20px 50px rgba(15,42,49,.16)}
.items{grid-template-columns:1fr}
.items .item{display:grid;grid-template-columns:minmax(0,1.1fr) 1fr;border:0}
.items .item__ph{aspect-ratio:auto;min-height:260px}
.items .item__body{padding:clamp(22px,3vw,40px);justify-content:center}
.items .item__name{font-family:var(--display);font-weight:400;font-size:clamp(26px,2.6vw,36px)}
.items .item__lead{display:none}
@media (max-width:820px){.quickbook form{grid-template-columns:1fr 1fr}.items .item{grid-template-columns:1fr}.items .item__ph{min-height:220px}}`,
}
