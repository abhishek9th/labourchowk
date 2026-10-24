-- Labour Chowk :: 0005 Work Portfolio + Digital Skill Passport
-- (1) permanent public_id, public visibility, contact-consent flags
-- (2) portfolio projects/images with RLS, triggers and public views
-- (3) hidden workers disappear from every public surface

-- ================================================================ permanent public id
-- 10 characters from a 32-symbol alphabet (no I, O, 0, 1) taken from a CSPRNG (gen_random_uuid),
-- ~50 bits. Never derived from phone/e-mail/name. UNIQUE in the database is the final authority.
create or replace function public.generate_public_id() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_id text;
  v_hex text;
  i int;
begin
  loop
    -- bytes 0-4 of the first uuid and 10-14 of the second avoid the fixed version/variant bits
    v_hex := replace(gen_random_uuid()::text, '-', '');
    v_id := '';
    for i in 0..4 loop
      v_id := v_id || substr(alphabet, (get_byte(decode(substr(v_hex, i * 2 + 1, 2), 'hex'), 0) % 32) + 1, 1);
    end loop;
    v_hex := replace(gen_random_uuid()::text, '-', '');
    for i in 10..14 loop
      v_id := v_id || substr(alphabet, (get_byte(decode(substr(v_hex, i * 2 + 1, 2), 'hex'), 0) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.worker_profiles where public_id = v_id);
  end loop;
  return v_id;
end $$;

alter table public.worker_profiles
  add column public_id       text    not null default public.generate_public_id(),
  add column is_public       boolean not null default true,    -- worker can hide their public profile
  add column share_phone     boolean not null default false,   -- consent: click-to-call
  add column share_whatsapp  boolean not null default false;   -- consent: WhatsApp link
alter table public.worker_profiles
  add constraint worker_public_id_key unique (public_id),
  add constraint worker_public_id_format check (public_id ~ '^[A-HJ-NP-Z2-9]{10}$');

create or replace function public.trg_public_id_immutable() returns trigger
language plpgsql as $$
begin
  if new.public_id is distinct from old.public_id then
    raise exception 'ERR_PUBLIC_ID_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger trg_worker_public_id_immutable before update on public.worker_profiles
  for each row execute function public.trg_public_id_immutable();

-- owners may change visibility/consent (never public_id)
grant update (is_public, share_phone, share_whatsapp) on public.worker_profiles to authenticated;

-- ================================================================ portfolio tables
create table public.worker_portfolio_projects (
  id                 uuid primary key default gen_random_uuid(),
  worker_id          uuid not null references public.worker_profiles(id) on delete cascade,
  title              text not null check (char_length(btrim(title)) between 3 and 120),
  description        text check (description is null or char_length(description) <= 1000),
  category_id        uuid references public.service_categories(id) on delete set null,
  location_label     text check (location_label is null or char_length(btrim(location_label)) between 2 and 120),
  completed_at       date not null check (completed_at >= date '2000-01-01'),  -- always the 1st of the month (trigger)
  project_area_sqft  numeric(10,1) check (project_area_sqft is null or project_area_sqft between 1 and 10000000),
  project_price      numeric(12,2) check (project_price is null or project_price between 0 and 100000000),
  project_price_unit text check (project_price_unit is null or project_price_unit in
                       ('per_day', 'per_visit', 'per_task', 'per_sq_ft', 'per_hour')),
  project_tags       text[] not null default '{}' check (cardinality(project_tags) <= 8),
  is_published       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint portfolio_price_pair check ((project_price is null) = (project_price_unit is null))
);
create index portfolio_projects_worker_idx on public.worker_portfolio_projects (worker_id, completed_at desc);
create index portfolio_projects_category_idx on public.worker_portfolio_projects (category_id);
create trigger trg_portfolio_projects_touch before update on public.worker_portfolio_projects
  for each row execute function public.touch_updated_at();

create table public.worker_portfolio_images (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.worker_portfolio_projects(id) on delete cascade,
  -- <worker_id>/<project_id>/<uuid>.<ext> inside the `portfolio` storage bucket
  storage_path  text not null unique check (storage_path ~
                  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  display_order int not null default 0 check (display_order >= 0),
  is_cover      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index portfolio_images_project_idx on public.worker_portfolio_images (project_id, display_order);
create unique index portfolio_one_cover on public.worker_portfolio_images (project_id) where is_cover;

-- ---------------------------------------------------------------- project triggers
create or replace function public.trg_portfolio_project_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tags text[];
begin
  new.completed_at := date_trunc('month', new.completed_at)::date;
  if new.completed_at > public.app_today() then raise exception 'ERR_FUTURE_DATE'; end if;
  -- tags: trimmed, lower-cased, de-duplicated, max 30 characters each
  select coalesce(array_agg(distinct left(lower(btrim(t)), 30)), '{}') into v_tags
  from unnest(new.project_tags) t where btrim(t) <> '';
  new.project_tags := v_tags;
  if cardinality(v_tags) > 8 then raise exception 'ERR_INVALID_INPUT'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.worker_portfolio_projects where worker_id = new.worker_id) >= 30 then
    raise exception 'ERR_TOO_MANY_PROJECTS';
  end if;
  return new;
end $$;
create trigger trg_portfolio_project_rules before insert or update on public.worker_portfolio_projects
  for each row execute function public.trg_portfolio_project_rules();

-- ---------------------------------------------------------------- image triggers
create or replace function public.trg_portfolio_image_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select worker_id into v_owner from public.worker_portfolio_projects where id = new.project_id;
  if v_owner is null then raise exception 'ERR_NOT_FOUND'; end if;
  -- the file must live in the owner's own folder, under this very project
  if split_part(new.storage_path, '/', 1) <> v_owner::text or split_part(new.storage_path, '/', 2) <> new.project_id::text then
    raise exception 'ERR_INVALID_PATH';
  end if;
  if (select count(*) from public.worker_portfolio_images where project_id = new.project_id) >= 10 then
    raise exception 'ERR_TOO_MANY_PHOTOS';
  end if;
  new.display_order := coalesce((select max(display_order) + 1 from public.worker_portfolio_images where project_id = new.project_id), 0);
  new.is_cover := false;    -- the after-insert trigger promotes the first photo
  return new;
end $$;
create trigger trg_portfolio_image_before before insert on public.worker_portfolio_images
  for each row execute function public.trg_portfolio_image_before();

create or replace function public.trg_portfolio_image_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.worker_portfolio_images where project_id = new.project_id and is_cover) then
      update public.worker_portfolio_images set is_cover = true where id = new.id;
    end if;
  elsif old.is_cover then   -- deleted the cover: promote the next photo
    update public.worker_portfolio_images set is_cover = true
    where id = (select id from public.worker_portfolio_images where project_id = old.project_id order by display_order, created_at limit 1);
  end if;
  return null;
end $$;
create trigger trg_portfolio_image_after after insert or delete on public.worker_portfolio_images
  for each row execute function public.trg_portfolio_image_after();

-- atomically re-order photos and choose the cover
create or replace function public.set_portfolio_images_layout(p_project uuid, p_ordered uuid[], p_cover uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.worker_portfolio_projects where id = p_project and worker_id = auth.uid()) then
    raise exception 'ERR_NOT_FOUND';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_ids from public.worker_portfolio_images where project_id = p_project;
  if v_ids is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_ordered) x)
     or cardinality(v_ids) = 0 or not (p_cover = any (p_ordered)) then
    raise exception 'ERR_INVALID_INPUT';
  end if;
  update public.worker_portfolio_images set is_cover = false where project_id = p_project;
  update public.worker_portfolio_images i set display_order = o.pos - 1
    from unnest(p_ordered) with ordinality as o(id, pos) where i.id = o.id;
  update public.worker_portfolio_images set is_cover = true where id = p_cover;
end $$;

-- ---------------------------------------------------------------- RLS (owner only; the public reads views)
alter table public.worker_portfolio_projects enable row level security;
alter table public.worker_portfolio_images   enable row level security;
revoke all on public.worker_portfolio_projects, public.worker_portfolio_images from anon, authenticated;

grant select, delete on public.worker_portfolio_projects to authenticated;
grant insert (worker_id, title, description, category_id, location_label, completed_at, project_area_sqft,
              project_price, project_price_unit, project_tags, is_published)
  on public.worker_portfolio_projects to authenticated;
grant update (title, description, category_id, location_label, completed_at, project_area_sqft,
              project_price, project_price_unit, project_tags, is_published)
  on public.worker_portfolio_projects to authenticated;
grant select, insert, delete on public.worker_portfolio_images to authenticated;   -- order/cover only via the RPC

create policy portfolio_projects_select on public.worker_portfolio_projects for select to authenticated using (worker_id = auth.uid());
create policy portfolio_projects_insert on public.worker_portfolio_projects for insert to authenticated with check (worker_id = auth.uid());
create policy portfolio_projects_update on public.worker_portfolio_projects for update to authenticated
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());
create policy portfolio_projects_delete on public.worker_portfolio_projects for delete to authenticated using (worker_id = auth.uid());

create policy portfolio_images_select on public.worker_portfolio_images for select to authenticated
  using (exists (select 1 from public.worker_portfolio_projects p where p.id = project_id and p.worker_id = auth.uid()));
create policy portfolio_images_insert on public.worker_portfolio_images for insert to authenticated
  with check (exists (select 1 from public.worker_portfolio_projects p where p.id = project_id and p.worker_id = auth.uid()));
create policy portfolio_images_delete on public.worker_portfolio_images for delete to authenticated
  using (exists (select 1 from public.worker_portfolio_projects p where p.id = project_id and p.worker_id = auth.uid()));

-- ================================================================ public views
-- Only published projects of workers whose public profile is ON and active. No private columns.
create view public.public_portfolio_projects as
select p.id, p.worker_id, p.title, p.description, p.category_id, c.name as category_name, c.name_hi as category_name_hi,
       p.location_label, p.completed_at, p.project_area_sqft, p.project_price, p.project_price_unit, p.project_tags,
       p.created_at,
       (select count(*) from public.worker_portfolio_images i where i.project_id = p.id)::int as image_count
from public.worker_portfolio_projects p
join public.worker_profiles w on w.id = p.worker_id
left join public.service_categories c on c.id = p.category_id
where p.is_published and w.is_public and w.is_active;

create view public.public_portfolio_images as
select i.id, i.project_id, p.worker_id, i.storage_path, i.display_order, i.is_cover
from public.worker_portfolio_images i
join public.worker_portfolio_projects p on p.id = i.project_id
join public.worker_profiles w on w.id = p.worker_id
where p.is_published and w.is_public and w.is_active;

grant select on public.public_portfolio_projects, public.public_portfolio_images to anon, authenticated;

-- existing public views now honour public visibility (columns only appended -> CREATE OR REPLACE is allowed)
create or replace view public.public_worker_profiles as
select w.id, p.full_name, p.avatar_url,
       w.primary_category_id, c.name as category_name, c.name_hi as category_name_hi,
       c.slug as category_slug, c.icon as category_icon,
       w.description, w.experience_years, w.indicative_price, w.pricing_unit,
       w.locality, w.city, w.service_radius_km, w.languages, w.verification_status,
       w.working_days, w.work_start, w.work_end, w.slot_minutes,
       w.rating_avg, w.review_count, w.is_demo,
       (w.latitude is not null) as has_coordinates,
       coalesce((select array_agg(s.skill_name order by s.skill_name)
                 from public.worker_skills s where s.worker_id = w.id), '{}') as skills,
       w.public_id,
       (select count(*) from public.public_portfolio_projects pp where pp.worker_id = w.id)::int as portfolio_count
from public.worker_profiles w
join public.profiles p on p.id = w.id
join public.service_categories c on c.id = w.primary_category_id
where w.is_active and w.is_public;

create or replace view public.public_reviews as
select r.id, r.worker_id, r.rating, r.review_text, r.created_at, r.is_demo,
       split_part(p.full_name, ' ', 1) ||
         coalesce(' ' || nullif(left(split_part(p.full_name, ' ', 2), 1), '') || '.', '') as reviewer_name
from public.reviews r
join public.profiles p on p.id = r.customer_id
join public.worker_profiles w on w.id = r.worker_id
where w.is_public and w.is_active;

-- ================================================================ passport functions
-- /p/:publicId -> worker id, or NULL when missing OR hidden (the two cases are indistinguishable)
create or replace function public.resolve_public_id(p_public_id text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.worker_profiles
  where public_id = upper(btrim(p_public_id)) and is_public and is_active
$$;

-- Contact details: returns a row ONLY if the worker opted in. The number is never in any view.
create or replace function public.get_public_contact(p_worker uuid)
returns table (allow_call boolean, allow_whatsapp boolean, phone text)
language sql stable security definer set search_path = public as $$
  select w.share_phone, w.share_whatsapp, p.phone
  from public.worker_profiles w join public.profiles p on p.id = w.id
  where w.id = p_worker and w.is_public and w.is_active and (w.share_phone or w.share_whatsapp) and p.phone is not null
$$;

-- hidden workers: no calendar, slots, distance or new requests for anyone but the worker themselves
create or replace function public.get_available_slots(p_worker uuid, p_date date)
returns table (slot_start time, slot_end time, is_available boolean)
language sql stable security definer set search_path = public as $$
  select s.slot_start, s.slot_end, public._slot_free(p_worker, p_date, s.slot_start, s.slot_end)
  from public._slots(p_worker, p_date) s
  where exists (select 1 from public.worker_profiles w where w.id = p_worker and w.is_active
                and (w.is_public or w.id = auth.uid()))
  order by s.slot_start
$$;

create or replace function public.get_worker_calendar(p_worker uuid, p_from date, p_to date)
returns table (day date, state text, free_slots int, is_extra_day boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_to < p_from or p_to - p_from > 124 then raise exception 'ERR_INVALID_RANGE'; end if;
  return query
  select d::date,
         case
           when d::date < public.app_today() then 'past'
           when exists (select 1 from public.worker_availability a where a.worker_id = p_worker
                        and a.date = d::date and a.availability_status = 'blocked') then 'blocked'
           when not public._schedule_open(p_worker, d::date) then 'off'
           when public._free_slot_count(p_worker, d::date) = 0 then 'full'
           else 'available'
         end,
         case when d::date < public.app_today() then 0 else public._free_slot_count(p_worker, d::date) end,
         exists (select 1 from public.worker_availability a where a.worker_id = p_worker
                 and a.date = d::date and a.availability_status = 'available')
  from generate_series(p_from, p_to, interval '1 day') d
  where exists (select 1 from public.worker_profiles w where w.id = p_worker and w.is_active
                and (w.is_public or w.id = auth.uid()));
end $$;

create or replace function public.worker_distance(p_worker uuid, p_lat double precision, p_lng double precision)
returns numeric language sql stable security definer set search_path = public as $$
  select round(public.haversine_km(p_lat, p_lng, w.latitude, w.longitude)::numeric, 1)
  from public.worker_profiles w where w.id = p_worker and w.is_active and w.is_public
$$;

create or replace function public.trg_visit_requires_public() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.worker_profiles where id = new.worker_id and is_public and is_active) then
    raise exception 'ERR_WORKER_NOT_FOUND';
  end if;
  return new;
end $$;
create trigger trg_visit_requires_public before insert on public.visit_requests
  for each row execute function public.trg_visit_requires_public();

create or replace function public.record_profile_view(p_worker uuid) returns void
language sql security definer set search_path = public as $$
  update public.worker_profiles set profile_views = profile_views + 1
  where id = p_worker and is_active and is_public and id is distinct from auth.uid()
$$;

-- ================================================================ search: portfolio thumbnail + project count
-- (the return type changes, so the function is dropped and re-created)
drop function public.search_workers(text, double precision, double precision, text, numeric, numeric, numeric, numeric, int, date, text[], text, text, int, int);

create or replace function public.search_workers(
  p_category_slug   text    default null,
  p_lat             double precision default null,
  p_lng             double precision default null,
  p_locality        text    default null,
  p_max_distance_km numeric default null,
  p_min_rating      numeric default null,
  p_min_price       numeric default null,
  p_max_price       numeric default null,
  p_min_experience  int     default null,
  p_date            date    default null,
  p_languages       text[]  default null,
  p_query           text    default null,
  p_sort            text    default 'nearest',
  p_limit           int     default 60,
  p_offset          int     default 0)
returns table (
  id uuid, full_name text, avatar_url text, description text,
  category_name text, category_name_hi text, category_slug text, category_icon text,
  experience_years int, indicative_price numeric, pricing_unit text,
  locality text, city text, languages text[], skills text[], verification_status text,
  rating_avg numeric, review_count int, is_demo boolean,
  distance_km numeric, locality_match boolean, serves_area boolean,
  next_available date, available_on_date boolean, cover_path text, portfolio_count int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_sort text := case when p_sort in ('nearest', 'rating', 'price_low', 'price_high', 'reviews', 'soonest')
                      then p_sort else 'nearest' end;
  v_loc  text := nullif(lower(btrim(coalesce(p_locality, ''))), '');
  v_q    text := nullif(lower(btrim(coalesce(p_query, ''))), '');
begin
  return query
  with c as (
    select v.id, v.full_name, v.avatar_url, v.description,
           v.category_name, v.category_name_hi, v.category_slug, v.category_icon,
           v.experience_years, v.indicative_price, v.pricing_unit, v.locality, v.city,
           v.languages, v.skills, v.verification_status, v.rating_avg, v.review_count, v.is_demo,
           w.latitude as w_lat, w.longitude as w_lng, w.service_radius_km
    from public.public_worker_profiles v
    join public.worker_profiles w on w.id = v.id
    where (p_category_slug is null or v.category_slug = p_category_slug
           or exists (select 1 from public.worker_skills s
                      join public.service_categories sc on sc.id = s.category_id
                      where s.worker_id = v.id and sc.slug = p_category_slug))
      and (p_min_rating is null or (v.review_count > 0 and v.rating_avg >= p_min_rating))
      and (p_min_price is null or v.indicative_price >= p_min_price)
      and (p_max_price is null or v.indicative_price <= p_max_price)
      and (p_min_experience is null or v.experience_years >= p_min_experience)
      and (p_languages is null or cardinality(p_languages) = 0 or v.languages && p_languages)
      and (v_q is null or lower(v.full_name) like '%' || v_q || '%'
           or lower(coalesce(v.description, '')) like '%' || v_q || '%'
           or exists (select 1 from unnest(v.skills) sk where lower(sk) like '%' || v_q || '%'))
  ), d as (
    select c.*,
           case when p_lat is not null and p_lng is not null
                then round(public.haversine_km(p_lat, p_lng, c.w_lat, c.w_lng)::numeric, 1) end as distance_km,
           (v_loc is not null and (position(v_loc in lower(c.locality)) > 0 or position(v_loc in lower(c.city)) > 0)) as locality_match
    from c
  ), e as (
    select d.*, public.next_available_date(d.id) as next_av,
           case when p_date is not null then public._free_slot_count(d.id, p_date) > 0 end as avail_on,
           (select i.storage_path from public.worker_portfolio_images i
              join public.worker_portfolio_projects pp on pp.id = i.project_id
             where pp.worker_id = d.id and pp.is_published
             order by pp.completed_at desc, pp.created_at desc, i.is_cover desc, i.display_order limit 1) as cover_v,
           (select count(*) from public.worker_portfolio_projects pp where pp.worker_id = d.id and pp.is_published)::int as pcount
    from d
    where (p_max_distance_km is null or p_lat is null or p_lng is null
           or (d.distance_km is not null and d.distance_km <= p_max_distance_km)
           or (d.distance_km is null and d.locality_match))
  )
  select e.id, e.full_name, e.avatar_url, e.description,
         e.category_name, e.category_name_hi, e.category_slug, e.category_icon,
         e.experience_years, e.indicative_price, e.pricing_unit, e.locality, e.city,
         e.languages, e.skills, e.verification_status, e.rating_avg, e.review_count, e.is_demo,
         e.distance_km, e.locality_match,
         case when e.distance_km is null then null else e.distance_km <= e.service_radius_km end,
         e.next_av, e.avail_on, e.cover_v, e.pcount
  from e
  where p_date is null or e.avail_on
  order by
    case when v_sort = 'nearest'    then e.distance_km end asc nulls last,
    case when v_sort = 'nearest'    then e.locality_match end desc,
    case when v_sort = 'rating'     then e.rating_avg end desc,
    case when v_sort = 'price_low'  then nullif(e.indicative_price, 0) end asc nulls last,
    case when v_sort = 'price_high' then e.indicative_price end desc,
    case when v_sort = 'reviews'    then e.review_count end desc,
    case when v_sort = 'soonest'    then e.next_av end asc nulls last,
    e.distance_km asc nulls last, e.rating_avg desc, e.review_count desc, e.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ================================================================ execute privileges for the new / re-created functions
revoke all on function public.generate_public_id(), public.trg_public_id_immutable(), public.trg_portfolio_project_rules(),
  public.trg_portfolio_image_before(), public.trg_portfolio_image_after(), public.trg_visit_requires_public(),
  public.resolve_public_id(text), public.get_public_contact(uuid), public.set_portfolio_images_layout(uuid, uuid[], uuid),
  public.get_available_slots(uuid, date), public.get_worker_calendar(uuid, date, date),
  public.worker_distance(uuid, double precision, double precision), public.record_profile_view(uuid),
  public.search_workers(text, double precision, double precision, text, numeric, numeric, numeric, numeric, int, date, text[], text, text, int, int) from public, anon, authenticated;

grant execute on function
  public.resolve_public_id(text), public.get_public_contact(uuid),
  public.get_available_slots(uuid, date), public.get_worker_calendar(uuid, date, date),
  public.worker_distance(uuid, double precision, double precision), public.record_profile_view(uuid),
  public.search_workers(text, double precision, double precision, text, numeric, numeric, numeric, numeric, int, date, text[], text, text, int, int)
  to anon, authenticated;
grant execute on function public.set_portfolio_images_layout(uuid, uuid[], uuid) to authenticated;
