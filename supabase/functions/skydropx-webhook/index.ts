// ============================================================================
// skydropx-webhook — actualiza estado de envío y notifica al cliente
// Secrets: SKYDROPX_WEBHOOK_SECRET, SUPABASE_*
//
// verify_jwt = false a propósito: quien llama es Skydropx, no un usuario con
// sesión. Si se deja en true, el gateway de Supabase responde
// UNAUTHORIZED_INVALID_JWT_FORMAT antes de ejecutar nada, porque el header
// Authorization trae el token de Skydropx y no un JWT. La autenticación la
// hace esta función con el token compartido.
//
// Autenticación: Skydropx manda el token en el header que elijas. Por default
// usa `Authorization: Bearer <token>`, pero el nombre es editable en su panel,
// así que aceptamos también `x-skydropx-signature` y el token pelón sin
// prefijo "Bearer". La comparación es de tiempo constante.
//
// Payload: Skydropx tiene dos formatos vivos según la sección/evento:
//   v1     { type, action, timestamp, data: { id, carrier, status, tracking_number } }
//   JSON:API { data: { id, type: "packages", attributes: { ... } } }
// Leemos ambos.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

const SECRET = Deno.env.get('SKYDROPX_WEBHOOK_SECRET');
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Estados de Skydropx → estados internos.
// Skydropx los manda en MAYÚSCULAS; normalizamos a minúsculas antes de buscar.
const MAP: Record<string, { shipment: string; order?: string }> = {
  pending:          { shipment: 'pending' },
  created:          { shipment: 'created' },
  label_created:    { shipment: 'label_created' },
  picked_up:        { shipment: 'picked_up', order: 'shipped' },
  in_transit:       { shipment: 'in_transit', order: 'shipped' },
  last_mile:        { shipment: 'out_for_delivery', order: 'shipped' },
  out_for_delivery: { shipment: 'out_for_delivery', order: 'shipped' },
  delivery_attempt: { shipment: 'delivery_attempt' },
  delivered:        { shipment: 'delivered', order: 'delivered' },
  exception:        { shipment: 'exception' },
  canceled:         { shipment: 'cancelled' },
  cancelled:        { shipment: 'cancelled' },
  returned:         { shipment: 'returned' },
};

/* ------------------------------------------------------------------- auth --- */
function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // Longitudes distintas: seguimos comparando para no filtrar el largo por tiempo.
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function presentedToken(req: Request): string {
  const raw = req.headers.get('x-skydropx-signature')
    ?? req.headers.get('x-webhook-token')
    ?? req.headers.get('authorization')
    ?? '';
  return raw.replace(/^Bearer\s+/i, '').trim();
}

/* ---------------------------------------------------------------- payload --- */
type Any = Record<string, unknown>;

const str = (v: unknown) => (v == null ? '' : String(v));

/** Busca una llave en el payload sin importar en qué nivel venga. */
function pick(payload: Any, keys: string[]): string {
  const attrs = ((payload?.data as Any)?.attributes ?? {}) as Any;
  const data = (payload?.data ?? {}) as Any;
  for (const k of keys) {
    const hit = attrs[k] ?? data[k] ?? payload[k];
    if (hit != null && hit !== '') return str(hit);
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405);
  if (!SECRET) return json({ error: 'webhook sin configurar' }, 501);
  if (!constantTimeEqual(presentedToken(req), SECRET)) {
    return json({ error: 'token inválido' }, 401);
  }

  try {
    const payload = (await req.json()) as Any;

    const trackingNumber = pick(payload, [
      'tracking_number', 'trackingNumber', 'master_tracking_number',
    ]);
    const shipmentId = pick(payload, ['shipment_id', 'shipmentId', 'id']);

    const rawStatus = pick(payload, [
      'status', 'shipment_status', 'tracking_status', 'event', 'action',
    ]).toLowerCase().replace(/^shipment_/, '');

    const mapped = MAP[rawStatus] ?? { shipment: rawStatus || 'unknown' };

    // Localizamos el envío por número de guía y, si no, por el id de Skydropx.
    type Ship = {
      id: string; order_id: string; status: string | null;
      shipped_at: string | null; delivered_at: string | null;
    };
    const COLS = 'id, order_id, status, shipped_at, delivered_at';
    let shipment: Ship | null = null;
    if (trackingNumber) {
      const { data } = await admin.from('shipments')
        .select(COLS).eq('tracking_number', trackingNumber).maybeSingle();
      shipment = (data as Ship) ?? null;
    }
    if (!shipment && shipmentId) {
      const { data } = await admin.from('shipments')
        .select(COLS).eq('skydropx_shipment_id', shipmentId).maybeSingle();
      shipment = (data as Ship) ?? null;
    }

    // 200 a propósito: si el envío no es nuestro, reintentar no lo va a arreglar
    // y Skydropx dejaría el webhook en falla permanente.
    if (!shipment) {
      return json({ ok: false, reason: 'envío no encontrado', tracking: trackingNumber });
    }

    // Las paqueterías reenvían y desordenan eventos. El estado del envío solo
    // avanza; un evento tardío se guarda en la línea de tiempo pero no lo
    // regresa. Las excepciones sí se aplican siempre: son noticia, no retroceso.
    const SHIP_RANK: Record<string, number> = {
      pending: 0, created: 1, label_created: 2, picked_up: 3,
      in_transit: 4, out_for_delivery: 5, delivery_attempt: 5, delivered: 6,
    };
    const ALWAYS = ['exception', 'cancelled', 'returned'];
    const shipAdvances = ALWAYS.includes(mapped.shipment)
      || (SHIP_RANK[mapped.shipment] ?? -1) > (SHIP_RANK[shipment.status ?? 'pending'] ?? -1);

    await admin.from('shipments').update({
      ...(shipAdvances ? { status: mapped.shipment } : {}),
      ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
      // Las marcas de tiempo se sellan una sola vez: guardan cuándo pasó de
      // verdad, no cuándo llegó el último reenvío.
      ...(mapped.shipment === 'delivered' && !shipment.delivered_at
        ? { delivered_at: new Date().toISOString() } : {}),
      ...(['in_transit', 'picked_up'].includes(mapped.shipment) && !shipment.shipped_at
        ? { shipped_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', shipment.id);

    await admin.from('shipment_events').insert({
      shipment_id: shipment.id,
      status: mapped.shipment,
      description: pick(payload, ['description', 'message', 'detail']) || null,
      location: pick(payload, ['location', 'city']) || null,
    });

    if (mapped.order) {
      // Nunca retrocedemos un pedido que ya avanzó.
      const { data: ord } = await admin
        .from('orders').select('status').eq('id', shipment.order_id).maybeSingle();
      const rank: Record<string, number> = {
        pending: 0, paid: 1, processing: 2, shipped: 3, delivered: 4,
      };
      const advances = (rank[mapped.order] ?? 0) > (rank[ord?.status ?? 'pending'] ?? 0);

      if (advances) {
        await admin.from('orders').update({ status: mapped.order }).eq('id', shipment.order_id);
        await admin.from('order_events').insert({
          order_id: shipment.order_id,
          status: mapped.order,
          note: mapped.order === 'shipped' ? 'Pedido enviado' : 'Pedido entregado',
        });

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
    }

    return json({ ok: true, status: mapped.shipment });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
