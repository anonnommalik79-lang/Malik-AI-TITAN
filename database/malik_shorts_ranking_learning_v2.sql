-- MALIK SHORTS — online recommendation learning v2
-- Apply after malik_shorts_platform_v2.sql.
-- Converts authenticated behavior signals into topic-interest weights.

create or replace function malik_shorts_apply_interest_signal(
  p_user_key text,
  p_post_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta real;
begin
  if p_user_key is null or p_post_id is null then return; end if;

  v_delta := case p_event_type
    when 'complete' then 0.55
    when 'rewatch' then 0.85
    when 'like' then 0.70
    when 'comment' then 0.82
    when 'comment_reply' then 0.90
    when 'save' then 1.05
    when 'repost' then 1.10
    when 'share' then 1.15
    when 'follow' then 1.35
    when '75' then 0.28
    when '50' then 0.14
    when '25' then 0.05
    when 'skip' then -0.22
    when 'not_interested' then -1.85
    when 'report' then -2.60
    else 0
  end;

  if v_delta = 0 then return; end if;

  insert into malik_shorts_user_interests(user_key, topic_id, weight, evidence_count, last_signal_at, updated_at)
  select
    p_user_key,
    pt.topic_id,
    greatest(-10, least(10, v_delta * greatest(0.25, pt.confidence))),
    1,
    now(),
    now()
  from malik_shorts_post_topics pt
  where pt.post_id = p_post_id
  on conflict (user_key, topic_id) do update set
    weight = greatest(-10, least(10,
      malik_shorts_user_interests.weight + (excluded.weight * (case when malik_shorts_user_interests.evidence_count > 40 then 0.35 else 1 end))
    )),
    evidence_count = malik_shorts_user_interests.evidence_count + 1,
    last_signal_at = now(),
    updated_at = now();
end;
$$;

revoke all on function malik_shorts_apply_interest_signal(text, uuid, text) from public, anon, authenticated;
grant execute on function malik_shorts_apply_interest_signal(text, uuid, text) to service_role;

-- Topic trend rollup used by Explore. It deliberately excludes deleted/limited posts.
create or replace view malik_shorts_topic_trends_v2 as
select
  t.id as topic_id,
  t.slug,
  t.name,
  t.language,
  t.region,
  count(distinct pt.post_id) as active_posts,
  coalesce(sum(
    case e.event_type
      when 'view' then 1
      when 'complete' then 3
      when 'rewatch' then 4
      when 'like' then 5
      when 'comment' then 7
      when 'save' then 8
      when 'share' then 10
      when 'follow' then 12
      else 0
    end
  ), 0)::bigint as trend_score,
  max(e.created_at) as last_activity_at
from malik_shorts_topics t
join malik_shorts_post_topics pt on pt.topic_id = t.id
join malik_shorts_posts p on p.id = pt.post_id and p.status = 'published' and p.visibility = 'public'
left join malik_shorts_event_stream_v2 e
  on e.post_id = p.id
  and e.created_at >= now() - interval '24 hours'
where t.active = true
group by t.id, t.slug, t.name, t.language, t.region;

revoke all on malik_shorts_topic_trends_v2 from anon, authenticated;
grant select on malik_shorts_topic_trends_v2 to service_role;
