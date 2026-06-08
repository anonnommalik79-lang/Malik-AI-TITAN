-- MALIK AI Stage 5 production schema for PostgreSQL / Supabase
-- Apply with care. Add RLS policies before exposing public clients.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  provider text,
  model text,
  tokens int default 0,
  created_at timestamptz not null default now()
);

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  type text not null check (type in ('image','video','code','project','file')),
  prompt text not null,
  status text not null default 'queued',
  result_url text,
  provider text,
  model text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  type text not null,
  status text not null default 'queued',
  priority int not null default 0,
  input jsonb not null default '{}',
  output jsonb,
  error text,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  title text not null,
  description text,
  files jsonb not null default '[]',
  preview_url text,
  export_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  usage_date date not null default current_date,
  chat_count int not null default 0,
  image_count int not null default 0,
  video_count int not null default 0,
  project_count int not null default 0,
  token_count int not null default 0,
  unique(user_id, usage_date)
);

create table if not exists user_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  preferences jsonb not null default '{}',
  memory jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists provider_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  provider text not null,
  model text,
  task text not null,
  status text not null,
  duration_ms int,
  error_code text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_chat_created on messages(chat_id, created_at desc);
create index if not exists idx_generations_user_created on generations(user_id, created_at desc);
create index if not exists idx_jobs_status_created on jobs(status, created_at desc);
create index if not exists idx_provider_logs_created on provider_logs(created_at desc);
