/* ==========================================================================
   Aminos MX — Checkout
   El precio y el stock los valida el servidor (RPC create_order).
   ========================================================================== */
import { supabase, mxn, createOrder, getProfile } from './db.js';
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
        <a class="btn btn-primary" style="margin-top:14px" href="index.html#catalogo">Ver catálogo</a>
      </div></div></div>`;
    return;
  }

  // Sesión obligatoria: el pedido queda ligado a la cuenta para su seguimiento
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    body.innerHTML = `<div class="panel"><div class="panel-body"><div class="empty">
      ${icon('users')}<p>Inicia sesión o crea tu cuenta para completar el pedido<br>y poder seguir tu envío.</p>
      <a class="btn btn-primary" style="margin-top:14px" href="login.html?next=checkout.html">Entrar / crear cuenta</a>
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

      <div class="panel"><div class="panel-head"><h2>3 · Forma de pago</h2></div>
        <div class="panel-body" style="display:flex;flex-direction:column;gap:10px">
          <label class="pay-opt"><input type="radio" name="pay" value="spei" checked>
            <span><b>Transferencia SPEI</b><span>Te enviamos la CLABE al confirmar. Validación el mismo día hábil.</span></span></label>
          <label class="pay-opt"><input type="radio" name="pay" value="tarjeta">
            <span><b>Tarjeta de crédito / débito</b><span>Te contactamos por WhatsApp con el enlace de pago seguro.</span></span></label>
          <label class="pay-opt"><input type="radio" name="pay" value="mercado-pago">
            <span><b>Mercado Pago / OXXO</b><span>Paga con saldo, tarjeta o en efectivo en tiendas afiliadas.</span></span></label>
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
        <div class="sum-row"><span>Envío refrigerado</span>
          <b>${shipping === 0 ? 'Gratis' : mxn(shipping)}</b></div>
        <div class="sum-total"><span>Total estimado</span>
          <span style="color:hsl(var(--primary))">${mxn(subtotal + shipping)}</span></div>
        <button class="btn btn-primary btn-lg btn-block" id="placeOrder" style="margin-top:16px">
          Confirmar pedido</button>
        <p class="help" style="margin-top:12px;text-align:center">
          ${icon('check')} Empaque en frío incluido · Uso exclusivo en investigación</p>
      </div>
    </div>
  </div>`;

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
      });

      // Método de pago elegido
      const pay = document.querySelector('input[name="pay"]:checked')?.value ?? 'spei';
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
      location.href = `cuenta.html?pedido=${encodeURIComponent(result.order_number)}#pedidos`;
    } catch (e) {
      console.error(e);
      toast(e?.message ?? 'No pudimos crear el pedido', 'err');
      btn.disabled = false; btn.textContent = 'Confirmar pedido';
    }
  });
})();
