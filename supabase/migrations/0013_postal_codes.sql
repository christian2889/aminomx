-- ============================================================================
-- 0013 — Catálogo SEPOMEX de códigos postales (autocompletado del checkout)
--
-- Al teclear un CP de 5 dígitos, el checkout llena Estado/Ciudad y sugiere
-- las colonias del CP, sin servicios externos. El catálogo (~146k filas) se
-- carga por REST con tools/load-postal-codes.py usando una cuenta staff.
-- ============================================================================

create table if not exists public.postal_codes (
  cp        text not null,
  colonia   text not null,
  municipio text not null,
  estado    text not null,
  ciudad    text
);

create index if not exists postal_codes_cp_idx on public.postal_codes (cp);

alter table public.postal_codes enable row level security;

-- Lectura pública: es un catálogo nacional, sin datos personales.
drop policy if exists "postal_codes_read" on public.postal_codes;
create policy "postal_codes_read" on public.postal_codes
  for select to anon, authenticated using (true);

-- Escritura solo staff/admin (la herramienta de carga).
drop policy if exists "postal_codes_staff_insert" on public.postal_codes;
create policy "postal_codes_staff_insert" on public.postal_codes
  for insert to authenticated
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and p.role in ('admin','staff')));

drop policy if exists "postal_codes_staff_delete" on public.postal_codes;
create policy "postal_codes_staff_delete" on public.postal_codes
  for delete to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role in ('admin','staff')));

-- Truncate rápido para recargas; solo service_role.
create or replace function public.truncate_postal_codes() returns void
language sql security definer set search_path = public
as $$ truncate table public.postal_codes; $$;

revoke all on function public.truncate_postal_codes() from public, anon, authenticated;
