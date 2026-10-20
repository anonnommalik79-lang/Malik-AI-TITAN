import { GAME_RUNTIME_JS } from "./runtime-script"
import type { GamePlan } from "./types"

/**
 * One self-contained index.html: the plan as JSON data, the Malik runtime,
 * the model's game logic and the styles of this game's theme. It runs from
 * the chat's preview, from a downloaded file and from a static host alike.
 */

const GOOGLE_FONT: Record<GamePlan["theme"]["font"], string> = {
  display: "Russo+One",
  pixel: "Press+Start+2P",
  round: "Nunito:wght@600;800",
  tech: "Exo+2:wght@500;700;800",
  serif: "Playfair+Display:wght@600;800",
}
const FONT_STACK: Record<GamePlan["theme"]["font"], string> = {
  display: "'Russo One', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  pixel: "'Press Start 2P', 'Courier New', ui-monospace, monospace",
  round: "'Nunito', 'Segoe UI', system-ui, sans-serif",
  tech: "'Exo 2', 'Segoe UI', system-ui, sans-serif",
  serif: "'Playfair Display', Georgia, serif",
}

const escapeHtml = (value: string) => String(value || "").replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string))

/** Text inside <script> must never close the element early. */
export function scriptSafe(code: string) {
  return String(code || "").replace(/<\/(script)/giu, "<\\/$1").replace(/<!--/gu, "<\\!--")
}

/** JSON inside <script type="application/json">, readable by JSON.parse and unable to break out. */
function jsonScript(value: unknown) {
  return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026").replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029")
}

function styles(plan: GamePlan) {
  const p = plan.theme.palette
  const pixel = plan.theme.font === "pixel"
  return `
:root{--bg:${p.bg};--bg2:${p.bg2};--fg:${p.fg};--muted:${p.muted};--accent:${p.accent};--accent2:${p.accent2};--danger:${p.danger};--good:${p.good};--font:${FONT_STACK[plan.theme.font]};color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:var(--font);overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#stage{position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 0%,var(--bg2),var(--bg));touch-action:none}
#game{display:block;outline:none;border-radius:${pixel ? "0" : "14px"};box-shadow:0 30px 80px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06);${pixel ? "image-rendering:pixelated;" : ""}}
#hud{position:absolute;top:max(10px,env(safe-area-inset-top));left:12px;right:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none;z-index:3}
[hidden]{display:none!important}
.hud-left,.hud-center,.hud-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pill{display:inline-flex;align-items:baseline;gap:6px;padding:7px 12px;border-radius:999px;background:rgba(0,0,0,.42);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);font-size:${pixel ? "11px" : "14px"};line-height:1;color:var(--fg);white-space:nowrap}
.pill b{font-size:${pixel ? "13px" : "18px"};color:var(--accent)}
.pill small{opacity:.7;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.pill.soft{opacity:.85}.pill.lives{color:var(--danger);letter-spacing:2px}
.icon{pointer-events:auto;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.42);color:var(--fg);font:inherit;font-size:14px;cursor:pointer;backdrop-filter:blur(8px)}
#ui{position:absolute;inset:0;display:grid;place-items:center;padding:16px;z-index:4;background:radial-gradient(80% 80% at 50% 50%,rgba(0,0,0,.25),rgba(0,0,0,.6))}
.panel{width:min(560px,100%);max-height:100%;overflow:auto;padding:28px 26px;border-radius:24px;text-align:center;background:linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.16);box-shadow:0 30px 90px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.18);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);animation:rise .35s cubic-bezier(.2,.8,.2,1)}
@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
.eyebrow{margin:0 0 6px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent2)}
.panel h1{margin:0;font-size:${pixel ? "clamp(20px,5vw,30px)" : "clamp(32px,7vw,56px)"};line-height:1.05;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 24px rgba(0,0,0,.35))}
.panel h2{margin:0 0 8px;font-size:${pixel ? "20px" : "34px"};color:var(--fg)}
.panel.won h2{color:var(--good)}.panel.over h2{color:var(--danger)}
.tagline{margin:12px auto 18px;max-width:42ch;color:var(--muted);font-size:${pixel ? "11px" : "16px"};line-height:1.5}
.panel button{font:inherit;cursor:pointer;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:var(--fg);padding:10px 16px;font-size:${pixel ? "11px" : "15px"}}
.panel button:hover{background:rgba(255,255,255,.16)}
.panel button.primary{display:block;width:100%;margin:6px 0 4px;padding:15px 20px;font-size:${pixel ? "14px" : "20px"};font-weight:800;color:#0b0b0f;border:0;background:linear-gradient(90deg,var(--accent),var(--accent2));box-shadow:0 12px 30px rgba(0,0,0,.35);transition:transform .15s}
.panel button.primary:hover{transform:translateY(-2px)}
.panel button:focus-visible{outline:3px solid var(--accent2);outline-offset:3px}
.row{display:flex;gap:8px;justify-content:center;margin-top:10px}
.controls{margin:18px 0 6px;text-align:left}
.controls p{margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);text-align:center}
.controls ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px}
.controls li{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;background:rgba(0,0,0,.22);font-size:${pixel ? "9px" : "13px"};color:var(--fg)}
kbd{font:inherit;font-size:${pixel ? "9px" : "12px"};padding:3px 8px;border-radius:7px;background:rgba(255,255,255,.14);border-bottom:2px solid rgba(255,255,255,.25);white-space:nowrap;color:var(--accent)}
.goal{margin:12px 0 0;font-size:${pixel ? "10px" : "14px"};color:var(--fg);opacity:.9}
.best{margin:12px 0 0;font-size:${pixel ? "10px" : "13px"};color:var(--muted)}.best b{color:var(--accent)}
.final{margin:10px 0 0;font-size:16px;color:var(--muted)}.final b{font-size:${pixel ? "28px" : "52px"};color:var(--accent);display:block;line-height:1.1}
.hint{margin:12px 0 0;font-size:12px;color:var(--muted)}
.error{color:var(--danger);font-family:ui-monospace,Consolas,monospace;font-size:13px;word-break:break-word}
.banner{position:absolute;top:22%;left:50%;transform:translateX(-50%);z-index:5;padding:14px 28px;border-radius:18px;font-size:${pixel ? "18px" : "32px"};font-weight:800;color:var(--fg);background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(10px);pointer-events:none;animation:banner 1.6s ease forwards}
@keyframes banner{0%{opacity:0;transform:translate(-50%,10px) scale(.9)}15%{opacity:1;transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-10px)}}
#touch{position:absolute;left:0;right:0;bottom:max(16px,env(safe-area-inset-bottom));display:flex;justify-content:space-between;align-items:flex-end;padding:0 18px;pointer-events:none;z-index:3}
.stick{pointer-events:auto;width:132px;height:132px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.2);display:grid;place-items:center;touch-action:none}
.knob{width:58px;height:58px;border-radius:50%;background:linear-gradient(160deg,var(--accent),var(--accent2));box-shadow:0 8px 20px rgba(0,0,0,.4);transition:transform .05s}
.buttons{display:flex;gap:12px;margin-left:auto}
.tbtn{pointer-events:auto;width:84px;height:84px;border-radius:50%;border:2px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:var(--fg);font:inherit;font-size:13px;font-weight:800;touch-action:none}
.tbtn.on{background:var(--accent);color:#0b0b0f}
.rotate{margin:10px 0 0;font-size:12px;color:var(--accent2)}
@media (max-width:640px){.pill{padding:6px 9px;font-size:12px}.pill b{font-size:15px}.pill small{display:none}.icon{width:32px;height:32px}.panel{padding:22px 18px}.tbtn{width:74px;height:74px}.stick{width:120px;height:120px}}
@media (prefers-reduced-motion:reduce){.panel,.banner{animation:none}}
`.trim()
}

export function buildGameHtml(plan: GamePlan, logic: string) {
  const title = escapeHtml(plan.title)
  const lang = plan.locale === "kk" ? "kk" : plan.locale === "ru" ? "ru" : "en"
  return [
    "<!doctype html>",
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">',
    `<title>${title}</title>`,
    `<meta name="description" content="${escapeHtml(plan.tagline)}">`,
    '<meta name="generator" content="Malik Game Studio">',
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${GOOGLE_FONT[plan.theme.font]}&display=swap">`,
    `<style>${styles(plan)}</style>`,
    "</head>",
    "<body>",
    `<main id="stage" aria-label="${title}">`,
    `<canvas id="game" width="${plan.width}" height="${plan.height}" tabindex="0" aria-label="${title}"></canvas>`,
    '<div id="hud" hidden></div>',
    '<div id="ui"></div>',
    '<div id="touch" hidden></div>',
    "</main>",
    `<script id="malik-game-plan" type="application/json">${jsonScript(plan)}</script>`,
    `<script id="malik-game-runtime">${scriptSafe(GAME_RUNTIME_JS)}</script>`,
    `<script id="malik-game-logic">\n${scriptSafe(logic)}\n</script>`,
    "<script>MalikGame.boot()</script>",
    "</body>",
    "</html>",
  ].join("\n")
}

/** The plan and the logic of a game this studio made, read back from its page (for edits). */
export function readGamePage(html: string): { plan: GamePlan; logic: string } | null {
  const text = String(html || "")
  const planMatch = text.match(/<script id="malik-game-plan" type="application\/json">([\s\S]*?)<\/script>/u)
  const logicMatch = text.match(/<script id="malik-game-logic">\n?([\s\S]*?)\n?<\/script>/u)
  if (!planMatch || !logicMatch) return null
  try {
    const plan = JSON.parse(planMatch[1]) as GamePlan
    if (!plan || plan.version !== 1 || typeof plan.title !== "string") return null
    return { plan, logic: logicMatch[1].replace(/<\\\/(script)/giu, "</$1").replace(/<\\!--/gu, "<!--") }
  } catch {
    return null
  }
}
