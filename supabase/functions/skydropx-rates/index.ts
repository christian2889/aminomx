// ============================================================================
// skydropx-rates — Skydropx PRO (API v2, OAuth2 client_credentials)
//
// Secrets:
//   SKYDROPX_CLIENT_ID      · "Clave de cliente (API Key)"
//   SKYDROPX_CLIENT_SECRET  · "Clave secreta del cliente (API Secret key)"
//   SKYDROPX_API_URL        · default https://pro.skydropx.com/api/v1
//                             sandbox https://sb-pro.skydropx.com/api/v1
//   ORIGIN_*                · dirección de origen del envío
//
// Body:
//   { action?: 'quote' | 'label', order_id?: uuid, to: {...}, parcel?: {...},
//     quotation_id?: string, rate_id?: string }
//
//   'quote' (default) → cotiza y devuelve tarifas ordenadas por precio.
//   'label'           → genera la guía con el rate_id elegido.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const CLIENT_ID = Deno.env.get('SKYDROPX_CLIENT_ID') ?? Deno.env.get('SKYDROPX_API_KEY');
const CLIENT_SECRET = Deno.env.get('SKYDROPX_CLIENT_SECRET');
const API_URL = (Deno.env.get('SKYDROPX_API_URL') ?? 'https://pro.skydropx.com/api/v1')
  .replace(/\/$/, '');

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Bodega real como valor por defecto: la dirección no es un secreto (va
// impresa en cada guía). Los secrets ORIGIN_* siguen teniendo prioridad si
// algún día cambia la bodega sin redesplegar.
const ORIGIN = {
  name: Deno.env.get('ORIGIN_NAME') ?? 'Aminos MX',
  company: Deno.env.get('ORIGIN_NAME') ?? 'Aminos MX',
  street1: Deno.env.get('ORIGIN_STREET') ?? 'Ryerson 1600',
  postal_code: Deno.env.get('ORIGIN_ZIP') ?? '22800',
  area_level1: Deno.env.get('ORIGIN_STATE') ?? 'Baja California',
  area_level2: Deno.env.get('ORIGIN_CITY') ?? 'Ensenada',
  area_level3: Deno.env.get('ORIGIN_NEIGHBORHOOD') ?? 'Zona Centro',
  country_code: 'MX',
  phone: Deno.env.get('ORIGIN_PHONE') ?? '+526461164390',
  email: Deno.env.get('ORIGIN_EMAIL') ?? 'envios@aminosmx.com',
  reference: Deno.env.get('ORIGIN_REFERENCE') ?? '',
};

/* ---------------------------------------------------------------- OAuth2 ---
   El token dura 2 h y el endpoint está limitado, así que lo cacheamos
   mientras la función siga caliente y lo renovamos 60 s antes de vencer.  */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    cachedToken = null;
    throw new Error(`Skydropx OAuth ${res.status}: ${JSON.stringify(data)}`);
  }

  const ttl = Number(data.expires_in ?? 7200);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
  return cachedToken.value;
}

async function sdx(path: string, init: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ------------------------------------------------------------ direcciones --- */
function toAddress(to: Record<string, unknown> = {}) {
  return {
    name: (to.recipient as string) ?? (to.name as string) ?? 'Cliente',
    company: '',
    street1: (to.line1 as string) ?? '',
    street2: (to.line2 as string) ?? '',
    postal_code: (to.postal_code as string) ?? '',
    area_level1: (to.state as string) ?? '',
    area_level2: (to.city as string) ?? '',
    area_level3: (to.neighborhood as string) ?? (to.line2 as string) ?? '',
    country_code: (to.country as string) ?? 'MX',
    phone: (to.phone as string) ?? '',
    email: (to.email as string) ?? '',
    reference: (to.reference as string) ?? '',
  };
}

/* Las tarifas llegan de forma progresiva: la cotización se marca is_completed
   cuando todas las paqueterías respondieron. Sondeamos con un tope corto. */
/* Skydropx PRE-CREA una entrada por cada paqueteria/servicio con
   status:"pending" y total:null, y las va resolviendo en segundos. Contar
   entradas engana (siempre hay ~25 desde el primer segundo): lo que importa
   es cuantas ya traen total. */
async function waitForRates(quotationId: string, tries = 15, waitMs = 1500) {
  let last: Record<string, unknown> = {};
  for (let i = 0; i < tries; i++) {
    const { ok, data } = await sdx(`/quotations/${quotationId}`);
    if (!ok) break;
    last = data;
    const rates = (data?.rates ?? []) as Record<string, unknown>[];
    const listas = rates.filter((r) => r?.total != null).length;
    if (data?.is_completed === true) return data;
    if (listas >= 3 && i >= 2) return data;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return last;
}

function normalizeRates(raw: Record<string, unknown>[] = []) {
  // Campos reales de PRO v2: provider_name / provider_display_name /
  // provider_service_name / amount / total / days / currency_code.
  return raw
    .filter((r) => r?.total != null && r?.status !== 'pending')
    .map((r) => ({
      id: r.id,
      provider: r.provider_display_name ?? r.provider_name ?? r.provider ?? null,
      service: r.provider_service_name ?? r.service_level_name ?? null,
      days: r.days ?? null,
      currency: r.currency_code ?? r.currency ?? 'MXN',
      total: Number(r.total ?? r.amount ?? 0),
      cost_cents: Math.round(Number(r.total ?? r.amount ?? 0) * 100),
      pickup: r.pickup === true,
    }))
    .sort((a, b) => a.cost_cents - b.cost_cents);
}

/* ------------------------------------------------------------------ handler */
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
    const { action = 'quote', order_id, to, parcel, quotation_id, rate_id } = body ?? {};

    const box = {
      weight: Number(parcel?.weight ?? 1),
      height: Number(parcel?.height ?? 12),
      width: Number(parcel?.width ?? 15),
      length: Number(parcel?.length ?? 20),
    };

    /* ------------------------------------------------------------- cotizar */
    if (action === 'quote') {
      const dest = toAddress(to);
      if (!dest.postal_code) return json({ error: 'Falta el código postal de destino', rates: [] }, 400);

      const created = await sdx('/quotations', {
        method: 'POST',
        body: JSON.stringify({
          quotation: {
            // area_level3 es la colonia y Skydropx PRO la exige en ambos
            // extremos: si va vacía responde 422 sin cotizar. Cuando no la
            // tenemos usamos el municipio, que es lo más cercano y permite
            // cotizar; para exactitud conviene fijar ORIGIN_NEIGHBORHOOD.
            address_from: {
              postal_code: ORIGIN.postal_code,
              area_level1: ORIGIN.area_level1,
              area_level2: ORIGIN.area_level2,
              area_level3: ORIGIN.area_level3 || ORIGIN.area_level2,
              country_code: 'MX',
            },
            address_to: {
              postal_code: dest.postal_code,
              area_level1: dest.area_level1,
              area_level2: dest.area_level2,
              area_level3: dest.area_level3 || dest.area_level2,
              country_code: dest.country_code,
            },
            parcel: box,
          },
        }),
      });
      if (!created.ok) return json({ error: 'Skydropx', detail: created.data, rates: [] }, 502);

      const qid = String(created.data?.id ?? '');
      const full = qid ? await waitForRates(qid) : created.data;
      const rates = normalizeRates((full?.rates ?? []) as Record<string, unknown>[]);
      const best = rates[0];

      if (order_id && best) {
        await admin.from('shipments').upsert({
          order_id,
          carrier: best.provider,
          service: best.service,
          cost_cents: best.cost_cents,
          skydropx_shipment_id: qid,
          skydropx_payload: full,
          status: 'quoted',
        }, { onConflict: 'order_id' });
      }

      // Sin tarifas casi nunca es un fallo de red: suele ser que la cuenta no
      // tiene paqueterías habilitadas para esa ruta, o que cada una devolvió su
      // propio error. Devolvemos el detalle para no quedarnos a ciegas.
      if (!rates.length) {
        const raw = (full?.rates ?? []) as Record<string, unknown>[];
        return json({
          ok: true, quotation_id: qid, rates: [],
          diagnostico: {
            is_completed: full?.is_completed ?? null,
            tarifas_devueltas: raw.length,
            motivos: raw.map((r) => ({
              provider: r.provider ?? null,
              success: r.success ?? null,
              error: r.error ?? r.error_messages ?? r.message ?? null,
              total: r.total ?? null,
            })).slice(0, 10),
          },
        });
      }

      // La cotización se persiste con service_role y el navegador recibe solo
      // IDs: create_order releerá el precio de shipping_quotes. Si el cliente
      // manipula el JSON de tarifas en su consola, no cambia lo que se cobra.
      const { data: qrow } = await admin
        .from('shipping_quotes')
        .insert({ quotation_id: qid, postal_code: dest.postal_code, rates })
        .select('id')
        .single();

      return json({ ok: true, quotation_id: qid, quote_id: qrow?.id ?? null, rates });
    }

    /* --------------------------------------------------------- generar guía */
    if (action === 'label') {
      if (!rate_id) return json({ error: 'Falta rate_id' }, 400);

      const created = await sdx('/shipments', {
        method: 'POST',
        body: JSON.stringify({
          shipment: {
            quotation_id,
            rate_id,
            address_from: ORIGIN,
            address_to: toAddress(to),
            consignment_note_class_code: '53102400', // productos de laboratorio
            consignment_note_packaging_code: '4G',
          },
        }),
      });
      if (!created.ok) return json({ error: 'Skydropx', detail: created.data }, 502);

      const d = created.data ?? {};
      const included = (d.included ?? []) as Record<string, unknown>[];
      const label = included.find((x) => x?.type === 'labels') ?? {};
      const attrs = (label.attributes ?? {}) as Record<string, unknown>;

      const tracking = String(
        attrs.tracking_number ?? d.tracking_number ?? d.master_tracking_number ?? '',
      ) || null;
      const labelUrl = String(attrs.label_url ?? d.label_url ?? '') || null;
      const trackUrl = String(attrs.tracking_url ?? d.tracking_url ?? '') || null;

      if (order_id) {
        await admin.from('shipments').upsert({
          order_id,
          carrier: String(attrs.provider ?? d.provider ?? '') || null,
          service: String(attrs.provider_service_name ?? d.service ?? '') || null,
          tracking_number: tracking,
          tracking_url: trackUrl,
          label_url: labelUrl,
          skydropx_shipment_id: String(d.id ?? ''),
          skydropx_payload: d,
          status: 'label_created',
        }, { onConflict: 'order_id' });

        // La guía no cambia el estado del pedido por sí sola: se registra en la
        // línea de tiempo con el estado que el pedido ya tiene.
        const { data: ord } = await admin
          .from('orders').select('status').eq('id', order_id).maybeSingle();

        await admin.from('order_events').insert({
          order_id,
          status: ord?.status ?? 'processing',
          note: `Guía generada${tracking ? ` · ${tracking}` : ''}`,
        });
      }

      return json({
        ok: true,
        shipment_id: d.id ?? null,
        tracking_number: tracking,
        tracking_url: trackUrl,
        label_url: labelUrl,
      });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
