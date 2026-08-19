-- ============================================================================
-- Aminos MX — RLS + funciones de negocio
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.batches        enable row level security;
alter table public.addresses      enable row level security;
alter table public.coupons        enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.order_events   enable row level security;
alter table public.shipments      enable row level security;
alter table public.shipment_events enable row level security;
alter table public.email_log      enable row level security;
alter table public.settings       enable row level security;

-- ------------------------------------------------------------------ perfiles
create policy "perfil propio: leer" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "perfil propio: actualizar" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "staff: administrar perfiles" on public.profiles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- --------------------------------------------------- catálogo (lectura pública)
create policy "categorías públicas" on public.categories
  for select to anon, authenticated using (active);
create policy "staff: categorías" on public.categories
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "productos publicados" on public.products
  for select to anon, authenticated using (status = 'active' or public.is_staff());
create policy "staff: productos" on public.products
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "imágenes públicas" on public.product_images
  for select to anon, authenticated using (
    exists (select 1 from public.products p
            where p.id = product_id and (p.status = 'active' or public.is_staff()))
  );
create policy "staff: imágenes" on public.product_images
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "lotes publicados" on public.batches
  for select to anon, authenticated using (published or public.is_staff());
create policy "staff: lotes" on public.batches
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- --------------------------------------------------------------- direcciones
create policy "direcciones propias" on public.addresses
  for all to authenticated using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- ------------------------------------------------------------------- cupones
create policy "staff: cupones" on public.coupons
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ------------------------------------------------------------------- pedidos
create policy "pedidos propios: leer" on public.orders
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "staff: pedidos" on public.orders
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "partidas del pedido propio" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and (o.user_id = auth.uid() or public.is_staff()))
  );
create policy "staff: partidas" on public.order_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "eventos del pedido propio" on public.order_events
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id
              and ((o.user_id = auth.uid() and visible_to_customer) or public.is_staff()))
  );
create policy "staff: eventos" on public.order_events
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- -------------------------------------------------------------------- envíos
create policy "envíos del pedido propio" on public.shipments
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and (o.user_id = auth.uid() or public.is_staff()))
  );
create policy "staff: envíos" on public.shipments
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "eventos de envío propios" on public.shipment_events
  for select to authenticated using (
    exists (select 1 from public.shipments s
            join public.orders o on o.id = s.order_id
            where s.id = shipment_id and (o.user_id = auth.uid() or public.is_staff()))
  );
create policy "staff: eventos de envío" on public.shipment_events
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ------------------------------------------------------- correos y ajustes
create policy "staff: correos" on public.email_log
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "ajustes públicos" on public.settings
  for select to anon, authenticated using (true);
create policy "admin: ajustes" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- RPC: verificación pública de COA por lote
-- ============================================================================
create or replace function public.verify_batch(p_code text)
returns table (
  code text, product_name text, purity_hplc numeric, identity_ms text,
  endotoxins text, lyophilized_on date, coa_url text, lab text
)
language sql stable security definer set search_path = public as $$
  select b.code, p.name, b.purity_hplc, b.identity_ms,
         b.endotoxins, b.lyophilized_on, b.coa_url, b.lab
  from public.batches b
  left join public.products p on p.id = b.product_id
  where b.published and upper(trim(b.code)) = upper(trim(p_code));
$$;
grant execute on function public.verify_batch(text) to anon, authenticated;

-- ============================================================================
-- RPC: crear pedido (precios validados en el servidor)
-- items: [{"product_id": uuid, "qty": int}, ...]
-- ============================================================================
create or replace function public.create_order(
  p_items    jsonb,
  p_email    text,
  p_name     text default null,
  p_phone    text default null,
  p_address  jsonb default null,
  p_coupon   text default null,
  p_notes    text default null
)
returns table (order_id uuid, order_number text, total_cents int)
language plpgsql security definer set search_path = public as $$
declare
  v_order_id   uuid;
  v_number     text;
  v_subtotal   int := 0;
  v_discount   int := 0;
  v_shipping   int := 0;
  v_free_thr   int;
  v_flat_cost  int;
  v_item       jsonb;
  v_product    public.products%rowtype;
  v_qty        int;
  v_coupon     public.coupons%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'Correo inválido';
  end if;

  select (value->>'free_threshold_cents')::int, (value->>'flat_cost_cents')::int
    into v_free_thr, v_flat_cost
  from public.settings where key = 'shipping';

  v_number := 'AMX-' || to_char(now(), 'YYMM') || '-' || nextval('public.order_number_seq');

  insert into public.orders (order_number, user_id, email, phone, customer_name,
                             shipping_address, notes, currency)
  values (v_number, auth.uid(), lower(trim(p_email)), p_phone, p_name,
          p_address, p_notes, 'MXN')
  returning id into v_order_id;

  -- Partidas: precio y stock tomados de la base, nunca del cliente
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid and status = 'active'
     for update;

    if not found then
      raise exception 'Producto no disponible: %', v_item->>'product_id';
    end if;
    if v_product.stock < v_qty then
      raise exception 'Stock insuficiente de %: quedan %', v_product.name, v_product.stock;
    end if;

    insert into public.order_items (order_id, product_id, name, presentation, sku,
                                    unit_price_cents, qty, total_cents)
    values (v_order_id, v_product.id, v_product.name, v_product.presentation_es,
            v_product.sku, v_product.price_cents, v_qty,
            v_product.price_cents * v_qty);

    update public.products set stock = stock - v_qty where id = v_product.id;
    v_subtotal := v_subtotal + v_product.price_cents * v_qty;
  end loop;

  -- Cupón
  if p_coupon is not null and length(trim(p_coupon)) > 0 then
    select * into v_coupon from public.coupons
     where code = upper(trim(p_coupon)) and active
       and (expires_at is null or expires_at > now())
       and (max_uses is null or used_count < max_uses)
       and min_subtotal_cents <= v_subtotal;
    if found then
      v_discount := case when v_coupon.kind = 'percent'
                         then (v_subtotal * v_coupon.value) / 100
                         else least(v_coupon.value, v_subtotal) end;
      update public.coupons set used_count = used_count + 1 where code = v_coupon.code;
      update public.orders set coupon_code = v_coupon.code where id = v_order_id;
    end if;
  end if;

  -- Envío
  v_shipping := case when (v_subtotal - v_discount) >= coalesce(v_free_thr, 250000)
                     then 0 else coalesce(v_flat_cost, 18900) end;

  update public.orders
     set subtotal_cents = v_subtotal,
         discount_cents = v_discount,
         shipping_cents = v_shipping,
         total_cents    = v_subtotal - v_discount + v_shipping
   where id = v_order_id;

  insert into public.order_events (order_id, status, note)
  values (v_order_id, 'pending', 'Pedido recibido');

  return query
    select v_order_id, v_number, (v_subtotal - v_discount + v_shipping);
end $$;
grant execute on function public.create_order(jsonb, text, text, text, jsonb, text, text)
  to anon, authenticated;

-- ============================================================================
-- RPC: seguimiento público (número de pedido + correo)
-- ============================================================================
create or replace function public.track_order(p_order_number text, p_email text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_result jsonb;
begin
  select * into v_order from public.orders
   where upper(order_number) = upper(trim(p_order_number))
     and lower(email) = lower(trim(p_email));
  if not found then return null; end if;

  select jsonb_build_object(
    'order_number', v_order.order_number,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'total_cents', v_order.total_cents,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name', i.name, 'qty', i.qty, 'total_cents', i.total_cents))
      from public.order_items i where i.order_id = v_order.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'status', e.status, 'note', e.note, 'created_at', e.created_at)
        order by e.created_at)
      from public.order_events e
      where e.order_id = v_order.id and e.visible_to_customer), '[]'::jsonb),
    'shipment', (select jsonb_build_object(
        'carrier', s.carrier, 'tracking_number', s.tracking_number,
        'tracking_url', s.tracking_url, 'status', s.status,
        'shipped_at', s.shipped_at, 'delivered_at', s.delivered_at)
      from public.shipments s where s.order_id = v_order.id
      order by s.created_at desc limit 1)
  ) into v_result;
  return v_result;
end $$;
grant execute on function public.track_order(text, text) to anon, authenticated;

-- ============================================================================
-- Vista de métricas para el panel admin
-- ============================================================================
create or replace view public.admin_stats
with (security_invoker = true) as
  select
    (select count(*) from public.orders)                                      as orders_total,
    (select count(*) from public.orders where status = 'pending')             as orders_pending,
    (select count(*) from public.orders
      where created_at > now() - interval '30 days')                          as orders_30d,
    (select coalesce(sum(total_cents), 0) from public.orders
      where payment_status = 'paid')                                          as revenue_cents,
    (select count(*) from public.products where status = 'active')            as products_active,
    (select count(*) from public.products where stock <= 10 and status='active') as products_low_stock,
    (select count(*) from public.profiles where role = 'customer')            as customers_total;
