-- ============================================================================
-- 0012 — Entrega local Ensenada (DiDi / asociados Aminos MX VIP)
--
-- La tarifa local viaja como cualquier otra en shipping_quotes. En un CP de
-- Ensenada la entrega es exclusivamente local (skydropx-rates ya ni cotiza
-- paquetería): cuesta cost_cents ($100) y create_order la deja en $0 desde
-- el umbral nacional de envío gratis. min_subtotal_cents es informativo
-- ("gratis desde") para el checkout. Elegir tarifa nunca es elegir precio.
--
-- Config de la opción local en settings, key 'local_delivery':
--   { enabled, provider, service, cost_cents, min_subtotal_cents, cp_prefixes }
-- ============================================================================

insert into public.settings (key, value) values ('local_delivery', jsonb_build_object(
  'enabled', true,
  'provider', 'Entrega local Ensenada',
  'service', 'Mismo día · DiDi o asociado Aminos MX VIP',
  'cost_cents', 10000,
  'min_subtotal_cents', 190000,
  'cp_prefixes', jsonb_build_array('2276','2277','2278','2279','228')
))
on conflict (key) do update set value = excluded.value;

create or replace function public.create_order(
  p_items    jsonb,
  p_email    text,
  p_name     text default null,
  p_phone    text default null,
  p_address  jsonb default null,
  p_coupon   text default null,
  p_notes    text default null,
  p_quote_id uuid default null,
  p_rate_id  text default null
)
returns table (order_id uuid, order_number text, total_cents int)
language plpgsql
security definer
set search_path = public
as $$
-- Sin esta directiva, el OUT param order_id es ambiguo frente a la columna
-- en ON CONFLICT (order_id) y la función truena en tiempo de ejecución.
#variable_conflict use_column
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
  v_rates      jsonb;
  v_quotation  text;
  v_rate_cost  int;
  v_rate_min   int;
  v_carrier    text;
  v_service    text;
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

  -- Envío: tarifa plana por defecto
  v_shipping := case when (v_subtotal - v_discount) >= coalesce(v_free_thr, 250000)
                     then 0 else coalesce(v_flat_cost, 18900) end;

  -- Tarifa real elegida en el checkout. El navegador manda IDs; el precio se
  -- lee de shipping_quotes (escrita solo por el servidor) y expira en 24 h.
  -- IDs inválidos o vencidos no rompen el pedido: cae a la tarifa plana.
  if p_quote_id is not null and p_rate_id is not null then
    select q.rates, q.quotation_id into v_rates, v_quotation
      from public.shipping_quotes q
     where q.id = p_quote_id
       and q.created_at > now() - interval '24 hours';

    if found then
      select (r->>'cost_cents')::int, r->>'provider', r->>'service',
             coalesce((r->>'min_subtotal_cents')::int, 0)
        into v_rate_cost, v_carrier, v_service, v_rate_min
        from jsonb_array_elements(v_rates) r
       where r->>'id' = p_rate_id;

      -- Tarifas con monto mínimo (entrega local Ensenada gratis desde
      -- $1,900): si el pedido, ya con descuento, no lo alcanza, la selección
      -- se ignora y aplica la tarifa normal de paquetería.
      if v_rate_cost is not null
         and (v_subtotal - v_discount) >= coalesce(v_rate_min, 0) then
        v_shipping := case when v_rate_cost = 0 then 0
                           when (v_subtotal - v_discount) >= coalesce(v_free_thr, 250000)
                           then 0 else v_rate_cost end;
        -- La elección queda registrada aunque el envío salga gratis: el panel
        -- necesita saber con qué paquetería mandar, y la guía automática usa
        -- estos IDs para emitir exactamente la tarifa que el cliente pagó.
        insert into public.shipments (order_id, carrier, service, cost_cents, status,
                                      skydropx_shipment_id, skydropx_rate_id)
        values (v_order_id, v_carrier, v_service, v_rate_cost, 'quoted',
                v_quotation, p_rate_id)
        on conflict (order_id) do update
          set carrier = excluded.carrier, service = excluded.service,
              cost_cents = excluded.cost_cents,
              skydropx_shipment_id = excluded.skydropx_shipment_id,
              skydropx_rate_id = excluded.skydropx_rate_id;
      end if;
    end if;
  end if;

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

grant execute on function public.create_order(jsonb, text, text, text, jsonb, text, text, uuid, text)
  to anon, authenticated;
