-- ============================================================================
-- Aminos MX — esquema inicial
-- Catálogo, pedidos, envíos, clientes, lotes/COA + RLS
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- utilidades
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------------ perfiles
create type public.user_role as enum ('customer', 'staff', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  company     text,
  role        public.user_role not null default 'customer',
  marketing_opt_in boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Alta automática de perfil al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper de rol (security definer evita recursión de RLS)
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------- categorías
create table public.categories (
  id          text primary key,
  name_es     text not null,
  name_en     text not null,
  desc_es     text,
  desc_en     text,
  icon        text,
  sort_order  int not null default 0,
  active      boolean not null default true
);

-- ---------------------------------------------------------------- productos
create type public.product_status as enum ('draft', 'active', 'archived');

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  sku             text unique,
  name            text not null,
  category_id     text references public.categories(id) on delete set null,
  presentation_es text,
  presentation_en text,
  purity          text,
  price_cents     int not null check (price_cents >= 0),
  compare_at_cents int check (compare_at_cents >= 0),
  currency        text not null default 'MXN',
  desc_es         text,
  desc_en         text,
  tags_es         text[] not null default '{}',
  tags_en         text[] not null default '{}',
  stock           int not null default 0 check (stock >= 0),
  bestseller      boolean not null default false,
  is_new          boolean not null default false,
  status          public.product_status not null default 'active',
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
create index products_status_idx on public.products(status);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  storage_path text,
  url         text not null,
  alt         text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id, position);

-- --------------------------------------------------------------- lotes / COA
create table public.batches (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  product_id     uuid references public.products(id) on delete set null,
  purity_hplc    numeric(5,2),
  identity_ms    text,
  endotoxins     text,
  residual_water text,
  lyophilized_on date,
  expires_on     date,
  coa_url        text,
  lab            text,
  notes          text,
  published      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index batches_product_idx on public.batches(product_id);

-- ---------------------------------------------------------------- direcciones
create table public.addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  label        text,
  recipient    text not null,
  phone        text,
  line1        text not null,
  line2        text,
  city         text not null,
  state        text not null,
  postal_code  text not null,
  country      text not null default 'MX',
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id);

-- -------------------------------------------------------------------- cupones
create table public.coupons (
  code              text primary key,
  kind              text not null check (kind in ('percent', 'fixed')),
  value             int not null check (value > 0),
  min_subtotal_cents int not null default 0,
  active            boolean not null default true,
  expires_at        timestamptz,
  max_uses          int,
  used_count        int not null default 0,
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------------- pedidos
create type public.order_status as enum
  ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create sequence if not exists public.order_number_seq start 1000;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  user_id          uuid references public.profiles(id) on delete set null,
  email            text not null,
  phone            text,
  customer_name    text,
  status           public.order_status not null default 'pending',
  payment_status   public.payment_status not null default 'pending',
  payment_method   text,
  subtotal_cents   int not null default 0,
  discount_cents   int not null default 0,
  shipping_cents   int not null default 0,
  total_cents      int not null default 0,
  currency         text not null default 'MXN',
  coupon_code      text references public.coupons(code) on delete set null,
  shipping_address jsonb,
  notes            text,
  admin_notes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id);
create index orders_status_idx on public.orders(status);
create index orders_created_idx on public.orders(created_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  product_id       uuid references public.products(id) on delete set null,
  name             text not null,
  presentation     text,
  sku              text,
  unit_price_cents int not null,
  qty              int not null check (qty > 0),
  total_cents      int not null
);
create index order_items_order_idx on public.order_items(order_id);

-- Bitácora del pedido (línea de tiempo para el cliente)
create table public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  status      text not null,
  note        text,
  visible_to_customer boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id, created_at);

-- -------------------------------------------------------------------- envíos
create table public.shipments (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  carrier              text,
  service              text,
  tracking_number      text,
  tracking_url         text,
  label_url            text,
  status               text not null default 'pending',
  cost_cents           int,
  skydropx_shipment_id text,
  skydropx_payload     jsonb,
  shipped_at           timestamptz,
  delivered_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index shipments_order_idx on public.shipments(order_id);
create trigger shipments_updated_at before update on public.shipments
  for each row execute function public.set_updated_at();

create table public.shipment_events (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  status      text not null,
  description text,
  location    text,
  occurred_at timestamptz not null default now()
);
create index shipment_events_shipment_idx on public.shipment_events(shipment_id, occurred_at);

-- ------------------------------------------------------- registro de correos
create table public.email_log (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  template    text not null,
  subject     text,
  order_id    uuid references public.orders(id) on delete set null,
  provider_id text,
  status      text not null default 'queued',
  error       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- ajustes
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (key, value) values
  ('shipping', '{"free_threshold_cents": 250000, "flat_cost_cents": 18900, "currency": "MXN"}'::jsonb),
  ('store',    '{"name": "Aminos MX", "email": "ventas@aminosmx.com", "whatsapp": "+52 55 0000 0000"}'::jsonb);
