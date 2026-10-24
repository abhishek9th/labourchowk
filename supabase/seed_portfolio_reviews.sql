-- Labour Chowk :: SAMPLE reviews + SAMPLE previous works
-- ============================================================================
-- Run AFTER seed.sql (it needs the three sample customers) and, if you want
-- them covered too, after seed_bulk.sql.
--
--  1. Sample workers get up to 3 sample reviews (random ratings, mostly 4-5)
--     from the sample customers, each tied to a sample completed visit.
--     Everything is flagged is_demo = true (the UI shows "Sample data").
--  2. Every sample worker rated above 4.2 gets 2 sample "previous works"
--     (3 if rated 4.6 or more) in the portfolio. The logins demo.worker01..03
--     always get 3 projects, whatever their rating, so you can log in and see them. The photos are generic
--     placeholders for the trade, not photos of that worker's own jobs; the
--     projects are tagged 'sample' and say so in their description.
--
-- Safe to run more than once. Remove only what this file added with:
--   delete from public.worker_portfolio_projects where 'sample' = any(project_tags);
--   delete from public.reviews r using public.visit_requests v
--     where r.visit_request_id = v.id and v.job_description = 'Sample completed visit (random review)';
-- ============================================================================

do $seed$
declare
  w        record;
  cust     uuid[];
  cat      uuid;
  vid      uuid;
  i        int; 
  have     int;
  want     int;
  proj     uuid;
  tpl      jsonb;
  n_proj   int;
  slugs    text[] := array['mason','plumber','electrician','painter','carpenter','tile-flooring','welder',
                           'construction-helper','pop-false-ceiling','ac-appliance','cleaner','other'];
  idx      int;
  texts    text[] := array[
    'Arrived on time, explained the work clearly and the price was fair.',
    'Neat work and good behaviour. Would call again.',
    'Understood the problem quickly. Gave an honest estimate at the first visit.',
    'Very skilled and careful with the details. Recommended.',
    'Reasonable rates and cleaned up after the work.',
    'Finished the job in one day and the finishing was clean.',
    'Polite and hardworking. Explained what was needed before starting.',
    'Good quality work. Took a little longer than planned but the result is good.',
    'Came with his own tools and did not waste any material.',
    'Honest worker, told me what was not needed instead of selling extra work.'];
  ratings  int[] := array[5, 5, 5, 4, 5, 4, 5, 4, 3, 5];
  -- three sample jobs per trade: title | description | tags | area (sq ft, 0 = not applicable)
  tpls     jsonb := '{
    "mason": [["Boundary wall repair","Repaired a cracked boundary wall and re-plastered both sides.","brickwork,plastering",180],
              ["Bathroom wall construction","Built a new partition wall for a bathroom with proper plastering.","brickwork,partition",90],
              ["Terrace parapet","Built a parapet wall on the terrace with a smooth cement finish.","parapet,cement",140]],
    "plumber": [["Kitchen sink and tap fitting","Replaced the sink, tap and waste pipe and fixed a slow leak.","sink,leak repair",0],
                ["Bathroom pipeline change","Changed old pipes in a bathroom and fitted new fittings.","pipeline,fittings",0],
                ["Water tank connection","Connected a new overhead tank with a float valve.","tank,valve",0]],
    "electrician": [["Full room rewiring","Rewired a bedroom with new switch boards and concealed wiring.","wiring,switchboard",0],
                    ["Fan and light points","Added fan and light points and fixed a loose connection.","fan,lights",0],
                    ["MCB board change","Replaced an old fuse box with an MCB board.","mcb,safety",0]],
    "painter": [["Two-room interior paint","Painted two rooms with putty, primer and two coats.","interior,putty",420],
                ["Exterior wall paint","Repainted the front exterior wall with weather-proof paint.","exterior,weatherproof",300],
                ["Texture wall","Made a textured feature wall in the living room.","texture,feature wall",120]],
    "carpenter": [["Wardrobe repair and polish","Repaired the doors and hinges of a wardrobe and polished it.","wardrobe,polish",0],
                  ["Main door fitting","Fitted a new wooden door with frame and lock.","door,frame",0],
                  ["Kitchen shelves","Made and fixed wall shelves in a kitchen.","shelves,woodwork",0]],
    "tile-flooring": [["Living room floor tiles","Laid 2x2 vitrified tiles in a living room with level checks.","vitrified,flooring",320],
                      ["Bathroom wall tiles","Fitted wall tiles in a bathroom with neat joints.","wall tiles,bathroom",110],
                      ["Kitchen dado","Fitted dado tiles above the kitchen counter.","dado,kitchen",60]],
    "welder": [["Window grill","Made and fitted a metal grill for a window.","grill,welding",0],
               ["Gate repair","Repaired a main gate and welded the broken hinge.","gate,repair",0],
               ["Shed frame","Welded a steel frame for a small shed.","shed,steel",0]],
    "construction-helper": [["Site cleaning and shifting","Helped shift material and cleaned a construction site.","material shifting,cleaning",0],
                            ["Mixing and carrying","Assisted the mason team with mixing and carrying material.","site help",0],
                            ["Debris removal","Cleared debris after a renovation job.","debris,renovation",0]],
    "pop-false-ceiling": [["Living room false ceiling","Made a POP false ceiling with cove lighting.","pop,cove",260],
                          ["Bedroom ceiling design","Made a simple false ceiling with a border design.","ceiling,design",180],
                          ["POP repair","Repaired damaged POP work and repainted the patch.","repair,pop",40]],
    "ac-appliance": [["Split AC installation","Installed a split AC with a proper stand and drain pipe.","ac,installation",0],
                     ["AC service","Serviced an AC and cleaned the indoor and outdoor units.","ac,service",0],
                     ["Washing machine repair","Found and fixed a drain problem in a washing machine.","washing machine,repair",0]],
    "cleaner": [["Deep cleaning of a 2BHK","Deep cleaned a 2BHK flat including kitchen and bathrooms.","deep cleaning,2bhk",900],
                ["Post-renovation cleaning","Cleaned dust and paint marks after renovation work.","post renovation",600],
                ["Kitchen degreasing","Removed oil and grease from kitchen walls and cabinets.","kitchen,degreasing",0]],
    "other": [["General repair visit","Fixed small household repairs in one visit.","repairs",0],
              ["Furniture assembly","Assembled and fixed furniture for a new home.","assembly",0],
              ["Moving help","Helped with shifting household items.","shifting",0]]
  }'::jsonb;
begin
  select array_agg(id order by email) into cust from auth.users where email like 'demo.customer%@labourchowk.demo';
  if cust is null or cardinality(cust) = 0 then
    raise exception 'Run supabase/seed.sql first (it creates the sample customers).';
  end if;

  for w in
    select p.id, p.category_slug, p.primary_category_id, p.locality, p.city
    from public.public_worker_profiles p where p.is_demo order by p.id
  loop
    -- 1. sample reviews, up to 3 per sample worker
    select count(*) into have from public.reviews where worker_id = w.id;
    want := greatest(0, 3 - have);
    for i in 1..want loop
      insert into public.visit_requests (customer_id, worker_id, category_id, requested_date, start_time, end_time,
                                         customer_locality, job_description, status, is_demo)
      values (cust[1 + floor(random() * cardinality(cust))::int], w.id, w.primary_category_id,
              public.app_today() - (20 + i * 17 + floor(random() * 10)::int), '12:00', '13:00',
              'Sample locality', 'Sample completed visit (random review)', 'completed', true)
      on conflict do nothing
      returning id into vid;
      if vid is not null then
        insert into public.reviews (visit_request_id, customer_id, worker_id, rating, review_text, is_demo)
        select vid, customer_id, w.id, ratings[1 + floor(random() * 10)::int], texts[1 + floor(random() * 10)::int], true
        from public.visit_requests where id = vid;
      end if;
      vid := null;
    end loop;
  end loop;

  -- 2. sample previous works for sample workers rated above 4.2
  for w in
    select p.id, p.category_slug, p.primary_category_id, p.locality, p.city, p.rating_avg,
           p.id in (select id from auth.users where email in
           ('demo.worker01@labourchowk.demo', 'demo.worker02@labourchowk.demo', 'demo.worker03@labourchowk.demo')) as login_account
    from public.public_worker_profiles p
    where p.is_demo
      and (p.rating_avg > 4.2 or p.id in (select id from auth.users where email in
           ('demo.worker01@labourchowk.demo', 'demo.worker02@labourchowk.demo', 'demo.worker03@labourchowk.demo')))
      and not exists (select 1 from public.worker_portfolio_projects x where x.worker_id = p.id)
    order by p.id
  loop
    idx := coalesce(array_position(slugs, w.category_slug), 12);
    n_proj := case when w.rating_avg >= 4.6 or w.login_account then 3 else 2 end;   -- the three login accounts always get 3
    for i in 1..n_proj loop
      tpl := coalesce(tpls -> w.category_slug, tpls -> 'other') -> (i - 1);
      insert into public.worker_portfolio_projects (worker_id, title, description, category_id, location_label, completed_at,
                                                    project_area_sqft, project_tags, is_published)
      values (w.id, tpl ->> 0, (tpl ->> 1) || ' (Sample project for demonstration.)', w.primary_category_id,
              w.locality || ', ' || w.city, public.app_today() - (45 * i + 20),
              nullif((tpl ->> 3)::numeric, 0), string_to_array(tpl ->> 2, ',') || array['sample'], true)
      returning id into proj;
      insert into public.worker_portfolio_images (project_id, storage_path)
      values (proj, w.id::text || '/' || proj::text || '/5a3b1e00-0000-4000-8000-0000000000' || lpad(idx::text, 2, '0') || '.jpg');
    end loop;
  end loop;
end
$seed$;
