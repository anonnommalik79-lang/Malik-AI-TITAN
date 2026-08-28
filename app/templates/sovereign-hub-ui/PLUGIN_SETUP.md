# Malik AI — production plugin setup

The live plugin engine is implemented in this app. Public-data plugins need no user account connection. Account plugins use WorkOS Pipes so provider credentials stay server-side.

## Production checklist

1. Keep `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` and `WORKOS_COOKIE_PASSWORD` configured on the server/Render environment.
2. In WorkOS Dashboard -> Pipes, enable only the providers exposed by `components/sovereign/features/plugin-registry.ts`.
3. For OAuth providers, configure the provider OAuth app/client credentials and the scopes required by Malik AI's read tools.
4. For API-key providers, use the provider's Pipes API-key auth method. Malik AI sends the key directly from its same-origin server route to WorkOS; it is not stored in localStorage.
5. Test each enabled provider with a real user account before marking it production-ready in UI.

## Runtime flow

`/plugin <id> <request>` -> `/api/ai/chat` -> `lib/server/plugin-runtime.ts` -> public API or WorkOS Pipes credential -> official provider API.

If an account plugin is not connected, Malik AI returns the first-party `/api/plugins/connect` route. That route either starts official OAuth or shows the secure API-key connection form, depending on the WorkOS provider configuration.
