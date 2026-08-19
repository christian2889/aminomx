-- ============================================================================
-- Aminos MX — Storage: imágenes de producto y certificados COA
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,
   array['image/png','image/jpeg','image/webp','image/avif','image/svg+xml']),
  ('coa', 'coa', true, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

-- Lectura pública
create policy "imágenes de producto: lectura pública" on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');
create policy "coa: lectura pública" on storage.objects
  for select to anon, authenticated using (bucket_id = 'coa');

-- Escritura sólo staff/admin
create policy "imágenes de producto: staff escribe" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_staff());
create policy "imágenes de producto: staff actualiza" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_staff());
create policy "imágenes de producto: staff borra" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_staff());

create policy "coa: staff escribe" on storage.objects
  for insert to authenticated with check (bucket_id = 'coa' and public.is_staff());
create policy "coa: staff actualiza" on storage.objects
  for update to authenticated using (bucket_id = 'coa' and public.is_staff());
create policy "coa: staff borra" on storage.objects
  for delete to authenticated using (bucket_id = 'coa' and public.is_staff());
