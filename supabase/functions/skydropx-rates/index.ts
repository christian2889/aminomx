// ============================================================================
// skydropx-rates — Skydropx PRO (API v2, OAuth2 client_credentials)
//
// Secrets: ver _shared/skydropx.ts (SKYDROPX_*, ORIGIN_*).
//
// Body:
//   { action?: 'quote' | 'label' | 'auto_label', order_id?: uuid, to?: {...},
//     parcel?: {...}, quotation_id?: string, rate_id?: string,
//     carrier?: string, service?: string }
//
//   'quote' (default) → cotiza y devuelve tarifas ordenadas por precio.
//                       Cualquier usuario autenticado (checkout).
//   'label'           → genera la guía con el rate_id elegido (panel).
//   'auto_label'      → flujo completo para un pedido pagado (recotiza si
//                       la tarifa venció). También lo dispara stripe-webhook
//                       vía import directo, sin pasar por aquí.
//   Ambas acciones de guía cuestan dinero (descuentan saldo Skydropx):
//   exigen rol staff/admin, no basta un JWT válido.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  autoLabelOrder, CLIENT_ID, CLIENT_SECRET, createLabel, DEFAULT_BOX,
  quoteForAddress, saveLabelToOrder, toAddress,
} from '../_shared/skydropx.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function isStaff(req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
  const { data } = await admin.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: prof } = await admin.from('profiles')
    .select('role').eq('id', uid).maybeSingle();
  return prof?.role === 'admin' || prof?.role === 'staff';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return json({
      error: 'Skydropx sin configurar: faltan SKYDROPX_CLIENT_ID y/o SKYDROPX_CLIENT_SECRET',
      rates: [],
    }, 501);
  }

  try {
    const body = await req.json();
    const {
      action = 'quote', order_id, to, parcel, quotation_id, rate_id,
      carrier, service,
    } = body ?? {};

    const box = {
      weight: Number(parcel?.weight ?? DEFAULT_BOX.weight),
      height: Number(parcel?.height ?? DEFAULT_BOX.height),
      width: Number(parcel?.width ?? DEFAULT_BOX.width),
      length: Number(parcel?.length ?? DEFAULT_BOX.length),
    };

    /* ------------------------------------------------------------- cotizar */
    if (action === 'quote') {
      const dest = toAddress(to);
      if (!dest.postal_code) {
        return json({ error: 'Falta el código postal de destino', rates: [] }, 400);
      }

      const q = await quoteForAddress(dest, box);
      if (q.error) return json({ error: 'Skydropx', detail: q.error, rates: [] }, 502);

      const rates = q.rates;
      const best = rates[0];

      if (order_id && best) {
        // Recotización desde el panel: la más barata queda preseleccionada y
        // sus IDs guardados para que la guía (manual o automática) los use.
        await admin.from('shipments').upsert({
          order_id,
          carrier: best.provider,
          service: best.service,
          cost_cents: best.cost_cents,
          skydropx_shipment_id: q.qid,
          skydropx_rate_id: String(best.id ?? ''),
          skydropx_payload: q.full,
          status: 'quoted',
        }, { onConflict: 'order_id' });
      }

      // Sin tarifas casi nunca es un fallo de red: suele ser que la cuenta no
      // tiene paqueterías para esa ruta o cada una devolvió su propio error.
      if (!rates.length) {
        const raw = (q.full?.rates ?? []) as Record<string, unknown>[];
        return json({
          ok: true, quotation_id: q.qid, rates: [],
          diagnostico: {
            is_completed: q.full?.is_completed ?? null,
            tarifas_devueltas: raw.length,
            resueltas: raw.filter((r) => r?.total != null).length,
            con_error: raw.filter((r) => r?.error_messages).map((r) => ({
              provider: r.provider_display_name ?? r.provider_name,
              error: r.error_messages,
            })).slice(0, 6),
          },
        });
      }

      // La cotización se persiste con service_role y el navegador recibe solo
      // IDs: create_order releerá el precio de shipping_quotes. Si el cliente
      // manipula el JSON de tarifas en su consola, no cambia lo que se cobra.
      const { data: qrow } = await admin
        .from('shipping_quotes')
        .insert({ quotation_id: q.qid, postal_code: dest.postal_code, rates })
        .select('id')
        .single();

      return json({ ok: true, quotation_id: q.qid, quote_id: qrow?.id ?? null, rates });
    }

    /* --------------------------------------------------------- generar guía */
    if (action === 'label') {
      if (!(await isStaff(req))) {
        return json({ error: 'Solo staff puede generar guías' }, 403);
      }
      if (!rate_id) return json({ error: 'Falta rate_id' }, 400);

      const result = await createLabel({
        quotationId: quotation_id ?? null,
        rateId: String(rate_id),
        dest: toAddress(to),
        box,
      });
      if (!result.ok) return json({ error: 'Skydropx', detail: result.detail }, 502);

      if (order_id) {
        // Manual: registra la guía sin mover el estado; el admin decide.
        await saveLabelToOrder(admin, order_id, result.parsed, result.raw,
          { carrier, service }, { advance: false });
      }

      return json({
        ok: true,
        shipment_id: result.parsed.id,
        tracking_number: result.parsed.tracking,
        tracking_url: result.parsed.trackUrl,
        label_url: result.parsed.labelUrl,
      });
    }

    /* ----------------------------------------------------- guía automática */
    if (action === 'auto_label') {
      if (!(await isStaff(req))) {
        return json({ error: 'Solo staff puede generar guías' }, 403);
      }
      if (!order_id) return json({ error: 'Falta order_id' }, 400);
      const result = await autoLabelOrder(admin, order_id);
      return json(result, result.ok ? 200 : 502);
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error('skydropx-rates', e);
    return json({ error: String(e) }, 500);
  }
});
