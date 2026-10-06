# Malik digital browser

The chat and Work interfaces show actual browser receipts and JPEG snapshots. A launch button authorizes the task. Every fill and non-navigation click pauses with the current page, exact target, value and current form fields. An approval ID is consumed once; polling cannot repeat an action. Page changes invalidate the approval. Session ownership is verified by the authenticated app and by the worker. Passwords, OTPs, CAPTCHAs and financial/login walls stop the agent for user participation. This version does not provide a remote interactive login handoff or connected Gmail sending; it operates the browser's observed public pages and forms.

## Deploy

Create a **separate** service using this directory's Render blueprint (Blueprint path `services/computer-runner/render.yaml`). It is intentionally not added to the website's root blueprint, so pushing does not silently create another service.

1. Generate a private random token of at least 32 characters. Set the same `MALIK_COMPUTER_USE_TOKEN` on the website and this worker. Never send it to clients.
2. On the worker, set `MALIK_COMPUTER_PLANNER_URL=https://malikaiworld.world/api/ai/computer/planner`. Planning uses Malik's configured model router; no new model key is needed.
3. On the website, set `MALIK_COMPUTER_USE_URL=https://<worker-host>/v1/tasks`.
4. Chromium launches as `pwuser` with its sandbox enabled. Its HTTPS CONNECT proxy pins validated public DNS addresses, denying private/metadata destinations and DNS rebinding. If the host cannot support Chromium's sandbox, use a trusted isolated remote browser via secret `MALIK_BROWSER_CDP_URL` and set `MALIK_BROWSER_EGRESS_ISOLATED=true` only after verifying that provider's egress denies private/metadata networks. Do not disable the sandbox to work around host limitations. A compatible CDP service may have separate costs; none is provisioned here.
5. Redeploy both services. Log into Malik AI and send a task such as “Открой https://example.com и покажи заголовок”. Select “Запустить задачу в браузере”. Check the actual screenshot and receipt before trying a form.

The worker permits one session by default, 30 actions per task, 20-minute expiry and bounded screenshots. Browser processes and sessions stay outside the website's memory. Sessions expire on worker restart; the UI reports missing sessions without automatic replay. Screenshots and browser authentication data are not persisted to chat history. The worker has no arbitrary evaluate, shell, upload, download or cookie tools exposed to the model.

Run `npm ci`, `npm test`. The Docker image and Playwright dependency are pinned to the same version. Deploying requires a selected hosting workspace and configured secrets; until then the interface explicitly reports that no browser action has been executed.
