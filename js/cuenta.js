/* ==========================================================================
   Aminos MX — Panel del cliente
   ========================================================================== */
import {
  supabase, mxn, fechaMX, fechaHoraMX, ESTADO_PEDIDO,
  requireAuth, getProfile, signOut, startStripeCheckout,
} from './db.js';
import { injectIcons, icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let PROFILE = null;

function toast(text, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : 'alert')}<span class="tmsg">${esc(text)}</span>`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3000);
}
const fail = (e) => { console.error(e); toast(e?.message ?? 'Ocurrió un error', 'err'); };
const render = (h) => { $('#viewBody').innerHTML = h; };
const empty = (msg, ico = 'box') => `<div class="empty">${icon(ico)}<p>${esc(msg)}</p></div>`;
const stateChip = (s) => `<span class="state ${esc(s)}">${esc(ESTADO_PEDIDO[s] ?? s)}</span>`;

function openSheet(title, body, foot = '') {
  $('#sheetCard').innerHTML = `
    <div class="sheet-head"><h3>${esc(title)}</h3>
      <button class="btn btn-ghost btn-icon" data-close-sheet>${icon('x')}</button></div>
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  $('#sheet').classList.add('show');
}
const closeSheet = () => $('#sheet').classList.remove('show');
document.addEventListener('click', (e) => { if (e.target.closest('[data-close-sheet]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ------------------------------------------------------------- pedidos */
const PASOS = ['pending', 'paid', 'processing', 'shipped', 'delivered'];

async function viewPedidos() {
  $('#viewTitle').textContent = 'Mis pedidos';
  $('#viewSub').textContent = 'Seguimiento y detalle de tus compras';
  try {
    const { data, error } = await supabase.from('orders')
      .select('*, order_items(*), shipments(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    render(`<div class="panel">
      <div class="panel-head"><h2>Historial</h2><span class="help">${data.length} pedido(s)</span></div>
      <div class="panel-body flush"><div class="table-wrap">
        <table class="data"><thead><tr>
          <th>Pedido</th><th>Estado</th><th>Envío</th><th class="num">Total</th><th>Fecha</th><th></th>
        </tr></thead><tbody>
        ${data.length ? data.map((o) => {
          const s = o.shipments?.[0];
          return `<tr>
            <td><div class="cell-main mono">${esc(o.order_number)}</div>
                <div class="cell-sub">${o.order_items?.length ?? 0} artículo(s)</div></td>
            <td>${stateChip(o.status)}
              ${o.payment_status === 'paid'
                ? '<div class="cell-sub" style="color:hsl(var(--primary))">Pagado</div>'
                : '<div class="cell-sub">Pago pendiente</div>'}</td>
            <td>${s?.tracking_number
              ? `<div class="cell-main mono">${esc(s.tracking_number)}</div>
                 <div class="cell-sub">${esc(s.carrier ?? '')}</div>` : '<span class="help">Preparando</span>'}</td>
            <td class="num">${mxn(o.total_cents)}</td>
            <td>${fechaMX(o.created_at)}</td>
            <td><div class="row-actions">
              ${o.payment_status !== 'paid' && !['cancelled','refunded'].includes(o.status)
                ? `<button class="btn btn-primary btn-sm" data-pay="${o.id}">Pagar ahora</button>` : ''}
              <button class="btn btn-outline btn-sm" data-order="${o.id}">${icon('eye')} Seguir</button>
            </div></td></tr>`;
        }).join('') : `<tr><td colspan="6">${empty('Todavía no tienes pedidos. ¡Explora el catálogo!', 'receipt')}</td></tr>`}
        </tbody></table></div></div></div>`);
  } catch (e) { fail(e); render(empty('No pudimos cargar tus pedidos.', 'alert')); }
}

async function openOrder(id) {
  try {
    const { data: o, error } = await supabase.from('orders')
      .select('*, order_items(*), shipments(*, shipment_events(*)), order_events(*)')
      .eq('id', id).single();
    if (error) throw error;

    const s = o.shipments?.[0];
    const idx = PASOS.indexOf(o.status);
    const cancelado = ['cancelled', 'refunded'].includes(o.status);
    const a = o.shipping_address ?? {};

    openSheet(`Pedido ${o.order_number}`, `
      <div class="kpis">
        <div class="kpi"><div class="k-label">Estado</div>
          <div style="margin-top:10px">${stateChip(o.status)}</div>
          <div class="k-note">Pedido del ${fechaMX(o.created_at)}</div></div>
        <div class="kpi"><div class="k-label">Total</div>
          <div class="k-value teal">${mxn(o.total_cents)}</div>
          <div class="k-note">Envío ${o.shipping_cents ? mxn(o.shipping_cents) : 'gratis'}</div></div>
      </div>

      ${o.payment_status !== 'paid' && !['cancelled', 'refunded'].includes(o.status) ? `
        <div class="panel" style="margin-top:18px;border-color:hsl(var(--primary) / .4)">
          <div class="panel-body" style="display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap">
            <div><strong>Pago pendiente</strong>
              <p class="help" style="margin-top:4px">Paga con tarjeta o genera tu ficha OXXO de forma segura.</p></div>
            <button class="btn btn-primary" data-pay="${o.id}">Pagar ${mxn(o.total_cents)}</button>
          </div></div>` : `
        <div class="panel" style="margin-top:18px">
          <div class="panel-body" style="display:flex;gap:10px;align-items:center;color:hsl(var(--primary))">
            ${icon('check')} <strong>Pago confirmado</strong></div></div>`}

      ${cancelado ? '' : `<div class="panel" style="margin-top:18px">
        <div class="panel-head"><h2>Seguimiento</h2>${s?.tracking_url
          ? `<a class="btn btn-primary btn-sm" href="${esc(s.tracking_url)}" target="_blank" rel="noopener">
              ${icon('truck')} Rastrear con la paquetería</a>` : ''}</div>
        <div class="panel-body"><ul class="timeline">
          ${PASOS.map((p, i) => `<li class="${i <= idx ? 'done' : ''}">
            <div class="t-title">${esc(ESTADO_PEDIDO[p])}</div>
            <div class="t-meta">${
              i === 0 ? fechaHoraMX(o.created_at)
              : i === 3 && s?.shipped_at ? fechaHoraMX(s.shipped_at)
              : i === 4 && s?.delivered_at ? fechaHoraMX(s.delivered_at)
              : i <= idx ? 'Completado' : 'Pendiente'}</div></li>`).join('')}
        </ul>
        ${s?.tracking_number ? `<p class="help" style="margin-top:12px">
          Guía <strong class="mono">${esc(s.tracking_number)}</strong> · ${esc(s.carrier ?? '')}</p>` : ''}
        </div></div>`}

      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Artículos</h2></div>
        <div class="panel-body flush"><div class="table-wrap"><table class="data" style="min-width:auto"><tbody>
          ${(o.order_items ?? []).map((i) => `<tr>
            <td><div class="cell-main">${esc(i.name)}</div>
                <div class="cell-sub">${esc(i.presentation ?? '')}</div></td>
            <td class="num">${i.qty} × ${mxn(i.unit_price_cents)}</td>
            <td class="num"><strong>${mxn(i.total_cents)}</strong></td></tr>`).join('')}
          <tr><td colspan="2" class="num">Subtotal</td><td class="num">${mxn(o.subtotal_cents)}</td></tr>
          ${o.discount_cents ? `<tr><td colspan="2" class="num">Descuento</td>
            <td class="num" style="color:hsl(var(--primary))">−${mxn(o.discount_cents)}</td></tr>` : ''}
          <tr><td colspan="2" class="num">Envío refrigerado</td>
            <td class="num">${o.shipping_cents ? mxn(o.shipping_cents) : 'Gratis'}</td></tr>
          <tr><td colspan="2" class="num"><strong>Total</strong></td>
            <td class="num"><strong style="color:hsl(var(--primary))">${mxn(o.total_cents)}</strong></td></tr>
        </tbody></table></div></div></div>

      ${a.line1 ? `<div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Dirección de envío</h2></div>
        <div class="panel-body"><p style="font-size:.9rem;line-height:1.7">
          ${esc(a.recipient ?? '')}<br>${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ''}<br>
          ${esc(a.city ?? '')}, ${esc(a.state ?? '')} ${esc(a.postal_code ?? '')}<br>
          ${esc(a.phone ?? '')}</p></div></div>` : ''}`,
      `<button class="btn btn-outline" data-close-sheet>Cerrar</button>`);
  } catch (e) { fail(e); }
}

/* --------------------------------------------------------- direcciones */
async function viewDirecciones() {
  $('#viewTitle').textContent = 'Direcciones';
  $('#viewSub').textContent = 'Guarda tus datos de envío para comprar más rápido';
  try {
    const { data, error } = await supabase.from('addresses')
      .select('*').order('created_at', { ascending: false });
    if (error) throw error;
    render(`<div class="panel">
      <div class="panel-head"><h2>Mis direcciones</h2>
        <button class="btn btn-primary btn-sm" id="newAddr">${icon('plus')} Agregar</button></div>
      <div class="panel-body">
        ${data.length ? `<div class="form-grid">${data.map((a) => `
          <div class="kpi"><div style="display:flex;justify-content:space-between;gap:10px">
            <strong>${esc(a.label || a.recipient)}</strong>
            ${a.is_default ? '<span class="state active">Principal</span>' : ''}</div>
            <p class="help" style="margin-top:8px;line-height:1.6">
              ${esc(a.recipient)}<br>${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ''}<br>
              ${esc(a.city)}, ${esc(a.state)} ${esc(a.postal_code)}<br>${esc(a.phone ?? '')}</p>
            <div class="row-actions" style="margin-top:12px">
              <button class="btn btn-outline btn-sm" data-addr-del="${a.id}">${icon('trash')}</button></div>
          </div>`).join('')}</div>` : empty('Aún no has guardado direcciones.', 'home')}
      </div></div>`);

    $('#newAddr').addEventListener('click', () => {
      openSheet('Nueva dirección', `<form id="aForm"><div class="form-grid">
        <div class="field"><label>Etiqueta</label><input class="input" name="label" placeholder="Casa, laboratorio…"></div>
        <div class="field"><label>Destinatario *</label><input class="input" name="recipient" required></div>
        <div class="field"><label>Teléfono</label><input class="input" name="phone"></div>
        <div class="field"><label>Código postal *</label><input class="input" name="postal_code" required></div>
        <div class="field span-2"><label>Calle y número *</label><input class="input" name="line1" required></div>
        <div class="field span-2"><label>Colonia / referencias</label><input class="input" name="line2"></div>
        <div class="field"><label>Ciudad *</label><input class="input" name="city" required></div>
        <div class="field"><label>Estado *</label><input class="input" name="state" required></div>
        <div class="field span-2"><label class="check">
          <input type="checkbox" name="is_default" checked> Usar como dirección principal</label></div>
      </div></form>`,
      `<button class="btn btn-outline" data-close-sheet>Cancelar</button>
       <button class="btn btn-primary" id="saveAddr">Guardar dirección</button>`);

      $('#saveAddr').addEventListener('click', async () => {
        const f = new FormData($('#aForm'));
        const row = {
          user_id: PROFILE.id,
          label: f.get('label').trim() || null,
          recipient: f.get('recipient').trim(),
          phone: f.get('phone').trim() || null,
          line1: f.get('line1').trim(), line2: f.get('line2').trim() || null,
          city: f.get('city').trim(), state: f.get('state').trim(),
          postal_code: f.get('postal_code').trim(),
          is_default: f.get('is_default') === 'on',
        };
        if (!row.recipient || !row.line1 || !row.city || !row.state || !row.postal_code) {
          return toast('Completa los campos obligatorios', 'err');
        }
        try {
          if (row.is_default) {
            await supabase.from('addresses').update({ is_default: false }).eq('user_id', PROFILE.id);
          }
          const { error } = await supabase.from('addresses').insert(row);
          if (error) throw error;
          toast('Dirección guardada'); closeSheet(); viewDirecciones();
        } catch (e) { fail(e); }
      });
    });

    $$('[data-addr-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta dirección?')) return;
      try {
        const { error } = await supabase.from('addresses').delete().eq('id', b.dataset.addrDel);
        if (error) throw error;
        toast('Dirección eliminada'); viewDirecciones();
      } catch (e) { fail(e); }
    }));
  } catch (e) { fail(e); render(empty('No pudimos cargar tus direcciones.', 'alert')); }
}

/* --------------------------------------------------------------- perfil */
function viewPerfil() {
  $('#viewTitle').textContent = 'Mis datos';
  $('#viewSub').textContent = 'Información de tu cuenta';
  render(`<div class="panel"><div class="panel-head"><h2>Perfil</h2></div><div class="panel-body">
    <form id="prForm"><div class="form-grid">
      <div class="field"><label>Nombre completo</label>
        <input class="input" name="full_name" value="${esc(PROFILE.full_name ?? '')}"></div>
      <div class="field"><label>Teléfono</label>
        <input class="input" name="phone" value="${esc(PROFILE.phone ?? '')}"></div>
      <div class="field"><label>Empresa / laboratorio</label>
        <input class="input" name="company" value="${esc(PROFILE.company ?? '')}"></div>
      <div class="field"><label>Correo</label>
        <input class="input" value="${esc(PROFILE.email ?? '')}" disabled></div>
      <div class="field span-2"><label class="check">
        <input type="checkbox" name="marketing_opt_in" ${PROFILE.marketing_opt_in ? 'checked' : ''}>
        Quiero recibir avisos de nuevos lotes y reabastos</label></div>
    </div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Guardar cambios</button></div>
    </form></div></div>`);

  $('#prForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const patch = {
        full_name: f.get('full_name').trim() || null,
        phone: f.get('phone').trim() || null,
        company: f.get('company').trim() || null,
        marketing_opt_in: f.get('marketing_opt_in') === 'on',
      };
      const { error } = await supabase.from('profiles').update(patch).eq('id', PROFILE.id);
      if (error) throw error;
      PROFILE = { ...PROFILE, ...patch };
      toast('Datos actualizados');
    } catch (err) { fail(err); }
  });
}

/* ------------------------------------------------------------ arranque */
const VIEWS = { pedidos: viewPedidos, direcciones: viewDirecciones, perfil: viewPerfil };

function go(view) {
  $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#sidebar').classList.remove('show'); $('#sideOverlay').classList.remove('show');
  location.hash = view;
  (VIEWS[view] ?? viewPedidos)();
}

(async function boot() {
  injectIcons();
  const session = await requireAuth();
  if (!session) return;
  PROFILE = await getProfile();

  // Si es staff, ofrecer atajo al panel
  if (['admin', 'staff'].includes(PROFILE?.role)) {
    const link = document.createElement('a');
    link.className = 'side-link'; link.href = 'admin.html';
    link.innerHTML = `${icon('gauge')} Panel admin`;
    $('.side-foot').prepend(link);
  }

  $('#sideUser').textContent = PROFILE?.email ?? '';
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-order]'); if (b) return openOrder(b.dataset.order);
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      pay.disabled = true; const txt = pay.textContent; pay.textContent = 'Abriendo…';
      try { location.href = await startStripeCheckout(pay.dataset.pay); }
      catch (err) { fail(err); pay.disabled = false; pay.textContent = txt; }
    }
  });

  // Aviso al volver de Stripe
  const params = new URLSearchParams(location.search);
  if (params.get('pago') === 'exito') {
    toast('¡Pago recibido! Estamos preparando tu pedido.');
  } else if (params.get('pago') === 'cancelado') {
    toast('Pago cancelado. Tu pedido sigue guardado; puedes pagarlo cuando quieras.', 'err');
  }
  $('#menuBtn').addEventListener('click', () => {
    $('#sidebar').classList.toggle('show'); $('#sideOverlay').classList.toggle('show');
  });
  $('#sideOverlay').addEventListener('click', () => {
    $('#sidebar').classList.remove('show'); $('#sideOverlay').classList.remove('show');
  });
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('amx_theme', next);
  });
  $('#logoutBtn').addEventListener('click', async () => { await signOut(); location.href = 'index.html'; });

  go((location.hash || '#pedidos').slice(1));
})();
