# Malik AI — production plugin setup

The live plugin engine is implemented in this app. Public-data plugins need no user account connection. Account plugins use WorkOS Pipes so provider credentials stay server-side.

## Production checklist

1. Keep `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` and `WORKOS_COOKIE_PASSWORD` configured on the server/Render environment.
2. Recommended: create a second WorkOS API key in the **same Production environment** and store it as `WORKOS_PIPES_API_KEY`. Plugin traffic will use this key, while AuthKit keeps using `WORKOS_API_KEY`. Do not use a different WorkOS environment/account for this split because WorkOS users and configuration are environment-scoped.
3. In WorkOS Dashboard -> Pipes, enable only the providers exposed by `components/sovereign/features/plugin-registry.ts`.
4. For OAuth providers, configure the provider OAuth app/client credentials and the scopes required by Malik AI's read tools.
5. For API-key providers, use the provider's Pipes API-key auth method. Malik AI sends the key directly from its same-origin server route to WorkOS; it is not stored in localStorage.
6. Test each enabled provider with a real user account before marking it production-ready in UI.

## Key separation

- `WORKOS_API_KEY` — AuthKit/session/user-management key.
- `WORKOS_PIPES_API_KEY` — optional dedicated key for Pipes/plugin traffic, created in the **same WorkOS environment**.
- If `WORKOS_PIPES_API_KEY` is absent, the plugin runtime falls back to `WORKOS_API_KEY`, so existing deployments continue to work.

Keeping both keys in the same environment preserves the same WorkOS user IDs while allowing the plugin runtime to use its own WorkOS API-key rate-limit bucket.

## Runtime flow

`/plugin <id> <request>` -> `/api/ai/chat` -> `lib/server/plugin-runtime.ts` -> public API or WorkOS Pipes credential -> official provider API.

If an account plugin is not connected, Malik AI returns the first-party `/api/plugins/connect` route. That route either starts official OAuth or shows the secure API-key connection form, depending on the WorkOS provider configuration.
