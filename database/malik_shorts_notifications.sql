-- MALIK SHORTS notification graph.
-- Run after core social schema.

create table if not exists malik_shorts_notifications (
  id bigint generated always as identity primary key,
  recipient_key text not null references malik_shorts_profiles(user_key) on delete cascade,
  actor_key text references malik_shorts_profiles(user_key) on delete set null,
  type text not null check (type in ('like','comment','reply','follow','repost','mention','system')),
  post_id uuid references malik_shorts_posts(id) on delete cascade,
  comment_id uuid references malik_shorts_comments(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_malik_shorts_notifications_recipient
  on malik_shorts_notifications(recipient_key, created_at desc);
create index if not exists idx_malik_shorts_notifications_unread
  on malik_shorts_notifications(recipient_key, read_at, created_at desc);

create or replace function malik_shorts_notify_like()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient text;
begin
  select creator_key into v_recipient from malik_shorts_posts where id=new.post_id;
  if v_recipient is not null and v_recipient <> new.user_key then
    insert into malik_shorts_notifications(recipient_key,actor_key,type,post_id)
    values(v_recipient,new.user_key,'like',new.post_id);
  end if;
  return new;
end;
$$;

create or replace function malik_shorts_notify_repost()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient text;
begin
  select creator_key into v_recipient from malik_shorts_posts where id=new.post_id;
  if v_recipient is not null and v_recipient <> new.user_key then
    insert into malik_shorts_notifications(recipient_key,actor_key,type,post_id)
    values(v_recipient,new.user_key,'repost',new.post_id);
  end if;
  return new;
end;
$$;

create or replace function malik_shorts_notify_follow()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.following_key <> new.follower_key then
    insert into malik_shorts_notifications(recipient_key,actor_key,type)
    values(new.following_key,new.follower_key,'follow');
  end if;
  return new;
end;
$$;

create or replace function malik_shorts_notify_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient text; v_type text := 'comment';
begin
  if new.parent_id is not null then
    select user_key into v_recipient from malik_shorts_comments where id=new.parent_id;
    v_type := 'reply';
  end if;
  if v_recipient is null then select creator_key into v_recipient from malik_shorts_posts where id=new.post_id; end if;
  if v_recipient is not null and v_recipient <> new.user_key then
    insert into malik_shorts_notifications(recipient_key,actor_key,type,post_id,comment_id)
    values(v_recipient,new.user_key,v_type,new.post_id,new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_notify_like on malik_shorts_likes;
create trigger trg_malik_shorts_notify_like after insert on malik_shorts_likes
for each row execute function malik_shorts_notify_like();

drop trigger if exists trg_malik_shorts_notify_repost on malik_shorts_reposts;
create trigger trg_malik_shorts_notify_repost after insert on malik_shorts_reposts
for each row execute function malik_shorts_notify_repost();

drop trigger if exists trg_malik_shorts_notify_follow on malik_shorts_follows;
create trigger trg_malik_shorts_notify_follow after insert on malik_shorts_follows
for each row execute function malik_shorts_notify_follow();

drop trigger if exists trg_malik_shorts_notify_comment on malik_shorts_comments;
create trigger trg_malik_shorts_notify_comment after insert on malik_shorts_comments
for each row execute function malik_shorts_notify_comment();

revoke all on malik_shorts_notifications from anon, authenticated;
grant select, insert, update, delete on malik_shorts_notifications to service_role;
grant usage, select on all sequences in schema public to service_role;
