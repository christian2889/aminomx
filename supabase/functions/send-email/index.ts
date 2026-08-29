// ============================================================================
// send-email — correos transaccionales vía Resend
// Secrets: RESEND_API_KEY, FROM_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Body: { template: 'order_confirmation'|'order_shipped'|'order_delivered'
//                 |'spei_instructions', order_id: uuid }
// Los datos bancarios de spei_instructions viven en settings.bank_transfer
// (editables sin redesplegar).
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

// Los pagos SPEI se validan a mano: el correo lleva CLABE, referencia y a
// dónde mandar el comprobante. `o.bank` viene de settings.bank_transfer.
function speiHTML(o: any) {
  const b = o.bank ?? {};
  const fila = (k: string, v: string, mono = false) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #253244;color:#8ba1ad;font-size:13px">${k}</td>
      <td style="padding:9px 0;border-bottom:1px solid #253244;text-align:right;font-weight:700${
        mono ? ';font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em' : ''}">${v}</td>
    </tr>`;
  return layout('Completa tu pago por transferencia', `
    <p style="color:#c9d7de;line-height:1.7">Tu pedido <strong style="color:#14d3c4">${o.order_number}</strong>
    quedó apartado. Realiza la transferencia SPEI por el monto exacto y envíanos tu comprobante;
    en cuanto lo validemos preparamos tu envío.</p>

    <div style="background:#0d151d;border:1px solid #253244;border-radius:12px;padding:18px;margin:18px 0">
      <div style="font-size:11px;letter-spacing:.18em;color:#8ba1ad;margin-bottom:6px">MONTO A TRANSFERIR</div>
      <div style="font-size:28px;font-weight:800;color:#14d3c4">${mxn(o.total_cents)}</div>
    </div>

    <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">
      ${fila('Banco', b.bank ?? 'BBVA')}
      ${fila('Beneficiario', b.beneficiary ?? '')}
      ${fila('CLABE', b.clabe ?? '', true)}
      ${fila('Cuenta', b.account ?? '', true)}
      ${fila('Referencia / concepto', o.order_number, true)}
    </table>

    <p style="color:#c9d7de;line-height:1.7;margin-top:20px"><strong>Envía tu comprobante</strong> por
      WhatsApp al <a href="https://wa.me/${String(b.whatsapp ?? '').replace(/\D/g, '')}"
        style="color:#14d3c4">${b.whatsapp ?? ''}</a>
      o al correo <a href="mailto:${b.email ?? ''}" style="color:#14d3c4">${b.email ?? ''}</a>,
      indicando tu número de pedido.</p>

    ${itemsTable(o.order_items ?? [])}
    <p style="font-size:16px"><strong>Total: ${mxn(o.total_cents)}</strong></p>
    <p style="color:#8ba1ad;font-size:13px;line-height:1.6">Apartamos tu pedido
      ${b.hours_to_pay ?? 48} horas. Si no recibimos el pago en ese plazo, las piezas
      vuelven al catálogo y tendrás que hacer el pedido de nuevo.</p>`);
}

const TEMPLATES: Record<string, (o: any) => { subject: string; html: string }> = {
  spei_instructions: (o) => ({
    subject: `Datos para tu transferencia · Pedido ${o.order_number} · Aminos MX`,
    html: speiHTML(o),
  }),
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

    // Datos bancarios para las instrucciones SPEI (editables en settings).
    let bank: Record<string, unknown> | null = null;
    if (template === 'spei_instructions') {
      const { data: s } = await admin.from('settings')
        .select('value').eq('key', 'bank_transfer').maybeSingle();
      bank = (s?.value ?? null) as Record<string, unknown> | null;
      if (!bank || bank.enabled !== true) {
        return json({ error: 'Transferencia bancaria sin configurar (settings.bank_transfer)' }, 501);
      }
    }

    const payload = { ...order, shipment: order.shipments?.[0], bank };
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
