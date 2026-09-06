# Malik Shorts — YouTube connected client

Implementation and verification: 2026-09-07.

## Release status — read before deploying

The repository now contains the connected client, not just API stubs. **Production activation is not verified.** No Google/YouTube credentials or real WorkOS session were available in this checkout. The SQL migration has not been applied to the production database. Automated tests use explicitly isolated fixtures, not a real user's YouTube account. Do not describe those tests as successful live YouTube mutations.

Do not roll this change into production until the migration and OAuth configuration below are installed. Without them, Shorts intentionally stops at authentication/connection/configuration states rather than showing fake content.

## What was broken

- The previous Shorts component mixed Malik-local, TikTok and YouTube sources. YouTube interactions were sent to UUID-based Malik Supabase RPCs, not the YouTube account.
- Local counters could be displayed instead of YouTube statistics. The existing API key only supported public discovery; it could not authorize user writes.
- There was no separate Google OAuth connection bound to the WorkOS identity.
- Several library/navigation actions were notification-only. Search filtered the currently loaded list rather than searching YouTube.
- Playback had no authoritative IFrame API lifecycle for visibility, pause, cleanup and sound state.
- The requested `ShortsUXFixes.tsx`, `ShortsAutoSync.tsx` and `shorts-final.css` were absent from this checkout. No new force-play observers were added. Existing global video-generation observers target that studio, not the new YouTube player.

## Implemented behavior

| Feature | Source of truth / operation |
| --- | --- |
| Malik login | Existing WorkOS AuthKit; safe Shorts return URL |
| YouTube connection | Server authorization-code OAuth + PKCE + one-use state |
| Current channel | Authenticated `channels.list(mine=true)` |
| Discovery | Official public `search.list`; batched `videos.list` / `channels.list` |
| Like / unlike | `videos.rate(like/none)` + `getRating` and statistics reconciliation |
| Comments | `commentThreads.list` / `insert`, actual returned resource ID |
| Replies | Paginated `comments.list(parentId)` / `comments.insert` |
| Own edit/delete | Ownership check against authorized channel, then `comments.update/delete` |
| Subscription | `subscriptions.list/insert/delete`, duplicate-operation lock and reconciliation |
| Saved | Private YouTube playlist `Malik Shorts Saved`; playlist item insertion/deletion |
| Author profile | Real channel metadata and paginated uploads playlist, internal route |
| Library | Actual liked videos, saved playlist, subscriptions and own uploads |
| Following | Five subscribed channels per explicit page, three recent uploads per channel |
| History | WorkOS-owned server records; progress, resume, clear one/all; explicitly Malik history |
| Share | Native share or clipboard with `/shorts/youtube/<videoId>`; canonical YouTube URL kept separately |
| Playback | One official YouTube IFrame API controller for the visible video; native controls only |

Previous playback is paused/destroyed on switching. Hidden-document playback pauses. Pause is never undone by a timer/observer. Sound preference is remembered for the current browser session, not reset on each clip. Autoplay failure asks the user to press native Play. Opening comments pauses without replacing the player. The UI does not cover native controls.

The root uses the existing `data-preserve-brand-color` opt-out so the legacy global `NoBlueUiGuard` does not rewrite React-owned Shorts styles during hydration. Other sections keep their existing guard behavior.

The former local comments/interactions routes reject YouTube posts after looking up the authoritative post source in the database; a caller cannot bypass this by sending `source=malik`. Legacy non-YouTube storage is retained, not deleted.

Unsupported controls were removed from this connected UI: fake Live, notifications, reposts, uploads without a real upload workflow. Comment likes are read-only; returned `viewerRating` is displayed when available. There is no private API, cookie scraping or browser-automated YouTube action.

## Files

Paths below are relative to `app/templates/sovereign-hub-ui/`, except database/docs paths.

- `lib/youtube/{contracts,security,errors,store,client,resources,http,quota}.ts`: typed API services, tokens, storage, API errors and quota controls.
- `app/api/youtube/connect/route.ts`, `callback/route.ts`, `[...path]/route.ts`: OAuth and connected API routes.
- `app/api/shorts/history/route.ts`: server history.
- `components/sovereign/shorts/YouTubeShortsApp.tsx`: actual connected UI. `MalikShortsApp.tsx` is now its compatibility export, not a second player.
- `YouTubePlayer.tsx`, `YouTubeActions.tsx`, `YouTubeComments.tsx`, `YouTubeAccountMenu.tsx`, `youtube-api.ts`: focused client components.
- `MalikShortsApp.module.css`: scoped black desktop/mobile styles.
- `app/shorts/ShortsPage.tsx` and pages under `youtube/`, `channel/`, `library/`, `history/`, `privacy/`: routes, authentication gate and data disclosures.
- `app/sign-in/route.ts`: preserve safe Shorts return paths without changing normal dashboard sign-in.
- `lib/shorts/legacy-source.ts`, old `api/shorts/comments` and `interactions`: prevent local writes pretending to be YouTube writes.
- `.env.shorts.example`: variable names only, no secrets.
- `scripts/verify-youtube.mjs`, test loader/resolver, `verify-youtube-ui.mjs`: isolated tests.
- `app/visual-test/shorts/page.tsx`: dev-only UI test host; returns 404 in production even if the test flag is set. It does not bypass API authorization.
- `database/youtube_connected_client.sql`: migration.

Three small pre-existing Next 16 build blockers were also repaired: Promise-only dynamic route parameter types in `api/generate/[kind]` and `api/media/asset/[id]`, and removal of a non-route helper export in `api/generate/route.ts`. Their runtime logic and other section layouts were not changed. Optional `MALIK_BUILD_NO_CACHE=1` disables only Webpack's cache for disk-constrained local build verification.

## Database installation

Apply **`database/youtube_connected_client.sql`** in the production Supabase SQL editor with the migration/admin role. It is transactional and additive; no old Shorts content is dropped.

Tables: `youtube_connections`, `youtube_oauth_states`, `youtube_operation_locks`, `youtube_request_budgets`, `shorts_history`. Browser roles have no access; RLS is enabled and only server service-role calls can access them. Every server route derives ownership from the WorkOS session, never a submitted user ID.

Functions: `youtube_acquire_lock`, `youtube_release_lock`, `youtube_take_budget`, `youtube_cleanup_data`, `youtube_delete_connection`. Public/anon/authenticated execution is revoked. Disconnect revokes the Google grant and transactionally deletes the connection, history, OAuth state, locks and budgets belonging to that user.

Arrange a daily database maintenance invocation of `select public.youtube_cleanup_data();` using the deployment's existing scheduler. **This schedule has not been installed by this change.** It removes expired OAuth state, locks/budgets and history older than 30 days. History reads additionally remove the requesting user's old history. Do not expose maintenance functions publicly.

## Render environment variables

Configure the existing Next.js service in Render → Environment. Keep all unrelated existing variables. Do not paste secrets into browser JavaScript, screenshots, commits or this report.

```dotenv
YOUTUBE_API_KEY=<server-side YouTube Data API key>
GOOGLE_YOUTUBE_CLIENT_ID=<Google OAuth web client ID>
GOOGLE_YOUTUBE_CLIENT_SECRET=<Google OAuth web client secret>
GOOGLE_YOUTUBE_REDIRECT_URI=https://malikaiworld.world/api/youtube/callback
YOUTUBE_TOKEN_ENCRYPTION_KEY=<32 random bytes as base64, or 64 hex characters>
SUPABASE_URL=<existing Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<existing server-only service key>
```

Existing WorkOS configuration remains required: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD` and the existing WorkOS redirect/public-origin settings. YouTube OAuth is not a replacement for WorkOS login. `GOOGLE_YOUTUBE_API_KEY` remains a supported discovery-key alias, but prefer `YOUTUBE_API_KEY`.

Store the encryption key securely and keep it stable across releases/instances. Rotating it without migrating ciphertext requires users to reconnect. Google client secret and Supabase service key are never sent to the browser.

The Render environment skill informed these instructions: do not replace a service's entire environment collection, and do not expect newly added `sync: false` Blueprint entries to populate secrets on an already-existing service. No Render environment values were changed here.

## Google Cloud setup

1. Enable **YouTube Data API v3** in the project.
2. Create/configure a **Web application** OAuth client, configure the consent screen and authorized domain `malikaiworld.world`.
3. Add this exact authorized redirect URI:

   `https://malikaiworld.world/api/youtube/callback`

4. Local testing uses a separate matching configuration/allowed URI:

   `http://127.0.0.1:3000/api/youtube/callback`

   Do not leave the production redirect URI in local env when testing local mutations: the server checks the mutation Origin against the configured OAuth origin.

5. Scope: **`https://www.googleapis.com/auth/youtube.force-ssl`**. This single documented grant covers the implemented operations. Do not add unrelated Google scopes.
6. In OAuth testing mode add the intended test account. Complete Google's applicable consent verification before making the integration generally available. Publish/review the application's data policy; `/shorts/privacy` describes this integration.

For a Brand account, select the intended YouTube identity in Google's authorization flow. If the token returns multiple identities, the client requires reconnect/selection in Google instead of silently guessing which author will perform writes. A local dropdown cannot change the identity represented by Google's access token.

## Security, consistency and quota notes

- AES-256-GCM with random IV and owner-bound authenticated data; encrypted access/refresh tokens and PKCE verifier.
- HttpOnly SameSite=Lax state cookie; hashed, expiring, one-use server state tied to WorkOS; constrained return paths.
- Mutation Origin/content-type validation and streamed 16 KB body limit.
- Access-token expiry refresh, single-flight in-process refresh, database lease for multiple instances, one retry after an upstream 401. Revoked scope/token returns reconnect, not an infinite retry.
- Shared atomic per-user budgets: 180 reads/minute, 30 mutations/minute, six searches/minute and 30 searches/day, five connection attempts/minute. Google project quota still applies; these limits do not guarantee unlimited throughput.
- Public discovery cache: five minutes. OAuth-authorized response bodies are not cached across users. Hydration is batched; pagination/search is explicit, not on every render/scroll.
- Mutation controls have pending state. Likes/subscriptions/saves roll back on rejected writes. A successful mutation is not falsely reported failed merely because subsequent reconciliation failed.
- Network interruption during a comment POST can leave the outcome uncertain. There is no automatic retry of such a POST; the UI preserves the draft and asks the user to check before repeating. Exactly-once delivery across an ambiguous upstream network failure is not claimed.
- Saved playlist creation is serialized; the client can rediscover an existing named playlist after a successful upstream creation followed by a database failure. Discovery is bounded.
- Following pages are groups of subscribed channels, **not** a complete globally chronological feed. Search short-duration filtering is not an official classification of every result as a YouTube Short.

## Verification

- `npm run test:youtube`: **32 passing server/service tests**, using intercepted Google/Supabase responses. Includes encryption/state, ownership/CSRF, refresh and revocation, like rollback/reconciliation, comments/replies/ownership, unsubscribe, private playlist, budgets, history and OAuth callback.
- Browser contract tests: **1440×1000, 390×844 and 320×568 passed** with the real React components and explicit intercepted test fixtures. Checked like rejection rollback, save, subscription, comments, Escape/focus behavior, pause/mute preservation, switching to one player and horizontal overflow.
- `npx tsc --noEmit --incremental false`: passed after compatibility fixes.
- Scoped lint for new YouTube implementation: no errors; five React effect warnings remain. Full-project lint was run and found **28 errors** in the pre-existing wider project, including old scripts/routes. Full-project lint is not green.
- Production build through Webpack: **passed**, including TypeScript, 83 static pages and route/build tracing. The default Turbopack build could not resolve this worktree's external `node_modules` junction. The first Webpack retry also hit local disk exhaustion; only this worktree's rebuildable `.next/cache` was cleared, then the build was verified with caching disabled. No user media/source files were deleted.
- Production-server smoke check: `/shorts` and a valid video deep link redirect an anonymous user to WorkOS sign-in; `/api/youtube/me` returns 401; `/visual-test/shorts` returns 404.

Repeat locally with Node 22.13+ (verification here used the installed Node 24 runtime):

```powershell
npm run test:youtube
npx tsc --noEmit --incremental false
$env:MALIK_BUILD_NO_CACHE='1'
npm run build -- --webpack
```

Browser tests require a local Playwright package (or `PLAYWRIGHT_MODULE` pointing to it), Microsoft Edge or `PLAYWRIGHT_CHANNEL`, and a dev server started with `MALIK_SHORTS_TEST_UI=1`. Run `node scripts/verify-youtube-ui.mjs`. All fixtures and auth stubs are confined to test scripts; they are not used by production APIs.

## Mandatory real-account acceptance before release

Not yet performed: production migration execution, real Google consent, real-account like/unlike checked on youtube.com after reload, comment/reply publication and deletion, subscription changes, private playlist contents, token revocation in Google, real iframe playback/autoplay/fullscreen on physical Safari/Android devices. These require configured credentials and the user's authorized test account. A passing fixture test does not prove those external conditions.

Use a designated test video/channel and verify each supported operation against the same YouTube account. Do not publish test comments to unrelated creators merely to demonstrate success. Check direct links through WorkOS login, history resume/clear, no-channel/Brand account handling, removed videos and comments-disabled states. Verify that `/visual-test/shorts` is unavailable in the production deployment.

## Official references

- [Google server-side OAuth flow](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [Video rating](https://developers.google.com/youtube/v3/docs/videos/rate)
- [Comments API methods](https://developers.google.com/youtube/v3/docs/comments)
- [Subscriptions insert](https://developers.google.com/youtube/v3/docs/subscriptions/insert)
- [Playlist item insert](https://developers.google.com/youtube/v3/docs/playlistItems/insert)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube API developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [Next.js route caching semantics](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config): the shared API handler relies on request-time authentication rather than `force-dynamic`, so explicit public-search caching is not overridden; all OAuth fetches and responses explicitly remain no-store.

No supported comment-like write endpoint, ordinary repost endpoint, personalized Home/Shorts recommendation endpoint or Watch History write endpoint is asserted by this implementation. Save targets an ordinary private playlist, not the special Watch Later playlist.
