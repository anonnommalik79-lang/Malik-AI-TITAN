# Malik AI plugin audit — 2026-08-28

Goal: the Plugins screen must not pretend to have access. A card stays in the live catalog only when Malik AI has a concrete server-side execution path in this branch.

Legend:
- ✅ **LIVE** — kept in the marketplace and wired to a real runtime now.
- ↪ **MODEL ROUTER** — removed from Plugins because it belongs in Malik AI model routing, not an app connector.
- 🟡 **DEFERRED** — an API/integration exists, but this branch does not keep the card until a dedicated, tested runtime is present.
- ❌ **REMOVE** — not suitable for the promised simple/free ChatGPT-style app connection.

## AI (10)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 1 | ChatGPT / OpenAI | ↪ MODEL ROUTER | Model provider; duplicate of the model layer. |
| 2 | Claude / Anthropic | ↪ MODEL ROUTER | Model provider; duplicate of the model layer. |
| 3 | Google Gemini | ↪ MODEL ROUTER | Model provider; duplicate of the model layer. |
| 4 | Perplexity | ↪ MODEL ROUTER | Search/model provider; keep in model/search routing, not Plugins. |
| 5 | Mistral AI | ↪ MODEL ROUTER | Model provider. |
| 6 | Groq | ↪ MODEL ROUTER | Inference provider. |
| 7 | Hugging Face | ✅ LIVE | WorkOS Pipes credential + live account API. |
| 8 | Replicate | ✅ LIVE | WorkOS Pipes credential + live predictions API. |
| 9 | Ollama | ❌ REMOVE | User localhost is not reachable from a public Render server without an agent/tunnel. |
| 10 | LangChain | ❌ REMOVE | Framework/library, not a user SaaS account connector. |

## Development (20)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 11 | GitHub | ✅ LIVE | OAuth via WorkOS Pipes + private/user repository API. |
| 12 | GitLab | ✅ LIVE | OAuth via WorkOS Pipes + membership projects API. |
| 13 | Stack Overflow | ✅ LIVE | Public Stack Exchange API. |
| 14 | MDN Web Docs | 🟡 DEFERRED | Better served by the research/web layer; no account connection is needed. |
| 15 | Vercel | 🟡 DEFERRED | Official API exists, but needs a dedicated OAuth/token adapter before the card returns. |
| 16 | Cloudflare | ✅ LIVE | WorkOS Pipes + Cloudflare account API. |
| 17 | Netlify | ✅ LIVE | WorkOS Pipes + sites API. |
| 18 | Supabase | 🟡 DEFERRED | Management API/PAT exists; dedicated secure key connector not shipped in this branch. |
| 19 | Firebase | 🟡 DEFERRED | Google project/service-account setup is not a simple per-user plugin flow. |
| 20 | PostgreSQL | ❌ REMOVE | Raw database connection strings should not be offered as a generic public plugin. |
| 21 | MongoDB | 🟡 DEFERRED | Atlas API exists, but needs a dedicated project/key adapter. |
| 22 | Redis | 🟡 DEFERRED | Redis Cloud API exists, but generic Redis is not one OAuth account surface. |
| 23 | Docker | 🟡 DEFERRED | Docker Hub can be integrated, but the old generic “Docker” card was ambiguous. |
| 24 | Kubernetes | ❌ REMOVE | Arbitrary cluster credentials/endpoints require a separate hardened connector. |
| 25 | Sentry | ✅ LIVE | WorkOS Pipes + organizations API. |
| 26 | Grafana | 🟡 DEFERRED | API exists, but instance URL + token configuration is required. |
| 27 | Datadog | 🟡 DEFERRED | OAuth/API exists; dedicated site-aware adapter still required. |
| 28 | Postman | 🟡 DEFERRED | API key API exists; secure API-key provider + runtime not in this branch. |
| 29 | npm | ✅ LIVE | Public npm registry search API. |
| 30 | PyPI | 🟡 DEFERRED | Package JSON API is strong for exact names, but no equivalent reliable general search runner is shipped here. |

## Work (25)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 31 | Notion | ✅ LIVE | WorkOS Pipes + Notion search API. |
| 32 | Google Drive | ✅ LIVE | WorkOS Pipes + Drive API. |
| 33 | Gmail | ✅ LIVE | WorkOS Pipes + Gmail API. |
| 34 | Google Calendar | ✅ LIVE | WorkOS Pipes + Calendar API. |
| 35 | Google Sheets | 🟡 DEFERRED | Google API exists; bring back when a spreadsheet-specific tool schema is implemented. |
| 36 | Google Docs | 🟡 DEFERRED | Google API exists; bring back with a document-specific tool schema. |
| 37 | Google Slides | 🟡 DEFERRED | Google API exists; bring back with a presentation-specific tool schema. |
| 38 | Slack | ✅ LIVE | WorkOS Pipes + conversations API. |
| 39 | Discord | ✅ LIVE | WorkOS Pipes + guilds API. |
| 40 | Telegram | ✅ LIVE | Explicitly Telegram Bot; WorkOS Pipes credential + Bot API. |
| 41 | WhatsApp | 🟡 DEFERRED | WhatsApp Cloud API is a Business/Meta integration, not a personal WhatsApp account plugin. |
| 42 | Dropbox | ✅ LIVE | WorkOS Pipes + files API. |
| 43 | OneDrive | ✅ LIVE | WorkOS Pipes + Microsoft Graph. |
| 44 | Outlook | ✅ LIVE | WorkOS Pipes + Microsoft Graph mail. |
| 45 | Teams | ✅ LIVE | WorkOS Pipes + Microsoft Graph Teams. |
| 46 | Trello | 🟡 DEFERRED | Official API exists but requires its own key/token/OAuth flow; no fake card until adapter is tested. |
| 47 | Asana | ✅ LIVE | WorkOS Pipes + workspaces API. |
| 48 | Linear | ✅ LIVE | WorkOS Pipes + GraphQL API. |
| 49 | Jira | ✅ LIVE | WorkOS Pipes + Atlassian accessible-resources/Jira API. |
| 50 | ClickUp | ✅ LIVE | WorkOS Pipes + workspace API. |
| 51 | monday.com | 🟡 DEFERRED | Official API/MCP exists; dedicated MCP/OAuth adapter is deferred. |
| 52 | Airtable | ✅ LIVE | WorkOS Pipes + bases metadata API. |
| 53 | Miro | ✅ LIVE | WorkOS Pipes + boards API. |
| 54 | Figma | ✅ LIVE | WorkOS Pipes + Figma user API. |
| 55 | Canva | ✅ LIVE | WorkOS Pipes + Canva Connect user API. |

## Automation (5)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 56 | Zapier | 🟡 DEFERRED | WorkOS supports the provider, but a safe action schema is not shipped yet. |
| 57 | Make | 🟡 DEFERRED | Official API/OAuth exists; requires zone-aware action adapter. |
| 58 | n8n | 🟡 DEFERRED | API exists, but self-hosted base URL/config must be handled safely. |
| 59 | Pipedream | 🟡 DEFERRED | OAuth/API exists; action adapter deferred. |
| 60 | IFTTT | 🟡 DEFERRED | Connect API requires an IFTTT Platform service setup; not a zero-setup user connector. |

## Research (12)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 61 | Wikipedia | ✅ LIVE | MediaWiki public API. |
| 62 | arXiv | ✅ LIVE | arXiv Atom API. |
| 63 | PubMed | ✅ LIVE | NCBI E-utilities API. |
| 64 | Semantic Scholar | ✅ LIVE | Semantic Scholar Graph API. |
| 65 | OpenAlex | ✅ LIVE | OpenAlex API. |
| 66 | Crossref | ✅ LIVE | Crossref REST API. |
| 67 | Reddit | ✅ LIVE | WorkOS Pipes + Reddit OAuth API. |
| 68 | YouTube | 🟡 DEFERRED | YouTube Data API works, but Google scopes/quota/tool schema should be isolated before exposing the card. |
| 69 | Medium | ❌ REMOVE | Medium says it is not issuing new API integration tokens/new integrations. |
| 70 | DEV Community | ✅ LIVE | Forem/DEV API. |
| 71 | Hacker News | ✅ LIVE | Official Firebase API for top stories/items. |
| 72 | RSS | 🟡 DEFERRED | Standard is usable, but needs user-supplied feed URL + hardened parser rather than a fake account card. |

## Media (7)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 73 | Spotify | 🟡 DEFERRED | OAuth/Web API exists; dedicated scopes/player limitations need a proper adapter. |
| 74 | SoundCloud | ❌ REMOVE | New API app registration currently requires eligible paid/Artist Pro access; not a simple free connector. |
| 75 | Vimeo | 🟡 DEFERRED | API exists; OAuth adapter deferred. |
| 76 | Unsplash | 🟡 DEFERRED | API key/app registration required; dedicated key provider not shipped here. |
| 77 | Pexels | 🟡 DEFERRED | API key required; dedicated key provider not shipped here. |
| 78 | Pixabay | 🟡 DEFERRED | API key required; dedicated key provider not shipped here. |
| 79 | GIPHY | 🟡 DEFERRED | API key/app registration required. |

## Business (13)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 80 | Shopify | 🟡 DEFERRED | Official Admin API exists; public app/OAuth store semantics need a dedicated adapter. |
| 81 | WooCommerce | 🟡 DEFERRED | REST credentials + store URL required; dedicated store connector deferred. |
| 82 | Stripe | ✅ LIVE | WorkOS Pipes + Stripe customer API. |
| 83 | PayPal | 🟡 DEFERRED | OAuth exists, but the generic card did not define safe payment/account tools. |
| 84 | Wise | ❌ REMOVE | Personal token access is restricted; API is primarily business/platform oriented. |
| 85 | HubSpot | ✅ LIVE | WorkOS Pipes + CRM contacts API. |
| 86 | Salesforce | 🟡 DEFERRED | WorkOS supports it, but instance discovery/tool schema is deferred. |
| 87 | Zendesk | 🟡 DEFERRED | OAuth/API exists; dedicated Support/Sell tool schema required. |
| 88 | Intercom | ✅ LIVE | WorkOS Pipes + account API. |
| 89 | Mailchimp | ✅ LIVE | WorkOS Pipes + OAuth metadata + Marketing API. |
| 90 | Brevo | 🟡 DEFERRED | API key connector required. |
| 91 | Twilio | 🟡 DEFERRED | Account SID/API credentials and write-action confirmations require a dedicated connector. |
| 92 | SendGrid | 🟡 DEFERRED | API key connector + explicit send confirmation required. |

## Data (8)

| # | Plugin | Decision | Reason |
|---|---|---|---|
| 93 | OpenStreetMap | ✅ LIVE | Nominatim/OpenStreetMap search with server-side user agent. |
| 94 | Mapbox | 🟡 DEFERRED | Access token required; key provider deferred. |
| 95 | OpenWeather | 🟡 DEFERRED | API key required; key provider deferred. |
| 96 | CoinGecko | 🟡 DEFERRED | Current API tiers/keys need a dedicated market-data adapter. |
| 97 | TradingView | ❌ REMOVE | No general-purpose public TradingView account/data REST API matching the old card promise. |
| 98 | Yahoo Finance | ❌ REMOVE | No supported official public Yahoo Finance API matching the old card promise. |
| 99 | Kaggle | 🟡 DEFERRED | API credentials exist; dedicated dataset/competition adapter deferred. |
| 100 | Wolfram | 🟡 DEFERRED | API exists with usage limits; AppID/key connector deferred. |

## Higgsfield (not part of the original 100)

Higgsfield now publishes an MCP server and works with ChatGPT/Claude-style clients, but its MCP requires an active paid Higgsfield subscription and consumes credits. It is therefore **not added to the free live core** in this audit.

## Result

- Original cards audited: **100**
- Kept as live cards in this branch: **42**
- Removed/deferred/moved out of Plugins: **58**
- Every retained card has a concrete runtime path in `lib/server/plugin-runtime.ts`.
- OAuth/API credentials are vended server-side through WorkOS Pipes; provider tokens are never stored in browser localStorage.
