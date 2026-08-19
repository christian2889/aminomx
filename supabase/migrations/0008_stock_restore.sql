-- ============================================================================
-- 0008 — Devolución de inventario
--
-- create_order descuenta stock al crear el pedido para que dos clientes no
-- compren la última pieza. El problema: si el pago nunca se completa (ficha
-- OXXO vencida, pago rechazado, pedido cancelado) ese stock quedaba
-- descontado para siempre y el catálogo mostraba "agotado" con producto en
-- bodega. Lo mismo pasaba con used_count de los cupones.
-- ============================================================================

alter table public.orders
  add column if not exists stock_restored_at timestamptz;

comment on column public.orders.stock_restored_at is
  'Marca de cuándo se devolvió el inventario de este pedido. Hace la
   devolución idempotente: un webhook reintentado no la duplica.';

create or replace function public.restore_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item  record;
begin
  -- Solo staff o el propio backend (service_role) pueden devolver inventario.
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'No autorizado';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return false;
  end if;

  -- Idempotente: un reintento del webhook no devuelve el stock dos veces.
  if v_order.stock_restored_at is not null then
    return false;
  end if;

  -- Un pedido pagado conserva su stock descontado: ya se vendió.
  if v_order.payment_status = 'paid' then
    return false;
  end if;

  for v_item in
    select product_id, qty from public.order_items
     where order_id = p_order_id and product_id is not null
  loop
    update public.products
       set stock = stock + v_item.qty
     where id = v_item.product_id;
  end loop;

  -- El cupón tampoco debe quedar consumido por una venta que no ocurrió.
  if v_order.coupon_code is not null then
    update public.coupons
       set used_count = greatest(0, used_count - 1)
     where code = v_order.coupon_code;
  end if;

  update public.orders set stock_restored_at = now() where id = p_order_id;

  insert into public.order_events (order_id, status, note, visible_to_customer)
  values (p_order_id, v_order.status, 'Inventario devuelto al catálogo', false);

  return true;
end $$;

revoke execute on function public.restore_order_stock(uuid) from anon;
grant execute on function public.restore_order_stock(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Operación inversa: volver a apartar el inventario.
--
-- Si a un pedido se le devolvió el stock (ficha vencida) y el cliente
-- reintenta pagarlo, hay que apartarlo otra vez ANTES de cobrar. Sin esto se
-- vendería sin descontar y el catálogo mentiría al revés.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_item    record;
  v_product public.products%rowtype;
begin
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'No autorizado';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return false;
  end if;

  -- Sin devolución previa el stock ya está apartado desde create_order.
  if v_order.stock_restored_at is null then
    return false;
  end if;

  -- Primero verificamos todo: no queremos apartar la mitad y fallar.
  for v_item in
    select product_id, qty, name from public.order_items
     where order_id = p_order_id and product_id is not null
  loop
    select * into v_product from public.products
     where id = v_item.product_id for update;
    if not found or v_product.stock < v_item.qty then
      raise exception 'Ya no hay inventario suficiente de %', v_item.name;
    end if;
  end loop;

  for v_item in
    select product_id, qty from public.order_items
     where order_id = p_order_id and product_id is not null
  loop
    update public.products
       set stock = stock - v_item.qty
     where id = v_item.product_id;
  end loop;

  if v_order.coupon_code is not null then
    update public.coupons
       set used_count = used_count + 1
     where code = v_order.coupon_code;
  end if;

  update public.orders set stock_restored_at = null where id = p_order_id;

  insert into public.order_events (order_id, status, note, visible_to_customer)
  values (p_order_id, v_order.status, 'Inventario apartado de nuevo', false);

  return true;
end $$;

revoke execute on function public.reserve_order_stock(uuid) from anon;
grant execute on function public.reserve_order_stock(uuid) to authenticated, service_role;
