-- YouTube connected client. Run with the Supabase migration/admin role.
-- Browser roles have NO access; WorkOS ownership is enforced by server routes.
begin;
create table if not exists public.youtube_connections (
  workos_user_id text primary key,
  access_encrypted text not null,
  refresh_encrypted text not null,
  expires_at timestamptz not null,
  scopes text[] not null,
  channels jsonb not null default '[]',
  channel_id text,
  saved_playlist_id text,
  saved_playlist_checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.youtube_connections add column if not exists saved_playlist_checked boolean not null default false;
create table if not exists public.youtube_oauth_states (
  state_hash text primary key,
  workos_user_id text not null,
  verifier_encrypted text not null,
  return_path text not null,
  expires_at timestamptz not null
);
create table if not exists public.youtube_operation_locks (
  workos_user_id text not null,
  operation text not null,
  lease text not null,
  expires_at timestamptz not null,
  primary key(workos_user_id, operation)
);
create table if not exists public.shorts_history (
  workos_user_id text not null references public.youtube_connections(workos_user_id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id text not null,
  watched_at timestamptz not null default now(),
  progress_seconds numeric not null check (progress_seconds >= 0),
  duration_seconds numeric not null check (duration_seconds >= 0),
  completed boolean not null default false,
  primary key(workos_user_id, video_id)
);
create index if not exists shorts_history_recent on public.shorts_history(workos_user_id, watched_at desc);
create or replace function public.youtube_acquire_lock(p_user text, p_operation text, p_lease text)
returns boolean language plpgsql security definer set search_path = public as $$
declare acquired integer;
begin
  insert into youtube_operation_locks values(p_user,p_operation,p_lease,now()+interval '3 minutes')
  on conflict(workos_user_id,operation) do update set lease=excluded.lease, expires_at=excluded.expires_at
  where youtube_operation_locks.expires_at < now();
  get diagnostics acquired = row_count;
  return acquired = 1;
end $$;
create or replace function public.youtube_release_lock(p_user text, p_operation text, p_lease text)
returns void language sql security definer set search_path = public as $$
  delete from youtube_operation_locks where workos_user_id=p_user and operation=p_operation and lease=p_lease;
$$;
alter table public.youtube_connections enable row level security;
alter table public.youtube_oauth_states enable row level security;
alter table public.youtube_operation_locks enable row level security;
alter table public.shorts_history enable row level security;
revoke all on public.youtube_connections, public.youtube_oauth_states, public.youtube_operation_locks, public.shorts_history from public, anon, authenticated;
grant all on public.youtube_connections, public.youtube_oauth_states, public.youtube_operation_locks, public.shorts_history to service_role;
revoke all on function public.youtube_acquire_lock(text,text,text), public.youtube_release_lock(text,text,text) from public, anon, authenticated;
grant execute on function public.youtube_acquire_lock(text,text,text), public.youtube_release_lock(text,text,text) to service_role;

create table if not exists public.youtube_request_budgets (
  key text primary key, window_at bigint not null, requests integer not null, expires_at timestamptz not null
);
alter table public.youtube_request_budgets enable row level security;
revoke all on public.youtube_request_budgets from public, anon, authenticated;
grant all on public.youtube_request_budgets to service_role;
create or replace function public.youtube_take_budget(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare bucket bigint; used integer;
begin
  if p_limit < 1 or p_seconds not in (60,86400) then return false; end if;
  bucket := floor(extract(epoch from now()) / p_seconds);
  insert into youtube_request_budgets values(p_key,bucket,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set window_at=excluded.window_at,
    requests=case when youtube_request_budgets.window_at=excluded.window_at then youtube_request_budgets.requests+1 else 1 end,
    expires_at=excluded.expires_at
  returning requests into used;
  return used <= p_limit;
end $$;
create or replace function public.youtube_cleanup_data()
returns void language sql security definer set search_path = public as $$
  delete from shorts_history where watched_at < now()-interval '30 days';
  delete from youtube_oauth_states where expires_at < now();
  delete from youtube_operation_locks where expires_at < now();
  delete from youtube_request_budgets where expires_at < now();
$$;
create or replace function public.youtube_delete_connection(p_user text)
returns void language sql security definer set search_path = public as $$
  delete from youtube_connections where workos_user_id=p_user;
  delete from youtube_oauth_states where workos_user_id=p_user;
  delete from youtube_operation_locks where workos_user_id=p_user;
  delete from youtube_request_budgets where left(key,length(p_user)+1)=p_user||':';
$$;
revoke all on function public.youtube_delete_connection(text) from public, anon, authenticated;
grant execute on function public.youtube_delete_connection(text) to service_role;
revoke all on function public.youtube_take_budget(text,integer,integer), public.youtube_cleanup_data() from public, anon, authenticated;
grant execute on function public.youtube_take_budget(text,integer,integer), public.youtube_cleanup_data() to service_role;
commit;
