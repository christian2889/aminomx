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
  const free = cfg.FREE_SHIPPING_CENTS ?? 350000;
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
            <input class="input" id="fLine2" list="colonias" value="${esc(def?.line2 ?? '')}"
                   placeholder="Se sugiere sola al escribir tu CP">
            <datalist id="colonias"></datalist></div>
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
    const precio = (envio.gratis || !r.cost_cents) ? 'Gratis' : mxn(r.cost_cents);
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
      const todas = data.rates ?? [];
      // Entrega local Ensenada: solo aparece si el pedido alcanza su mínimo
      // ($2,000). El servidor lo vuelve a validar al crear el pedido.
      const rates = todas
        .filter((r) => !r.min_subtotal_cents || subtotal >= r.min_subtotal_cents)
        .slice(0, 5);
      const localFuera = todas.find((r) =>
        r.local && r.min_subtotal_cents && subtotal < r.min_subtotal_cents);
      if (!rates.length) throw new Error('sin tarifas');

      envio.quoteId = data.quote_id ?? null;
      envio.rateId = String(rates[0].id);
      envio.cents = rates[0].cost_cents;

      box.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
        ${rates.map((r, i) => tarifaHTML(r, i === 0)).join('')}
        ${rates.some((r) => r.local) ? `<p class="help">🛵 Entrega local en Ensenada por DiDi o
          asociado Aminos MX VIP: después de pagar, escríbenos por
          <a href="https://wa.me/526461164390" target="_blank" rel="noopener">WhatsApp</a>
          para coordinar tu entrega el mismo día.</p>` : ''}
        ${localFuera ? `<p class="help">🛵 En Ensenada tu entrega local es gratis en pedidos
          desde ${mxn(localFuera.min_subtotal_cents)} — te faltan
          ${mxn(localFuera.min_subtotal_cents - subtotal)}.</p>` : ''}
        ${envio.gratis ? '<p class="help">Tu pedido supera $3,500: el envío corre por nuestra cuenta 🎉</p>' : ''}
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

  /* -------- Dirección inteligente: CP → estado, ciudad y colonias ---------
     Catálogo SEPOMEX completo en la tabla postal_codes (lectura pública, sin
     servicios externos). Al teclear un CP válido se llenan Estado y Ciudad y
     el campo Colonia sugiere las del CP; todo sigue siendo editable. */
  const cpCache = {};
  async function autocompletaCP() {
    const cp = $('#fZip').value.trim();
    if (!/^\d{5}$/.test(cp)) return;
    try {
      if (!cpCache[cp]) {
        const { data } = await supabase.from('postal_codes')
          .select('colonia, municipio, estado, ciudad')
          .eq('cp', cp).order('colonia').limit(80);
        cpCache[cp] = data ?? [];
      }
      const filas = cpCache[cp];
      if (!filas.length || $('#fZip').value.trim() !== cp) return;
      $('#fState').value = filas[0].estado;
      $('#fCity').value = filas[0].ciudad || filas[0].municipio;
      $('#colonias').innerHTML = filas
        .map((f) => `<option value="${esc(f.colonia)}">`).join('');
      if (filas.length === 1 && !$('#fLine2').value.trim()) {
        $('#fLine2').value = filas[0].colonia;
      }
    } catch { /* sin catálogo: captura manual, nada se rompe */ }
  }

  let cpTimer = null;
  $('#fZip').addEventListener('input', () => {
    autocompletaCP();
    clearTimeout(cpTimer);
    cpTimer = setTimeout(cotizar, 600);
  });
  if (/^\d{5}$/.test($('#fZip').value.trim())) { autocompletaCP(); cotizar(); }

  /* ------------ Autocompletado de calle con Google Places (opcional) ------
     Se enciende solo si AMX_CONFIG.GOOGLE_MAPS_KEY tiene valor (llave
     restringida por dominio; pública por diseño). Al elegir una dirección se
     llenan calle, colonia, ciudad, estado y CP, y se recotiza el envío.
     Sin llave, el CP inteligente de arriba trabaja solo. */
  const gmKey = (window.AMX_CONFIG || {}).GOOGLE_MAPS_KEY;
  if (gmKey) {
    window.__amxGmaps = async () => {
      try {
        const { Autocomplete } = await google.maps.importLibrary('places');
        const ac = new Autocomplete($('#fLine1'), {
          componentRestrictions: { country: 'mx' },
          fields: ['address_components'],
          types: ['address'],
        });
        ac.addListener('place_changed', () => {
          const comps = ac.getPlace()?.address_components ?? [];
          const get = (t) => comps.find((c) => c.types.includes(t))?.long_name ?? '';
          const calle = get('route'), num = get('street_number');
          if (calle) $('#fLine1').value = num ? `${calle} ${num}` : calle;
          const col = get('sublocality') || get('sublocality_level_1') || get('neighborhood');
          if (col) $('#fLine2').value = col;
          const ciudad = get('locality') || get('municipality');
          if (ciudad) $('#fCity').value = ciudad;
          const edo = get('administrative_area_level_1');
          if (edo) $('#fState').value = edo;
          const cp = get('postal_code');
          if (cp) { $('#fZip').value = cp; autocompletaCP(); cotizar(); }
        });
      } catch (e) { console.warn('Google Places no disponible', e); }
    };
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(gmKey) +
      '&v=weekly&loading=async&language=es&region=MX&callback=__amxGmaps';
    s.async = true;
    document.head.appendChild(s);
  }

  $('#placeOrder').addEventListener('click', async () => {
    const btn = $('#placeOrder');
    const req = { fName: 'nombre', fPhone: 'teléfono', fLine1: 'calle', fCity: 'ciudad', fState: 'estado', fZip: 'código postal' };
    for (const [id, label] of Object.entries(req)) {
      if (!$('#' + id).value.trim()) return toast(`Falta el campo: ${label}`, 'err');
    }
    btn.disabled = true; btn.textContent = 'Procesando…';

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

      // Método de pago elegido
      const pay = document.querySelector('input[name="pay"]:checked')?.value ?? 'stripe';
      await supabase.from('orders').update({ payment_method: pay }).eq('id', result.order_id);

      // Guardar dirección y perfil
      if ($('#fSave').checked) {
        await supabase.from('addresses').insert({ user_id: session.user.id, ...address, is_default: !def });
      }
      await supabase.from('profiles').update({
        full_name: address.recipient, phone: address.phone,
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
