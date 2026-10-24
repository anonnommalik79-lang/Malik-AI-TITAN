import { buildPassport, passportScriptJson } from "@/lib/proof/passport"
import type { QualityReport } from "./quality"

export function sitePassport(title: string, html: string, quality: QualityReport) {
  let hash = 0x811c9dc5
  for (const ch of html) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return buildPassport({
    projectId: `site-${hash.toString(16)}`, kind: "site", title,
    checks: [
      { id: "static", kind: "static", label: "Статическая проверка HTML", required: true,
        status: quality.ok ? "pass" : "fail", command: "reviewSiteHtml (lib/sites/forge/quality.ts)", details: [`${quality.checks} checks`, ...quality.issues.map(issue => `${issue.code}: ${issue.message}`)] },
      { id: "browser", kind: "browser", label: "Браузер desktop/mobile", required: true, status: "not_run", details: ["HTML не запускался сервером в браузере"] },
      { id: "media", kind: "integration", label: "Доступность и лицензии внешних фото", required: true, status: "not_run", details: ["Подбор фотографии не доказывает её доступность и право использования"] },
    ],
    knownIssues: quality.issues.map(issue => issue.message), artifacts: [{ name: "index.html", bytes: new TextEncoder().encode(html).length }],
  })
}

export function embedSitePassport(html: string, passport: ReturnType<typeof sitePassport>) {
  return html.replace(/<\/body>/i, `<script id="malik-proof-passport" type="application/json">${passportScriptJson(passport)}</script></body>`)
}
