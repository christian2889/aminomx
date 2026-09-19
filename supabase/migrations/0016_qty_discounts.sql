-- ============================================================================
-- 0016 — Descuentos por volumen (no acumulables con cupones)
--
-- Escalones en settings.qty_discounts (editable sin redesplegar):
--   2 uds −7.5% · 3+ −12.5% · 10+ −40% · 50+ −50%
-- Se aplican POR COMPUESTO: las unidades de un mismo producto suman entre
-- concentraciones (mismo name + categoría, igual que el agrupado de la
-- tienda), y el % del escalón alcanzado descuenta toda la línea familiar.
--
-- Cupones y volumen NO se acumulan: se aplica el mayor de los dos. El uso
-- del cupón (used_count / coupon_code) solo se registra cuando el cupón es
-- el que gana, así restore_order_stock sigue cuadrando.
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
  v_order_id    uuid;
  v_number      text;
  v_subtotal    int := 0;
  v_discount    int := 0;
  v_qty_disc    int := 0;
  v_coupon_disc int := 0;
  v_shipping    int := 0;
  v_free_thr    int;
  v_flat_cost   int;
  v_item        jsonb;
  v_product     public.products%rowtype;
  v_qty         int;
  v_coupon      public.coupons%rowtype;
  v_qty_tiers   jsonb;
  v_rates       jsonb;
  v_quotation   text;
  v_rate_cost   int;
  v_rate_min    int;
  v_carrier     text;
  v_service     text;
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

  -- Descuento por volumen: unidades del mismo compuesto (name + categoría)
  -- suman entre concentraciones; el escalón más alto alcanzado descuenta
  -- toda la línea de ese compuesto. floor() casa con Math.floor del cliente.
  select value->'tiers' into v_qty_tiers
    from public.settings
   where key = 'qty_discounts' and (value->>'enabled')::boolean;

  if v_qty_tiers is not null then
    select coalesce(sum(floor(g.line_cents * coalesce(t.pct, 0) / 100))::int, 0)
      into v_qty_disc
      from (
        select pr.name, pr.category_id,
               sum(oi.qty)::int         as fam_qty,
               sum(oi.total_cents)::int as line_cents
          from public.order_items oi
          join public.products pr on pr.id = oi.product_id
         where oi.order_id = v_order_id
         group by pr.name, pr.category_id
      ) g
      left join lateral (
        select (tt->>'percent')::numeric as pct
          from jsonb_array_elements(v_qty_tiers) tt
         where (tt->>'min_qty')::int <= g.fam_qty
         order by (tt->>'min_qty')::int desc
         limit 1
      ) t on true;
  end if;

  -- Cupón: aquí solo se calcula cuánto descontaría; el uso se registra más
  -- abajo únicamente si el cupón le gana al descuento por volumen.
  if p_coupon is not null and length(trim(p_coupon)) > 0 then
    select * into v_coupon from public.coupons
     where code = upper(trim(p_coupon)) and active
       and (expires_at is null or expires_at > now())
       and (max_uses is null or used_count < max_uses)
       and min_subtotal_cents <= v_subtotal;
    if found then
      v_coupon_disc := case when v_coupon.kind = 'percent'
                            then (v_subtotal * v_coupon.value) / 100
                            else least(v_coupon.value, v_subtotal) end;
    end if;
  end if;

  -- No acumulables: se aplica el mayor de los dos.
  if v_coupon_disc > v_qty_disc then
    v_discount := v_coupon_disc;
    update public.coupons set used_count = used_count + 1 where code = v_coupon.code;
    update public.orders set coupon_code = v_coupon.code where id = v_order_id;
  else
    v_discount := v_qty_disc;
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
