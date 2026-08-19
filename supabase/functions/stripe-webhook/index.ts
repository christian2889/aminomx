// ============================================================================
// stripe-webhook — confirma pagos de Stripe Checkout
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_…), SUPABASE_*
// verify_jwt=false: lo llama Stripe; se valida la firma Stripe-Signature
// (HMAC-SHA256 del esquema oficial t.payload → v1).
// Eventos: checkout.session.completed, checkout.session.async_payment_succeeded,
//          checkout.session.async_payment_failed, checkout.session.expired
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const TOLERANCE_S = 300;

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function verifySignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=', 2) as [string, string]),
  );
  const t = Number(parts['t']);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;

  const v1s = header.split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  if (!v1s.length) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${t}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  // comparación de tiempo constante
  return v1s.some((v1) => {
    if (v1.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < v1.length; i++) diff |= v1.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

async function markPaid(session: any) {
  const orderId = session?.metadata?.order_id ?? session?.client_reference_id;
  if (!orderId) return;
  const { data: order } = await admin.from('orders')
    .select('id, status, payment_status').eq('id', orderId).single();
  if (!order || order.payment_status === 'paid') return;

  await admin.from('orders').update({
    payment_status: 'paid',
    paid_at: new Date().toISOString(),
    stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    // no retroceder pedidos ya avanzados
    ...(order.status === 'pending' ? { status: 'paid' } : {}),
  }).eq('id', orderId);

  await admin.from('order_events').insert({
    order_id: orderId, status: 'paid',
    note: 'Pago confirmado (Stripe)',
  });
}

Deno.serve(async (req) => {
  if (!SECRET) return json({ error: 'webhook sin configurar' }, 501);
  const sig = req.headers.get('stripe-signature');
  if (!sig) return json({ error: 'sin firma' }, 400);

  const payload = await req.text();
  if (!(await verifySignature(payload, sig, SECRET))) {
    return json({ error: 'firma inválida' }, 401);
  }

  try {
    const event = JSON.parse(payload);
    const session = event?.data?.object;
    const orderId = session?.metadata?.order_id ?? session?.client_reference_id;

    switch (event?.type) {
      case 'checkout.session.completed':
        if (session?.payment_status === 'paid') {
          await markPaid(session); // tarjeta: pago inmediato
        } else if (orderId) {
          await admin.from('order_events').insert({
            order_id: orderId, status: 'pending',
            note: 'Ficha OXXO generada; esperando pago',
          });
        }
        break;
      case 'checkout.session.async_payment_succeeded':
        await markPaid(session); // OXXO pagado
        break;
      case 'checkout.session.async_payment_failed':
        if (orderId) {
          await admin.from('orders').update({ payment_status: 'failed' }).eq('id', orderId);
          await admin.from('order_events').insert({
            order_id: orderId, status: 'pending',
            note: 'El pago OXXO no se completó; puedes intentar de nuevo',
          });
        }
        break;
      case 'checkout.session.expired':
        if (orderId) {
          await admin.from('order_events').insert({
            order_id: orderId, status: 'pending',
            note: 'La sesión de pago expiró; puedes intentar de nuevo',
            visible_to_customer: false,
          });
        }
        break;
    }
    return json({ received: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
