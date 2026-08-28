# Malik Taxi — Uber v1

Malik Taxi is a zero-LLM ride flow inside Malik AI. The normal path is template -> device geolocation -> official Uber Riders API -> live fare -> explicit one-tap confirmation -> ride lifecycle.

## What is implemented

- `/taxi` first-class Malik AI section.
- Official Uber OAuth connection. Malik AI never receives the user's Uber password.
- Encrypted HttpOnly Uber token session bound to the authenticated Malik AI WorkOS user.
- Automatic token refresh when Uber returns a refresh token.
- Uber Home / Work quick templates.
- Browser geolocation only after the rider chooses a template.
- `GET /v1.2/products` + `POST /v1.2/requests/estimate` live ride options.
- Expiring fare handling. Malik refuses stale quote tokens.
- Tamper-resistant encrypted quote token containing rider, route, product and fare ID.
- Explicit one-click confirmation with the current fare before `POST /v1.2/requests`.
- Active ride polling via `GET /v1.2/requests/{request_id}`.
- Cancellation via official Uber API.
- Sandbox by default so development cannot accidentally call a real driver or charge a rider.
- No LLM call is used for Home, Work, quote, booking, status or cancellation.

## Environment

Add these only as private server environment variables (for Render, add them in the service environment; never commit the real values):

```env
UBER_CLIENT_ID=
UBER_CLIENT_SECRET=
UBER_REDIRECT_URI=https://malikaiworld.world/api/taxi/uber/callback
UBER_SCOPES=profile request places offline_access
UBER_TOKEN_ENCRYPTION_KEY=
UBER_API_MODE=sandbox
```

`UBER_TOKEN_ENCRYPTION_KEY` should be a long random secret. Malik AI uses AES-256-GCM before any Uber credential is placed in the HttpOnly session cookie.

If Uber's developer dashboard grants a newer/migrated set of Riders API scopes, set `UBER_SCOPES` to exactly the scopes granted to the app instead of changing application code.

## Uber developer app

1. Create/configure an Uber developer application.
2. Register this exact redirect URL: `https://malikaiworld.world/api/taxi/uber/callback`.
3. Enable the rider permissions needed for profile, saved places and ride requests.
4. Put the client ID and client secret into the server environment.
5. Keep `UBER_API_MODE=sandbox` while developing.
6. Connect the founder/developer Uber account through `/taxi` and test the complete flow.
7. Request Uber Full Access for the privileged ride-request permission before opening real native booking to all Malik AI users.
8. Only after approval, set `UBER_API_MODE=production`.

## Product rule

Never silently create a paid ride. Malik first obtains the current Uber fare and renders a button containing that fare. The rider's click is the explicit confirmation.

Provider/API errors must never be represented as a successful booking. A ride is considered created only after Uber returns a real `request_id`.

## Normal zero-token flow

```text
Taxi
  -> Uber connected once through OAuth
  -> Home / Work template
  -> current device location
  -> Uber live estimate
  -> rider sees fare + ETA
  -> [Order for <current Uber fare>]
  -> Uber request_id
  -> driver / vehicle / ETA status inside Malik AI
  -> completed or cancelled
  -> close Taxi session
```

## Next safe additions

- Place search/autocomplete for arbitrary destinations without an LLM.
- Airport templates based on geocoded airport IDs.
- Favorites stored per Malik user.
- Receipts from Uber after completed trips.
- Uber map/tracking endpoint for an in-Malik live map.
- Optional natural-language route parser only when a rider explicitly chooses “Ask Malik”; quick templates remain zero-token.
