-- Malik AI Business Lead OS
-- Run once in the same PostgreSQL/Supabase project used by Malik AI.
-- Server routes use SUPABASE_SERVICE_ROLE_KEY. No public client policies are granted.

create extension if not exists pgcrypto;

create table if not exists business_leads (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  company text not null,
  contact text not null,
  niche text not null,
  website text not null default '',
  message text not null default '',
  source text not null default 'business-page',
  lang text not null default 'ru' check (lang in ('ru','kk','en')),
  status text not null default 'new' check (status in ('new','qualified','contacted','proposal','won','lost')),
  priority text not null default 'normal' check (priority in ('low','normal','high','hot')),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_leads_created_at_idx on business_leads (created_at desc);
create index if not exists business_leads_status_idx on business_leads (status);
create index if not exists business_leads_priority_idx on business_leads (priority);
create index if not exists business_leads_source_idx on business_leads (source);

alter table business_leads enable row level security;

-- Intentionally no anon/authenticated policies.
-- The Next.js server API reads and writes with SUPABASE_SERVICE_ROLE_KEY,
-- while /business/dashboard additionally requires the verified Malik owner account.
