-- MALIK SHORTS — worker queue primitives
-- Apply after malik_shorts_platform_v2_scale.sql.

create or replace function malik_shorts_claim_media_job(p_worker text)
returns setof malik_shorts_media_jobs
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id
  from malik_shorts_media_jobs
  where status = 'queued'
    and run_after <= now()
    and attempts < max_attempts
  order by priority asc, created_at asc
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  return query
  update malik_shorts_media_jobs
  set status = 'running',
      locked_at = now(),
      locked_by = left(coalesce(p_worker, 'worker'), 120),
      attempts = attempts + 1,
      updated_at = now()
  where id = v_id
  returning *;
end;
$$;

create or replace function malik_shorts_finish_media_job(
  p_job_id uuid,
  p_worker text,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_attempts integer; v_max integer;
begin
  select attempts, max_attempts into v_attempts, v_max
  from malik_shorts_media_jobs
  where id = p_job_id and status = 'running' and locked_by = left(coalesce(p_worker, 'worker'), 120)
  for update;

  if not found then return false; end if;

  if p_success then
    update malik_shorts_media_jobs
    set status = 'succeeded', result = coalesce(p_result, '{}'::jsonb), error = null,
        locked_at = null, locked_by = null, updated_at = now()
    where id = p_job_id;
  else
    update malik_shorts_media_jobs
    set status = case when v_attempts >= v_max then 'failed' else 'queued' end,
        error = left(coalesce(p_error, 'worker failed'), 4000),
        run_after = case when v_attempts >= v_max then run_after else now() + make_interval(secs => least(3600, 20 * (2 ^ greatest(0, v_attempts - 1)))) end,
        locked_at = null, locked_by = null, updated_at = now()
    where id = p_job_id;
  end if;
  return true;
end;
$$;

create or replace function malik_shorts_claim_agent_run(p_worker text)
returns setof malik_shorts_creator_agent_runs
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select r.id into v_id
  from malik_shorts_creator_agent_runs r
  join malik_shorts_creator_agents a on a.id = r.agent_id
  where r.status = 'queued' and a.enabled = true
  order by r.created_at asc
  for update of r skip locked
  limit 1;
  if v_id is null then return; end if;
  return query
  update malik_shorts_creator_agent_runs
  set status = 'running', started_at = coalesce(started_at, now())
  where id = v_id
  returning *;
end;
$$;

create or replace function malik_shorts_claim_scheduled_draft()
returns setof malik_shorts_drafts
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id
  from malik_shorts_drafts
  where status = 'scheduled' and scheduled_for is not null and scheduled_for <= now()
  order by scheduled_for asc
  for update skip locked
  limit 1;
  if v_id is null then return; end if;
  return query
  update malik_shorts_drafts
  set status = 'publishing', updated_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function malik_shorts_claim_media_job(text) from public, anon, authenticated;
revoke all on function malik_shorts_finish_media_job(uuid,text,boolean,jsonb,text) from public, anon, authenticated;
revoke all on function malik_shorts_claim_agent_run(text) from public, anon, authenticated;
revoke all on function malik_shorts_claim_scheduled_draft() from public, anon, authenticated;
grant execute on function malik_shorts_claim_media_job(text) to service_role;
grant execute on function malik_shorts_finish_media_job(uuid,text,boolean,jsonb,text) to service_role;
grant execute on function malik_shorts_claim_agent_run(text) to service_role;
grant execute on function malik_shorts_claim_scheduled_draft() to service_role;
