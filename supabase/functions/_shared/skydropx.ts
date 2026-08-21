// ============================================================================
// _shared/skydropx — cliente Skydropx PRO (API v2, OAuth2 client_credentials)
// compartido por skydropx-rates (cotizar/guía manual) y stripe-webhook
// (guía automática al confirmarse el pago, sin salto HTTP entre funciones).
//
// Secrets:
//   SKYDROPX_CLIENT_ID / SKYDROPX_CLIENT_SECRET · credenciales PRO
//   SKYDROPX_API_URL          · default https://pro.skydropx.com/api/v1
//   SKYDROPX_CONSIGNMENT_CODE · clave SAT carta porte (default 53131619,
//                               "Cosméticos"; la fija el comerciante)
//   SKYDROPX_PACKAGE_TYPE     · embalaje SAT (default 4G, caja de cartón)
//   ORIGIN_*                  · dirección de origen (hay defaults de bodega)
// ============================================================================

// deno-lint-ignore-file no-explicit-any

export const CLIENT_ID = Deno.env.get('SKYDROPX_CLIENT_ID') ?? Deno.env.get('SKYDROPX_API_KEY');
export const CLIENT_SECRET = Deno.env.get('SKYDROPX_CLIENT_SECRET');
const API_URL = (Deno.env.get('SKYDROPX_API_URL') ?? 'https://pro.skydropx.com/api/v1')
  .replace(/\/$/, '');

// Clave de producto SAT para la carta porte. El endpoint /shipments la exige
// en cada paquete; sin ella Skydropx responde 422 y no hay guía.
const CONSIGNMENT_CODE = Deno.env.get('SKYDROPX_CONSIGNMENT_CODE') ?? '53131619';
const PACKAGE_TYPE = Deno.env.get('SKYDROPX_PACKAGE_TYPE') ?? '4G';

// Bodega real como valor por defecto: la dirección no es un secreto (va
// impresa en cada guía). Los secrets ORIGIN_* tienen prioridad si algún día
// cambia la bodega sin redesplegar. `reference` no puede ir vacía: /shipments
// la exige en ambas direcciones.
export const ORIGIN = {
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
  reference: (Deno.env.get('ORIGIN_REFERENCE') || 'Bodega Aminos MX').slice(0, 40),
};

export const DEFAULT_BOX = { weight: 1, height: 12, width: 15, length: 20 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- OAuth2 ---
   El token dura 2 h y el endpoint está limitado: se cachea mientras la
   función siga caliente y se renueva 60 s antes de vencer. */
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

export async function sdx(path: string, init: RequestInit = {}) {
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

/* ------------------------------------------------------------ direcciones */
export function toAddress(to: Record<string, any> = {}) {
  const s = (v: unknown) => (v == null ? '' : String(v).trim());
  return {
    name: s(to.recipient) || s(to.name) || 'Cliente',
    company: '',
    street1: s(to.line1),
    street2: s(to.line2),
    postal_code: s(to.postal_code),
    area_level1: s(to.state),
    area_level2: s(to.city),
    area_level3: s(to.neighborhood) || s(to.line2) || s(to.city),
    country_code: s(to.country) || 'MX',
    phone: s(to.phone),
    email: s(to.email),
    // /shipments exige reference en ambas direcciones ("no puede estar en
    // blanco") y la limita a 40 caracteres; si el cliente no dejó
    // referencias se manda un texto neutro.
    reference: (s(to.reference) || s(to.line2) || 'Sin referencias').slice(0, 40),
  };
}

/* ------------------------------------------------------------- cotización ---
   Skydropx PRE-CREA una entrada por paquetería/servicio con status:"pending"
   y total:null y las resuelve en segundos. Contar entradas engaña (siempre
   hay ~25 desde el primer segundo): lo que importa es cuántas traen total. */
export async function waitForRates(quotationId: string, tries = 15, waitMs = 1500) {
  let last: Record<string, any> = {};
  for (let i = 0; i < tries; i++) {
    const { ok, data } = await sdx(`/quotations/${quotationId}`);
    if (!ok) break;
    last = data;
    const rates = (data?.rates ?? []) as Record<string, any>[];
    const listas = rates.filter((r) => r?.total != null).length;
    if (data?.is_completed === true) return data;
    if (listas >= 3 && i >= 2) return data;
    await sleep(waitMs);
  }
  return last;
}

export function normalizeRates(raw: Record<string, any>[] = []) {
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

export type Box = { weight: number; height: number; width: number; length: number };
export type Rate = ReturnType<typeof normalizeRates>[number];

export async function quoteForAddress(dest: Record<string, any>, box: Box): Promise<{
  qid: string;
  full: Record<string, any>;
  rates: Rate[];
  error?: unknown;
}> {
  const created = await sdx('/quotations', {
    method: 'POST',
    body: JSON.stringify({
      quotation: {
        // area_level3 es la colonia y Skydropx PRO la exige en ambos
        // extremos: si va vacía responde 422 sin cotizar.
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
          country_code: dest.country_code || 'MX',
        },
        parcel: box,
      },
    }),
  });
  if (!created.ok) {
    console.error('Skydropx /quotations rechazado', created.status, JSON.stringify(created.data));
    return { qid: '', full: {}, rates: [], error: created.data };
  }
  const qid = String(created.data?.id ?? '');
  const full = qid ? await waitForRates(qid) : created.data;
  const rates = normalizeRates((full?.rates ?? []) as Record<string, any>[]);
  return { qid, full, rates };
}

/* ------------------------------------------------------------------- guía */
export type ParsedShipment = {
  id: string | null;
  status: string | null;
  carrier: string | null;
  service: string | null;
  tracking: string | null;
  trackUrl: string | null;
  labelUrl: string | null;
};

// La respuesta real de /shipments es JSON:API: el tracking maestro vive en
// data.attributes (master_tracking_number, carrier_name, workflow_status) y
// el PDF de la guía + URL de rastreo en included[type='package'].attributes
// (label_url, tracking_url_provider). Se aceptan también formas planas.
export function parseShipment(payload: any): ParsedShipment {
  const root = payload?.data ?? payload ?? {};
  const attrs = root?.attributes ?? root ?? {};
  const included = (payload?.included ?? root?.included ?? []) as any[];
  const labelNode = included.find((x) => x?.type === 'labels' || x?.type === 'label')
    ?? included.find((x) => x?.type === 'package')
    ?? {};
  const la = labelNode?.attributes ?? labelNode ?? {};
  const pick = (...vals: unknown[]) => {
    for (const v of vals) {
      const s = v == null ? '' : String(v).trim();
      if (s && s !== 'undefined' && s !== 'null') return s;
    }
    return null;
  };
  return {
    id: pick(root?.id, attrs?.id),
    status: pick(attrs?.workflow_status, attrs?.status),
    carrier: pick(la?.provider_display_name, la?.provider_name, attrs?.provider_display_name,
      attrs?.provider_name, attrs?.carrier_name, attrs?.provider),
    service: pick(la?.provider_service_name, attrs?.provider_service_name, attrs?.service),
    tracking: pick(la?.tracking_number, attrs?.tracking_number, attrs?.master_tracking_number),
    trackUrl: pick(la?.tracking_url_provider, la?.tracking_url, attrs?.tracking_url),
    labelUrl: pick(la?.label_url, la?.label_file_url, la?.file_url, attrs?.label_url),
  };
}

export type LabelResult =
  | { ok: true; parsed: ParsedShipment; raw: Record<string, any> }
  | { ok: false; status: number; detail: unknown };

export async function createLabel(opts: {
  quotationId?: string | null;
  rateId: string;
  dest: ReturnType<typeof toAddress>;
  box: Box;
}): Promise<LabelResult> {
  const created = await sdx('/shipments', {
    method: 'POST',
    body: JSON.stringify({
      shipment: {
        ...(opts.quotationId ? { quotation_id: opts.quotationId } : {}),
        rate_id: opts.rateId,
        address_from: ORIGIN,
        address_to: opts.dest,
        // consignment_note y package_type son obligatorios POR PAQUETE
        // ("El atributo … es requerido en todos los paquetes"), no a nivel
        // shipment como sugiere el ejemplo de la documentación.
        packages: [{
          package_number: 1,
          package_type: PACKAGE_TYPE,
          consignment_note: CONSIGNMENT_CODE,
          weight: opts.box.weight,
          height: opts.box.height,
          width: opts.box.width,
          length: opts.box.length,
        }],
      },
    }),
  });
  if (!created.ok) {
    console.error('Skydropx /shipments rechazado', created.status, JSON.stringify(created.data));
    return { ok: false, status: created.status, detail: created.data };
  }

  // La guía puede tardar unos segundos en emitirse: si la respuesta aún no
  // trae tracking o PDF, se consulta el shipment hasta que aparezcan.
  let raw = created.data ?? {};
  let parsed = parseShipment(raw);
  for (let i = 0; i < 8 && parsed.id && (!parsed.tracking || !parsed.labelUrl); i++) {
    await sleep(1500);
    const got = await sdx(`/shipments/${parsed.id}`);
    if (!got.ok) break;
    raw = got.data ?? raw;
    const again = parseShipment(raw);
    parsed = { ...again, id: again.id ?? parsed.id };
  }
  return { ok: true, parsed, raw };
}

/* ------------------------------------------------- persistir en el pedido */
type Client = {
  from: (t: string) => any;
};

export async function saveLabelToOrder(
  admin: Client,
  orderId: string,
  parsed: ParsedShipment,
  raw: Record<string, any>,
  fallback: { carrier?: string | null; service?: string | null } = {},
  opts: { advance?: boolean } = {},
) {
  // Solo se escriben los campos con valor: un dato aún desconocido (p. ej. el
  // PDF que tarda unos segundos en emitirse) no debe borrar lo ya guardado.
  const carrier = parsed.carrier ?? fallback.carrier;
  const service = parsed.service ?? fallback.service;
  // El nombre viene en minúsculas del API (carrier_name): se capitaliza.
  const nice = (v: string | null | undefined) =>
    v && v === v.toLowerCase() ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  await admin.from('shipments').upsert({
    order_id: orderId,
    ...(carrier ? { carrier: nice(carrier) } : {}),
    ...(service ? { service } : {}),
    ...(parsed.tracking ? { tracking_number: parsed.tracking } : {}),
    ...(parsed.trackUrl ? { tracking_url: parsed.trackUrl } : {}),
    ...(parsed.labelUrl ? { label_url: parsed.labelUrl } : {}),
    skydropx_shipment_id: parsed.id ?? '',
    skydropx_payload: raw,
    status: 'label_created',
  }, { onConflict: 'order_id' });

  const { data: ord } = await admin.from('orders')
    .select('status').eq('id', orderId).maybeSingle();
  let status = ord?.status ?? 'processing';

  // Con la guía emitida el pedido pasa a "processing" (nunca retrocede);
  // skydropx-webhook lo avanzará a shipped cuando la paquetería recolecte.
  if (opts.advance && (status === 'pending' || status === 'paid')) {
    await admin.from('orders').update({ status: 'processing' }).eq('id', orderId);
    status = 'processing';
  }

  await admin.from('order_events').insert({
    order_id: orderId,
    status,
    note: `${opts.advance ? 'Guía generada automáticamente' : 'Guía generada'}${
      parsed.tracking ? ` · ${parsed.tracking}` : ''}`,
  });
}

/* ---------------------------------------------------------- guía automática
   Flujo completo para un pedido pagado: usa la cotización elegida en el
   checkout; si venció (OXXO se paga días después) o no existe, recotiza y
   prefiere la misma paquetería/servicio o cae a la más barata. Nunca lanza:
   el pago jamás debe fallar por la guía. */
export async function autoLabelOrder(
  admin: Client,
  orderId: string,
): Promise<Record<string, unknown>> {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) return { ok: false, skipped: 'Skydropx sin configurar' };

    const { data: ord } = await admin.from('orders')
      .select('id, order_number, status, payment_status, email, phone, customer_name, shipping_address')
      .eq('id', orderId).maybeSingle();
    if (!ord) return { ok: false, error: 'Pedido no encontrado' };
    if (ord.payment_status !== 'paid') return { ok: false, skipped: 'Pago no confirmado' };
    if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(ord.status)) {
      return { ok: false, skipped: `Pedido ya en estado ${ord.status}` };
    }

    const { data: ship } = await admin.from('shipments')
      .select('*').eq('order_id', orderId).maybeSingle();
    if (ship?.tracking_number) {
      return { ok: true, already: true, tracking_number: ship.tracking_number };
    }

    const addr = (ord.shipping_address ?? {}) as Record<string, any>;
    const dest = toAddress({
      ...addr,
      recipient: addr.recipient ?? ord.customer_name,
      phone: addr.phone ?? ord.phone,
      email: addr.email ?? ord.email,
    });
    if (!dest.postal_code) {
      await admin.from('order_events').insert({
        order_id: orderId, status: ord.status,
        note: 'Guía automática omitida: el pedido no tiene código postal',
        visible_to_customer: false,
      });
      return { ok: false, error: 'Pedido sin código postal' };
    }

    const box = DEFAULT_BOX;
    let fallback = { carrier: ship?.carrier ?? null, service: ship?.service ?? null };
    let attempt: LabelResult | null = null;

    // 1º: la tarifa exacta que el cliente eligió y pagó en el checkout.
    if (ship?.skydropx_shipment_id && ship?.skydropx_rate_id) {
      attempt = await createLabel({
        quotationId: ship.skydropx_shipment_id,
        rateId: ship.skydropx_rate_id,
        dest, box,
      });
    }

    // 2º: recotizar (tarifa vencida, sin cotización guardada o rechazo).
    if (!attempt || !attempt.ok) {
      const q = await quoteForAddress(dest, box);
      if (!q.rates.length) {
        await admin.from('order_events').insert({
          order_id: orderId, status: ord.status,
          note: 'Guía automática pendiente: Skydropx no devolvió tarifas. Genérala desde el panel.',
          visible_to_customer: false,
        });
        return { ok: false, error: 'Sin tarifas', detail: q.error ?? null };
      }
      const same = q.rates.find((r) =>
        r.provider === fallback.carrier && r.service === fallback.service);
      const rate = same ?? q.rates[0];
      fallback = { carrier: rate.provider, service: rate.service };
      attempt = await createLabel({ quotationId: q.qid, rateId: String(rate.id), dest, box });
    }

    if (!attempt.ok) {
      await admin.from('order_events').insert({
        order_id: orderId, status: ord.status,
        note: 'Guía automática pendiente: Skydropx rechazó la creación. Genérala desde el panel.',
        visible_to_customer: false,
      });
      return { ok: false, error: 'Skydropx rechazó la guía', detail: attempt.detail };
    }

    await saveLabelToOrder(admin, orderId, attempt.parsed, attempt.raw, fallback, { advance: true });
    return {
      ok: true,
      tracking_number: attempt.parsed.tracking,
      tracking_url: attempt.parsed.trackUrl,
      label_url: attempt.parsed.labelUrl,
      shipment_id: attempt.parsed.id,
    };
  } catch (e) {
    console.error('autoLabelOrder', orderId, e);
    return { ok: false, error: String(e) };
  }
}
