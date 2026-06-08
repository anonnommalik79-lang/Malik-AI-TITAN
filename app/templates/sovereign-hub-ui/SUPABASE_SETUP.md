# Supabase Setup for MALIK AI Sovereign Hub

## 1. Create project

1. Go to [supabase.com](https://supabase.com) → New project
2. Copy **Project URL** and **anon public** key
3. Copy **service_role** key (server only — never expose to browser)

## 2. Apply schema

Open SQL Editor and run `supabase/schema.sql`.

This creates:

- `profiles` — user display name, avatar, plan
- `chat_sessions` — conversation metadata
- `chat_messages` — message history
- `uploaded_files` — file upload registry
- `usage_events` — daily usage counters
- `provider_logs` — anonymized provider routing logs

## 3. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 4. OAuth providers (optional)

In Supabase → Authentication → Providers, enable GitHub/Google/Apple/Discord.

Set redirect URL: `https://your-domain.com/auth/callback`

Enable in app env:

```env
NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH=true
NEXT_PUBLIC_ENABLE_GITHUB_OAUTH=true
NEXT_PUBLIC_ENABLE_APPLE_OAUTH=true
NEXT_PUBLIC_ENABLE_DISCORD_OAUTH=true
```

## 5. Row Level Security

The schema enables RLS. Users can only read/write their own rows. Service role bypasses RLS for admin routes.

## 6. Guest mode (no Supabase)

If Supabase env vars are missing:

- `GET /api/health/auth` returns `guestModeActive: true`
- Auth screen shows disabled OAuth + working guest button
- Chat/limits use in-memory guest tier

## 7. Verify

```bash
curl https://your-app.com/api/health/auth
```

Expected when configured:

```json
{ "ok": true, "supabase": "configured", "guestModeActive": false, "oauthProviders": [...] }
```
