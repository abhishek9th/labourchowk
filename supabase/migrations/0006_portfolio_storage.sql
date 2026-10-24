-- Labour Chowk :: 0006 portfolio storage (Supabase only - needs the storage schema)
--
-- Bucket `portfolio`: public READ (portfolio photos are shown to anonymous customers; object
-- names are <worker_id>/<project_id>/<random uuid>.<ext>, so they are unguessable), but only the
-- owning worker can create / replace / delete objects, and only inside their own folder.
-- 5 MB limit and image MIME types are enforced by the bucket itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio', 'portfolio', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portfolio_public_read" on storage.objects;
create policy "portfolio_public_read" on storage.objects for select
  using (bucket_id = 'portfolio');

-- uploads: must be a worker, inside <own uid>/<one of own projects>/...
drop policy if exists "portfolio_owner_insert" on storage.objects;
create policy "portfolio_owner_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.worker_portfolio_projects p
                where p.id::text = (storage.foldername(name))[2] and p.worker_id = auth.uid())
  );

drop policy if exists "portfolio_owner_update" on storage.objects;
create policy "portfolio_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "portfolio_owner_delete" on storage.objects;
create policy "portfolio_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
