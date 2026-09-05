-- MALIK SHORTS — production social graph / content graph foundation
-- Apply once to the PostgreSQL/Supabase database used by Malik AI.
-- Server routes use SUPABASE_SERVICE_ROLE_KEY. Do not expose service role keys to browsers.

create extension if not exists pgcrypto;

create table if not exists malik_shorts_profiles (
  user_key text primary key,
  username text unique not null check (username ~ '^[A-Za-z0-9._]{2,32}$'),
  display_name text not null,
  avatar_url text,
  bio text not null default '',
  verified boolean not null default false,
  private_account boolean not null default false,
  locale text not null default 'ru',
  region text not null default 'KZ',
  follower_count bigint not null default 0,
  following_count bigint not null default 0,
  total_likes bigint not null default 0,
  post_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_posts (
  id uuid primary key default gen_random_uuid(),
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  source text not null default 'malik' check (source in ('malik','youtube','tiktok')),
  source_id text,
  source_url text,
  playback_kind text not null default 'native' check (playback_kind in ('native','youtube','tiktok')),
  media_url text,
  poster_url text,
  caption text not null default '',
  hashtags text[] not null default '{}',
  language text,
  region text,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  status text not null default 'published' check (status in ('draft','processing','published','limited','removed')),
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  can_remix boolean not null default true,
  can_download boolean not null default false,
  attribution_required boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create table if not exists malik_shorts_counters (
  post_id uuid primary key references malik_shorts_posts(id) on delete cascade,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  reposts bigint not null default 0,
  saves bigint not null default 0,
  shares bigint not null default 0,
  total_watch_ms bigint not null default 0,
  completes bigint not null default 0,
  rewatches bigint not null default 0,
  external_views bigint,
  external_likes bigint,
  external_comments bigint,
  external_shares bigint,
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_likes (
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_key)
);

create table if not exists malik_shorts_saves (
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_key)
);

create table if not exists malik_shorts_reposts (
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  commentary text not null default '',
  created_at timestamptz not null default now(),
  primary key (post_id, user_key)
);

create table if not exists malik_shorts_follows (
  follower_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  following_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_key, following_key),
  check (follower_key <> following_key)
);

create table if not exists malik_shorts_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  parent_id uuid references malik_shorts_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2200),
  like_count bigint not null default 0,
  status text not null default 'visible' check (status in ('visible','limited','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malik_shorts_comment_likes (
  comment_id uuid not null references malik_shorts_comments(id) on delete cascade,
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_key)
);

create table if not exists malik_shorts_events (
  id bigint generated always as identity primary key,
  user_key text,
  post_id uuid,
  source text check (source is null or source in ('malik','youtube','tiktok')),
  event_type text not null check (event_type in (
    'impression','start','view','pause','25','50','75','complete','rewatch','skip',
    'like','unlike','comment','save','unsave','repost','unrepost','share',
    'follow','unfollow','profile_view','not_interested','report'
  )),
  position_ms integer,
  duration_ms integer,
  session_id text,
  device_hint text,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_external_accounts (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok')),
  provider_user_id text not null,
  username text,
  display_name text,
  avatar_url text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  granted_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id),
  unique (user_key, provider)
);

create table if not exists malik_shorts_collections (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  private boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists malik_shorts_collection_items (
  collection_id uuid not null references malik_shorts_collections(id) on delete cascade,
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, post_id)
);

create table if not exists malik_shorts_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  post_id uuid references malik_shorts_posts(id) on delete cascade,
  comment_id uuid references malik_shorts_comments(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists malik_shorts_boosts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references malik_shorts_posts(id) on delete cascade,
  creator_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  objective text not null check (objective in ('views','engagement','followers','profile_visits')),
  regions text[] not null default '{}',
  languages text[] not null default '{}',
  interests text[] not null default '{}',
  budget_credits integer not null check (budget_credits > 0),
  status text not null default 'draft' check (status in ('draft','review','active','paused','finished','rejected')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_malik_shorts_posts_feed on malik_shorts_posts(status, visibility, published_at desc);
create index if not exists idx_malik_shorts_posts_creator on malik_shorts_posts(creator_key, published_at desc);
create index if not exists idx_malik_shorts_posts_source on malik_shorts_posts(source, source_id);
create index if not exists idx_malik_shorts_comments_post on malik_shorts_comments(post_id, created_at desc);
create index if not exists idx_malik_shorts_events_user_time on malik_shorts_events(user_key, created_at desc);
create index if not exists idx_malik_shorts_events_post_time on malik_shorts_events(post_id, created_at desc);
create index if not exists idx_malik_shorts_events_type_time on malik_shorts_events(event_type, created_at desc);
create index if not exists idx_malik_shorts_follows_following on malik_shorts_follows(following_key, created_at desc);

create or replace function malik_shorts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function malik_shorts_init_counter()
returns trigger language plpgsql as $$
begin
  insert into malik_shorts_counters(post_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create or replace function malik_shorts_recount_profile_posts()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    update malik_shorts_profiles p
       set post_count = (select count(*) from malik_shorts_posts s where s.creator_key = old.creator_key and s.status = 'published')
     where p.user_key = old.creator_key;
    return old;
  end if;
  update malik_shorts_profiles p
     set post_count = (select count(*) from malik_shorts_posts s where s.creator_key = new.creator_key and s.status = 'published')
   where p.user_key = new.creator_key;
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_profiles_touch on malik_shorts_profiles;
create trigger trg_malik_shorts_profiles_touch before update on malik_shorts_profiles
for each row execute function malik_shorts_touch_updated_at();

drop trigger if exists trg_malik_shorts_posts_touch on malik_shorts_posts;
create trigger trg_malik_shorts_posts_touch before update on malik_shorts_posts
for each row execute function malik_shorts_touch_updated_at();

drop trigger if exists trg_malik_shorts_counter_init on malik_shorts_posts;
create trigger trg_malik_shorts_counter_init after insert on malik_shorts_posts
for each row execute function malik_shorts_init_counter();

drop trigger if exists trg_malik_shorts_post_count on malik_shorts_posts;
create trigger trg_malik_shorts_post_count after insert or update of status or delete on malik_shorts_posts
for each row execute function malik_shorts_recount_profile_posts();

-- Feed view deliberately contains no tokens/secrets.
create or replace view malik_shorts_feed_v1 as
select
  p.id,
  p.creator_key,
  p.source,
  p.source_id,
  p.source_url,
  p.playback_kind,
  p.media_url,
  p.poster_url,
  p.caption,
  p.hashtags,
  p.language,
  p.region,
  p.duration_seconds,
  p.can_remix,
  p.can_download,
  p.attribution_required,
  p.published_at,
  p.created_at,
  prof.username,
  prof.display_name,
  prof.avatar_url,
  prof.bio,
  prof.verified,
  coalesce(c.views,0) as views,
  coalesce(c.likes,0) as likes,
  coalesce(c.comments,0) as comments,
  coalesce(c.reposts,0) as reposts,
  coalesce(c.saves,0) as saves,
  coalesce(c.shares,0) as shares,
  c.total_watch_ms,
  c.completes,
  c.rewatches,
  c.external_views,
  c.external_likes,
  c.external_comments,
  c.external_shares
from malik_shorts_posts p
join malik_shorts_profiles prof on prof.user_key = p.creator_key
left join malik_shorts_counters c on c.post_id = p.id
where p.status = 'published' and p.visibility = 'public';

-- The browser never receives direct table privileges. Server routes own access.
revoke all on malik_shorts_profiles from anon, authenticated;
revoke all on malik_shorts_posts from anon, authenticated;
revoke all on malik_shorts_counters from anon, authenticated;
revoke all on malik_shorts_likes from anon, authenticated;
revoke all on malik_shorts_saves from anon, authenticated;
revoke all on malik_shorts_reposts from anon, authenticated;
revoke all on malik_shorts_follows from anon, authenticated;
revoke all on malik_shorts_comments from anon, authenticated;
revoke all on malik_shorts_comment_likes from anon, authenticated;
revoke all on malik_shorts_events from anon, authenticated;
revoke all on malik_shorts_external_accounts from anon, authenticated;
revoke all on malik_shorts_collections from anon, authenticated;
revoke all on malik_shorts_collection_items from anon, authenticated;
revoke all on malik_shorts_reports from anon, authenticated;
revoke all on malik_shorts_boosts from anon, authenticated;
