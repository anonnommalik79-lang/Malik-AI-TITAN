-- MALIK SHORTS — YouTube-class parity hardening v3
-- Apply after malik_shorts_platform_v2_scale.sql and malik_shorts_workers_v2.sql.
-- Additive/idempotent: media fingerprints, duplicate review and worker job support.

create extension if not exists pgcrypto;

alter table malik_shorts_media_jobs
  drop constraint if exists malik_shorts_media_jobs_job_type_check;

alter table malik_shorts_media_jobs
  add constraint malik_shorts_media_jobs_job_type_check
  check (job_type in ('virus_scan','probe','fingerprint','transcode_hls','thumbnail','caption','moderation','embedding','cleanup'));

create table if not exists malik_shorts_media_fingerprints (
  asset_id uuid primary key references malik_shorts_media_assets(id) on delete cascade,
  post_id uuid references malik_shorts_posts(id) on delete set null,
  exact_sha256 text,
  video_fingerprint text,
  audio_fingerprint text,
  duration_ms integer,
  width integer,
  height integer,
  algorithm_version text not null default 'malik-fp-v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (exact_sha256 is null or exact_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists malik_shorts_duplicate_matches (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null references malik_shorts_media_assets(id) on delete cascade,
  matched_asset_id uuid not null references malik_shorts_media_assets(id) on delete cascade,
  match_kind text not null check (match_kind in ('exact','video_fingerprint','audio_fingerprint','manual')),
  score real not null default 1 check (score between 0 and 1),
  status text not null default 'review' check (status in ('review','cleared','confirmed','ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (source_asset_id, matched_asset_id, match_kind),
  check (source_asset_id <> matched_asset_id)
);

create index if not exists idx_shorts_fingerprint_exact
  on malik_shorts_media_fingerprints(exact_sha256)
  where exact_sha256 is not null;
create index if not exists idx_shorts_fingerprint_video
  on malik_shorts_media_fingerprints(video_fingerprint)
  where video_fingerprint is not null;
create index if not exists idx_shorts_fingerprint_audio
  on malik_shorts_media_fingerprints(audio_fingerprint)
  where audio_fingerprint is not null;
create index if not exists idx_shorts_duplicate_review
  on malik_shorts_duplicate_matches(status, created_at desc);

create or replace function malik_shorts_touch_media_fingerprint()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_fingerprint_touch on malik_shorts_media_fingerprints;
create trigger trg_malik_shorts_fingerprint_touch
before update on malik_shorts_media_fingerprints
for each row execute function malik_shorts_touch_media_fingerprint();

revoke all on malik_shorts_media_fingerprints from anon, authenticated;
revoke all on malik_shorts_duplicate_matches from anon, authenticated;
grant select, insert, update, delete on malik_shorts_media_fingerprints to service_role;
grant select, insert, update, delete on malik_shorts_duplicate_matches to service_role;
