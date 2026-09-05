-- MALIK SHORTS PLATFORM V2 FUNCTIONS
-- Apply after database/malik_shorts_platform_v2.sql.

create or replace function malik_shorts_event_signal_weight(p_event_type text)
returns real language sql immutable as $$
  select case p_event_type
    when 'complete' then 0.35
    when 'rewatch' then 0.55
    when 'like' then 0.45
    when 'comment' then 0.65
    when 'comment_reply' then 0.75
    when 'save' then 0.85
    when 'share' then 0.95
    when 'follow' then 1.20
    when 'profile_view' then 0.25
    when 'skip' then -0.25
    when 'not_interested' then -2.00
    when 'report' then -3.00
    else 0.0
  end;
$$;

create or replace function malik_shorts_learn_interest_from_event()
returns trigger language plpgsql as $$
declare
  signal_weight real;
begin
  if new.user_key is null or new.post_id is null then return new; end if;
  signal_weight := malik_shorts_event_signal_weight(new.event_type);
  if signal_weight = 0 then return new; end if;

  insert into malik_shorts_user_interests(user_key, topic_id, weight, evidence_count, last_signal_at, updated_at)
  select new.user_key,
         pt.topic_id,
         greatest(-10, least(10, signal_weight * greatest(.25, pt.confidence))),
         1,
         new.created_at,
         now()
    from malik_shorts_post_topics pt
   where pt.post_id = new.post_id
  on conflict (user_key, topic_id) do update
    set weight = greatest(-10, least(10,
          malik_shorts_user_interests.weight + excluded.weight *
          case when malik_shorts_user_interests.last_signal_at is null then 1
               when malik_shorts_user_interests.last_signal_at < now() - interval '30 days' then 1.25
               else 1 end)),
        evidence_count = malik_shorts_user_interests.evidence_count + 1,
        last_signal_at = excluded.last_signal_at,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_learn_interest on malik_shorts_event_stream_v2;
create trigger trg_malik_shorts_learn_interest
after insert on malik_shorts_event_stream_v2
for each row execute function malik_shorts_learn_interest_from_event();

create or replace function malik_shorts_refresh_topic_counts(p_topic_id uuid)
returns void language plpgsql as $$
begin
  update malik_shorts_topics t
     set post_count = (select count(*) from malik_shorts_post_topics pt join malik_shorts_posts p on p.id = pt.post_id where pt.topic_id = p_topic_id and p.status = 'published'),
         follower_count = (select count(*) from malik_shorts_user_interests ui where ui.topic_id = p_topic_id and ui.weight >= 5),
         updated_at = now()
   where t.id = p_topic_id;
end;
$$;

create or replace function malik_shorts_post_topic_count_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform malik_shorts_refresh_topic_counts(old.topic_id);
    return old;
  end if;
  perform malik_shorts_refresh_topic_counts(new.topic_id);
  if tg_op = 'UPDATE' and old.topic_id is distinct from new.topic_id then
    perform malik_shorts_refresh_topic_counts(old.topic_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_post_topic_counts on malik_shorts_post_topics;
create trigger trg_malik_shorts_post_topic_counts
after insert or update or delete on malik_shorts_post_topics
for each row execute function malik_shorts_post_topic_count_trigger();

create or replace function malik_shorts_interest_count_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform malik_shorts_refresh_topic_counts(old.topic_id);
    return old;
  end if;
  perform malik_shorts_refresh_topic_counts(new.topic_id);
  if tg_op = 'UPDATE' and old.topic_id is distinct from new.topic_id then
    perform malik_shorts_refresh_topic_counts(old.topic_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_interest_counts on malik_shorts_user_interests;
create trigger trg_malik_shorts_interest_counts
after insert or update of weight or delete on malik_shorts_user_interests
for each row execute function malik_shorts_interest_count_trigger();

create or replace function malik_shorts_ensure_creator_wallet()
returns trigger language plpgsql as $$
begin
  insert into malik_shorts_creator_wallets(user_key) values (new.user_key) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_creator_wallet on malik_shorts_profiles;
create trigger trg_malik_shorts_creator_wallet
after insert on malik_shorts_profiles
for each row execute function malik_shorts_ensure_creator_wallet();

insert into malik_shorts_creator_wallets(user_key)
select user_key from malik_shorts_profiles
on conflict do nothing;

create or replace function malik_shorts_comment_like_atomic(p_user_key text, p_comment_id uuid, p_like boolean)
returns table(liked boolean, likes bigint)
language plpgsql security definer set search_path = public as $$
begin
  if p_like then
    insert into malik_shorts_comment_likes(comment_id, user_key)
    values (p_comment_id, p_user_key)
    on conflict do nothing;
  else
    delete from malik_shorts_comment_likes where comment_id = p_comment_id and user_key = p_user_key;
  end if;

  update malik_shorts_comments c
     set like_count = (select count(*) from malik_shorts_comment_likes cl where cl.comment_id = p_comment_id),
         updated_at = now()
   where c.id = p_comment_id;

  return query
  select exists(select 1 from malik_shorts_comment_likes where comment_id = p_comment_id and user_key = p_user_key),
         (select c.like_count from malik_shorts_comments c where c.id = p_comment_id);
end;
$$;

revoke all on function malik_shorts_comment_like_atomic(text, uuid, boolean) from public;
grant execute on function malik_shorts_comment_like_atomic(text, uuid, boolean) to service_role;

create or replace function malik_shorts_block_cleanup()
returns trigger language plpgsql as $$
begin
  delete from malik_shorts_follows
   where (follower_key = new.blocker_key and following_key = new.blocked_key)
      or (follower_key = new.blocked_key and following_key = new.blocker_key);
  return new;
end;
$$;

drop trigger if exists trg_malik_shorts_block_cleanup on malik_shorts_blocks;
create trigger trg_malik_shorts_block_cleanup
after insert on malik_shorts_blocks
for each row execute function malik_shorts_block_cleanup();
