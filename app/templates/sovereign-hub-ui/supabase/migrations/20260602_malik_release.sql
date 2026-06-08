create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  avatar_url text not null default '',
  plan text not null default 'free' check (plan in ('free', 'pro', 'ultra', 'owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  chat_count integer not null default 0,
  image_count integer not null default 0,
  video_count integer not null default 0,
  project_count integer not null default 0,
  tokens_used bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'ultra', 'owner')),
  status text not null default 'active' check (status in ('active', 'paused', 'expired')),
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  plan text not null check (plan in ('pro', 'ultra')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  payment_reference text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.usage_daily enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_orders enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "usage_read_own" on public.usage_daily;
create policy "usage_read_own" on public.usage_daily for select using (auth.uid() = user_id);
drop policy if exists "subscriptions_read_own" on public.subscriptions;
create policy "subscriptions_read_own" on public.subscriptions for select using (auth.uid() = user_id);
drop policy if exists "billing_orders_read_own" on public.billing_orders;
create policy "billing_orders_read_own" on public.billing_orders for select using (auth.uid() = user_id);
drop policy if exists "billing_orders_insert_own_pending" on public.billing_orders;
create policy "billing_orders_insert_own_pending" on public.billing_orders for insert with check (auth.uid() = user_id and status = 'pending');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute procedure public.handle_new_user();
