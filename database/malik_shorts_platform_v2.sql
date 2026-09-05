-- MALIK SHORTS PLATFORM V2
-- Additive production migration for recommendation, topics, sounds, remix lineage,
-- messaging, live, experimentation, creator economy, anti-abuse and provider expansion.
-- Apply after malik_shorts_world_social.sql and the existing service-role migration.

create extension if not exists pgcrypto;

-- External account layer is provider-agnostic. Core feed stays Malik/YouTube/TikTok
-- until an Instagram media adapter is approved and enabled.
alter table malik_shorts_external_accounts
  drop constraint if exists malik_shorts_external_accounts_provider_check;
alter table malik_shorts_external_accounts
  add constraint malik_shorts_external_accounts_provider_check
  check (provider in ('youtube','tiktok','instagram'));

create table if not exists malik_shorts_topics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  language text,
  region text,
  active boolean not null default true,
  post_count bigint not null default 0,
  follower_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_post_topics (
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  topic_id uuid not null references malik_shorts_topics(id) on delete cascade,
  confidence real not null default 1 check (confidence between 0 and 1),
  source text not null default 'ai' check (source in ('ai','creator','moderator','import')),
  created_at timestamptz not null default now(),
  primary key (post_id, topic_id)
);

create table if not exists malik_shorts_user_interests (
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  topic_id uuid not null references malik_shorts_topics(id) on delete cascade,
  weight real not null default 0 check (weight between -10 and 10),
  evidence_count bigint not null default 0,
  last_signal_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_key, topic_id)
);

create table if not exists malik_shorts_post_features (
  post_id uuid primary key references malik_shorts_posts(id) on delete cascade,
  quality_score real not null default .5 check (quality_score between 0 and 1),
  safety_score real not null default 1 check (safety_score between 0 and 1),
  novelty_score real not null default .5 check (novelty_score between 0 and 1),
  creator_quality real not null default .5 check (creator_quality between 0 and 1),
  language_confidence real check (language_confidence is null or language_confidence between 0 and 1),
  detected_language text,
  detected_region text,
  objects jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  moderation_labels jsonb not null default '{}'::jsonb,
  embedding_model text,
  embedding real[],
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_sounds (
  id uuid primary key default gen_random_uuid(),
  owner_key text references malik_shorts_profiles(user_key) on delete set null,
  source text not null default 'malik' check (source in ('malik','youtube','tiktok','instagram')),
  source_id text,
  title text not null default '',
  artist text not null default '',
  media_url text,
  canonical_url text,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  rights_status text not null default 'unknown' check (rights_status in ('owned','licensed','external_embed','unknown','blocked')),
  usage_count bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

create table if not exists malik_shorts_post_sounds (
  post_id uuid primary key references malik_shorts_posts(id) on delete cascade,
  sound_id uuid not null references malik_shorts_sounds(id) on delete cascade,
  start_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_remixes (
  parent_post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  child_post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  remix_type text not null check (remix_type in ('remix','duet','stitch','response','template','ai_variant')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (parent_post_id, child_post_id),
  check (parent_post_id <> child_post_id)
);

create table if not exists malik_shorts_blocks (
  blocker_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  blocked_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_key, blocked_key),
  check (blocker_key <> blocked_key)
);

create table if not exists malik_shorts_mutes (
  muter_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  muted_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_key, muted_key),
  check (muter_key <> muted_key)
);

-- Rich event stream for ranking. Existing malik_shorts_events remains the compact
-- transactional/audit stream used by current counters.
create table if not exists malik_shorts_event_stream_v2 (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid(),
  user_key text,
  anonymous_key text,
  post_id uuid references malik_shorts_posts(id) on delete set null,
  creator_key text,
  source text,
  event_type text not null check (event_type in (
    'impression','start','view','pause','resume','25','50','75','complete','rewatch','skip',
    'like','unlike','comment','comment_reply','comment_like','save','unsave','repost','unrepost','share',
    'follow','unfollow','profile_view','topic_view','sound_view','search','search_click','not_interested',
    'report','block','mute','dm_share','live_join','live_leave','remix_open','remix_publish'
  )),
  position_ms integer,
  duration_ms integer,
  watch_ms integer,
  session_id text,
  request_id text,
  device_hint text,
  locale text,
  region text,
  network_hint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_id)
);

create table if not exists malik_shorts_recommendation_impressions (
  id bigint generated always as identity primary key,
  user_key text,
  anonymous_key text,
  session_id text not null,
  request_id text not null,
  post_id uuid references malik_shorts_posts(id) on delete set null,
  source text,
  rank_position integer not null,
  score real,
  model_version text not null,
  reasons jsonb not null default '[]'::jsonb,
  experiment_buckets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_experiments (
  key text primary key check (key ~ '^[a-z0-9._-]{2,80}$'),
  description text not null default '',
  variants jsonb not null,
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_experiment_exposures (
  experiment_key text not null references malik_shorts_experiments(key) on delete cascade,
  subject_key text not null,
  variant text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (experiment_key, subject_key)
);

-- External provider content is mirrored as metadata only; canonical media rights
-- and provider playback restrictions remain attached to every record.
create table if not exists malik_shorts_external_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok','instagram')),
  provider_comment_id text not null,
  provider_parent_id text,
  author_provider_id text,
  author_name text not null default '',
  author_avatar_url text,
  body text not null default '',
  like_count bigint not null default 0,
  reply_count bigint not null default 0,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (provider, provider_comment_id)
);

create table if not exists malik_shorts_sync_cursors (
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok','instagram')),
  resource text not null,
  cursor text,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (user_key, provider, resource)
);

-- Messaging layer.
create table if not exists malik_shorts_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct','group','creator_support')),
  title text not null default '',
  created_by text references malik_shorts_profiles(user_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_conversation_members (
  conversation_id uuid not null references malik_shorts_conversations(id) on delete cascade,
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_key)
);

create table if not exists malik_shorts_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references malik_shorts_conversations(id) on delete cascade,
  sender_key text references malik_shorts_profiles(user_key) on delete set null,
  body text not null default '' check (char_length(body) <= 8000),
  shared_post_id uuid references malik_shorts_posts(id) on delete set null,
  reply_to_id uuid references malik_shorts_messages(id) on delete set null,
  status text not null default 'visible' check (status in ('visible','removed')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- Live layer.
create table if not exists malik_shorts_live_sessions (
  id uuid primary key default gen_random_uuid(),
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  title text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  playback_url text,
  ingest_key_encrypted text,
  viewer_count bigint not null default 0,
  peak_viewers bigint not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_live_chat (
  id bigint generated always as identity primary key,
  live_id uuid not null references malik_shorts_live_sessions(id) on delete cascade,
  user_key text references malik_shorts_profiles(user_key) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'visible' check (status in ('visible','limited','removed')),
  created_at timestamptz not null default now()
);

-- Creator economy. Amounts are integer credits until a regulated payout rail is connected.
create table if not exists malik_shorts_creator_wallets (
  user_key text primary key references malik_shorts_profiles(user_key) on delete cascade,
  available_credits bigint not null default 0,
  pending_credits bigint not null default 0,
  lifetime_earned_credits bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_creator_ledger (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  entry_type text not null check (entry_type in ('reward','tip','gift','membership','affiliate','boost_spend','adjustment','payout_hold','payout_release')),
  amount_credits bigint not null,
  post_id uuid references malik_shorts_posts(id) on delete set null,
  reference_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_memberships (
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  member_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  tier text not null default 'supporter',
  status text not null default 'active' check (status in ('active','paused','cancelled','expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  primary key (creator_key, member_key),
  check (creator_key <> member_key)
);

create index if not exists idx_shorts_topic_posts on malik_shorts_post_topics(topic_id, post_id);
create index if not exists idx_shorts_interest_user_weight on malik_shorts_user_interests(user_key, weight desc);
create index if not exists idx_shorts_event_v2_user_time on malik_shorts_event_stream_v2(user_key, created_at desc);
create index if not exists idx_shorts_event_v2_post_time on malik_shorts_event_stream_v2(post_id, created_at desc);
create index if not exists idx_shorts_event_v2_session_time on malik_shorts_event_stream_v2(session_id, created_at desc);
create index if not exists idx_shorts_impression_session on malik_shorts_recommendation_impressions(session_id, created_at desc);
create index if not exists idx_shorts_external_comments_post on malik_shorts_external_comments(post_id, published_at desc);
create index if not exists idx_shorts_messages_conversation on malik_shorts_messages(conversation_id, created_at desc);
create index if not exists idx_shorts_live_status on malik_shorts_live_sessions(status, started_at desc);
create index if not exists idx_shorts_ledger_user_time on malik_shorts_creator_ledger(user_key, created_at desc);

-- Backend-only access. Browser clients go through authenticated Next.js routes.
revoke all on malik_shorts_topics from anon, authenticated;
revoke all on malik_shorts_post_topics from anon, authenticated;
revoke all on malik_shorts_user_interests from anon, authenticated;
revoke all on malik_shorts_post_features from anon, authenticated;
revoke all on malik_shorts_sounds from anon, authenticated;
revoke all on malik_shorts_post_sounds from anon, authenticated;
revoke all on malik_shorts_remixes from anon, authenticated;
revoke all on malik_shorts_blocks from anon, authenticated;
revoke all on malik_shorts_mutes from anon, authenticated;
revoke all on malik_shorts_event_stream_v2 from anon, authenticated;
revoke all on malik_shorts_recommendation_impressions from anon, authenticated;
revoke all on malik_shorts_experiments from anon, authenticated;
revoke all on malik_shorts_experiment_exposures from anon, authenticated;
revoke all on malik_shorts_external_comments from anon, authenticated;
revoke all on malik_shorts_sync_cursors from anon, authenticated;
revoke all on malik_shorts_conversations from anon, authenticated;
revoke all on malik_shorts_conversation_members from anon, authenticated;
revoke all on malik_shorts_messages from anon, authenticated;
revoke all on malik_shorts_live_sessions from anon, authenticated;
revoke all on malik_shorts_live_chat from anon, authenticated;
revoke all on malik_shorts_creator_wallets from anon, authenticated;
revoke all on malik_shorts_creator_ledger from anon, authenticated;
revoke all on malik_shorts_memberships from anon, authenticated;

grant select, insert, update, delete on malik_shorts_topics to service_role;
grant select, insert, update, delete on malik_shorts_post_topics to service_role;
grant select, insert, update, delete on malik_shorts_user_interests to service_role;
grant select, insert, update, delete on malik_shorts_post_features to service_role;
grant select, insert, update, delete on malik_shorts_sounds to service_role;
grant select, insert, update, delete on malik_shorts_post_sounds to service_role;
grant select, insert, update, delete on malik_shorts_remixes to service_role;
grant select, insert, update, delete on malik_shorts_blocks to service_role;
grant select, insert, update, delete on malik_shorts_mutes to service_role;
grant select, insert, update, delete on malik_shorts_event_stream_v2 to service_role;
grant select, insert, update, delete on malik_shorts_recommendation_impressions to service_role;
grant select, insert, update, delete on malik_shorts_experiments to service_role;
grant select, insert, update, delete on malik_shorts_experiment_exposures to service_role;
grant select, insert, update, delete on malik_shorts_external_comments to service_role;
grant select, insert, update, delete on malik_shorts_sync_cursors to service_role;
grant select, insert, update, delete on malik_shorts_conversations to service_role;
grant select, insert, update, delete on malik_shorts_conversation_members to service_role;
grant select, insert, update, delete on malik_shorts_messages to service_role;
grant select, insert, update, delete on malik_shorts_live_sessions to service_role;
grant select, insert, update, delete on malik_shorts_live_chat to service_role;
grant select, insert, update, delete on malik_shorts_creator_wallets to service_role;
grant select, insert, update, delete on malik_shorts_creator_ledger to service_role;
grant select, insert, update, delete on malik_shorts_memberships to service_role;
grant usage, select on all sequences in schema public to service_role;
