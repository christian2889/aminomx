// ============================================================================
// skydropx-webhook — actualiza estado de envío y notifica al cliente
// Secrets: SKYDROPX_WEBHOOK_SECRET, SUPABASE_*
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

const SECRET = Deno.env.get('SKYDROPX_WEBHOOK_SECRET');
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Estados de Skydropx → estados internos
const MAP: Record<string, { shipment: string; order?: string }> = {
  created:    { shipment: 'created' },
  in_transit: { shipment: 'in_transit', order: 'shipped' },
  out_for_delivery: { shipment: 'out_for_delivery', order: 'shipped' },
  delivered:  { shipment: 'delivered', order: 'delivered' },
  exception:  { shipment: 'exception' },
  cancelled:  { shipment: 'cancelled' },
};

Deno.serve(async (req) => {
  if (!SECRET) return json({ error: 'webhook sin configurar' }, 501);
  {
    const got = req.headers.get('x-skydropx-signature') ?? req.headers.get('authorization');
    if (got !== SECRET) return json({ error: 'firma inválida' }, 401);
  }
  try {
    const payload = await req.json();
    const trackingNumber = payload?.tracking_number ?? payload?.data?.tracking_number;
    const rawStatus = String(payload?.status ?? payload?.data?.status ?? '').toLowerCase();
    const mapped = MAP[rawStatus] ?? { shipment: rawStatus || 'unknown' };

    const { data: shipment } = await admin
      .from('shipments')
      .select('id, order_id')
      .eq('tracking_number', trackingNumber)
      .maybeSingle();
    if (!shipment) return json({ ok: false, reason: 'envío no encontrado' }, 404);

    await admin.from('shipments').update({
      status: mapped.shipment,
      ...(mapped.shipment === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
      ...(mapped.shipment === 'in_transit' ? { shipped_at: new Date().toISOString() } : {}),
    }).eq('id', shipment.id);

    await admin.from('shipment_events').insert({
      shipment_id: shipment.id,
      status: mapped.shipment,
      description: payload?.description ?? payload?.data?.description ?? null,
      location: payload?.location ?? null,
    });

    if (mapped.order) {
      await admin.from('orders').update({ status: mapped.order }).eq('id', shipment.order_id);
      await admin.from('order_events').insert({
        order_id: shipment.order_id,
        status: mapped.order,
        note: mapped.order === 'shipped' ? 'Pedido enviado' : 'Pedido entregado',
      });
      // Notificación al cliente
      const template = mapped.order === 'shipped' ? 'order_shipped' : 'order_delivered';
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ template, order_id: shipment.order_id }),
      }).catch(() => {});
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
