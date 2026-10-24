-- Labour Chowk :: demo accounts (one customer, one worker "Manoj", a tile installer)
-- ============================================================================
-- Run in the Supabase SQL editor (after the migrations). Safe to run more than once.
-- Both accounts are flagged is_demo = true, so the app shows a "Sample data" badge on Manoj.
--
--   Customer : demo.customer@labourchowk.demo   password: Demo@12345
--   Worker   : manoj.tiles@labourchowk.demo     password: Demo@12345   (Tile & Flooring Installer, ₹80 per sq ft)
--
-- Deliberately NOT included: reviews and portfolio photos. Reviews can only come from real
-- customers after a completed visit, and portfolio photos must be the worker's own work.
-- To add photos, log in as Manoj and use  Portfolio -> Add project  (upload real photos of
-- real jobs). Copying photos or reviews from other websites and presenting them as his own
-- work would mislead customers, so the app and this script do not do it.
-- ============================================================================

create extension if not exists pgcrypto;

create or replace function pg_temp.demo_user(p_email text, p_meta jsonb) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
          crypt('Demo@12345', gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', p_meta, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now(), now());
  return v_id;
end $$;

do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'demo.customer@labourchowk.demo') then
    v_id := pg_temp.demo_user('demo.customer@labourchowk.demo',
      jsonb_build_object('role', 'customer', 'full_name', 'Demo Customer', 'phone', '9800000100',
                         'default_locality', 'Sector 62, Noida'));
    update public.profiles set is_demo = true where id = v_id;
  end if;

  if not exists (select 1 from auth.users where email = 'manoj.tiles@labourchowk.demo') then
    v_id := pg_temp.demo_user('manoj.tiles@labourchowk.demo',
      jsonb_build_object('role', 'worker', 'full_name', 'Manoj', 'phone', '9700000100',
        'category_slug', 'tile-flooring', 'experience_years', 10,
        'indicative_price', 80, 'pricing_unit', 'per_sq_ft',
        'locality', 'Sector 62', 'city', 'Noida', 'latitude', 28.6280, 'longitude', 77.3649,
        'service_radius_km', 15, 'languages', jsonb_build_array('Hindi', 'English'),
        'skills', jsonb_build_array('Floor tiles', 'Wall tiles', 'Bathroom tiling', 'Kitchen dado'),
        'description', 'Tile fitting for flats and houses: floors, bathrooms and kitchen walls. Price is per square foot; final quote after seeing the site.'));
    update public.profiles set is_demo = true where id = v_id;
    update public.worker_profiles set is_demo = true where id = v_id;
  end if;
end $$;
