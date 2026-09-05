-- MALIK SHORTS atomic social actions. Run after malik_shorts_world_social.sql.

create or replace function malik_shorts_interact(
  p_user_key text,
  p_post_id uuid,
  p_action text,
  p_position_ms integer default null,
  p_duration_ms integer default null,
  p_session_id text default null,
  p_source text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator text;
  v_changed integer := 0;
  v_liked boolean := false;
  v_saved boolean := false;
  v_reposted boolean := false;
  v_following boolean := false;
  v_counters record;
begin
  if p_action not in ('view','like','unlike','save','unsave','repost','unrepost','share','follow','unfollow','complete','rewatch','profile_view','not_interested') then
    raise exception 'unsupported action';
  end if;

  select creator_key into v_creator from malik_shorts_posts where id = p_post_id and status = 'published';
  if v_creator is null then raise exception 'post not found'; end if;

  insert into malik_shorts_events(user_key, post_id, source, event_type, position_ms, duration_ms, session_id)
  values (p_user_key, p_post_id, nullif(p_source,''), p_action, p_position_ms, p_duration_ms, nullif(p_session_id,''));

  if p_action = 'view' then
    update malik_shorts_counters
       set views = views + 1,
           total_watch_ms = total_watch_ms + greatest(coalesce(p_position_ms,0),0),
           updated_at = now()
     where post_id = p_post_id;

  elsif p_action = 'like' then
    insert into malik_shorts_likes(post_id,user_key) values (p_post_id,p_user_key) on conflict do nothing;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      update malik_shorts_counters set likes = likes + 1, updated_at = now() where post_id = p_post_id;
      update malik_shorts_profiles set total_likes = total_likes + 1 where user_key = v_creator;
    end if;

  elsif p_action = 'unlike' then
    delete from malik_shorts_likes where post_id = p_post_id and user_key = p_user_key;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      update malik_shorts_counters set likes = greatest(likes - 1,0), updated_at = now() where post_id = p_post_id;
      update malik_shorts_profiles set total_likes = greatest(total_likes - 1,0) where user_key = v_creator;
    end if;

  elsif p_action = 'save' then
    insert into malik_shorts_saves(post_id,user_key) values (p_post_id,p_user_key) on conflict do nothing;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then update malik_shorts_counters set saves = saves + 1, updated_at = now() where post_id = p_post_id; end if;

  elsif p_action = 'unsave' then
    delete from malik_shorts_saves where post_id = p_post_id and user_key = p_user_key;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then update malik_shorts_counters set saves = greatest(saves - 1,0), updated_at = now() where post_id = p_post_id; end if;

  elsif p_action = 'repost' then
    insert into malik_shorts_reposts(post_id,user_key) values (p_post_id,p_user_key) on conflict do nothing;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then update malik_shorts_counters set reposts = reposts + 1, updated_at = now() where post_id = p_post_id; end if;

  elsif p_action = 'unrepost' then
    delete from malik_shorts_reposts where post_id = p_post_id and user_key = p_user_key;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then update malik_shorts_counters set reposts = greatest(reposts - 1,0), updated_at = now() where post_id = p_post_id; end if;

  elsif p_action = 'share' then
    update malik_shorts_counters set shares = shares + 1, updated_at = now() where post_id = p_post_id;

  elsif p_action = 'complete' then
    update malik_shorts_counters
       set completes = completes + 1,
           total_watch_ms = total_watch_ms + greatest(coalesce(p_duration_ms,p_position_ms,0),0),
           updated_at = now()
     where post_id = p_post_id;

  elsif p_action = 'rewatch' then
    update malik_shorts_counters set rewatches = rewatches + 1, updated_at = now() where post_id = p_post_id;

  elsif p_action = 'follow' and v_creator <> p_user_key then
    insert into malik_shorts_follows(follower_key,following_key) values (p_user_key,v_creator) on conflict do nothing;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      update malik_shorts_profiles set following_count = following_count + 1 where user_key = p_user_key;
      update malik_shorts_profiles set follower_count = follower_count + 1 where user_key = v_creator;
    end if;

  elsif p_action = 'unfollow' and v_creator <> p_user_key then
    delete from malik_shorts_follows where follower_key = p_user_key and following_key = v_creator;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      update malik_shorts_profiles set following_count = greatest(following_count - 1,0) where user_key = p_user_key;
      update malik_shorts_profiles set follower_count = greatest(follower_count - 1,0) where user_key = v_creator;
    end if;
  end if;

  select exists(select 1 from malik_shorts_likes where post_id=p_post_id and user_key=p_user_key) into v_liked;
  select exists(select 1 from malik_shorts_saves where post_id=p_post_id and user_key=p_user_key) into v_saved;
  select exists(select 1 from malik_shorts_reposts where post_id=p_post_id and user_key=p_user_key) into v_reposted;
  select exists(select 1 from malik_shorts_follows where follower_key=p_user_key and following_key=v_creator) into v_following;
  select * into v_counters from malik_shorts_counters where post_id = p_post_id;

  return jsonb_build_object(
    'viewer', jsonb_build_object('liked',v_liked,'saved',v_saved,'reposted',v_reposted,'following',v_following),
    'metrics', jsonb_build_object(
      'views',coalesce(v_counters.views,0),
      'likes',coalesce(v_counters.likes,0),
      'comments',coalesce(v_counters.comments,0),
      'reposts',coalesce(v_counters.reposts,0),
      'saves',coalesce(v_counters.saves,0),
      'shares',coalesce(v_counters.shares,0)
    )
  );
end;
$$;

create or replace function malik_shorts_create_comment(
  p_user_key text,
  p_post_id uuid,
  p_body text,
  p_parent_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if char_length(trim(coalesce(p_body,''))) < 1 or char_length(trim(p_body)) > 2200 then
    raise exception 'invalid comment';
  end if;
  if not exists(select 1 from malik_shorts_posts where id=p_post_id and status='published') then
    raise exception 'post not found';
  end if;
  if p_parent_id is not null and not exists(select 1 from malik_shorts_comments where id=p_parent_id and post_id=p_post_id and status='visible') then
    raise exception 'parent comment not found';
  end if;

  insert into malik_shorts_comments(post_id,user_key,parent_id,body)
  values (p_post_id,p_user_key,p_parent_id,trim(p_body))
  returning id into v_id;

  update malik_shorts_counters set comments = comments + 1, updated_at = now() where post_id=p_post_id;
  insert into malik_shorts_events(user_key,post_id,event_type) values (p_user_key,p_post_id,'comment');
  return v_id;
end;
$$;

revoke all on function malik_shorts_interact(text,uuid,text,integer,integer,text,text) from public, anon, authenticated;
revoke all on function malik_shorts_create_comment(text,uuid,text,uuid) from public, anon, authenticated;
