// ============================================================================
// send-email — correos transaccionales vía Resend
// Secrets: RESEND_API_KEY, FROM_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Body: { template: 'order_confirmation'|'order_shipped'|'order_delivered',
//         order_id: uuid }
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Aminos MX <pedidos@aminosmx.com>';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const mxn = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
    .format((cents ?? 0) / 100);

function layout(title: string, body: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#0a0f16;font-family:Inter,Helvetica,Arial,sans-serif;color:#eef6f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:560px;background:#111a22;border:1px solid #253244;border-radius:14px;overflow:hidden">
      <tr><td style="padding:22px 26px;border-bottom:1px solid #253244">
        <span style="font-size:19px;font-weight:800">Aminos<span style="color:#14d3c4">MX</span></span>
        <div style="font-size:10px;letter-spacing:.2em;color:#8ba1ad;margin-top:3px">GRADO INVESTIGACIÓN</div>
      </td></tr>
      <tr><td style="padding:26px">
        <h1 style="margin:0 0 14px;font-size:21px">${title}</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:18px 26px;border-top:1px solid #253244;font-size:11px;color:#8ba1ad;line-height:1.6">
        Productos destinados exclusivamente a investigación de laboratorio.<br>
        No para consumo humano ni veterinario.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function itemsTable(items: any[]) {
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;font-size:14px">
    ${items.map((i) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #253244;color:#c9d7de">${i.name} × ${i.qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid #253244;text-align:right;font-weight:700">${mxn(i.total_cents)}</td>
    </tr>`).join('')}
  </table>`;
}

const TEMPLATES: Record<string, (o: any) => { subject: string; html: string }> = {
  order_confirmation: (o) => ({
    subject: `Pedido ${o.order_number} confirmado · Aminos MX`,
    html: layout('¡Gracias por tu pedido!', `
      <p style="color:#c9d7de;line-height:1.7">Recibimos tu pedido <strong style="color:#14d3c4">${o.order_number}</strong>.
      Te avisaremos en cuanto salga con su número de guía.</p>
      ${itemsTable(o.order_items ?? [])}
      <p style="font-size:16px"><strong>Total: ${mxn(o.total_cents)}</strong></p>
      <p style="color:#8ba1ad;font-size:13px">Puedes seguir tu pedido en tu cuenta con el número ${o.order_number}.</p>`),
  }),
  order_shipped: (o) => ({
    subject: `Tu pedido ${o.order_number} va en camino · Aminos MX`,
    html: layout('Tu pedido va en camino 🚚', `
      <p style="color:#c9d7de;line-height:1.7">Tu pedido <strong style="color:#14d3c4">${o.order_number}</strong>
      ya salió de nuestro almacén.</p>
      ${o.shipment?.tracking_number ? `<p style="color:#c9d7de">Paquetería: <strong>${o.shipment.carrier ?? ''}</strong><br>
        Guía: <strong>${o.shipment.tracking_number}</strong></p>
        ${o.shipment.tracking_url ? `<p><a href="${o.shipment.tracking_url}" style="display:inline-block;background:#14d3c4;color:#04121a;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Rastrear envío</a></p>` : ''}` : ''}`),
  }),
  order_delivered: (o) => ({
    subject: `Pedido ${o.order_number} entregado · Aminos MX`,
    html: layout('Pedido entregado ✅', `
      <p style="color:#c9d7de;line-height:1.7">Tu pedido <strong style="color:#14d3c4">${o.order_number}</strong> fue entregado.</p>
      <p style="color:#8ba1ad;font-size:13px">Recuerda refrigerar los viales liofilizados entre 2–8 °C.</p>`),
  }),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { template, order_id } = await req.json();
    const build = TEMPLATES[template];
    if (!build) return json({ error: 'Plantilla desconocida' }, 400);

    const { data: order, error } = await admin
      .from('orders')
      .select('*, order_items(*), shipments(*)')
      .eq('id', order_id)
      .single();
    if (error || !order) return json({ error: 'Pedido no encontrado' }, 404);

    const payload = { ...order, shipment: order.shipments?.[0] };
    const { subject, html } = build(payload);

    if (!RESEND_API_KEY) {
      await admin.from('email_log').insert({
        to_email: order.email, template, subject, order_id,
        status: 'skipped', error: 'RESEND_API_KEY no configurada',
      });
      return json({ ok: false, skipped: true, reason: 'RESEND_API_KEY no configurada' });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [order.email], subject, html }),
    });
    const out = await res.json();

    await admin.from('email_log').insert({
      to_email: order.email, template, subject, order_id,
      provider_id: out?.id ?? null,
      status: res.ok ? 'sent' : 'failed',
      error: res.ok ? null : JSON.stringify(out),
    });
    return json({ ok: res.ok, id: out?.id ?? null }, res.ok ? 200 : 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
