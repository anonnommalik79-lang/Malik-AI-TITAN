-- MALIK AI Sovereign Hub — core tables for Level 1 MVP
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- User profiles (extends auth.users)
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'ultra', 'owner')),
  preferred_language text default 'ru' check (preferred_language in ('ru', 'kz', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat sessions
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_id_idx on public.chat_sessions(user_id);

-- Chat messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  provider_used text,
  model_used text,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx on public.chat_messages(session_id);

-- Daily usage events (durable limits on Render)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  event_type text not null check (event_type in ('chat', 'image', 'video', 'upload')),
  tokens_used int default 0,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_email_idx on public.usage_events(user_email);
create index if not exists usage_events_created_at_idx on public.usage_events(created_at);

-- Uploaded files metadata
create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  name text not null,
  mime text,
  size_bytes bigint default 0,
  storage_path text,
  public_url text,
  kind text default 'file',
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table public.user_profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.uploaded_files enable row level security;

-- Users read/write own data
create policy "users_own_profile" on public.user_profiles
  for all using (auth.uid() = id);

create policy "users_own_sessions" on public.chat_sessions
  for all using (auth.uid() = user_id);

create policy "users_own_messages" on public.chat_messages
  for all using (auth.uid() = user_id);

create policy "users_own_files" on public.uploaded_files
  for all using (auth.uid() = user_id);

-- Service role bypasses RLS for server routes (supabase-admin client)
