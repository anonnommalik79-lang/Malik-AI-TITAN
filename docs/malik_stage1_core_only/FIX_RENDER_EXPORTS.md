# Fix Render missing exports

Render failed because these imports exist:

- `MALIK_COPY`
- `launchReadiness`

but `app/templates/sovereign-hub-ui/lib/malik-intelligence/index.ts` did not export them.

This patch adds:

- `compatibility.ts`
- `export * from "./compatibility"` in `index.ts`

No dashboard/sidebar rewrite.
No active API routes.
No secret values.
