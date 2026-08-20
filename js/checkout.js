/* ==========================================================================
   Aminos MX — Checkout
   El precio y el stock los valida el servidor (RPC create_order).
   ========================================================================== */
import { supabase, mxn, createOrder, getProfile, startStripeCheckout, quoteShipping } from './db.js';
import { injectIcons, icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cfg = window.AMX_CONFIG || {};

function toast(text, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : 'alert')}<span class="tmsg">${esc(text)}</span>`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3500);
}

function readCart() {
  try { return JSON.parse(localStorage.getItem('amx_cart')) || []; } catch { return []; }
}

(async function boot() {
  injectIcons();
  const cart = readCart();
  const body = $('#coBody');

  if (!cart.length) {
    body.innerHTML = `<div class="panel"><div class="panel-body">
      <div class="empty">${icon('box')}<p>Tu carrito está vacío.</p>
        <a class="btn btn-primary" style="margin-top:14px" href="/#catalogo">Ver catálogo</a>
      </div></div></div>`;
    return;
  }

  // Sesión obligatoria: el pedido queda ligado a la cuenta para su seguimiento
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    body.innerHTML = `<div class="panel"><div class="panel-body"><div class="empty">
      ${icon('users')}<p>Inicia sesión o crea tu cuenta para completar el pedido<br>y poder seguir tu envío.</p>
      <a class="btn btn-primary" style="margin-top:14px" href="/login?next=%2Fcheckout">Entrar / crear cuenta</a>
    </div></div></div>`;
    return;
  }

  // Cargar productos reales del carrito (precio de referencia para el resumen)
  const ids = cart.map((i) => i.id);
  const { data: products, error } = await supabase.from('products')
    .select('id, slug, name, presentation_es, price_cents, stock, status')
    .in('slug', ids);
  if (error) { toast(error.message, 'err'); return; }

  const bySlug = Object.fromEntries((products ?? []).map((p) => [p.slug, p]));
  const items = cart.map((i) => ({ ...i, p: bySlug[i.id] })).filter((i) => i.p && i.p.status === 'active');
  if (!items.length) {
    body.innerHTML = `<div class="panel"><div class="panel-body">${
      `<div class="empty">${icon('alert')}<p>Los productos de tu carrito ya no están disponibles.</p></div>`}</div></div>`;
    return;
  }

  const profile = await getProfile();
  const { data: addresses } = await supabase.from('addresses')
    .select('*').order('is_default', { ascending: false });

  const subtotal = items.reduce((s, i) => s + i.p.price_cents * i.qty, 0);
  const free = cfg.FREE_SHIPPING_CENTS ?? 250000;
  const flat = cfg.SHIPPING_FLAT_CENTS ?? 18900;
  const shipping = subtotal >= free ? 0 : flat;
  const def = addresses?.[0];

  body.innerHTML = `<div class="co-grid">
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="panel"><div class="panel-head"><h2>1 · Datos de contacto</h2></div>
        <div class="panel-body"><div class="form-grid">
          <div class="field"><label>Nombre completo *</label>
            <input class="input" id="fName" value="${esc(profile?.full_name ?? '')}" required></div>
          <div class="field"><label>Teléfono / WhatsApp *</label>
            <input class="input" id="fPhone" value="${esc(profile?.phone ?? '')}" required></div>
          <div class="field span-2"><label>Correo</label>
            <input class="input" value="${esc(session.user.email)}" disabled></div>
        </div></div></div>

      <div class="panel"><div class="panel-head"><h2>2 · Dirección de envío</h2></div>
        <div class="panel-body"><div class="form-grid">
          <div class="field span-2"><label>Calle y número *</label>
            <input class="input" id="fLine1" value="${esc(def?.line1 ?? '')}" required></div>
          <div class="field span-2"><label>Colonia / referencias</label>
            <input class="input" id="fLine2" value="${esc(def?.line2 ?? '')}"></div>
          <div class="field"><label>Ciudad *</label>
            <input class="input" id="fCity" value="${esc(def?.city ?? '')}" required></div>
          <div class="field"><label>Estado *</label>
            <input class="input" id="fState" value="${esc(def?.state ?? '')}" required></div>
          <div class="field"><label>Código postal *</label>
            <input class="input" id="fZip" value="${esc(def?.postal_code ?? '')}" required></div>
          <div class="field span-2"><label class="check">
            <input type="checkbox" id="fSave" ${def ? '' : 'checked'}> Guardar esta dirección en mi cuenta</label></div>
        </div></div></div>

      <div class="panel"><div class="panel-head"><h2>3 · Opciones de envío</h2></div>
        <div class="panel-body">
          <div id="shipBox">
            <p class="help">Escribe tu código postal arriba y cotizamos con las paqueterías en segundos.</p>
          </div>
        </div></div>

      <div class="panel"><div class="panel-head"><h2>4 · Forma de pago</h2></div>
        <div class="panel-body" style="display:flex;flex-direction:column;gap:10px">
          <label class="pay-opt"><input type="radio" name="pay" value="stripe" checked>
            <span><b>Pago en línea · tarjeta u OXXO</b>
            <span>Pago seguro con Stripe: Visa, Mastercard, AMEX o ficha para pagar en OXXO.</span></span></label>
          <label class="pay-opt"><input type="radio" name="pay" value="spei">
            <span><b>Transferencia SPEI</b><span>Te enviamos la CLABE al confirmar. Validación el mismo día hábil.</span></span></label>
          <label class="pay-opt"><input type="radio" name="pay" value="whatsapp">
            <span><b>Coordinar por WhatsApp</b><span>Te contactamos para acordar la forma de pago.</span></span></label>
        </div></div>

      <div class="panel"><div class="panel-head"><h2>5 · Facturación (opcional)</h2></div>
        <div class="panel-body">
          <label class="check" style="margin-bottom:4px">
            <input type="checkbox" id="fInvoice"> Necesito factura (CFDI 4.0)</label>
          <p class="help">Puedes solicitarla dentro del mes en que compres.</p>
          <div id="invoiceFields" hidden style="margin-top:16px"><div class="form-grid">
            <div class="field"><label>RFC *</label>
              <input class="input mono" id="fRfc" style="text-transform:uppercase" maxlength="13"
                     value="${esc(profile?.billing?.rfc ?? '')}"></div>
            <div class="field"><label>Razón social *</label>
              <input class="input" id="fRazon" value="${esc(profile?.billing?.razon_social ?? '')}"></div>
            <div class="field"><label>Régimen fiscal *</label>
              <input class="input" id="fRegimen" placeholder="612 · Personas Físicas con Actividades…"
                     value="${esc(profile?.billing?.regimen ?? '')}"></div>
            <div class="field"><label>Uso del CFDI *</label>
              <select class="select" id="fUso">
                <option value="G03">G03 · Gastos en general</option>
                <option value="G01">G01 · Adquisición de mercancías</option>
                <option value="I08">I08 · Otra maquinaria y equipo</option>
                <option value="S01">S01 · Sin efectos fiscales</option>
              </select></div>
            <div class="field"><label>CP fiscal *</label>
              <input class="input mono" id="fCpFiscal" maxlength="5"
                     value="${esc(profile?.billing?.cp_fiscal ?? '')}"></div>
            <div class="field"><label>Correo para la factura</label>
              <input class="input" id="fEmailFiscal" type="email"
                     value="${esc(profile?.billing?.email_fiscal ?? session.user.email)}"></div>
          </div></div>
        </div></div>

      <div class="panel"><div class="panel-head"><h2>Notas del pedido (opcional)</h2></div>
        <div class="panel-body"><textarea class="textarea" id="fNotes"
          placeholder="Referencias de entrega, horario, etc."></textarea></div></div>
    </div>

    <div class="panel" style="position:sticky;top:18px">
      <div class="panel-head"><h2>Resumen</h2></div>
      <div class="panel-body">
        ${items.map((i) => `<div class="sum-row">
          <span>${esc(i.p.name)} <span class="mono">× ${i.qty}</span></span>
          <b>${mxn(i.p.price_cents * i.qty)}</b></div>`).join('')}
        <div class="field" style="margin:12px 0">
          <label>Cupón</label>
          <div style="display:flex;gap:8px">
            <input class="input" id="fCoupon" placeholder="BULK10">
          </div>
          <span class="help">Se valida al confirmar el pedido.</span>
        </div>
        <div class="sum-row"><span>Subtotal</span><b>${mxn(subtotal)}</b></div>
        <div class="sum-row"><span>Envío <span class="help" id="sumCarrier"></span></span>
          <b id="sumShip">${shipping === 0 ? 'Gratis' : mxn(shipping)}</b></div>
        <div class="sum-total"><span>Total estimado</span>
          <span style="color:hsl(var(--primary))" id="sumTotal">${mxn(subtotal + shipping)}</span></div>
        <button class="btn btn-primary btn-lg btn-block" id="placeOrder" style="margin-top:16px">
          Confirmar pedido</button>
        <p class="help" style="margin-top:12px;text-align:center">
          ${icon('check')} Empaque discreto y sin logotipos · Uso exclusivo en investigación</p>
      </div>
    </div>
  </div>`;

  $('#fInvoice').addEventListener('change', (e) => {
    $('#invoiceFields').hidden = !e.target.checked;
  });

  /* ---------------- Cotización de envío en vivo (Skydropx) ----------------
     El navegador solo maneja IDs de cotización/tarifa; el precio que se cobra
     lo relee create_order de la tabla shipping_quotes en el servidor. */
  const envio = { quoteId: null, rateId: null, cents: shipping, gratis: subtotal >= free };
  let quoteSeq = 0;

  function pintaResumen() {
    const efectivo = envio.gratis ? 0 : envio.cents;
    $('#sumShip').textContent = efectivo === 0 ? 'Gratis' : mxn(efectivo);
    $('#sumTotal').textContent = mxn(subtotal + efectivo);
  }

  function tarifaHTML(r, checked) {
    const precio = envio.gratis ? 'Gratis' : mxn(r.cost_cents);
    return `<label class="pay-opt" style="align-items:center">
      <input type="radio" name="rate" value="${esc(String(r.id))}" ${checked ? 'checked' : ''}>
      <span style="display:flex;justify-content:space-between;gap:12px;width:100%;align-items:center">
        <span><b>${esc(String(r.provider ?? ''))}</b>
          <span style="display:block;font-size:.78rem;color:hsl(var(--muted-fg))">
            ${esc(String(r.service ?? ''))}${r.days ? ` · ${esc(String(r.days))} día(s)` : ''}</span></span>
        <b style="white-space:nowrap">${precio}</b>
      </span></label>`;
  }

  async function cotizar() {
    const cp = $('#fZip').value.trim();
    if (!/^\d{5}$/.test(cp)) return;
    const seq = ++quoteSeq;
    const box = $('#shipBox');
    box.innerHTML = '<p class="help">Cotizando con las paqueterías…</p>';
    try {
      const data = await quoteShipping({
        postal_code: cp,
        city: $('#fCity').value.trim(),
        state: $('#fState').value.trim(),
        neighborhood: $('#fLine2').value.trim(),
      });
      if (seq !== quoteSeq) return; // llegó tarde: el CP ya cambió
      const rates = (data.rates ?? []).slice(0, 5);
      if (!rates.length) throw new Error('sin tarifas');

      envio.quoteId = data.quote_id ?? null;
      envio.rateId = String(rates[0].id);
      envio.cents = rates[0].cost_cents;

      box.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
        ${rates.map((r, i) => tarifaHTML(r, i === 0)).join('')}
        ${envio.gratis ? '<p class="help">Tu pedido supera $2,500: el envío corre por nuestra cuenta 🎉</p>' : ''}
      </div>`;
      pintaResumen();

      box.querySelectorAll('input[name="rate"]').forEach((inp) => {
        inp.addEventListener('change', () => {
          const r = rates.find((x) => String(x.id) === inp.value);
          if (!r) return;
          envio.rateId = String(r.id);
          envio.cents = r.cost_cents;
          pintaResumen();
        });
      });
    } catch {
      if (seq !== quoteSeq) return;
      // Sin cotización en vivo el pedido no se detiene: tarifa estándar.
      envio.quoteId = null; envio.rateId = null; envio.cents = flat;
      box.innerHTML = `<label class="pay-opt"><input type="radio" name="rate" checked>
        <span><b>Envío estándar</b>
        <span>Paquetería asignada al preparar tu pedido · ${envio.gratis ? 'Gratis' : mxn(flat)}</span></span></label>`;
      pintaResumen();
    }
  }

  let cpTimer = null;
  $('#fZip').addEventListener('input', () => {
    clearTimeout(cpTimer);
    cpTimer = setTimeout(cotizar, 600);
  });
  if (/^\d{5}$/.test($('#fZip').value.trim())) cotizar();

  $('#placeOrder').addEventListener('click', async () => {
    const btn = $('#placeOrder');
    const req = { fName: 'nombre', fPhone: 'teléfono', fLine1: 'calle', fCity: 'ciudad', fState: 'estado', fZip: 'código postal' };
    for (const [id, label] of Object.entries(req)) {
      if (!$('#' + id).value.trim()) return toast(`Falta el campo: ${label}`, 'err');
    }
    btn.disabled = true; btn.textContent = 'Procesando…';
    // Datos fiscales (si pidió factura)
    let billing = null;
    if ($('#fInvoice').checked) {
      const rfc = $('#fRfc').value.trim().toUpperCase();
      const rfcOk = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc);
      if (!rfcOk) { btn.disabled = false; return toast('El RFC no tiene un formato válido', 'err'); }
      for (const [id, label] of Object.entries({ fRazon: 'razón social', fRegimen: 'régimen fiscal', fCpFiscal: 'CP fiscal' })) {
        if (!$('#' + id).value.trim()) { btn.disabled = false; return toast(`Falta para la factura: ${label}`, 'err'); }
      }
      billing = {
        rfc, razon_social: $('#fRazon').value.trim(),
        regimen: $('#fRegimen').value.trim(), uso_cfdi: $('#fUso').value,
        cp_fiscal: $('#fCpFiscal').value.trim(),
        email_fiscal: $('#fEmailFiscal').value.trim() || session.user.email,
      };
    }

    const address = {
      recipient: $('#fName').value.trim(), phone: $('#fPhone').value.trim(),
      line1: $('#fLine1').value.trim(), line2: $('#fLine2').value.trim() || null,
      city: $('#fCity').value.trim(), state: $('#fState').value.trim(),
      postal_code: $('#fZip').value.trim(), country: 'MX',
    };
    try {
      const result = await createOrder({
        items: items.map((i) => ({ product_id: i.p.id, qty: i.qty })),
        email: session.user.email,
        name: address.recipient, phone: address.phone, address,
        coupon: $('#fCoupon').value.trim() || null,
        notes: $('#fNotes').value.trim() || null,
        quoteId: envio.quoteId, rateId: envio.rateId,
      });

      // Método de pago elegido + datos fiscales
      const pay = document.querySelector('input[name="pay"]:checked')?.value ?? 'stripe';
      const patch = { payment_method: pay };
      if (billing) {
        patch.billing = billing;
        patch.invoice_requested = true;
        patch.invoice_status = 'requested';
      }
      await supabase.from('orders').update(patch).eq('id', result.order_id);

      // Guardar dirección y perfil
      if ($('#fSave').checked) {
        await supabase.from('addresses').insert({ user_id: session.user.id, ...address, is_default: !def });
      }
      await supabase.from('profiles').update({
        full_name: address.recipient, phone: address.phone,
        ...(billing ? { billing } : {}),
      }).eq('id', session.user.id);

      // Correo de confirmación (no bloqueante)
      supabase.functions.invoke('send-email', {
        body: { template: 'order_confirmation', order_id: result.order_id },
      }).catch(() => {});

      localStorage.setItem('amx_cart', '[]');

      // Pago en línea: redirigir a Stripe Checkout
      if (pay === 'stripe') {
        btn.textContent = 'Abriendo pago seguro…';
        try {
          location.href = await startStripeCheckout(result.order_id);
          return;
        } catch (err) {
          // El pedido ya existe: el cliente puede pagarlo desde su cuenta
          toast(`Pedido ${result.order_number} creado. ${err.message}. Puedes pagarlo desde tu cuenta.`, 'err');
          setTimeout(() => {
            location.href = `/cuenta?pedido=${encodeURIComponent(result.order_number)}#pedidos`;
          }, 3200);
          return;
        }
      }

      location.href = `/cuenta?pedido=${encodeURIComponent(result.order_number)}#pedidos`;
    } catch (e) {
      console.error(e);
      toast(e?.message ?? 'No pudimos crear el pedido', 'err');
      btn.disabled = false; btn.textContent = 'Confirmar pedido';
    }
  });
})();
