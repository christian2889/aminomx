// ============================================================================
// skydropx-rates — cotiza envío y (opcional) genera guía
// Secrets: SKYDROPX_API_KEY, SKYDROPX_API_URL, ORIGIN_* , SUPABASE_*
// Body: { order_id?: uuid, to: { postal_code, city, state, ... }, parcel?: {...} }
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const API_KEY = Deno.env.get('SKYDROPX_API_KEY');
const API_URL = Deno.env.get('SKYDROPX_API_URL') ?? 'https://api.skydropx.com/v1';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ORIGIN = {
  name: Deno.env.get('ORIGIN_NAME') ?? 'Aminos MX',
  street1: Deno.env.get('ORIGIN_STREET') ?? '',
  city: Deno.env.get('ORIGIN_CITY') ?? 'Tijuana',
  province: Deno.env.get('ORIGIN_STATE') ?? 'Baja California',
  zip: Deno.env.get('ORIGIN_ZIP') ?? '22000',
  country: 'MX',
  phone: Deno.env.get('ORIGIN_PHONE') ?? '',
  email: Deno.env.get('ORIGIN_EMAIL') ?? 'envios@aminosmx.com',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!API_KEY) return json({ error: 'SKYDROPX_API_KEY no configurada', rates: [] }, 501);

  try {
    const { order_id, to, parcel } = await req.json();

    const body = {
      address_from: ORIGIN,
      address_to: {
        name: to?.recipient ?? 'Cliente',
        street1: to?.line1 ?? '',
        city: to?.city ?? '',
        province: to?.state ?? '',
        zip: to?.postal_code ?? '',
        country: 'MX',
        phone: to?.phone ?? '',
        email: to?.email ?? '',
      },
      parcels: [parcel ?? { length: 20, width: 15, height: 12, weight: 1 }],
      consignment_note_class_code: '53102400',
      consignment_note_packaging_code: '4G',
    };

    const res = await fetch(`${API_URL}/shipments`, {
      method: 'POST',
      headers: { Authorization: `Token token=${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment: body }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: 'Skydropx', detail: data }, 502);

    if (order_id) {
      await admin.from('shipments').upsert({
        order_id,
        carrier: data?.rates?.[0]?.provider ?? null,
        service: data?.rates?.[0]?.service_level_name ?? null,
        cost_cents: data?.rates?.[0]?.total_pricing
          ? Math.round(Number(data.rates[0].total_pricing) * 100) : null,
        skydropx_shipment_id: String(data?.id ?? ''),
        skydropx_payload: data,
        status: 'quoted',
      }, { onConflict: 'order_id' });
    }
    return json({ ok: true, shipment_id: data?.id, rates: data?.rates ?? [] });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
