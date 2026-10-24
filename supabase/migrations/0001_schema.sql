-- Labour Chowk :: 0001 schema
-- Tables, constraints, indexes, triggers. RLS is in 0002, RPC functions in 0003.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- helpers
create or replace function public.app_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.app_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Asia/Kolkata') $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- great-circle distance in km (haversine)
create or replace function public.haversine_km(lat1 double precision, lon1 double precision,
                                               lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
  else 2 * 6371.0088 * asin(least(1.0, sqrt(
         power(sin(radians(lat2 - lat1) / 2), 2) +
         cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))) end
$$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  full_name          text not null check (char_length(btrim(full_name)) between 2 and 100),
  role               text not null check (role in ('customer', 'worker')),
  phone              text check (phone is null or phone ~ '^[0-9+() -]{7,20}$'),
  email              text,
  avatar_url         text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  preferred_language text not null default 'en' check (preferred_language ~ '^[a-z]{2,3}$'),
  default_locality   text check (default_locality is null or char_length(default_locality) <= 120),
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Administrators are NOT a role on profiles (users can't grant it to themselves).
-- Rows are inserted only with SQL / service role. See README.
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- categories
create table public.service_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 60),
  name_hi     text,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon        text not null default 'hammer',
  description text,
  is_active   boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- workers
create table public.worker_profiles (
  id                  uuid primary key references public.profiles(id) on delete cascade, -- = auth user id
  primary_category_id uuid not null references public.service_categories(id) on delete restrict,
  description         text check (description is null or char_length(description) <= 1000),
  experience_years    int not null default 0 check (experience_years between 0 and 70),
  indicative_price    numeric(10,2) not null default 0 check (indicative_price >= 0 and indicative_price <= 1000000),
  pricing_unit        text not null default 'per_day'
                        check (pricing_unit in ('per_day', 'per_visit', 'per_task', 'per_sq_ft', 'per_hour')),
  latitude            double precision check (latitude between -90 and 90),
  longitude           double precision check (longitude between -180 and 180),
  locality            text not null check (char_length(btrim(locality)) between 2 and 120),
  city                text not null check (char_length(btrim(city)) between 2 and 80),
  service_radius_km   int not null default 10 check (service_radius_km between 1 and 100),
  languages           text[] not null default '{}' check (cardinality(languages) <= 12),
  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  -- schedule: 0 = Sunday ... 6 = Saturday
  working_days        smallint[] not null default '{1,2,3,4,5,6}'
                        check (working_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  work_start          time not null default '09:00',
  work_end            time not null default '18:00',
  slot_minutes        int not null default 60 check (slot_minutes in (30, 60, 90, 120)),
  -- maintained by the server, never writable by the client
  profile_views       int not null default 0,
  rating_avg          numeric(3,2) not null default 0,
  review_count        int not null default 0,
  is_active           boolean not null default true,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint work_hours_valid check (work_end > work_start),
  constraint coords_together check ((latitude is null) = (longitude is null))
);
create index worker_profiles_category_idx on public.worker_profiles (primary_category_id) where is_active;
create index worker_profiles_city_idx on public.worker_profiles (lower(city), lower(locality));
create index worker_profiles_geo_idx on public.worker_profiles (latitude, longitude);
create trigger trg_worker_profiles_touch before update on public.worker_profiles
  for each row execute function public.touch_updated_at();

create table public.worker_skills (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.worker_profiles(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  skill_name  text not null check (char_length(btrim(skill_name)) between 2 and 60),
  created_at  timestamptz not null default now()
);
create unique index worker_skills_unique on public.worker_skills (worker_id, lower(skill_name));
create index worker_skills_category_idx on public.worker_skills (category_id);

-- Manual overrides of the weekly schedule.
--   blocked   : the worker is unavailable on this date (leave, festival, other job ...)
--   available : the worker is open on a date that is normally a day off
-- Dates that are busy because of accepted visits are NOT stored here; they are
-- derived from visit_requests so the two can never drift apart.
create table public.worker_availability (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references public.worker_profiles(id) on delete cascade,
  date                date not null,
  start_time          time,
  end_time            time,
  availability_status text not null check (availability_status in ('blocked', 'available')),
  created_at          timestamptz not null default now(),
  constraint availability_times_valid check ((start_time is null) = (end_time is null)
                                            and (end_time is null or end_time > start_time)),
  unique (worker_id, date)
);
create index worker_availability_lookup on public.worker_availability (worker_id, date);

-- ---------------------------------------------------------------- visits
create table public.visit_requests (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.profiles(id) on delete cascade,
  worker_id          uuid not null references public.worker_profiles(id) on delete cascade,
  category_id        uuid not null references public.service_categories(id) on delete restrict,
  requested_date     date not null,
  start_time         time not null,
  end_time           time not null,
  customer_locality  text not null check (char_length(btrim(customer_locality)) between 2 and 120),
  customer_address   text check (customer_address is null or char_length(customer_address) <= 300),
  customer_latitude  double precision check (customer_latitude between -90 and 90),
  customer_longitude double precision check (customer_longitude between -180 and 180),
  job_description    text not null check (char_length(btrim(job_description)) between 10 and 1000),
  status             text not null default 'pending'
                       check (status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  status_reason      text,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint visit_time_valid check (end_time > start_time),
  constraint visit_not_self check (customer_id <> worker_id),
  -- Two accepted visits for one worker may never overlap. This is the hard
  -- guarantee behind the friendly checks in the RPC functions (race-proof).
  constraint no_overlapping_accepted exclude using gist (
    worker_id with =,
    tsrange(requested_date + start_time, requested_date + end_time, '[)') with &&
  ) where (status = 'accepted')
);
-- A customer cannot submit the same slot to the same worker twice.
create unique index visit_no_duplicate_open on public.visit_requests
  (customer_id, worker_id, requested_date, start_time) where status in ('pending', 'accepted');
create index visit_worker_idx on public.visit_requests (worker_id, requested_date, status);
create index visit_customer_idx on public.visit_requests (customer_id, requested_date desc);
create trigger trg_visit_touch before update on public.visit_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- reviews
create table public.reviews (
  id               uuid primary key default gen_random_uuid(),
  visit_request_id uuid not null unique references public.visit_requests(id) on delete cascade,
  customer_id      uuid not null references public.profiles(id) on delete cascade,
  worker_id        uuid not null references public.worker_profiles(id) on delete cascade,
  rating           int not null check (rating between 1 and 5),
  review_text      text check (review_text is null or char_length(review_text) <= 1000),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint review_not_self check (customer_id <> worker_id)
);
create index reviews_worker_idx on public.reviews (worker_id, created_at desc);

-- keep worker_profiles.rating_avg / review_count in sync with real reviews
create or replace function public.refresh_worker_rating(p_worker uuid) returns void
language sql security definer set search_path = public as $$
  update public.worker_profiles w set
    rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where worker_id = p_worker), 0),
    review_count = (select count(*) from public.reviews where worker_id = p_worker)
  where w.id = p_worker
$$;

create or replace function public.trg_reviews_refresh() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_worker_rating(coalesce(new.worker_id, old.worker_id));
  return null;
end $$;
create trigger trg_reviews_after after insert or update or delete on public.reviews
  for each row execute function public.trg_reviews_refresh();

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  title              text not null,
  message            text not null,
  notification_type  text not null check (notification_type in (
    'visit_requested', 'visit_accepted', 'visit_declined', 'visit_cancelled',
    'visit_reminder', 'visit_completed', 'review_received', 'verification', 'system')),
  related_visit_id   uuid references public.visit_requests(id) on delete cascade,
  is_read            boolean not null default false,
  created_at         timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------- reports (moderation)
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('worker', 'review')),
  target_id   uuid not null,
  reason      text not null check (char_length(btrim(reason)) between 5 and 500),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------- default categories
-- Reference data (not demo data). Admins can add more from /admin/categories.
insert into public.service_categories (name, name_hi, slug, icon, description, sort_order) values
  ('Mason',                      'राजमिस्त्री',            'mason',               'brick-wall',   'Brickwork, plastering, concrete and repairs', 10),
  ('Plumber',                    'प्लंबर',                'plumber',             'wrench',       'Pipes, taps, bathroom fittings and leaks', 20),
  ('Electrician',                'इलेक्ट्रीशियन',          'electrician',         'zap',          'Wiring, fittings, switches and fault finding', 30),
  ('Painter',                    'पेंटर',                 'painter',             'paint-roller', 'Interior and exterior painting', 40),
  ('Carpenter',                  'बढ़ई',                  'carpenter',           'hammer',       'Furniture, doors, wardrobes and repairs', 50),
  ('Tile & Flooring Installer',  'टाइल और फ़र्श मिस्त्री',   'tile-flooring',       'layout-grid',  'Tiles, marble, granite and flooring', 60),
  ('Welder',                     'वेल्डर',                'welder',              'flame',        'Gates, grills, sheds and metal fabrication', 70),
  ('Construction Helper',        'मज़दूर / हेल्पर',        'construction-helper', 'hard-hat',     'General site labour and loading', 80),
  ('POP & False Ceiling Worker', 'पीओपी / फॉल्स सीलिंग',    'pop-false-ceiling',   'layers',       'Plaster of Paris and false ceilings', 90),
  ('AC & Appliance Technician',  'एसी / उपकरण तकनीशियन',   'ac-appliance',        'fan',          'AC, fridge, washing machine service', 100),
  ('Cleaner',                    'सफ़ाई कर्मी',            'cleaner',             'sparkles',     'Home, office and post-construction cleaning', 110),
  ('Other Skilled Worker',       'अन्य कुशल कारीगर',        'other',               'wrench',       'Other skilled trades', 999);
