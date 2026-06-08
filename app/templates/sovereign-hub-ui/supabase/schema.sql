-- MALIK AI Sovereign Hub — Supabase schema
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat sessions
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  status text not null default 'draft',
  tech_stack text[] default '{}',
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
  content text not null default '',
  provider_used text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx on public.chat_messages(session_id);

-- Uploaded files
create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  name text not null,
  mime text not null,
  size_bytes bigint not null default 0,
  storage_path text,
  public_url text,
  kind text not null default 'unknown',
  created_at timestamptz not null default now()
);

create index if not exists uploaded_files_user_id_idx on public.uploaded_files(user_id);

-- Usage events (daily counters)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('chat', 'upload', 'video', 'image')),
  count int not null default 1,
  period_date date not null default (timezone('utc', now()))::date,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, event_type, period_date)
);

create index if not exists usage_events_user_period_idx on public.usage_events(user_id, period_date);

-- Provider logs (anonymized routing)
create table if not exists public.provider_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider_id text not null,
  task_type text not null default 'chat',
  success boolean not null default false,
  fallback_used boolean not null default false,
  safe_mode boolean not null default false,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index if not exists provider_logs_created_at_idx on public.provider_logs(created_at desc);

-- RLS
alter table public.profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.usage_events enable row level security;
alter table public.provider_logs enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_upsert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "sessions_own" on public.chat_sessions for all using (auth.uid() = user_id);
create policy "messages_own" on public.chat_messages for all using (auth.uid() = user_id);
create policy "uploads_own" on public.uploaded_files for all using (auth.uid() = user_id);
create policy "usage_own" on public.usage_events for all using (auth.uid() = user_id);
create policy "provider_logs_insert_own" on public.provider_logs for insert with check (auth.uid() = user_id);
create policy "provider_logs_select_own" on public.provider_logs for select using (auth.uid() = user_id);
