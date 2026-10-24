-- Labour Chowk :: 0002 signup trigger, public views, grants and Row Level Security
-- Requires roles `anon` and `authenticated` and function auth.uid() (provided by Supabase).

-- ---------------------------------------------------------------- admin check
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------- signup trigger
-- Creates the profile (and worker profile) when Supabase Auth creates a user.
-- Values come from the sign-up metadata, which is client supplied, so everything
-- is sanitised here and the table constraints are the final authority.
-- `role` can only ever become 'customer' or 'worker': there is no way to sign up as admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role     text  := case when m ->> 'role' = 'worker' then 'worker' else 'customer' end;
  v_name     text  := nullif(btrim(coalesce(m ->> 'full_name', '')), '');
  v_phone    text  := nullif(btrim(coalesce(m ->> 'phone', '')), '');
  v_lang     text  := coalesce(nullif(m ->> 'preferred_language', ''), 'en');
  v_cat      uuid;
  v_langs    text[] := '{}';
  v_lat      double precision;
  v_lng      double precision;
  v_skill    text;
begin
  v_name := coalesce(v_name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'User');
  if char_length(v_name) < 2 then v_name := v_name || ' .'; end if;
  v_name := left(v_name, 100);
  if v_phone is not null and v_phone !~ '^[0-9+() -]{7,20}$' then v_phone := null; end if;
  if v_lang !~ '^[a-z]{2,3}$' then v_lang := 'en'; end if;

  insert into public.profiles (id, full_name, role, phone, email, preferred_language, default_locality)
  values (new.id, v_name, v_role, v_phone, new.email, v_lang,
          left(nullif(btrim(coalesce(m ->> 'default_locality', '')), ''), 120));

  if v_role = 'worker' then
    select id into v_cat from public.service_categories
      where slug = m ->> 'category_slug' and is_active;
    if v_cat is null then select id into v_cat from public.service_categories where slug = 'other'; end if;

    if jsonb_typeof(m -> 'languages') = 'array' then
      select coalesce(array_agg(distinct left(l, 30)), '{}') into v_langs
      from (select jsonb_array_elements_text(m -> 'languages') as l limit 12) q where btrim(l) <> '';
    end if;

    if (m ->> 'latitude') ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' and (m ->> 'longitude') ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
      v_lat := (m ->> 'latitude')::double precision;
      v_lng := (m ->> 'longitude')::double precision;
      if abs(v_lat) > 90 or abs(v_lng) > 180 then v_lat := null; v_lng := null; end if;
    end if;

    insert into public.worker_profiles (
      id, primary_category_id, description, experience_years, indicative_price, pricing_unit,
      latitude, longitude, locality, city, service_radius_km, languages)
    values (
      new.id, v_cat,
      left(nullif(btrim(coalesce(m ->> 'description', '')), ''), 1000),
      case when (m ->> 'experience_years') ~ '^[0-9]{1,2}$' then least((m ->> 'experience_years')::int, 70) else 0 end,
      case when (m ->> 'indicative_price') ~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then (m ->> 'indicative_price')::numeric else 0 end,
      case when m ->> 'pricing_unit' in ('per_day', 'per_visit', 'per_task', 'per_sq_ft', 'per_hour')
           then m ->> 'pricing_unit' else 'per_day' end,
      v_lat, v_lng,
      coalesce(left(nullif(btrim(coalesce(m ->> 'locality', '')), ''), 120), 'Not set'),
      coalesce(left(nullif(btrim(coalesce(m ->> 'city', '')), ''), 80), 'Not set'),
      case when (m ->> 'service_radius_km') ~ '^[0-9]{1,3}$'
           then greatest(1, least((m ->> 'service_radius_km')::int, 100)) else 10 end,
      v_langs);

    if jsonb_typeof(m -> 'skills') = 'array' then
      for v_skill in select jsonb_array_elements_text(m -> 'skills') limit 15 loop
        v_skill := btrim(v_skill);
        if char_length(v_skill) between 2 and 60 then
          insert into public.worker_skills (worker_id, category_id, skill_name)
          values (new.id, v_cat, v_skill) on conflict do nothing;
        end if;
      end loop;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- public views
-- Public views deliberately run with the owner's rights so anonymous visitors can browse
-- workers without gaining access to the underlying tables. They expose NO phone, e-mail,
-- exact coordinates or address; only locality/city.
create view public.public_worker_profiles as
select w.id, p.full_name, p.avatar_url,
       w.primary_category_id, c.name as category_name, c.name_hi as category_name_hi,
       c.slug as category_slug, c.icon as category_icon,
       w.description, w.experience_years, w.indicative_price, w.pricing_unit,
       w.locality, w.city, w.service_radius_km, w.languages, w.verification_status,
       w.working_days, w.work_start, w.work_end, w.slot_minutes,
       w.rating_avg, w.review_count, w.is_demo,
       (w.latitude is not null) as has_coordinates,
       coalesce((select array_agg(s.skill_name order by s.skill_name)
                 from public.worker_skills s where s.worker_id = w.id), '{}') as skills
from public.worker_profiles w
join public.profiles p on p.id = w.id
join public.service_categories c on c.id = w.primary_category_id
where w.is_active;

create view public.public_reviews as
select r.id, r.worker_id, r.rating, r.review_text, r.created_at, r.is_demo,
       split_part(p.full_name, ' ', 1) ||
         coalesce(' ' || nullif(left(split_part(p.full_name, ' ', 2), 1), '') || '.', '') as reviewer_name
from public.reviews r
join public.profiles p on p.id = r.customer_id;

-- ---------------------------------------------------------------- grants
-- (the weekly schedule columns are changed through set_work_schedule(), not directly)
revoke all on all tables in schema public from anon, authenticated;

grant select on public.service_categories, public.public_worker_profiles, public.public_reviews to anon, authenticated;
grant select on public.worker_skills to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url, preferred_language, default_locality) on public.profiles to authenticated;

grant select on public.worker_profiles to authenticated;
grant update (primary_category_id, description, experience_years, indicative_price, pricing_unit,
              latitude, longitude, locality, city, service_radius_km, languages)
  on public.worker_profiles to authenticated;

grant insert, update, delete on public.worker_skills to authenticated;
grant select on public.worker_availability to authenticated;       -- writes go through set_availability()
grant select on public.visit_requests to authenticated;            -- writes go through RPC functions
grant select on public.reviews to authenticated;                   -- writes go through submit_review()
grant select, delete on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant select, insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;
grant insert, update, delete on public.service_categories to authenticated;
-- public.admins: no grants at all.

-- ---------------------------------------------------------------- RLS
alter table public.profiles            enable row level security;
alter table public.admins              enable row level security;
alter table public.service_categories  enable row level security;
alter table public.worker_profiles     enable row level security;
alter table public.worker_skills       enable row level security;
alter table public.worker_availability enable row level security;
alter table public.visit_requests      enable row level security;
alter table public.reviews             enable row level security;
alter table public.notifications       enable row level security;
alter table public.reports             enable row level security;

-- profiles: private; public identity is exposed only through the public views
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- service categories
create policy categories_select on public.service_categories for select to anon, authenticated
  using (is_active or public.is_admin());
create policy categories_insert on public.service_categories for insert to authenticated
  with check (public.is_admin());
create policy categories_update on public.service_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy categories_delete on public.service_categories for delete to authenticated
  using (public.is_admin());

-- worker profiles (exact coordinates live here: owner/admin only)
create policy worker_select on public.worker_profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy worker_update on public.worker_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- skills: not sensitive, readable by all; only the owner can change them
create policy skills_select on public.worker_skills for select to anon, authenticated using (true);
create policy skills_insert on public.worker_skills for insert to authenticated with check (worker_id = auth.uid());
create policy skills_update on public.worker_skills for update to authenticated
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());
create policy skills_delete on public.worker_skills for delete to authenticated using (worker_id = auth.uid());

-- availability overrides: only the worker can read them; customers use get_worker_calendar()
create policy availability_select on public.worker_availability for select to authenticated
  using (worker_id = auth.uid() or public.is_admin());

-- visits: a customer can read their own; workers read theirs via worker_visit_requests() (masked)
create policy visits_select on public.visit_requests for select to authenticated
  using (customer_id = auth.uid());

-- reviews: participants read the raw row; the public reads public_reviews
create policy reviews_select on public.reviews for select to authenticated
  using (customer_id = auth.uid() or worker_id = auth.uid() or public.is_admin());

-- notifications
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- reports
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy reports_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
