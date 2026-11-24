# Security hardening rollout

- Confirm the founder account has verified its email in WorkOS before rollout.
- Set MALIK_TRUST_PROXY_IP_HEADER only to an IP header overwritten by the trusted ingress; restrict direct origin access. Without it anonymous users share a conservative bucket. This change intentionally ignores user-agent and language for quota identity.
- Shared counters use the existing durable PostgreSQL connection and encryption configuration. Without that configuration, counters remain local; configure it for production and multiple instances. The founder overview remains runtime telemetry.
- Legacy Google video download now requires a signed-in owner and a completed in-memory job. Existing cached URLs may expire when the job cache is evicted or the server restarts; regenerate through the current media pipeline. Only Google file download paths are allowed.
- Validate normal voice sign-in, code execution, public media import (IPv4 only) and video playback on staging. The remote code runner must independently enforce sandbox isolation and cross-instance concurrency.
- CSP now blocks inline event attributes. Full CSP enforcement is opt-in via MALIK_ENFORCE_FULL_CSP=1 after staging checks; existing inline/eval allowances and nonce migration are outstanding. Validate published sites and integrations.
- Run npm run test:security-hardening, npm run build, existing auth and media tests, and cross-account/parallel quota tests against staging. Source assertions are not penetration tests.
- Remaining: migrate legacy synchronous rate-limit/Compute paths and ensure atomic daily admission/reservation across all generation endpoints; validate reverse proxy trust and live provider behavior.
