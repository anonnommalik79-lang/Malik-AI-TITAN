# Optional DeepSeek / DSH free-model gateway for MalikLLM MAX

Status: **OFF by default. Not a source of unlimited production tokens.**

This integration makes MalikLLM MAX capable of talking to an independently deployed, OpenAI-compatible gateway (including the local forwarder built into [dsh-our-free-model](https://github.com/Ebony-Vinyl/dsh-our-free-model)). It does **not** install or run the DSH plugin inside Next.js and does **not** bypass provider quotas.

## What is and is not verified

- DSH plugin advertises a local OpenAI-compatible endpoint and generated gateway key. Review the upstream repository before installing or operating its code.
- A model shown in the DSH catalogue may be unavailable by region, upstream policy or changed model ID. **Do not infer** DeepSeek V4.1 Flash availability from the model name or plugin advertising alone.
- Kilo's documented anonymous free pool is limited to **200 requests/hour/IP** across free models; it is not a daily token allowance. Kilo's Auto Free may process prompts through providers which log content for improvement. Do not send sensitive user data to such a route without a suitable privacy/consent arrangement.
- OpenCode Zen paid APIs are distinct from any keyless plugin lane. Verify that production multi-user proxying is permitted by each upstream's current terms before using this integration in a public app.

Official documentation: https://kilo.ai/docs/gateway/authentication and https://kilo.ai/docs/gateway/usage-and-billing and https://kilo.ai/docs/gateway/models-and-providers

## Setup (testing / approved provider use only)

1. Run the DSH plugin in an **isolated** environment following its upstream installation and security instructions. Enable the plugin's own local OpenAI forward gateway. Note its generated gateway key. Do not give this key to browser JavaScript.
2. Fetch the model catalogue from that bridge using its documented `GET /v1/models` endpoint. Use the **exact model id returned** for the model you intend to test. If DeepSeek V4.1 Flash is absent, do not claim or silently substitute it.
3. For local development, `MALIK_DSH_GATEWAY_BASE_URL` may be `http://127.0.0.1:<bridge-port>/v1`. For a deployed Malik AI server, an externally reachable **HTTPS** endpoint is required; `localhost` on Render is not your personal laptop. Secure the gateway itself (network restrictions, token rotation, TLS). Do not publish its admin interface.
4. Set **server-side** environment variables below, then opt in using the enable flag. No existing user or model choices need to change. Secret values must be configured in the host secret manager, not committed to Git.

```dotenv
MALIK_DSH_GATEWAY_ENABLED=false
MALIK_DSH_GATEWAY_BASE_URL=https://YOUR-APPROVED-GATEWAY.example/v1
MALIK_DSH_GATEWAY_API_KEY=YOUR_GENERATED_GATEWAY_KEY
MALIK_DSH_GATEWAY_MODEL=EXACT_ID_FROM_GET_V1_MODELS
```

Change `MALIK_DSH_GATEWAY_ENABLED` to `true` **only after** upstream permissions, security/privacy practices, model identity and quotas are confirmed. Missing values or an insecure remote HTTP URL mean the lane is not added. The bridge is text-only by default until vision support is independently verified.

## Verify without touching production

Run `npm run test:max` from `app/templates/sovereign-hub-ui`. The test suite mocks traffic to validate disabled-by-default behavior, correct model, secure URL checks and OpenAI-compatible streamed requests. It does **not** demonstrate free access or production quota.

When an approved gateway is online and enabled, owner-only `GET /api/ai/max/status` shows a `dsh-free-gateway` lane. Owner-only `POST /api/ai/max/status` performs a live one-word probe (it consumes an actual upstream request and counts against its quota). The normal MalikLLM MAX routing retains cooldown and fallback handling on failures.

## Production readiness criteria

- Written provider permission for a multi-user app (or verified provider terms permitting it).
- Explicit user-facing data handling / privacy disclosure where necessary.
- Live proof of the exact DeepSeek model ID through `/v1/models` and a successful response.
- Repeated measurement of usage, requests/hour, 429s and actual tokens. Never promise a fixed free daily token budget without account-level reporting.
- Separate managed HTTPS gateway with authentication, access control, egress restrictions and spending/quota controls.
