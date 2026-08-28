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
UBER_SCOPES=profile offline_access ride_request.ride_booking ride_request.place ride_request.estimate
UBER_TOKEN_ENCRYPTION_KEY=
UBER_API_MODE=sandbox
```

`UBER_TOKEN_ENCRYPTION_KEY` should be a long random secret. Malik AI uses AES-256-GCM before any Uber credential is placed in the HttpOnly session cookie.

Uber's current Riders API migration table maps `/v1.2/requests*` to `ride_request.ride_booking`, `/v1.2/places/*` to `ride_request.place`, and product/estimate endpoints to `ride_request.estimate`. Always make `UBER_SCOPES` match the scopes actually granted to the Malik AI application in Uber's developer dashboard.

## Uber developer app

1. Create/configure an Uber developer application.
2. Register this exact redirect URL: `https://malikaiworld.world/api/taxi/uber/callback`.
3. Enable the rider permissions needed for ride booking, saved places and estimates.
4. Put the client ID and client secret into the server environment.
5. Keep `UBER_API_MODE=sandbox` while developing.
6. Connect the founder/developer Uber account through `/taxi` and test the complete flow.
7. Request Uber Full Access for the privileged ride-booking permission before opening real native booking to all Malik AI users.
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
- Airport templates based on a real geocoding/place provider.
- Favorites stored per Malik user.
- “Open trip in Uber” deep link for provider-native trip/payment details where Uber requires a handoff.
- Webhook-backed status updates after registering and verifying Uber's signed webhook endpoint.
- Optional natural-language route parser only when a rider explicitly chooses “Ask Malik”; quick templates remain zero-token.
