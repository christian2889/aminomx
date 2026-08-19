-- ============================================================================
-- 0009 — Productos "próximamente"
--
-- El catálogo se muestra completo (da idea del rango que manejamos y conserva
-- las páginas ya indexadas), pero solo lo que hay en bodega se puede comprar.
-- El resto aparece como "Esperando disponibilidad" y no se puede añadir al
-- carrito.
--
-- El candado real vive aquí, no en el navegador: create_order rechaza
-- cualquier partida marcada coming_soon aunque alguien manipule el carrito.
-- ============================================================================

alter table public.products
  add column if not exists coming_soon boolean not null default false;

comment on column public.products.coming_soon is
  'Visible en el catálogo pero no comprable. Se muestra como "Esperando
   disponibilidad". create_order lo rechaza del lado del servidor.';

create index if not exists products_coming_soon_idx
  on public.products(coming_soon) where coming_soon;

-- ---------------------------------------------------------------------------
-- create_order: rechazar productos que aún no están disponibles
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_items   jsonb,
  p_email   text,
  p_name    text default null,
  p_phone   text default null,
  p_address jsonb default null,
  p_coupon  text default null,
  p_notes   text default null
)
returns table (order_id uuid, order_number text, total_cents int)
language plpgsql
security definer
set search_path = public
as $$
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
    if v_product.coming_soon then
      raise exception '% aún no está disponible para compra', v_product.name;
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
