-- Run after 20261028_006_marathon_results.sql in Supabase SQL Editor.
-- Each *_ok column should return true.
select
  to_regclass('public.marathon_race_control') is not null as race_control_table_ok,
  to_regclass('public.marathon_results') is not null as results_table_ok,
  to_regclass('public.public_marathon_results') is not null as public_results_view_ok,
  coalesce((select relrowsecurity from pg_class where oid = 'public.marathon_race_control'::regclass), false) as race_control_rls_enabled,
  coalesce((select relrowsecurity from pg_class where oid = 'public.marathon_results'::regclass), false) as results_rls_enabled,
  not has_table_privilege('anon', 'public.marathon_results', 'INSERT') as anon_cannot_insert_results,
  not has_table_privilege('anon', 'public.marathon_results', 'UPDATE') as anon_cannot_update_results,
  not has_table_privilege('anon', 'public.marathon_results', 'DELETE') as anon_cannot_delete_results,
  not has_table_privilege('authenticated', 'public.marathon_results', 'INSERT') as authenticated_cannot_direct_insert_results,
  not has_table_privilege('authenticated', 'public.marathon_results', 'UPDATE') as authenticated_cannot_direct_update_results,
  not has_table_privilege('authenticated', 'public.marathon_results', 'DELETE') as authenticated_cannot_direct_delete_results,
  not has_function_privilege('anon', 'public.admin_upsert_marathon_result(uuid,text,text,integer)', 'EXECUTE') as anon_cannot_call_result_write_rpc,
  not has_function_privilege('anon', 'public.admin_update_race_control(text,text)', 'EXECUTE') as anon_cannot_call_race_control_rpc,
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marathon_results') as results_realtime_enabled,
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marathon_race_control') as race_control_realtime_enabled;
