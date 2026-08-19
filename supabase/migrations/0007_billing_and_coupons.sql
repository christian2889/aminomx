-- ============================================================================
-- Aminos MX — Facturación CFDI 4.0 y visibilidad de cupones
-- ============================================================================

alter table public.orders
  add column if not exists billing jsonb,
  add column if not exists invoice_requested boolean not null default false,
  add column if not exists invoice_status text not null default 'none'
    check (invoice_status in ('none', 'requested', 'issued', 'rejected')),
  add column if not exists invoice_url text;

comment on column public.orders.billing is
  'Datos fiscales CFDI: {rfc, razon_social, regimen, uso_cfdi, cp_fiscal, email_fiscal}';

alter table public.profiles
  add column if not exists billing jsonb;

create index if not exists orders_invoice_idx
  on public.orders(invoice_status) where invoice_requested;

drop policy if exists "cupones activos visibles" on public.coupons;
create policy "cupones activos visibles" on public.coupons
  for select to anon, authenticated
  using (active and (expires_at is null or expires_at > now()));
