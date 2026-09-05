-- MALIK SHORTS — native low-latency Live transport v3
-- Apply after malik_shorts_platform_v2.sql.
-- Browser broadcasters upload short standalone WebM/MP4 chunks directly to R2/S3
-- through signed URLs. Viewers poll only lightweight segment metadata and play
-- the newest committed chunks sequentially, so Render never proxies media bytes.

create extension if not exists pgcrypto;

create table if not exists malik_shorts_live_segments (
  live_id uuid not null references malik_shorts_live_sessions(id) on delete cascade,
  sequence bigint not null check (sequence >= 0),
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  storage_key text not null,
  public_url text not null,
  mime_type text not null default 'video/webm',
  duration_ms integer check (duration_ms is null or duration_ms between 250 and 30000),
  bytes bigint check (bytes is null or bytes between 0 and 100000000),
  created_at timestamptz not null default now(),
  primary key (live_id, sequence)
);

create table if not exists malik_shorts_live_presence (
  live_id uuid not null references malik_shorts_live_sessions(id) on delete cascade,
  viewer_key text not null,
  user_key text references malik_shorts_profiles(user_key) on delete cascade,
  last_seen_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (live_id, viewer_key)
);

create index if not exists idx_shorts_live_segments_time
  on malik_shorts_live_segments(live_id, sequence desc);
create index if not exists idx_shorts_live_presence_seen
  on malik_shorts_live_presence(live_id, last_seen_at desc);

create or replace function malik_shorts_live_refresh_viewers(p_live_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_count bigint;
begin
  delete from malik_shorts_live_presence
  where live_id = p_live_id and last_seen_at < now() - interval '20 seconds';

  select count(*) into v_count
  from malik_shorts_live_presence
  where live_id = p_live_id;

  update malik_shorts_live_sessions
  set viewer_count = v_count,
      peak_viewers = greatest(peak_viewers, v_count)
  where id = p_live_id;

  return v_count;
end;
$$;

create or replace function malik_shorts_live_trim_segments(p_live_id uuid, p_keep integer default 120)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from malik_shorts_live_segments
  where live_id = p_live_id
    and sequence < coalesce((
      select max(sequence) - greatest(10, least(600, coalesce(p_keep,120)))
      from malik_shorts_live_segments where live_id = p_live_id
    ), -1);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on malik_shorts_live_segments from anon, authenticated;
revoke all on malik_shorts_live_presence from anon, authenticated;
revoke all on function malik_shorts_live_refresh_viewers(uuid) from public, anon, authenticated;
revoke all on function malik_shorts_live_trim_segments(uuid,integer) from public, anon, authenticated;

grant select, insert, update, delete on malik_shorts_live_segments to service_role;
grant select, insert, update, delete on malik_shorts_live_presence to service_role;
grant execute on function malik_shorts_live_refresh_viewers(uuid) to service_role;
grant execute on function malik_shorts_live_trim_segments(uuid,integer) to service_role;
