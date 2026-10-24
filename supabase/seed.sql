-- Labour Chowk :: SAMPLE DATA for demos
-- ============================================================================
-- Everything created here is flagged is_demo = true and shows a "Sample data"
-- badge in the UI. Sample workers are NEVER marked verified, and the sample
-- reviews belong to sample customers and sample (completed) visits.
-- Safe to run more than once (it does nothing if the sample users exist).
-- Remove it all with:  delete from auth.users where email like '%@labourchowk.demo';
--
-- Sample logins (password for all: Demo@12345)
--   customers: demo.customer1@labourchowk.demo ... demo.customer3@labourchowk.demo
--   workers  : demo.worker01@labourchowk.demo  ... demo.worker20@labourchowk.demo
-- Run in the Supabase SQL editor (or `supabase db reset`, which runs this file).
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
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
          now(), now(), now());
  return v_id;
end $$;

do $seed$
declare
  w          record;
  cust       uuid[] := '{}';
  wid        uuid;
  cid        uuid;
  cat        uuid;
  vid        uuid;
  i          int;
  n_reviews  int;
  k          int := 0;
  texts      text[] := array[
    'Arrived on time, explained the work clearly and the price was fair.',
    'Neat work and good behaviour. Would call again.',
    'Understood the problem quickly. Gave an honest estimate at the first visit.',
    'Good experience overall, finished a little later than promised.',
    'Very skilled and careful with the details. Recommended.',
    'Reasonable rates and cleaned up after the work.'];
  ratings    int[] := array[5, 4, 5, 4, 5, 3, 5, 4];
begin
  if exists (select 1 from auth.users where email like '%@labourchowk.demo') then
    raise notice 'Sample data already present - skipping.';
    return;
  end if;

  -- sample customers
  for i in 1..3 loop
    cid := pg_temp.demo_user(format('demo.customer%s@labourchowk.demo', i),
      jsonb_build_object('role', 'customer',
        'full_name', (array['Anita Sharma', 'Rahul Verma', 'Meera Iyer'])[i],
        'phone', '98000000' || lpad(i::text, 2, '0'),
        'default_locality', (array['Indiranagar, Bengaluru', 'Saket, Delhi', 'Andheri, Mumbai'])[i]));
    update public.profiles set is_demo = true where id = cid;
    cust := cust || cid;
  end loop;

  -- sample workers:  slug, name, exp, price, unit, locality, city, lat, lng, languages, skills, description, radius, verification
  for w in select * from (values
    ('electrician','Ramesh Yadav',      12,  800,'per_day',  'Indiranagar','Bengaluru', 12.9784, 77.6408,'{Hindi,Kannada,English}','{House wiring,Inverter fitting,Fault finding}','Licensed electrician. Complete house wiring, MCB boards and fault finding.',12,'unverified'),
    ('electrician','Imran Sheikh',       6,  350,'per_visit','Andheri',    'Mumbai',    19.1136, 72.8697,'{Hindi,Marathi,English}','{Switchboards,Ceiling fans,LED lighting}','Quick fixes and fittings for flats and offices.',10,'pending'),
    ('electrician','Vikas Chauhan',      9,  700,'per_day',  'Rohini',     'Delhi',     28.7495, 77.0565,'{Hindi,Punjabi}','{Wiring,Geyser fitting,Earthing}','Residential wiring and safety checks.',15,'unverified'),
    ('plumber','Suresh Naik',           10,  450,'per_visit','Koramangala','Bengaluru', 12.9352, 77.6245,'{Kannada,Hindi,Tamil}','{Leak repair,Bathroom fitting,Water tank}','Fixing leaks, bathroom and kitchen plumbing for 10 years.',10,'unverified'),
    ('plumber','Anil Prasad',            4,  400,'per_visit','Laxmi Nagar','Delhi',     28.6304, 77.2773,'{Hindi}','{Tap repair,Drain cleaning}','Reliable for small plumbing jobs and blockages.',8,'unverified'),
    ('plumber','Dinesh Patil',          14,  900,'per_day',  'Thane',      'Mumbai',    19.2183, 72.9781,'{Marathi,Hindi}','{Pipeline laying,Bathroom fitting,Motor pump}','New pipelines and complete bathroom fittings.',20,'unverified'),
    ('mason','Mohammed Irfan',          18, 1000,'per_day',  'Jayanagar',  'Bengaluru', 12.9308, 77.5838,'{Kannada,Hindi,Urdu}','{Brickwork,Plastering,Waterproofing}','Experienced mason for extensions, plastering and repair work.',15,'unverified'),
    ('mason','Ramkishan Meena',         11,  900,'per_day',  'Dwarka',     'Delhi',     28.5921, 77.0460,'{Hindi}','{Brickwork,Flooring base,Boundary walls}','Quality brickwork and plastering with a small team.',15,'unverified'),
    ('painter','Shankar Gowda',          8,   18,'per_sq_ft','Whitefield', 'Bengaluru', 12.9698, 77.7500,'{Kannada,Hindi,English}','{Interior painting,Texture,Wood polish}','Interior and exterior painting, textures and putty.',15,'unverified'),
    ('painter','Pappu Singh',            5,   16,'per_sq_ft','Saket',      'Delhi',     28.5245, 77.2066,'{Hindi,English}','{Wall painting,Putty,Waterproof coating}','Clean finish and on-time completion.',10,'unverified'),
    ('painter','Santosh Jadhav',        13, 1100,'per_day',  'Borivali',   'Mumbai',    19.2307, 72.8567,'{Marathi,Hindi}','{Exterior painting,Texture,POP finishing}','Society and flat painting, own scaffolding.',12,'unverified'),
    ('carpenter','Harish Sharma',       15,  900,'per_day',  'Malleshwaram','Bengaluru',13.0035, 77.5646,'{Hindi,Kannada,English}','{Modular wardrobes,Door fitting,Furniture repair}','Custom wardrobes, doors and furniture repair.',12,'unverified'),
    ('carpenter','Jagdish Lal',          7,  800,'per_task', 'Rohini',     'Delhi',     28.7495, 77.0565,'{Hindi,Punjabi}','{Doors,Windows,Bed and cupboards}','Fair price per job, quick work.',10,'unverified'),
    ('tile-flooring','Rafiq Ansari',    12,   35,'per_sq_ft','HSR Layout', 'Bengaluru', 12.9116, 77.6389,'{Hindi,Kannada,Urdu}','{Floor tiles,Granite,Marble polish}','Tile, marble and granite laying with a perfect finish.',15,'unverified'),
    ('tile-flooring','Bablu Prasad',     6,   30,'per_sq_ft','Thane',      'Mumbai',    19.2183, 72.9781,'{Hindi,Marathi}','{Vitrified tiles,Bathroom tiling}','Bathroom and kitchen tiling.',10,'unverified'),
    ('welder','Karan Thakur',            9, 1000,'per_day',  'Electronic City','Bengaluru',12.8452,77.6602,'{Hindi,Kannada}','{Gates,Grills,Sheds}','Gates, grills and shed fabrication, on-site welding.',20,'unverified'),
    ('pop-false-ceiling','Naseem Khan', 10,   75,'per_sq_ft','Laxmi Nagar','Delhi',     28.6304, 77.2773,'{Hindi,Urdu}','{False ceiling,POP design,Cove lighting}','Designer false ceilings and POP work.',15,'unverified'),
    ('ac-appliance','Pradeep Kumar',     7,  500,'per_visit','Indiranagar','Bengaluru', 12.9784, 77.6408,'{Hindi,Kannada,English}','{AC service,Fridge repair,Washing machine}','AC service, gas filling and appliance repair.',12,'unverified'),
    ('cleaner','Sunita Devi',            5,  600,'per_day',  'Andheri',    'Mumbai',    19.1136, 72.8697,'{Hindi,Marathi}','{Deep cleaning,Post-construction cleaning}','Deep cleaning of flats and offices.',10,'unverified'),
    ('construction-helper','Bhola Mahto',3,  600,'per_day',  'Whitefield', 'Bengaluru', 12.9698, 77.7500,'{Hindi}','{Loading,Mixing,Site helper}','Hard working helper for construction sites.',15,'unverified')
  ) t(slug, name, exp, price, unit, locality, city, lat, lng, langs, skills, descr, radius, verif)
  loop
    k := k + 1;
    wid := pg_temp.demo_user(format('demo.worker%s@labourchowk.demo', lpad(k::text, 2, '0')),
      jsonb_build_object('role', 'worker', 'full_name', w.name,
        'phone', '97000000' || lpad(k::text, 2, '0'), 'category_slug', w.slug,
        'experience_years', w.exp, 'indicative_price', w.price, 'pricing_unit', w.unit,
        'locality', w.locality, 'city', w.city, 'latitude', w.lat, 'longitude', w.lng,
        'service_radius_km', w.radius, 'languages', to_jsonb(w.langs::text[]),
        'skills', to_jsonb(w.skills::text[]), 'description', w.descr));
    update public.profiles set is_demo = true where id = wid;
    update public.worker_profiles set is_demo = true, verification_status = w.verif,
      -- vary the weekly schedule a little
      working_days = case when k % 4 = 0 then '{1,2,3,4,5}'::smallint[] when k % 5 = 0 then '{0,1,2,3,4,5,6}'::smallint[] else working_days end
    where id = wid;

    -- a couple of manually blocked dates ahead
    if k % 3 = 0 then
      insert into public.worker_availability (worker_id, date, availability_status)
      select wid, public.app_today() + d, 'blocked' from unnest(array[2, 3]) d on conflict do nothing;
    end if;

    -- sample completed visits + reviews (only for most workers; some have none -> empty state)
    n_reviews := case when k % 6 = 0 then 0 else 1 + (k % 3) end;
    select primary_category_id into cat from public.worker_profiles where id = wid;
    for i in 1..n_reviews loop
      insert into public.visit_requests (customer_id, worker_id, category_id, requested_date, start_time, end_time,
                                         customer_locality, job_description, status, is_demo)
      values (cust[1 + ((k + i) % 3)], wid, cat, public.app_today() - (7 * i + k), '10:00', '11:00',
              'Sample locality', 'Sample completed visit for demo data', 'completed', true)
      returning id into vid;
      insert into public.reviews (visit_request_id, customer_id, worker_id, rating, review_text, is_demo)
      select vid, customer_id, wid, ratings[1 + ((k + i) % 8)], texts[1 + ((k * i) % 6)], true
      from public.visit_requests where id = vid;
    end loop;
  end loop;

  raise notice 'Inserted % sample workers and 3 sample customers.', k;
end
$seed$;
