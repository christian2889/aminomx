-- ============================================================================
-- 0015 — Números de pedido cortos
--
-- Antes: AMX-2608-1012 (13 caracteres, dos guiones). El cliente lo teclea en
-- el concepto de su transferencia SPEI y en el rastreo público, así que el
-- año/mes sobra: la secuencia ya es única. Ahora: AMX1024 — 7 caracteres,
-- alfanumérico puro (las bancas suelen rechazar guiones en el concepto).
--
-- Los pedidos existentes conservan su número; track_order normaliza la
-- entrada para que ambos formatos se encuentren escritos de cualquier forma.
-- ============================================================================

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

  -- Corto y sin guiones: se teclea en el concepto de la transferencia.
  v_number := 'AMX' || nextval('public.order_number_seq');

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
      -- $2,000): si el pedido, ya con descuento, no lo alcanza, la selección
      -- se ignora y aplica la tarifa normal de paquetería.
      if v_rate_cost is not null
         and (v_subtotal - v_discount) >= coalesce(v_rate_min, 0) then
        v_shipping := case when v_rate_cost = 0 then 0
                           when (v_subtotal - v_discount) >= coalesce(v_free_thr, 250000)
                           then 0 else v_rate_cost end;
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

-- ----------------------------------------------------------------------------
-- Rastreo tolerante: el cliente teclea el número como se lo aprendió
-- ("amx1024", "AMX-1024", "1024") o el formato viejo con guiones. Se compara
-- sin guiones ni espacios y, si escribió solo dígitos, se prueba el sufijo.
-- El correo sigue siendo la segunda credencial, así que no expone pedidos
-- ajenos.
-- ----------------------------------------------------------------------------
create or replace function public.track_order(p_order_number text, p_email text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_order  public.orders%rowtype;
  v_result jsonb;
  v_norm   text;
begin
  v_norm := upper(regexp_replace(coalesce(p_order_number, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_norm = '' then return null; end if;

  select * into v_order from public.orders
   where upper(regexp_replace(order_number, '[^A-Za-z0-9]', '', 'g')) = v_norm
     and lower(email) = lower(trim(p_email));

  -- Solo dígitos: puede ser el consecutivo suelto (1024 → AMX1024, o el
  -- final de un número viejo AMX26081024).
  if not found and v_norm ~ '^[0-9]+$' then
    select * into v_order from public.orders
     where upper(regexp_replace(order_number, '[^A-Za-z0-9]', '', 'g')) like '%' || v_norm
       and lower(email) = lower(trim(p_email))
     order by created_at desc
     limit 1;
  end if;

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
