# ULTIMATE 10 — local verification and release

Application: `app/templates/sovereign-hub-ui`. Use Node 22 and existing dependencies/lockfile. Do not install generated-project dependencies or run generated builds in the web process.

## QA on D:

Use a separate mirror preserving the repository's directory structure. Exclude `.git`, `node_modules`, `.next`, `.data`, private `.env` files. Include tracked public `.env.example` files. Do not use `/MIR` against the user's checkout. The QA mirror used here is `D:/mqa/malik-ultimate10-20261024/repo`.

From the app directory:

```powershell
npm run test:project-passports
npm run test:selfbuild
npm run test:claim-ledger
npm run test:ultimate-chat
npm run test:proof-passport
npm run test:release-core
npm run typecheck
npx next build --webpack
```

Use test-only WorkOS placeholders if needed for local static build. Passing placeholders is not an authenticated WorkOS acceptance test. Do not print real environment values.

## Runtime configuration

Keep existing WorkOS and model configuration. No new key is required for passport generation. `DATABASE_URL`/`PRIVATE_STATE_DATABASE_URL` and existing private storage determine persistence; no new database is provisioned. `WEBSITE_EXECUTOR_URL` + server-only `WEBSITE_EXECUTOR_TOKEN` refer to an existing external executor contract: configuration alone is not evidence it ran.

No manual Render deploy is performed in this task. The user's standing authorization permits pushing checked commits to main. Recheck the actual service's auto-deploy setting before publication; do not assume it matches a historical prompt or YAML file. Do not modify service plans or secrets.

Read-only service inspection on 2026-10-24: `srv-dase4v0473hc73fte6vg`, confirmed workspace `tea-d9ij383rjlhs73f2hto0`, branch main, **autoDeploy=no / trigger=off**, runtime plan free and build plan starter. These differ from assumptions in the original brief; nothing was reconfigured. Current reference: [Render deploys](https://render.com/docs/deploys).

The first local build compiled successfully but its TypeScript worker ran out of memory while a separate lint process was running. Retry sequentially; `NODE_OPTIONS=--max-old-space-size=1536 --max-semi-space-size=8` is a local QA setting, not a proposed Render runtime setting. Direct temp files to D: too. Do not suppress TypeScript errors to get a green build.
