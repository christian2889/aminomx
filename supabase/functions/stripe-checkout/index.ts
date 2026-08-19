// ============================================================================
// stripe-checkout — crea una sesión de Stripe Checkout para un pedido
// Secrets: STRIPE_SECRET_KEY, SITE_URL (opcional), SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY
// Body: { order_id: uuid, success_url?: string, cancel_url?: string }
// Seguridad: requiere JWT; el pedido debe pertenecer al usuario y estar
// pendiente. Los montos salen SIEMPRE de la base de datos.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://aminomx.vercel.app').replace(/\/$/, '');
const OXXO_MAX_CENTS = 1000000; // límite OXXO: $10,000 MXN

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!STRIPE_KEY) return json({ error: 'STRIPE_SECRET_KEY no configurada' }, 501);

  try {
    // Usuario autenticado (verify_jwt ya validó el token; obtenemos su id)
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: userData } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userData?.user;
    if (!user) return json({ error: 'Sesión inválida' }, 401);

    const { order_id, success_url, cancel_url } = await req.json();
    if (!order_id) return json({ error: 'order_id requerido' }, 400);

    const { data: order, error } = await admin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();
    if (error || !order) return json({ error: 'Pedido no encontrado' }, 404);

    // El dueño del pedido, o staff/admin generando una liga de cobro
    if (order.user_id !== user.id) {
      const { data: prof } = await admin.from('profiles')
        .select('role').eq('id', user.id).maybeSingle();
      if (!prof || !['admin', 'staff'].includes(prof.role)) {
        return json({ error: 'Este pedido no es tuyo' }, 403);
      }
    }
    if (order.payment_status === 'paid') return json({ error: 'Este pedido ya está pagado' }, 409);
    if (['cancelled', 'refunded'].includes(order.status)) {
      return json({ error: 'Este pedido está cancelado' }, 409);
    }

    // Si a este pedido ya se le devolvió el inventario (ficha OXXO vencida,
    // pago rechazado) hay que volver a apartarlo ANTES de cobrar. Si mientras
    // tanto se agotó, mejor enterarnos aquí que después de cobrarle.
    if (order.stock_restored_at) {
      const { error: reserveErr } = await admin.rpc('reserve_order_stock', {
        p_order_id: order.id,
      });
      if (reserveErr) {
        return json({ error: reserveErr.message ?? 'Ya no hay inventario para este pedido' }, 409);
      }
    }

    // Construir la sesión con montos de la base
    const p = new URLSearchParams();
    p.set('mode', 'payment');
    p.set('client_reference_id', order.id);
    p.set('customer_email', order.email);
    p.set('locale', 'es-419');
    p.set('success_url', success_url ?? `${SITE_URL}/cuenta.html?pago=exito&pedido=${order.order_number}`);
    p.set('cancel_url', cancel_url ?? `${SITE_URL}/cuenta.html?pago=cancelado&pedido=${order.order_number}`);
    p.set('metadata[order_id]', order.id);
    p.set('metadata[order_number]', order.order_number);
    p.set('payment_intent_data[metadata][order_id]', order.id);
    p.set('payment_intent_data[metadata][order_number]', order.order_number);

    p.set('payment_method_types[0]', 'card');
    if (order.total_cents <= OXXO_MAX_CENTS) p.set('payment_method_types[1]', 'oxxo');

    let i = 0;
    const addLine = (name: string, unit: number, qty: number) => {
      p.set(`line_items[${i}][price_data][currency]`, 'mxn');
      p.set(`line_items[${i}][price_data][product_data][name]`, name.slice(0, 250));
      p.set(`line_items[${i}][price_data][unit_amount]`, String(unit));
      p.set(`line_items[${i}][quantity]`, String(qty));
      i++;
    };

    if (order.discount_cents > 0) {
      // Con descuento: una sola partida consolidada para no alterar el total
      addLine(`Pedido ${order.order_number} (incluye descuento)`, order.total_cents, 1);
    } else {
      for (const it of order.order_items ?? []) {
        addLine(`${it.name}${it.presentation ? ` · ${it.presentation}` : ''}`, it.unit_price_cents, it.qty);
      }
      if (order.shipping_cents > 0) addLine('Envío refrigerado', order.shipping_cents, 1);
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: p.toString(),
    });
    const session = await res.json();
    if (!res.ok) {
      return json({ error: session?.error?.message ?? 'Error de Stripe' }, 502);
    }

    await admin.from('orders').update({
      stripe_session_id: session.id,
      payment_method: 'stripe',
    }).eq('id', order.id);

    return json({ ok: true, url: session.url, session_id: session.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
