-- Labour Chowk :: 0003 business logic
-- Everything that must be transactional or must not trust the client lives here:
-- availability, booking, status transitions, reviews, search, notifications, admin.
--
-- Errors are raised as short codes (e.g. 'ERR_DATE_BLOCKED'); the frontend maps them to
-- translated messages (src/lib/errors.ts).

-- ---------------------------------------------------------------- internal helpers
create or replace function public._notify(p_user uuid, p_type text, p_title text, p_message text,
                                          p_visit uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, notification_type, title, message, related_visit_id)
  values (p_user, p_type, p_title, p_message, p_visit)
$$;

create or replace function public._fmt_when(p_date date, p_start time) returns text
language sql immutable as $$
  select to_char(p_date, 'DD Mon YYYY') || ' at ' || to_char(p_start, 'HH12:MI AM')
$$;

-- Is the worker open (schedule + manual overrides) on that date? Ignores bookings and the clock.
create or replace function public._schedule_open(p_worker uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when exists (select 1 from public.worker_availability a
                   where a.worker_id = w.id and a.date = p_date and a.availability_status = 'blocked') then false
      when exists (select 1 from public.worker_availability a
                   where a.worker_id = w.id and a.date = p_date and a.availability_status = 'available') then true
      else extract(dow from p_date)::smallint = any (w.working_days)
    end
    from public.worker_profiles w where w.id = p_worker and w.is_active), false)
$$;

-- Bookable slots of a day derived from working hours and slot length.
create or replace function public._slots(p_worker uuid, p_date date)
returns table (slot_start time, slot_end time)
language sql stable security definer set search_path = public as $$
  select (w.work_start + (n * w.slot_minutes) * interval '1 minute')::time,
         (w.work_start + ((n + 1) * w.slot_minutes) * interval '1 minute')::time
  from public.worker_profiles w,
       generate_series(0, floor(extract(epoch from (w.work_end - w.work_start)) / 60 / w.slot_minutes)::int - 1) n
  where w.id = p_worker
$$;

-- Can this exact slot be requested/accepted right now?
create or replace function public._slot_free(p_worker uuid, p_date date, p_start time, p_end time) returns boolean
language sql stable security definer set search_path = public as $$
  select p_date >= public.app_today()
     and (p_date > public.app_today() or p_start > public.app_now()::time)
     and public._schedule_open(p_worker, p_date)
     and not exists (select 1 from public.visit_requests v
                     where v.worker_id = p_worker and v.status = 'accepted' and v.requested_date = p_date
                       and v.start_time < p_end and v.end_time > p_start)
$$;

create or replace function public._free_slot_count(p_worker uuid, p_date date) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public._slots(p_worker, p_date) s
  where public._slot_free(p_worker, p_date, s.slot_start, s.slot_end)
$$;

-- ---------------------------------------------------------------- public availability
create or replace function public.get_available_slots(p_worker uuid, p_date date)
returns table (slot_start time, slot_end time, is_available boolean)
language sql stable security definer set search_path = public as $$
  select s.slot_start, s.slot_end, public._slot_free(p_worker, p_date, s.slot_start, s.slot_end)
  from public._slots(p_worker, p_date) s
  where exists (select 1 from public.worker_profiles w where w.id = p_worker and w.is_active)
  order by s.slot_start
$$;

-- state: past | blocked (manual) | off (regular day off) | full (every slot booked) | available
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
  where exists (select 1 from public.worker_profiles w where w.id = p_worker and w.is_active);
end $$;

create or replace function public.next_available_date(p_worker uuid) returns date
language sql stable security definer set search_path = public as $$
  select d::date from generate_series(public.app_today(), public.app_today() + 59, interval '1 day') d
  where public._free_slot_count(p_worker, d::date) > 0 order by d limit 1
$$;

create or replace function public.worker_distance(p_worker uuid, p_lat double precision, p_lng double precision)
returns numeric language sql stable security definer set search_path = public as $$
  select round(public.haversine_km(p_lat, p_lng, w.latitude, w.longitude)::numeric, 1)
  from public.worker_profiles w where w.id = p_worker and w.is_active
$$;

create or replace function public.record_profile_view(p_worker uuid) returns void
language sql security definer set search_path = public as $$
  update public.worker_profiles set profile_views = profile_views + 1
  where id = p_worker and is_active and id is distinct from auth.uid()
$$;

-- ---------------------------------------------------------------- search
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
  next_available date, available_on_date boolean)
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
           case when p_date is not null then public._free_slot_count(d.id, p_date) > 0 end as avail_on
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
         e.next_av, e.avail_on
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

-- ---------------------------------------------------------------- availability management (worker)
create or replace function public._require_worker() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.worker_profiles where id = auth.uid()) then
    raise exception 'ERR_NOT_WORKER';
  end if;
end $$;

-- After the schedule changed: pending visits that no longer fit are declined (and both
-- sides told); accepted visits that no longer fit abort the whole change.
create or replace function public._reconcile_visits(p_worker uuid, p_from date default null, p_to date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  w public.worker_profiles;
  v record;
  n int := 0;
begin
  select * into w from public.worker_profiles where id = p_worker;
  for v in
    select * from public.visit_requests r
    where r.worker_id = p_worker and r.status in ('pending', 'accepted')
      and r.requested_date >= public.app_today()
      and (p_from is null or r.requested_date >= p_from) and (p_to is null or r.requested_date <= p_to)
      and (not public._schedule_open(p_worker, r.requested_date)
           or r.start_time < w.work_start or r.end_time > w.work_end)
    order by r.requested_date
  loop
    if v.status = 'accepted' then
      raise exception 'ERR_HAS_ACCEPTED_VISITS' using detail = v.requested_date::text;
    end if;
    update public.visit_requests set status = 'declined',
      status_reason = 'The worker is no longer available at this time.' where id = v.id;
    perform public._notify(v.customer_id, 'visit_declined', 'Visit request declined',
      'The worker is no longer available on ' || public._fmt_when(v.requested_date, v.start_time) ||
      '. Please pick another date or worker.', v.id);
    perform public._notify(p_worker, 'visit_declined', 'Request closed automatically',
      'A pending request for ' || public._fmt_when(v.requested_date, v.start_time) ||
      ' was declined because that time is no longer in your availability.', v.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- p_state: 'blocked' | 'available' (open on a normal day off) | 'default' (follow weekly schedule)
create or replace function public.set_availability(p_dates date[], p_state text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dates date[];
  v_declined int;
begin
  perform public._require_worker();
  if p_state not in ('blocked', 'available', 'default') then raise exception 'ERR_INVALID_INPUT'; end if;
  select coalesce(array_agg(d order by d), '{}') into v_dates from (select distinct d from unnest(p_dates) d where d is not null) q;
  if cardinality(v_dates) = 0 or cardinality(v_dates) > 62 then raise exception 'ERR_INVALID_INPUT'; end if;
  if exists (select 1 from unnest(v_dates) d where d < public.app_today()) then raise exception 'ERR_DATE_IN_PAST'; end if;

  perform 1 from public.worker_profiles where id = auth.uid() for update;   -- serialise with bookings
  delete from public.worker_availability where worker_id = auth.uid() and date = any (v_dates);
  if p_state <> 'default' then
    insert into public.worker_availability (worker_id, date, availability_status)
    select auth.uid(), d, p_state from unnest(v_dates) d;
  end if;
  v_declined := public._reconcile_visits(auth.uid(), v_dates[1], v_dates[cardinality(v_dates)]);
  return jsonb_build_object('changed', cardinality(v_dates), 'auto_declined', v_declined);
end $$;

create or replace function public.set_work_schedule(p_days smallint[], p_start time, p_end time, p_slot_minutes int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_declined int;
begin
  perform public._require_worker();
  if p_end <= p_start or p_slot_minutes not in (30, 60, 90, 120)
     or not (p_days <@ array[0,1,2,3,4,5,6]::smallint[]) or cardinality(p_days) = 0 then
    raise exception 'ERR_INVALID_INPUT';
  end if;
  perform 1 from public.worker_profiles where id = auth.uid() for update;
  update public.worker_profiles set working_days = (select array_agg(distinct d order by d) from unnest(p_days) d),
         work_start = p_start, work_end = p_end, slot_minutes = p_slot_minutes
   where id = auth.uid();
  v_declined := public._reconcile_visits(auth.uid());
  return jsonb_build_object('auto_declined', v_declined);
end $$;

-- ---------------------------------------------------------------- visit workflow
create or replace function public.create_visit_request(
  p_worker uuid, p_category uuid, p_date date, p_start time,
  p_locality text, p_address text, p_lat double precision, p_lng double precision, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_end    time;
  v_cat    uuid;
  v_id     uuid;
  v_name   text;
begin
  if auth.uid() is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  select full_name into v_name from public.profiles where id = auth.uid() and role = 'customer';
  if v_name is null then raise exception 'ERR_NOT_CUSTOMER'; end if;
  if auth.uid() = p_worker then raise exception 'ERR_SELF_BOOKING'; end if;

  if char_length(btrim(coalesce(p_description, ''))) < 10 or char_length(p_description) > 1000
     or char_length(btrim(coalesce(p_locality, ''))) < 2 or char_length(p_locality) > 120
     or char_length(coalesce(p_address, '')) > 300 then
    raise exception 'ERR_INVALID_INPUT';
  end if;
  if (select count(*) from public.visit_requests
      where customer_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'ERR_RATE_LIMIT';
  end if;

  -- serialise concurrent requests for the same worker
  perform 1 from public.worker_profiles where id = p_worker and is_active for update;
  if not found then raise exception 'ERR_WORKER_NOT_FOUND'; end if;

  if p_date < public.app_today() then raise exception 'ERR_DATE_IN_PAST'; end if;
  if exists (select 1 from public.worker_availability where worker_id = p_worker and date = p_date
             and availability_status = 'blocked') then raise exception 'ERR_DATE_BLOCKED'; end if;
  if not public._schedule_open(p_worker, p_date) then raise exception 'ERR_DATE_UNAVAILABLE'; end if;

  select s.slot_end into v_end from public._slots(p_worker, p_date) s where s.slot_start = p_start;
  if v_end is null then raise exception 'ERR_INVALID_SLOT'; end if;
  if not public._slot_free(p_worker, p_date, p_start, v_end) then raise exception 'ERR_SLOT_UNAVAILABLE'; end if;

  -- the category must be one the worker actually offers (never trust the client)
  select c.id into v_cat from public.service_categories c
  where c.id = coalesce(p_category, (select primary_category_id from public.worker_profiles where id = p_worker))
    and (c.id = (select primary_category_id from public.worker_profiles where id = p_worker)
         or exists (select 1 from public.worker_skills s where s.worker_id = p_worker and s.category_id = c.id));
  if v_cat is null then raise exception 'ERR_INVALID_CATEGORY'; end if;

  begin
    insert into public.visit_requests (customer_id, worker_id, category_id, requested_date, start_time, end_time,
      customer_locality, customer_address, customer_latitude, customer_longitude, job_description)
    values (auth.uid(), p_worker, v_cat, p_date, p_start, v_end,
      btrim(p_locality), nullif(btrim(coalesce(p_address, '')), ''), p_lat, p_lng, btrim(p_description))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ERR_DUPLICATE_REQUEST';
  end;

  perform public._notify(p_worker, 'visit_requested', 'New visit request',
    v_name || ' asked for a visit on ' || public._fmt_when(p_date, p_start) || '.', v_id);
  return v_id;
end $$;

-- p_accept = true -> accept, false -> decline.
-- Returns 'accepted' | 'declined' | 'auto_declined' (the worker was no longer available).
create or replace function public.respond_visit_request(p_visit uuid, p_accept boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.visit_requests;
  o record;
begin
  if auth.uid() is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  perform 1 from public.worker_profiles where id = auth.uid() for update;
  select * into v from public.visit_requests where id = p_visit and worker_id = auth.uid() for update;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if v.status <> 'pending' then raise exception 'ERR_INVALID_TRANSITION'; end if;

  if not p_accept then
    update public.visit_requests set status = 'declined', status_reason = left(nullif(btrim(p_reason), ''), 300) where id = v.id;
    perform public._notify(v.customer_id, 'visit_declined', 'Visit request declined',
      'Your visit request for ' || public._fmt_when(v.requested_date, v.start_time) || ' was declined.', v.id);
    return 'declined';
  end if;

  if not public._slot_free(v.worker_id, v.requested_date, v.start_time, v.end_time) then
    update public.visit_requests set status = 'declined',
      status_reason = 'The worker is no longer available at this time.' where id = v.id;
    perform public._notify(v.customer_id, 'visit_declined', 'Visit request declined',
      'The worker could not take the visit on ' || public._fmt_when(v.requested_date, v.start_time) ||
      ' because the time is no longer available.', v.id);
    return 'auto_declined';
  end if;

  begin
    update public.visit_requests set status = 'accepted' where id = v.id;
  exception when exclusion_violation then
    raise exception 'ERR_CONFLICT';
  end;
  perform public._notify(v.customer_id, 'visit_accepted', 'Visit accepted',
    'Your visit on ' || public._fmt_when(v.requested_date, v.start_time) ||
    ' was accepted. You can discuss the job and the final price at the visit.', v.id);

  -- other pending requests that now overlap are closed gracefully
  for o in
    update public.visit_requests set status = 'declined', status_reason = 'The worker accepted another visit at this time.'
    where worker_id = v.worker_id and status = 'pending' and id <> v.id and requested_date = v.requested_date
      and start_time < v.end_time and end_time > v.start_time
    returning id, customer_id, requested_date, start_time
  loop
    perform public._notify(o.customer_id, 'visit_declined', 'Visit request declined',
      'The worker is already booked for ' || public._fmt_when(o.requested_date, o.start_time) ||
      '. Please choose another time.', o.id);
  end loop;
  return 'accepted';
end $$;

create or replace function public.cancel_visit_request(p_visit uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.visit_requests;
  v_actor text;
begin
  if auth.uid() is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  select * into v from public.visit_requests where id = p_visit and auth.uid() in (customer_id, worker_id) for update;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if v.requested_date < public.app_today() then raise exception 'ERR_INVALID_TRANSITION'; end if;

  if auth.uid() = v.customer_id then
    if v.status not in ('pending', 'accepted') then raise exception 'ERR_INVALID_TRANSITION'; end if;
  else -- worker: only an accepted visit can be cancelled, a pending one must be declined
    if v.status <> 'accepted' then raise exception 'ERR_INVALID_TRANSITION'; end if;
  end if;

  update public.visit_requests set status = 'cancelled', status_reason = left(nullif(btrim(p_reason), ''), 300) where id = v.id;
  v_actor := case when auth.uid() = v.customer_id then 'the customer' else 'the worker' end;
  perform public._notify(case when auth.uid() = v.customer_id then v.worker_id else v.customer_id end,
    'visit_cancelled', 'Visit cancelled',
    'The visit on ' || public._fmt_when(v.requested_date, v.start_time) || ' was cancelled by ' || v_actor || '.', v.id);
end $$;

create or replace function public.complete_visit_request(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.visit_requests;
begin
  if auth.uid() is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  select * into v from public.visit_requests where id = p_visit and worker_id = auth.uid() for update;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if v.status <> 'accepted' then raise exception 'ERR_INVALID_TRANSITION'; end if;
  if v.requested_date > public.app_today()
     or (v.requested_date = public.app_today() and v.start_time > public.app_now()::time) then
    raise exception 'ERR_TOO_EARLY';
  end if;
  update public.visit_requests set status = 'completed' where id = v.id;
  perform public._notify(v.customer_id, 'visit_completed', 'Visit completed',
    'Your visit on ' || public._fmt_when(v.requested_date, v.start_time) || ' is marked completed. How did it go? You can leave a review.', v.id);
end $$;

-- ---------------------------------------------------------------- reviews
create or replace function public.submit_review(p_visit uuid, p_rating int, p_text text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v public.visit_requests;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  if p_rating is null or p_rating not between 1 and 5 or char_length(coalesce(p_text, '')) > 1000 then
    raise exception 'ERR_INVALID_INPUT';
  end if;
  select * into v from public.visit_requests where id = p_visit and customer_id = auth.uid() for update;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if v.customer_id = v.worker_id then raise exception 'ERR_SELF_REVIEW'; end if;
  if v.status <> 'completed' then raise exception 'ERR_NOT_COMPLETED'; end if;
  begin
    insert into public.reviews (visit_request_id, customer_id, worker_id, rating, review_text)
    values (v.id, v.customer_id, v.worker_id, p_rating, nullif(btrim(coalesce(p_text, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ERR_ALREADY_REVIEWED';
  end;
  perform public._notify(v.worker_id, 'review_received', 'New review',
    'A customer rated you ' || p_rating || ' out of 5 after your visit.', v.id);
  return v_id;
end $$;

-- ---------------------------------------------------------------- masked visit lists
-- Workers see the customer's name and locality for every request, but the street address
-- and phone number only once they have accepted (or completed) the visit.
create or replace function public.worker_visit_requests(p_id uuid default null)
returns table (
  id uuid, status text, status_reason text, requested_date date, start_time time, end_time time,
  category_name text, job_description text, customer_name text, customer_locality text,
  customer_address text, customer_phone text, created_at timestamptz, has_review boolean, is_demo boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.status, v.status_reason, v.requested_date, v.start_time, v.end_time,
         c.name, v.job_description, p.full_name, v.customer_locality,
         case when v.status in ('accepted', 'completed') then v.customer_address end,
         case when v.status in ('accepted', 'completed') then p.phone end,
         v.created_at, exists (select 1 from public.reviews r where r.visit_request_id = v.id), v.is_demo
  from public.visit_requests v
  join public.profiles p on p.id = v.customer_id
  join public.service_categories c on c.id = v.category_id
  where v.worker_id = auth.uid() and (p_id is null or v.id = p_id)
  order by v.requested_date desc, v.start_time desc
$$;

create or replace function public.customer_bookings(p_id uuid default null)
returns table (
  id uuid, status text, status_reason text, requested_date date, start_time time, end_time time,
  worker_id uuid, worker_name text, worker_avatar text, worker_locality text, worker_phone text,
  category_name text, job_description text, customer_locality text, customer_address text,
  created_at timestamptz, review_id uuid, review_rating int, is_demo boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.status, v.status_reason, v.requested_date, v.start_time, v.end_time,
         v.worker_id, p.full_name, p.avatar_url, w.locality,
         case when v.status in ('accepted', 'completed') then p.phone end,
         c.name, v.job_description, v.customer_locality, v.customer_address,
         v.created_at, r.id, r.rating, v.is_demo
  from public.visit_requests v
  join public.profiles p on p.id = v.worker_id
  join public.worker_profiles w on w.id = v.worker_id
  join public.service_categories c on c.id = v.category_id
  left join public.reviews r on r.visit_request_id = v.id
  where v.customer_id = auth.uid() and (p_id is null or v.id = p_id)
  order by v.requested_date desc, v.start_time desc
$$;

create or replace function public.worker_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w public.worker_profiles;
begin
  perform public._require_worker();
  select * into w from public.worker_profiles where id = auth.uid();
  return jsonb_build_object(
    'profile_views', w.profile_views,
    'pending',   (select count(*) from public.visit_requests where worker_id = w.id and status = 'pending' and requested_date >= public.app_today()),
    'upcoming',  (select count(*) from public.visit_requests where worker_id = w.id and status = 'accepted' and requested_date >= public.app_today()),
    'completed', (select count(*) from public.visit_requests where worker_id = w.id and status = 'completed'),
    'rating_avg', w.rating_avg,
    'review_count', w.review_count);
end $$;

-- ---------------------------------------------------------------- notifications
-- Reminders have no scheduler dependency: each user's own visits in the next 24h generate a
-- reminder (once) when they open the app. With pg_cron you can also call it for everyone.
create or replace function public.generate_upcoming_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare v record; n int := 0;
begin
  if auth.uid() is null then return 0; end if;
  for v in
    select r.* from public.visit_requests r
    where r.status = 'accepted' and auth.uid() in (r.customer_id, r.worker_id)
      and (r.requested_date + r.start_time) between public.app_now() and public.app_now() + interval '24 hours'
      and not exists (select 1 from public.notifications n
                      where n.user_id = auth.uid() and n.related_visit_id = r.id and n.notification_type = 'visit_reminder')
  loop
    perform public._notify(auth.uid(), 'visit_reminder', 'Upcoming visit',
      'Reminder: you have a visit scheduled on ' || public._fmt_when(v.requested_date, v.start_time) || '.', v.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- abuse protection on reports: at most 5 per hour per user
create or replace function public.trg_reports_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where reporter_id = new.reporter_id
      and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'ERR_RATE_LIMIT';
  end if;
  return new;
end $$;
create trigger trg_reports_limit before insert on public.reports
  for each row execute function public.trg_reports_limit();

-- ---------------------------------------------------------------- worker verification request
create or replace function public.request_verification() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_worker();
  update public.worker_profiles set verification_status = 'pending'
  where id = auth.uid() and verification_status in ('unverified', 'rejected');
end $$;

-- ---------------------------------------------------------------- admin
create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ERR_FORBIDDEN'; end if;
end $$;

create or replace function public.admin_list_workers(p_status text default null)
returns table (id uuid, full_name text, email text, phone text, category_name text, locality text, city text,
               verification_status text, is_active boolean, is_demo boolean, review_count int, rating_avg numeric,
               created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select w.id, p.full_name, p.email, p.phone, c.name, w.locality, w.city, w.verification_status,
         w.is_active, w.is_demo, w.review_count, w.rating_avg, w.created_at
  from public.worker_profiles w
  join public.profiles p on p.id = w.id
  join public.service_categories c on c.id = w.primary_category_id
  where p_status is null or w.verification_status = p_status
  order by (w.verification_status = 'pending') desc, w.created_at desc;
end $$;

create or replace function public.admin_set_verification(p_worker uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_status not in ('unverified', 'pending', 'verified', 'rejected') then raise exception 'ERR_INVALID_INPUT'; end if;
  update public.worker_profiles set verification_status = p_status where id = p_worker;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  perform public._notify(p_worker, 'verification', 'Verification update',
    case p_status when 'verified' then 'Your identity verification is complete. A verified badge now shows on your profile.'
                  when 'rejected' then 'We could not verify your identity. Please contact support.'
                  else 'Your verification status was updated to ' || p_status || '.' end);
end $$;

create or replace function public.admin_set_worker_active(p_worker uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.worker_profiles set is_active = p_active where id = p_worker;
end $$;

create or replace function public.admin_delete_review(p_review uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.reviews where id = p_review;   -- trigger refreshes the worker's rating
end $$;

create or replace function public.admin_list_reports(p_status text default 'open')
returns table (id uuid, reporter_name text, target_type text, target_id uuid, target_label text,
               reason text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select r.id, p.full_name, r.target_type, r.target_id,
         case r.target_type
           when 'worker' then (select wp.full_name from public.profiles wp where wp.id = r.target_id)
           else (select left(coalesce(rv.review_text, '(rating only)'), 120) from public.reviews rv where rv.id = r.target_id)
         end,
         r.reason, r.status, r.created_at
  from public.reports r join public.profiles p on p.id = r.reporter_id
  where p_status is null or r.status = p_status
  order by r.created_at desc;
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_status not in ('resolved', 'dismissed', 'open') then raise exception 'ERR_INVALID_INPUT'; end if;
  update public.reports set status = p_status where id = p_report;
end $$;

-- ---------------------------------------------------------------- execute privileges
-- Postgres/Supabase grant EXECUTE to PUBLIC (and anon) by default: lock everything down,
-- then open only what the app needs.
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_admin(),
  public.get_available_slots(uuid, date),
  public.get_worker_calendar(uuid, date, date),
  public.worker_distance(uuid, double precision, double precision),
  public.record_profile_view(uuid),
  public.haversine_km(double precision, double precision, double precision, double precision),
  public.search_workers(text, double precision, double precision, text, numeric, numeric, numeric, numeric, int, date, text[], text, text, int, int)
  to anon, authenticated;

grant execute on function
  public.set_availability(date[], text),
  public.set_work_schedule(smallint[], time, time, int),
  public.create_visit_request(uuid, uuid, date, time, text, text, double precision, double precision, text),
  public.respond_visit_request(uuid, boolean, text),
  public.cancel_visit_request(uuid, text),
  public.complete_visit_request(uuid),
  public.submit_review(uuid, int, text),
  public.worker_visit_requests(uuid),
  public.customer_bookings(uuid),
  public.worker_stats(),
  public.generate_upcoming_reminders(),
  public.request_verification(),
  public.admin_list_workers(text),
  public.admin_set_verification(uuid, text),
  public.admin_set_worker_active(uuid, boolean),
  public.admin_delete_review(uuid),
  public.admin_list_reports(text),
  public.admin_resolve_report(uuid, text)
  to authenticated;
-- Internal helpers (_notify, _slots, _slot_free, ...) are intentionally not granted to API roles.
-- They are SECURITY DEFINER or called from SECURITY DEFINER functions only.
