-- MALIK SHORTS integrity hardening: deduplicated views and cheap anti-spam windows.
-- Run after malik_shorts_world_social.sql + functions + service_role grants.

create index if not exists idx_malik_shorts_events_view_dedupe
  on malik_shorts_events(user_key, post_id, event_type, created_at desc);

create or replace function malik_shorts_record_view(
  p_user_key text,
  p_post_id uuid,
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
  v_recent boolean := false;
  v_counters record;
  v_liked boolean := false;
  v_saved boolean := false;
  v_reposted boolean := false;
  v_following boolean := false;
  v_creator text;
begin
  select creator_key into v_creator from malik_shorts_posts where id=p_post_id and status='published';
  if v_creator is null then raise exception 'post not found'; end if;

  select exists(
    select 1 from malik_shorts_events
    where user_key=p_user_key and post_id=p_post_id and event_type='view'
      and created_at > now() - interval '20 minutes'
  ) into v_recent;

  insert into malik_shorts_events(user_key,post_id,source,event_type,position_ms,duration_ms,session_id)
  values (p_user_key,p_post_id,nullif(p_source,''),'view',p_position_ms,p_duration_ms,nullif(p_session_id,''));

  if not v_recent then
    update malik_shorts_counters
       set views=views+1,
           total_watch_ms=total_watch_ms+greatest(coalesce(p_position_ms,0),0),
           updated_at=now()
     where post_id=p_post_id;
  end if;

  select exists(select 1 from malik_shorts_likes where post_id=p_post_id and user_key=p_user_key) into v_liked;
  select exists(select 1 from malik_shorts_saves where post_id=p_post_id and user_key=p_user_key) into v_saved;
  select exists(select 1 from malik_shorts_reposts where post_id=p_post_id and user_key=p_user_key) into v_reposted;
  select exists(select 1 from malik_shorts_follows where follower_key=p_user_key and following_key=v_creator) into v_following;
  select * into v_counters from malik_shorts_counters where post_id=p_post_id;

  return jsonb_build_object(
    'deduped', v_recent,
    'viewer', jsonb_build_object('liked',v_liked,'saved',v_saved,'reposted',v_reposted,'following',v_following),
    'metrics', jsonb_build_object(
      'views',coalesce(v_counters.views,0),'likes',coalesce(v_counters.likes,0),
      'comments',coalesce(v_counters.comments,0),'reposts',coalesce(v_counters.reposts,0),
      'saves',coalesce(v_counters.saves,0),'shares',coalesce(v_counters.shares,0)
    )
  );
end;
$$;

revoke all on function malik_shorts_record_view(text,uuid,integer,integer,text,text) from public, anon, authenticated;
grant execute on function malik_shorts_record_view(text,uuid,integer,integer,text,text) to service_role;
