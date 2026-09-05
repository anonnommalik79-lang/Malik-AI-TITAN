-- MALIK SHORTS PLATFORM V2 — SCALE LAYER
-- Additive schema for media processing, provenance/rights, AI creator workflows,
-- commerce, collaborations, moderation and analytics rollups.
-- Apply after malik_shorts_platform_v2.sql.

create extension if not exists pgcrypto;

create table if not exists malik_shorts_media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_key text references malik_shorts_profiles(user_key) on delete set null,
  post_id uuid references malik_shorts_posts(id) on delete set null,
  kind text not null check (kind in ('video','image','audio','caption','thumbnail')),
  storage_key text,
  source_url text,
  mime_type text,
  bytes bigint check (bytes is null or bytes >= 0),
  width integer,
  height integer,
  duration_ms integer,
  sha256 text,
  status text not null default 'uploaded' check (status in ('uploaded','scanning','processing','ready','failed','quarantined','deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_media_renditions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references malik_shorts_media_assets(id) on delete cascade,
  kind text not null check (kind in ('hls_master','hls_variant','dash','mp4','poster','thumbnail','audio')),
  storage_key text,
  public_url text,
  codec text,
  container text,
  width integer,
  height integer,
  bitrate_kbps integer,
  fps real,
  bytes bigint,
  status text not null default 'processing' check (status in ('processing','ready','failed','deleted')),
  created_at timestamptz not null default now(),
  unique (asset_id, kind, width, height, bitrate_kbps)
);

create table if not exists malik_shorts_media_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references malik_shorts_media_assets(id) on delete cascade,
  job_type text not null check (job_type in ('virus_scan','probe','transcode_hls','thumbnail','caption','moderation','embedding','cleanup')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_rights_provenance (
  post_id uuid primary key references malik_shorts_posts(id) on delete cascade,
  source_provider text not null check (source_provider in ('malik','youtube','tiktok','instagram','other')),
  canonical_url text,
  provider_owner_id text,
  provider_owner_name text,
  ingestion_method text not null check (ingestion_method in ('native_upload','official_api','official_embed','creator_import','licensed_import','other')),
  rights_basis text not null default 'unknown' check (rights_basis in ('creator_owned','licensed','official_embed','platform_permission','unknown','blocked')),
  attribution_required boolean not null default false,
  download_allowed boolean not null default false,
  remix_allowed boolean not null default false,
  commercial_use_allowed boolean not null default false,
  license_reference text,
  takedown_status text not null default 'clear' check (takedown_status in ('clear','claimed','restricted','blocked','removed')),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_captions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  language text not null,
  kind text not null default 'caption' check (kind in ('caption','translation','dub_script')),
  source text not null default 'ai' check (source in ('creator','ai','provider','moderator')),
  body text not null default '',
  segments jsonb not null default '[]'::jsonb,
  status text not null default 'ready' check (status in ('draft','processing','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, language, kind)
);

create table if not exists malik_shorts_dubs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  language text not null,
  voice_key text,
  audio_asset_id uuid references malik_shorts_media_assets(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (post_id, language)
);

create table if not exists malik_shorts_drafts (
  id uuid primary key default gen_random_uuid(),
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  asset_id uuid references malik_shorts_media_assets(id) on delete set null,
  caption text not null default '',
  hashtags text[] not null default '{}',
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  scheduled_for timestamptz,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','published','failed','cancelled')),
  published_post_id uuid references malik_shorts_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_creator_agents (
  id uuid primary key default gen_random_uuid(),
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  name text not null,
  enabled boolean not null default false,
  instructions text not null default '',
  languages text[] not null default '{ru,kk,en}',
  cadence text,
  source_policy jsonb not null default '{}'::jsonb,
  publish_policy text not null default 'draft_only' check (publish_policy in ('draft_only','approval_required','auto_publish')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_creator_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references malik_shorts_creator_agents(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','waiting_approval','succeeded','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  draft_id uuid references malik_shorts_drafts(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists malik_shorts_collaborations (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  collaborator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  post_id uuid references malik_shorts_posts(id) on delete cascade,
  draft_id uuid references malik_shorts_drafts(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('collaborator','editor','guest','cohost')),
  status text not null default 'invited' check (status in ('invited','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (owner_key <> collaborator_key)
);

create table if not exists malik_shorts_products (
  id uuid primary key default gen_random_uuid(),
  seller_key text references malik_shorts_profiles(user_key) on delete set null,
  external_provider text,
  external_product_id text,
  title text not null,
  description text not null default '',
  currency text not null default 'KZT',
  price_minor bigint check (price_minor is null or price_minor >= 0),
  image_url text,
  destination_url text,
  status text not null default 'active' check (status in ('draft','active','paused','removed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_product_tags (
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  product_id uuid not null references malik_shorts_products(id) on delete cascade,
  start_ms integer,
  end_ms integer,
  label text,
  created_at timestamptz not null default now(),
  primary key (post_id, product_id)
);

create table if not exists malik_shorts_affiliate_events (
  id bigint generated always as identity primary key,
  user_key text,
  creator_key text,
  post_id uuid references malik_shorts_posts(id) on delete set null,
  product_id uuid references malik_shorts_products(id) on delete set null,
  event_type text not null check (event_type in ('impression','click','checkout','conversion','refund')),
  value_minor bigint,
  currency text,
  reference_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_moderation_cases (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references malik_shorts_posts(id) on delete cascade,
  comment_id uuid references malik_shorts_comments(id) on delete cascade,
  profile_key text references malik_shorts_profiles(user_key) on delete cascade,
  source text not null default 'automated' check (source in ('automated','report','copyright','moderator','provider')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  labels jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','reviewing','actioned','cleared','appealed','closed')),
  assigned_to text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_strikes (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  case_id uuid references malik_shorts_moderation_cases(id) on delete set null,
  reason text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_appeals (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  case_id uuid references malik_shorts_moderation_cases(id) on delete cascade,
  strike_id uuid references malik_shorts_strikes(id) on delete cascade,
  body text not null,
  status text not null default 'open' check (status in ('open','reviewing','accepted','rejected')),
  response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists malik_shorts_device_risk (
  user_key text,
  device_key text not null,
  risk_score real not null default 0 check (risk_score between 0 and 1),
  signals jsonb not null default '{}'::jsonb,
  last_ip_hash text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (device_key)
);

create table if not exists malik_shorts_daily_creator_metrics (
  day date not null,
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  views bigint not null default 0,
  unique_viewers bigint not null default 0,
  watch_ms bigint not null default 0,
  completes bigint not null default 0,
  rewatches bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  saves bigint not null default 0,
  shares bigint not null default 0,
  follows_gained bigint not null default 0,
  profile_views bigint not null default 0,
  revenue_credits bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, creator_key)
);

create index if not exists idx_shorts_media_jobs_queue on malik_shorts_media_jobs(status, priority, run_after);
create index if not exists idx_shorts_media_assets_post on malik_shorts_media_assets(post_id, created_at desc);
create index if not exists idx_shorts_drafts_schedule on malik_shorts_drafts(status, scheduled_for);
create index if not exists idx_shorts_agent_runs_queue on malik_shorts_creator_agent_runs(status, created_at);
create index if not exists idx_shorts_products_seller on malik_shorts_products(seller_key, status, created_at desc);
create index if not exists idx_shorts_affiliate_post_time on malik_shorts_affiliate_events(post_id, created_at desc);
create index if not exists idx_shorts_moderation_status on malik_shorts_moderation_cases(status, severity, created_at desc);
create index if not exists idx_shorts_strikes_user on malik_shorts_strikes(user_key, active, created_at desc);

-- Backend-only by default.
do $$
declare t text;
begin
  foreach t in array array[
    'malik_shorts_media_assets','malik_shorts_media_renditions','malik_shorts_media_jobs','malik_shorts_rights_provenance',
    'malik_shorts_captions','malik_shorts_dubs','malik_shorts_drafts','malik_shorts_creator_agents','malik_shorts_creator_agent_runs',
    'malik_shorts_collaborations','malik_shorts_products','malik_shorts_product_tags','malik_shorts_affiliate_events',
    'malik_shorts_moderation_cases','malik_shorts_strikes','malik_shorts_appeals','malik_shorts_device_risk','malik_shorts_daily_creator_metrics'
  ] loop
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on %I to service_role', t);
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;
