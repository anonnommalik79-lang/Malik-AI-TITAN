import { getRenderAccessOrigin } from "@/lib/auth/guest-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Plain HTML remains readable without React hydration, external fonts or JS.
 * This page diagnoses access; it cannot load through a blocked domain. */
export async function GET() {
  const accessOrigin = getRenderAccessOrigin()
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Подключение — Malik AI</title><style>
body{margin:0;background:#080808;color:#eee;font:16px/1.65 system-ui,sans-serif}main{max-width:760px;margin:48px auto;padding:24px}h1{font-size:30px;line-height:1.2}h2{font-size:21px;margin-top:32px}a{color:#fff;text-underline-offset:4px}code{overflow-wrap:anywhere}nav{display:flex;gap:16px;flex-wrap:wrap}.button{padding:10px 16px;border:1px solid #555;border-radius:10px;text-decoration:none}li{margin:8px 0}.note{color:#aaa}table{border-collapse:collapse;width:100%}td,th{padding:10px 0;text-align:left;border-bottom:1px solid #333}td:first-child{padding-right:16px}
</style></head><body><main><a href="/">Malik AI</a><h1>Подключение к Malik AI</h1>
<p>Эта страница загружена с сервера Malik AI. Для обычного чата браузер обращается к этому же сайту: API моделей вызываются на сервере.</p>
<h2>Сайт открывается, а ответ зависает</h2><p>Если сеть задерживает потоковые ответы, включите совместимый режим. Ответ готовится на сервере, а браузер получает его короткими HTTPS-запросами. Режим доступен после входа в аккаунт; тариф и лимиты сохраняются.</p>
<nav><a class="button" href="/dashboard?connection=poll">Совместимый режим</a><a class="button" href="/dashboard">Обычный режим</a><a class="button" href="/api/health">Проверить сервер</a></nav>
<h2>Не открывается даже главная страница</h2><p><code>ERR_ADDRESS_INVALID</code> означает недопустимый IP-адрес или порт для подключения. Возможные причины: ответ DNS, запись hosts, прокси или сетевой фильтр. Код сайта ещё не выполняется, поэтому обновление приложения само по себе такую ошибку не устраняет.</p>
<p>На проблемном Windows-компьютере запустите <a href="/malik-network-check.ps1" download>проверку подключения</a>. Она показывает DNS, локальные записи для домена и HTTP-статус. Настройки компьютера не изменяются.</p>
<h2>Что проверить администратору сети</h2><table><thead><tr><th>Доступ</th><th>Для чего</th></tr></thead><tbody><tr><td><code>malikaiworld.world:443</code></td><td>Сайт, чат, API и локальные ресурсы</td></tr><tr><td><code>api.workos.com:443</code></td><td>Стандартная авторизация WorkOS</td></tr><tr><td>Выбранный Google / Apple / Microsoft</td><td>Вход через выбранного провайдера</td></tr></tbody></table>
<p>Проверьте правила DNS, категорию сайта, HTTPS-прокси и доступ по TCP 443. Для совместимого режима достаточно обычных HTTPS-запросов, WebSocket не требуется.</p>
<p>Если вход через внешний сервис недоступен, <a href="/guest">открыть гостевой режим</a>. Совместимый режим с чтением сохранённых ответов требует аккаунт, чтобы чужие ответы оставались закрытыми.</p>
${accessOrigin ? `<h2>Дополнительный адрес сервиса</h2><p><a href="${accessOrigin}/guest">${accessOrigin}</a> — гостевой вход на этот же сервер. Адрес должен быть включён в Render и разрешён вашей сетью. Вход в аккаунт пока использует основной домен.</p>` : ""}
<p class="note">Доступ в сети, где сайт запрещён администратором, требует разрешения этой сети. Если основной домен не разрешён, администратор может согласовать дополнительный адрес того же сервиса; его нужно настроить и проверить отдельно.</p>
</main></body></html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  })
}
