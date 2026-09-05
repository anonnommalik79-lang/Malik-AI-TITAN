-- MALIK SHORTS service-role grants. Run after both Malik Shorts schema files.
-- Browser roles remain revoked; only the backend service role can call these RPCs.

grant usage on schema public to service_role;
grant select, insert, update, delete on malik_shorts_profiles to service_role;
grant select, insert, update, delete on malik_shorts_posts to service_role;
grant select, insert, update, delete on malik_shorts_counters to service_role;
grant select, insert, update, delete on malik_shorts_likes to service_role;
grant select, insert, update, delete on malik_shorts_saves to service_role;
grant select, insert, update, delete on malik_shorts_reposts to service_role;
grant select, insert, update, delete on malik_shorts_follows to service_role;
grant select, insert, update, delete on malik_shorts_comments to service_role;
grant select, insert, update, delete on malik_shorts_comment_likes to service_role;
grant select, insert, update, delete on malik_shorts_events to service_role;
grant select, insert, update, delete on malik_shorts_external_accounts to service_role;
grant select, insert, update, delete on malik_shorts_collections to service_role;
grant select, insert, update, delete on malik_shorts_collection_items to service_role;
grant select, insert, update, delete on malik_shorts_reports to service_role;
grant select, insert, update, delete on malik_shorts_boosts to service_role;
grant select on malik_shorts_feed_v1 to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function malik_shorts_interact(text,uuid,text,integer,integer,text,text) to service_role;
grant execute on function malik_shorts_create_comment(text,uuid,text,uuid) to service_role;
