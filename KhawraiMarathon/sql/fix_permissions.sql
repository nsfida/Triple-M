-- Run this alone if you already ran schema.sql and see "permission denied for schema public"
grant usage on schema public to anon, authenticated;
grant execute on function public.jwt_email() to anon, authenticated;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;
grant select on public.public_participants to anon, authenticated;
