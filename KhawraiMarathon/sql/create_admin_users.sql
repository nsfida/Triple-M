-- Creates the two admin logins. Run once in the SQL Editor AFTER schema.sql, then DELETE this file
-- (it contains passwords). Alternative: create the same two users in Dashboard > Authentication > Users
-- with "Auto Confirm User" ticked.
do $$
declare u record; uid uuid;
begin
  for u in select * from (values
    ('waseemfida@khawrai.app', 'Waseem746210'),
    ('nsfida@khawrai.app',     'nsf<3Naina')
  ) as t(email, pw) loop
    if not exists (select 1 from auth.users where email = u.email) then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', u.email,
        crypt(u.pw, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    end if;
  end loop;
end $$;
