/* ==========================================================================
   Aminos MX — Panel de administración
   ========================================================================== */
import {
  supabase, mxn, fechaMX, fechaHoraMX, ESTADO_PEDIDO, ESTADO_PAGO, slugify,
  requireStaff, signOut, fetchCategories, fetchProducts, upsertProduct, deleteProduct,
  uploadProductImage, deleteProductImage, fetchOrders, fetchOrder, updateOrder,
  upsertShipment, fetchCustomers, updateProfile, fetchBatches, upsertBatch,
  uploadCOA, fetchStats, sendOrderEmail,
} from './db.js';
import { injectIcons, icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let CATEGORIES = [];
let PROFILE = null;

/* --------------------------------------------------------------- toasts */
function toast(text, kind = 'ok') {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : 'alert')}<span class="tmsg">${esc(text)}</span>`;
  if (kind !== 'ok') el.style.borderColor = 'hsl(var(--destructive) / .5)';
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3000);
}
const fail = (e) => { console.error(e); toast(e?.message ?? 'Ocurrió un error', 'err'); };

/* ---------------------------------------------------------------- sheet */
function openSheet(title, bodyHTML, footHTML = '') {
  $('#sheetCard').innerHTML = `
    <div class="sheet-head"><h3>${esc(title)}</h3>
      <button class="btn btn-ghost btn-icon" data-close-sheet aria-label="Cerrar">${icon('x')}</button></div>
    <div class="sheet-body">${bodyHTML}</div>
    ${footHTML ? `<div class="sheet-foot">${footHTML}</div>` : ''}`;
  $('#sheet').classList.add('show');
}
const closeSheet = () => $('#sheet').classList.remove('show');
document.addEventListener('click', (e) => { if (e.target.closest('[data-close-sheet]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* --------------------------------------------------------------- helpers */
const stateChip = (s, dict = ESTADO_PEDIDO) =>
  `<span class="state ${esc(s)}">${esc(dict[s] ?? s)}</span>`;

const empty = (msg, ico = 'box') =>
  `<div class="empty">${icon(ico)}<p>${esc(msg)}</p></div>`;

function setView(title, sub, actions = '') {
  $('#viewTitle').textContent = title;
  $('#viewSub').textContent = sub;
  $('#viewActions').innerHTML = actions;
}
const render = (html) => { $('#viewBody').innerHTML = html; };
const loading = () => render(`<div class="panel"><div class="panel-body">
  ${'<div class="skeleton" style="margin-bottom:10px"></div>'.repeat(5)}</div></div>`);

/* ======================================================================
   RESUMEN
   ====================================================================== */
async function viewResumen() {
  setView('Resumen', 'Estado general de la tienda');
  loading();
  try {
    const [stats, orders] = await Promise.all([fetchStats(), fetchOrders({ limit: 8 })]);
    render(`
      <div class="kpis">
        <div class="kpi"><div class="k-label">Ingresos cobrados</div>
          <div class="k-value teal">${mxn(stats.revenue_cents)}</div>
          <div class="k-note">Pedidos con pago confirmado</div></div>
        <div class="kpi"><div class="k-label">Pedidos (30 días)</div>
          <div class="k-value">${stats.orders_30d}</div>
          <div class="k-note">${stats.orders_total} en total</div></div>
        <div class="kpi"><div class="k-label">Por atender</div>
          <div class="k-value">${stats.orders_pending}</div>
          <div class="k-note">Pedidos pendientes</div></div>
        <div class="kpi"><div class="k-label">Clientes</div>
          <div class="k-value">${stats.customers_total}</div>
          <div class="k-note">Cuentas registradas</div></div>
        <div class="kpi"><div class="k-label">Productos activos</div>
          <div class="k-value">${stats.products_active}</div>
          <div class="k-note">${stats.products_low_stock} con stock bajo</div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Pedidos recientes</h2>
          <button class="btn btn-outline btn-sm" data-goto="pedidos">Ver todos</button></div>
        <div class="panel-body flush"><div class="table-wrap">
          <table class="data"><thead><tr>
            <th>Pedido</th><th>Cliente</th><th>Estado</th><th class="num">Total</th><th>Fecha</th>
          </tr></thead><tbody>
          ${orders.length ? orders.map((o) => `<tr data-order="${o.id}" style="cursor:pointer">
            <td><div class="cell-main mono">${esc(o.order_number)}</div>
                <div class="cell-sub">${o.order_items?.length ?? 0} artículo(s)</div></td>
            <td><div class="cell-main">${esc(o.customer_name || '—')}</div>
                <div class="cell-sub">${esc(o.email)}</div></td>
            <td>${stateChip(o.status)}</td>
            <td class="num">${mxn(o.total_cents)}</td>
            <td>${fechaMX(o.created_at)}</td>
          </tr>`).join('') : `<tr><td colspan="5">${empty('Aún no hay pedidos.', 'receipt')}</td></tr>`}
          </tbody></table></div></div>
      </div>`);
  } catch (e) { fail(e); render(empty('No pudimos cargar las métricas.', 'alert')); }
}

/* ======================================================================
   PRODUCTOS
   ====================================================================== */
async function viewProductos() {
  setView('Productos', 'Catálogo, precios, stock e imágenes',
    `<button class="btn btn-primary btn-sm" id="newProduct">${icon('plus')} Nuevo producto</button>`);
  loading();
  try {
    if (!CATEGORIES.length) CATEGORIES = await fetchCategories();
    const products = await fetchProducts({ includeInactive: true });

    render(`
      <div class="panel">
        <div class="panel-head">
          <div class="toolbar">
            <label class="search">${icon('search')}
              <input class="input" id="pSearch" placeholder="Buscar producto…" style="padding-left:34px">
            </label>
            <select class="select" id="pCat">
              <option value="">Todas las categorías</option>
              ${CATEGORIES.map((c) => `<option value="${esc(c.id)}">${esc(c.name_es)}</option>`).join('')}
            </select>
            <select class="select" id="pStatus">
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="draft">Borradores</option>
              <option value="archived">Archivados</option>
            </select>
          </div>
          <span class="help">${products.length} producto(s)</span>
        </div>
        <div class="panel-body flush"><div class="table-wrap">
          <table class="data"><thead><tr>
            <th>Producto</th><th>Categoría</th><th class="num">Precio</th>
            <th class="num">Stock</th><th>Estado</th><th></th>
          </tr></thead><tbody id="pRows"></tbody></table></div></div>
      </div>`);

    const rows = () => {
      const q = ($('#pSearch').value || '').toLowerCase();
      const cat = $('#pCat').value, st = $('#pStatus').value;
      const list = products.filter((p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)) &&
        (!cat || p.category_id === cat) && (!st || p.status === st));
      $('#pRows').innerHTML = list.length ? list.map((p) => {
        const img = p.images?.[0]?.url;
        return `<tr>
          <td><div style="display:flex;gap:10px;align-items:center">
            <div style="width:38px;height:38px;border-radius:8px;overflow:hidden;flex:none;background:hsl(var(--secondary));display:grid;place-items:center">
              ${img ? `<img src="${esc(img)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '🧪'}
            </div>
            <div><div class="cell-main">${esc(p.name)}</div>
              <div class="cell-sub mono">${esc(p.sku ?? p.slug)}</div></div></div></td>
          <td>${esc(CATEGORIES.find((c) => c.id === p.category_id)?.name_es ?? '—')}</td>
          <td class="num">${mxn(p.price_cents)}${p.compare_at_cents
            ? `<div class="cell-sub" style="text-decoration:line-through">${mxn(p.compare_at_cents)}</div>` : ''}</td>
          <td class="num" ${p.stock <= 10 ? 'style="color:hsl(var(--amber))"' : ''}>${p.stock}</td>
          <td>${stateChip(p.status, { active: 'Activo', draft: 'Borrador', archived: 'Archivado' })}</td>
          <td><div class="row-actions">
            <button class="btn btn-outline btn-sm" data-edit="${p.id}">${icon('pencil')}</button>
            <button class="btn btn-outline btn-sm" data-del="${p.id}">${icon('trash')}</button>
          </div></td></tr>`;
      }).join('') : `<tr><td colspan="6">${empty('Sin productos que coincidan.', 'package')}</td></tr>`;
    };
    rows();
    ['#pSearch', '#pCat', '#pStatus'].forEach((s) => $(s).addEventListener('input', rows));

    $('#viewBody').onclick = ( (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) return editProduct(products.find((p) => p.id === ed.dataset.edit));
      const del = e.target.closest('[data-del]');
      if (del) {
        const p = products.find((x) => x.id === del.dataset.del);
        if (confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) {
          deleteProduct(p.id).then(() => { toast('Producto eliminado'); viewProductos(); }).catch(fail);
        }
      }
    });
    $('#newProduct').addEventListener('click', () => editProduct(null));
  } catch (e) { fail(e); render(empty('No pudimos cargar el catálogo.', 'alert')); }
}

function editProduct(p) {
  const isNew = !p;
  const v = p ?? { status: 'active', stock: 0, price_cents: 0, tags_es: [], tags_en: [] };
  openSheet(isNew ? 'Nuevo producto' : `Editar · ${v.name}`, `
    <form id="pForm">
      <div class="form-grid">
        <div class="field span-2"><label>Nombre *</label>
          <input class="input" name="name" required value="${esc(v.name ?? '')}"></div>
        <div class="field"><label>SKU</label>
          <input class="input" name="sku" value="${esc(v.sku ?? '')}"></div>
        <div class="field"><label>Slug (URL)</label>
          <input class="input" name="slug" value="${esc(v.slug ?? '')}" placeholder="se genera del nombre"></div>
        <div class="field"><label>Categoría</label>
          <select class="select" name="category_id">
            <option value="">—</option>
            ${CATEGORIES.map((c) => `<option value="${esc(c.id)}" ${c.id === v.category_id ? 'selected' : ''}>${esc(c.name_es)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Pureza</label>
          <input class="input" name="purity" value="${esc(v.purity ?? '≥99%')}"></div>
        <div class="field"><label>Presentación (ES)</label>
          <input class="input" name="presentation_es" value="${esc(v.presentation_es ?? '')}"></div>
        <div class="field"><label>Presentación (EN)</label>
          <input class="input" name="presentation_en" value="${esc(v.presentation_en ?? '')}"></div>
        <div class="field"><label>Precio MXN *</label>
          <input class="input" name="price" type="number" min="0" step="1" required
                 value="${(v.price_cents ?? 0) / 100}"></div>
        <div class="field"><label>Precio antes (MXN)</label>
          <input class="input" name="compare_at" type="number" min="0" step="1"
                 value="${v.compare_at_cents ? v.compare_at_cents / 100 : ''}"></div>
        <div class="field"><label>Stock *</label>
          <input class="input" name="stock" type="number" min="0" required value="${v.stock ?? 0}"></div>
        <div class="field"><label>Estado</label>
          <select class="select" name="status">
            ${['active', 'draft', 'archived'].map((s) => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${
              { active: 'Activo', draft: 'Borrador', archived: 'Archivado' }[s]}</option>`).join('')}
          </select></div>
        <div class="field span-2"><label>Descripción (ES)</label>
          <textarea class="textarea" name="desc_es">${esc(v.desc_es ?? '')}</textarea></div>
        <div class="field span-2"><label>Descripción (EN)</label>
          <textarea class="textarea" name="desc_en">${esc(v.desc_en ?? '')}</textarea></div>
        <div class="field"><label>Etiquetas ES (coma)</label>
          <input class="input" name="tags_es" value="${esc((v.tags_es ?? []).join(', '))}"></div>
        <div class="field"><label>Etiquetas EN (coma)</label>
          <input class="input" name="tags_en" value="${esc((v.tags_en ?? []).join(', '))}"></div>
        <div class="field span-2" style="flex-direction:row;gap:20px;flex-wrap:wrap">
          <label class="check"><input type="checkbox" name="bestseller" ${v.bestseller ? 'checked' : ''}> Más vendido</label>
          <label class="check"><input type="checkbox" name="is_new" ${v.is_new ? 'checked' : ''}> Nuevo</label>
        </div>
      </div>

      <div style="margin-top:22px">
        <label style="font-size:.78rem;font-weight:600;color:hsl(var(--muted-fg))">Imágenes</label>
        ${isNew ? `<p class="help" style="margin-top:8px">Guarda el producto primero para subir imágenes.</p>`
          : `<div class="img-grid" id="imgGrid" style="margin-top:10px"></div>
             <div class="dropzone" id="dropzone" style="margin-top:10px">
               ${icon('upload')} Arrastra imágenes o haz clic para subir (PNG/JPG/WebP, máx. 5 MB)
             </div>
             <input type="file" id="fileInput" accept="image/*" multiple hidden>`}
      </div>
    </form>`,
    `<button class="btn btn-outline" data-close-sheet>Cancelar</button>
     <button class="btn btn-primary" id="saveProduct">${isNew ? 'Crear producto' : 'Guardar cambios'}</button>`);

  if (!isNew) renderImages(v);

  $('#saveProduct').addEventListener('click', async () => {
    const f = new FormData($('#pForm'));
    const payload = {
      ...(v.id ? { id: v.id } : {}),
      name: f.get('name').trim(),
      sku: f.get('sku').trim() || null,
      slug: (f.get('slug').trim() || slugify(f.get('name'))),
      category_id: f.get('category_id') || null,
      purity: f.get('purity').trim() || null,
      presentation_es: f.get('presentation_es').trim() || null,
      presentation_en: f.get('presentation_en').trim() || null,
      price_cents: Math.round(Number(f.get('price')) * 100),
      compare_at_cents: f.get('compare_at') ? Math.round(Number(f.get('compare_at')) * 100) : null,
      stock: Number(f.get('stock')),
      status: f.get('status'),
      desc_es: f.get('desc_es').trim() || null,
      desc_en: f.get('desc_en').trim() || null,
      tags_es: f.get('tags_es').split(',').map((s) => s.trim()).filter(Boolean),
      tags_en: f.get('tags_en').split(',').map((s) => s.trim()).filter(Boolean),
      bestseller: f.get('bestseller') === 'on',
      is_new: f.get('is_new') === 'on',
    };
    if (!payload.name) return toast('El nombre es obligatorio', 'err');
    try {
      await upsertProduct(payload);
      toast(isNew ? 'Producto creado' : 'Producto actualizado');
      closeSheet(); viewProductos();
    } catch (e) { fail(e); }
  });

  if (!isNew) {
    const input = $('#fileInput'), zone = $('#dropzone');
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); zone.classList.remove('over'); handleFiles(v, e.dataTransfer.files);
    });
    input.addEventListener('change', () => handleFiles(v, input.files));
  }
}

async function handleFiles(product, files) {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 5 * 1024 * 1024) { toast(`${file.name} supera 5 MB`, 'err'); continue; }
    try {
      const img = await uploadProductImage(product.id, file);
      product.images = [...(product.images ?? []), img];
      renderImages(product);
      toast('Imagen subida');
    } catch (e) { fail(e); }
  }
}

function renderImages(product) {
  const grid = $('#imgGrid');
  if (!grid) return;
  const imgs = product.images ?? [];
  grid.innerHTML = imgs.length ? imgs.map((im) => `
    <div class="img-cell"><img src="${esc(im.url)}" alt="">
      <button class="rm" data-img="${im.id}" aria-label="Quitar">${icon('trash')}</button></div>`).join('')
    : `<p class="help">Sin imágenes todavía.</p>`;
  $$('[data-img]', grid).forEach((b) => b.addEventListener('click', async () => {
    const im = imgs.find((x) => x.id === b.dataset.img);
    try {
      await deleteProductImage(im);
      product.images = imgs.filter((x) => x.id !== im.id);
      renderImages(product); toast('Imagen eliminada');
    } catch (e) { fail(e); }
  }));
}

/* ======================================================================
   PEDIDOS
   ====================================================================== */
async function viewPedidos() {
  setView('Pedidos', 'Gestiona ventas, pagos y preparación');
  loading();
  try {
    const orders = await fetchOrders({ limit: 200 });
    render(`
      <div class="panel">
        <div class="panel-head">
          <div class="toolbar">
            <label class="search">${icon('search')}
              <input class="input" id="oSearch" placeholder="Pedido, cliente o correo…" style="padding-left:34px"></label>
            <select class="select" id="oStatus">
              <option value="">Todos los estados</option>
              ${Object.entries(ESTADO_PEDIDO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <span class="help">${orders.length} pedido(s)</span>
        </div>
        <div class="panel-body flush"><div class="table-wrap">
          <table class="data"><thead><tr>
            <th>Pedido</th><th>Cliente</th><th>Estado</th><th>Pago</th>
            <th class="num">Total</th><th>Fecha</th><th></th>
          </tr></thead><tbody id="oRows"></tbody></table></div></div>
      </div>`);

    const rows = () => {
      const q = ($('#oSearch').value || '').toLowerCase();
      const st = $('#oStatus').value;
      const list = orders.filter((o) =>
        (!q || o.order_number.toLowerCase().includes(q) || o.email.toLowerCase().includes(q) ||
         (o.customer_name ?? '').toLowerCase().includes(q)) && (!st || o.status === st));
      $('#oRows').innerHTML = list.length ? list.map((o) => `<tr>
        <td><div class="cell-main mono">${esc(o.order_number)}</div>
            <div class="cell-sub">${o.order_items?.length ?? 0} artículo(s)</div></td>
        <td><div class="cell-main">${esc(o.customer_name || '—')}</div>
            <div class="cell-sub">${esc(o.email)}</div></td>
        <td>${stateChip(o.status)}</td>
        <td>${stateChip(o.payment_status, ESTADO_PAGO)}</td>
        <td class="num">${mxn(o.total_cents)}</td>
        <td>${fechaMX(o.created_at)}</td>
        <td><div class="row-actions">
          <button class="btn btn-outline btn-sm" data-open="${o.id}">${icon('eye')} Ver</button>
        </div></td></tr>`).join('')
        : `<tr><td colspan="7">${empty('Sin pedidos que coincidan.', 'receipt')}</td></tr>`;
    };
    rows();
    ['#oSearch', '#oStatus'].forEach((s) => $(s).addEventListener('input', rows));
    $('#viewBody').onclick = ( (e) => {
      const b = e.target.closest('[data-open]');
      if (b) openOrder(b.dataset.open);
    });
  } catch (e) { fail(e); render(empty('No pudimos cargar los pedidos.', 'alert')); }
}

async function openOrder(id) {
  try {
    const o = await fetchOrder(id);
    const ship = o.shipments?.[0];
    const addr = o.shipping_address ?? {};
    openSheet(`Pedido ${o.order_number}`, `
      <div class="form-grid">
        <div class="kpi"><div class="k-label">Total</div><div class="k-value teal">${mxn(o.total_cents)}</div>
          <div class="k-note">Subtotal ${mxn(o.subtotal_cents)} · Envío ${mxn(o.shipping_cents)}${
            o.discount_cents ? ` · Desc. −${mxn(o.discount_cents)}` : ''}</div></div>
        <div class="kpi"><div class="k-label">Cliente</div>
          <div style="font-weight:700;margin-top:8px">${esc(o.customer_name || '—')}</div>
          <div class="k-note">${esc(o.email)}${o.phone ? ` · ${esc(o.phone)}` : ''}</div></div>
        <div class="kpi"><div class="k-label">Pago</div>
          <div style="margin-top:10px">${stateChip(o.payment_status, ESTADO_PAGO)}</div>
          <div class="k-note">${esc(o.payment_method ?? 'sin método')}${
            o.paid_at ? ` · ${fechaHoraMX(o.paid_at)}` : ''}${
            o.stripe_payment_intent ? `<br><span class="mono">${esc(o.stripe_payment_intent)}</span>` : ''}</div></div>
      </div>

      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Artículos</h2></div>
        <div class="panel-body flush"><div class="table-wrap"><table class="data" style="min-width:auto">
          <tbody>${(o.order_items ?? []).map((i) => `<tr>
            <td><div class="cell-main">${esc(i.name)}</div><div class="cell-sub">${esc(i.presentation ?? '')}</div></td>
            <td class="num">${i.qty} × ${mxn(i.unit_price_cents)}</td>
            <td class="num"><strong>${mxn(i.total_cents)}</strong></td></tr>`).join('')}
          </tbody></table></div></div></div>

      <div class="form-grid" style="margin-top:18px">
        <div class="field"><label>Estado del pedido</label>
          <select class="select" id="oSt">${Object.entries(ESTADO_PEDIDO).map(([k, v]) =>
            `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Estado del pago</label>
          <select class="select" id="oPay">${Object.entries(ESTADO_PAGO).map(([k, v]) =>
            `<option value="${k}" ${o.payment_status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field span-2"><label>Notas internas</label>
          <textarea class="textarea" id="oNotes">${esc(o.admin_notes ?? '')}</textarea></div>
      </div>

      ${o.invoice_requested ? `<div class="panel" style="margin-top:18px;border-color:hsl(var(--amber) / .4)">
        <div class="panel-head"><h2>Factura solicitada (CFDI 4.0)</h2>
          <select class="select" id="invStatus" style="min-width:150px">
            ${['requested', 'issued', 'rejected'].map((st) => `<option value="${st}" ${
              o.invoice_status === st ? 'selected' : ''}>${
              { requested: 'Solicitada', issued: 'Emitida', rejected: 'Rechazada' }[st]}</option>`).join('')}
          </select></div>
        <div class="panel-body"><table class="data" style="min-width:auto"><tbody>
          ${Object.entries(o.billing ?? {}).map(([k, v]) => `<tr>
            <td class="cell-sub">${esc({ rfc: 'RFC', razon_social: 'Razón social', regimen: 'Régimen',
              uso_cfdi: 'Uso CFDI', cp_fiscal: 'CP fiscal', email_fiscal: 'Correo fiscal' }[k] ?? k)}</td>
            <td class="mono">${esc(v)}</td></tr>`).join('')}
        </tbody></table></div></div>` : ''}

      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Envío</h2>
        <button class="btn btn-outline btn-sm" id="quoteBtn">${icon('truck')} Cotizar Skydropx</button></div>
        <div class="panel-body">
          <p class="help" style="margin-bottom:12px">${
            addr.line1 ? `${esc(addr.recipient ?? '')} · ${esc(addr.line1)}, ${esc(addr.city ?? '')}, ${esc(addr.state ?? '')} ${esc(addr.postal_code ?? '')}`
                       : 'Sin dirección registrada.'}</p>
          <div class="form-grid">
            <div class="field"><label>Paquetería</label>
              <input class="input" id="shCarrier" value="${esc(ship?.carrier ?? '')}" placeholder="Estafeta / DHL"></div>
            <div class="field"><label>Número de guía</label>
              <input class="input" id="shTracking" value="${esc(ship?.tracking_number ?? '')}"></div>
            <div class="field span-2"><label>URL de rastreo</label>
              <input class="input" id="shUrl" value="${esc(ship?.tracking_url ?? '')}" placeholder="https://…"></div>
          </div>
          ${ship?.label_url ? `<p class="help" style="margin-top:12px">
            <a class="btn btn-outline btn-sm" href="${esc(ship.label_url)}" target="_blank" rel="noopener">
              ${icon('external')} Descargar guía</a></p>` : ''}
          <div id="ratesBox"></div>
          ${ship?.shipment_events?.length ? `<ul class="timeline" style="margin-top:16px">${
            ship.shipment_events.map((ev) => `<li class="done"><div class="t-title">${esc(ev.status)}</div>
              <div class="t-meta">${esc(ev.description ?? '')} · ${fechaHoraMX(ev.occurred_at)}</div></li>`).join('')}</ul>` : ''}
        </div></div>

      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Historial</h2></div>
        <div class="panel-body"><ul class="timeline">${
          (o.order_events ?? []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((ev) => `<li class="done"><div class="t-title">${esc(ESTADO_PEDIDO[ev.status] ?? ev.status)}</div>
              <div class="t-meta">${esc(ev.note ?? '')} · ${fechaHoraMX(ev.created_at)}</div></li>`).join('')
          || '<li class="done"><div class="t-title">Pedido creado</div></li>'}</ul></div></div>`,
      `${o.payment_status !== 'paid'
          ? `<button class="btn btn-outline" id="payLinkBtn">${icon('external')} Liga de pago</button>` : ''}
       <button class="btn btn-outline" id="mailBtn">${icon('mail')} Enviar correo</button>
       <button class="btn btn-outline" data-close-sheet>Cerrar</button>
       <button class="btn btn-primary" id="saveOrder">Guardar cambios</button>`);

    $('#payLinkBtn')?.addEventListener('click', async () => {
      try {
        const { data, error } = await supabase.functions.invoke('stripe-checkout', {
          body: { order_id: o.id },
        });
        if (error || data?.error) throw new Error(data?.error ?? 'Stripe no está configurado');
        await navigator.clipboard.writeText(data.url).catch(() => {});
        toast('Liga de pago copiada al portapapeles');
      } catch (e) {
        toast(e.message === 'Este pedido no es tuyo'
          ? 'La liga sólo puede generarla el cliente dueño del pedido'
          : (e.message ?? 'Stripe no está configurado'), 'err');
      }
    });

    $('#saveOrder').addEventListener('click', async () => {
      try {
        const status = $('#oSt').value;
        const patch = { payment_status: $('#oPay').value, admin_notes: $('#oNotes').value.trim() || null };
        if ($('#invStatus')) patch.invoice_status = $('#invStatus').value;
        if (status !== o.status) patch.status = status;
        await updateOrder(o.id, patch);
        const carrier = $('#shCarrier').value.trim(), tracking = $('#shTracking').value.trim();
        if (carrier || tracking) {
          await upsertShipment(o.id, {
            carrier: carrier || null, tracking_number: tracking || null,
            tracking_url: $('#shUrl').value.trim() || null,
            status: status === 'delivered' ? 'delivered' : (tracking ? 'in_transit' : 'pending'),
            ...(status === 'shipped' && !ship?.shipped_at ? { shipped_at: new Date().toISOString() } : {}),
          });
        }
        // Correo automático al avanzar a enviado / entregado
        if (patch.status && ['shipped', 'delivered'].includes(patch.status)) {
          const tpl = patch.status === 'shipped' ? 'order_shipped' : 'order_delivered';
          try {
            const r = await sendOrderEmail(tpl, o.id);
            toast(r?.skipped ? 'Pedido actualizado (Resend sin configurar)'
                             : 'Pedido actualizado y cliente notificado');
          } catch { toast('Pedido actualizado (no se pudo enviar el correo)'); }
        } else {
          toast('Pedido actualizado');
        }
        closeSheet(); viewPedidos();
      } catch (e) { fail(e); }
    });

    $('#mailBtn').addEventListener('click', async () => {
      const tpl = { shipped: 'order_shipped', delivered: 'order_delivered' }[$('#oSt').value] ?? 'order_confirmation';
      try {
        const r = await sendOrderEmail(tpl, o.id);
        toast(r?.skipped ? 'Resend no está configurado todavía' : 'Correo enviado', r?.skipped ? 'err' : 'ok');
      } catch (e) { fail(e); }
    });

    $('#quoteBtn').addEventListener('click', async () => {
      const box = $('#ratesBox');
      const btn = $('#quoteBtn');
      btn.disabled = true;
      box.innerHTML = '<p class="help" style="margin-top:12px">Cotizando con las paqueterías…</p>';
      try {
        const { data, error } = await supabase.functions.invoke('skydropx-rates', {
          body: { action: 'quote', order_id: o.id, to: { ...addr, email: o.email, phone: o.phone } },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const rates = data?.rates ?? [];
        if (!rates.length) { box.innerHTML = '<p class="help" style="margin-top:12px">Sin tarifas para este destino.</p>'; return; }

        box.innerHTML = `<div class="table-wrap" style="margin-top:14px"><table class="data" style="min-width:auto">
          <tbody>${rates.map((r) => `<tr>
            <td><div class="cell-main">${esc(r.provider ?? '')}</div>
                <div class="cell-sub">${esc(r.service ?? '')}${r.days ? ` · ${esc(String(r.days))} día(s)` : ''}</div></td>
            <td class="num"><strong>${mxn(r.cost_cents)}</strong></td>
            <td class="num"><button class="btn btn-outline btn-sm" data-rate="${esc(String(r.id))}"
              data-carrier="${esc(r.provider ?? '')}">Generar guía</button></td></tr>`).join('')}
          </tbody></table></div>`;

        box.onclick = async (ev) => {
          const b = ev.target.closest('[data-rate]');
          if (!b) return;
          b.disabled = true; b.textContent = 'Generando…';
          try {
            const res = await supabase.functions.invoke('skydropx-rates', {
              body: {
                action: 'label', order_id: o.id, quotation_id: data.quotation_id,
                rate_id: b.dataset.rate, to: { ...addr, email: o.email, phone: o.phone },
              },
            });
            if (res.error) throw res.error;
            if (res.data?.error) throw new Error(res.data.error);
            $('#shCarrier').value = b.dataset.carrier;
            $('#shTracking').value = res.data?.tracking_number ?? '';
            $('#shUrl').value = res.data?.tracking_url ?? '';
            toast('Guía generada · guarda los cambios para confirmar');
            box.innerHTML = res.data?.label_url
              ? `<p class="help" style="margin-top:12px"><a class="btn btn-outline btn-sm"
                   href="${esc(res.data.label_url)}" target="_blank" rel="noopener">
                   ${icon('external')} Descargar guía</a></p>` : '';
          } catch (err) {
            b.disabled = false; b.textContent = 'Generar guía';
            toast(err.message ?? 'No se pudo generar la guía', 'err');
          }
        };
      } catch (e) {
        box.innerHTML = '';
        toast(e.message?.includes('SKYDROPX') ? 'Skydropx aún no está configurado'
                                              : (e.message ?? 'No se pudo cotizar'), 'err');
      } finally { btn.disabled = false; }
    });
  } catch (e) { fail(e); }
}

/* ======================================================================
   ENVÍOS
   ====================================================================== */
async function viewEnvios() {
  setView('Envíos', 'Guías, rastreo y cadena de frío');
  loading();
  try {
    const orders = (await fetchOrders({ limit: 200 }))
      .filter((o) => ['paid', 'processing', 'shipped', 'delivered'].includes(o.status));
    render(`<div class="panel">
      <div class="panel-head"><h2>Pedidos en logística</h2>
        <span class="help">${orders.length} registro(s)</span></div>
      <div class="panel-body flush"><div class="table-wrap">
        <table class="data"><thead><tr>
          <th>Pedido</th><th>Destino</th><th>Paquetería</th><th>Guía</th><th>Estado</th><th></th>
        </tr></thead><tbody>
        ${orders.length ? orders.map((o) => {
          const s = o.shipments?.[0]; const a = o.shipping_address ?? {};
          return `<tr>
            <td><div class="cell-main mono">${esc(o.order_number)}</div>
                <div class="cell-sub">${esc(o.customer_name || o.email)}</div></td>
            <td>${a.city ? `${esc(a.city)}, ${esc(a.state ?? '')}` : '—'}
                <div class="cell-sub">${esc(a.postal_code ?? '')}</div></td>
            <td>${esc(s?.carrier ?? '—')}</td>
            <td class="mono">${s?.tracking_number
              ? (s.tracking_url ? `<a href="${esc(s.tracking_url)}" target="_blank" rel="noopener">${esc(s.tracking_number)}</a>`
                                : esc(s.tracking_number)) : '—'}</td>
            <td>${stateChip(o.status)}</td>
            <td><div class="row-actions">
              <button class="btn btn-outline btn-sm" data-open="${o.id}">${icon('pencil')} Gestionar</button>
            </div></td></tr>`;
        }).join('') : `<tr><td colspan="6">${empty('Aún no hay envíos por preparar.', 'truck')}</td></tr>`}
        </tbody></table></div></div></div>`);
    $('#viewBody').onclick = ( (e) => {
      const b = e.target.closest('[data-open]'); if (b) openOrder(b.dataset.open);
    });
  } catch (e) { fail(e); render(empty('No pudimos cargar los envíos.', 'alert')); }
}

/* ======================================================================
   CLIENTES
   ====================================================================== */
async function viewClientes() {
  setView('Clientes', 'Cuentas registradas y permisos');
  loading();
  try {
    const [people, orders] = await Promise.all([fetchCustomers(), fetchOrders({ limit: 500 })]);
    const agg = {};
    orders.forEach((o) => {
      if (!o.user_id) return;
      agg[o.user_id] ??= { n: 0, total: 0 };
      agg[o.user_id].n++; agg[o.user_id].total += o.total_cents;
    });
    render(`<div class="panel">
      <div class="panel-head">
        <label class="search">${icon('search')}
          <input class="input" id="cSearch" placeholder="Nombre o correo…" style="padding-left:34px"></label>
        <span class="help">${people.length} cuenta(s)</span></div>
      <div class="panel-body flush"><div class="table-wrap">
        <table class="data"><thead><tr>
          <th>Cliente</th><th>Rol</th><th class="num">Pedidos</th><th class="num">Total</th><th>Alta</th><th></th>
        </tr></thead><tbody id="cRows"></tbody></table></div></div></div>`);

    const rows = () => {
      const q = ($('#cSearch').value || '').toLowerCase();
      const list = people.filter((p) =>
        !q || (p.full_name ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q));
      $('#cRows').innerHTML = list.length ? list.map((p) => `<tr>
        <td><div class="cell-main">${esc(p.full_name || '—')}</div>
            <div class="cell-sub">${esc(p.email ?? '')}${p.phone ? ` · ${esc(p.phone)}` : ''}</div></td>
        <td><select class="select" data-role="${p.id}" style="min-width:118px">
          ${['customer', 'staff', 'admin'].map((r) => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${
            { customer: 'Cliente', staff: 'Staff', admin: 'Admin' }[r]}</option>`).join('')}
        </select></td>
        <td class="num">${agg[p.id]?.n ?? 0}</td>
        <td class="num">${mxn(agg[p.id]?.total ?? 0)}</td>
        <td>${fechaMX(p.created_at)}</td>
        <td class="mono cell-sub">${esc((p.id ?? '').slice(0, 8))}</td></tr>`).join('')
        : `<tr><td colspan="6">${empty('Sin clientes registrados todavía.', 'users')}</td></tr>`;
      $$('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
        try { await updateProfile(sel.dataset.role, { role: sel.value }); toast('Rol actualizado'); }
        catch (e) { fail(e); }
      }));
    };
    rows();
    $('#cSearch').addEventListener('input', rows);
  } catch (e) { fail(e); render(empty('No pudimos cargar los clientes.', 'alert')); }
}

/* ======================================================================
   LOTES / COA
   ====================================================================== */
async function viewLotes() {
  setView('Lotes y COA', 'Trazabilidad y certificados de análisis',
    `<button class="btn btn-primary btn-sm" id="newBatch">${icon('plus')} Nuevo lote</button>`);
  loading();
  try {
    const [batches, products] = await Promise.all([fetchBatches(), fetchProducts({ includeInactive: true })]);
    render(`<div class="panel">
      <div class="panel-head"><h2>Lotes registrados</h2><span class="help">${batches.length} lote(s)</span></div>
      <div class="panel-body flush"><div class="table-wrap">
        <table class="data"><thead><tr>
          <th>Lote</th><th>Producto</th><th class="num">Pureza HPLC</th><th>Liofilizado</th><th>COA</th><th></th>
        </tr></thead><tbody>
        ${batches.length ? batches.map((b) => `<tr>
          <td><div class="cell-main mono">${esc(b.code)}</div>
              <div class="cell-sub">${b.published ? 'Publicado' : 'Oculto'}</div></td>
          <td>${esc(b.products?.name ?? '—')}</td>
          <td class="num">${b.purity_hplc ? `${b.purity_hplc}%` : '—'}</td>
          <td>${fechaMX(b.lyophilized_on)}</td>
          <td>${b.coa_url ? `<a href="${esc(b.coa_url)}" target="_blank" rel="noopener">Ver PDF</a>` : '—'}</td>
          <td><div class="row-actions">
            <button class="btn btn-outline btn-sm" data-batch="${b.id}">${icon('pencil')}</button></div></td>
        </tr>`).join('') : `<tr><td colspan="6">${empty('Sin lotes registrados.', 'flask')}</td></tr>`}
        </tbody></table></div></div></div>`);

    const editBatch = (b) => {
      const v = b ?? { published: true };
      openSheet(b ? `Lote ${b.code}` : 'Nuevo lote', `
        <form id="bForm"><div class="form-grid">
          <div class="field"><label>Código *</label>
            <input class="input" name="code" required value="${esc(v.code ?? 'AMX-')}"></div>
          <div class="field"><label>Producto</label>
            <select class="select" name="product_id"><option value="">—</option>
              ${products.map((p) => `<option value="${p.id}" ${p.id === v.product_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select></div>
          <div class="field"><label>Pureza HPLC (%)</label>
            <input class="input" name="purity_hplc" type="number" step="0.01" value="${v.purity_hplc ?? ''}"></div>
          <div class="field"><label>Identidad MS</label>
            <input class="input" name="identity_ms" value="${esc(v.identity_ms ?? '')}"></div>
          <div class="field"><label>Endotoxinas</label>
            <input class="input" name="endotoxins" value="${esc(v.endotoxins ?? '< 0.5 EU/mg')}"></div>
          <div class="field"><label>Agua residual</label>
            <input class="input" name="residual_water" value="${esc(v.residual_water ?? '')}"></div>
          <div class="field"><label>Fecha de liofilización</label>
            <input class="input" name="lyophilized_on" type="date" value="${v.lyophilized_on ?? ''}"></div>
          <div class="field"><label>Laboratorio</label>
            <input class="input" name="lab" value="${esc(v.lab ?? '')}"></div>
          <div class="field span-2"><label>Certificado (PDF)</label>
            <input class="input" type="file" id="coaFile" accept="application/pdf">
            ${v.coa_url ? `<span class="help">Actual: <a href="${esc(v.coa_url)}" target="_blank" rel="noopener">ver PDF</a></span>` : ''}</div>
          <div class="field span-2"><label class="check">
            <input type="checkbox" name="published" ${v.published ? 'checked' : ''}> Visible en la verificación pública</label></div>
        </div></form>`,
        `<button class="btn btn-outline" data-close-sheet>Cancelar</button>
         <button class="btn btn-primary" id="saveBatch">Guardar</button>`);

      $('#saveBatch').addEventListener('click', async () => {
        const f = new FormData($('#bForm'));
        const payload = {
          ...(v.id ? { id: v.id } : {}),
          code: f.get('code').trim().toUpperCase(),
          product_id: f.get('product_id') || null,
          purity_hplc: f.get('purity_hplc') ? Number(f.get('purity_hplc')) : null,
          identity_ms: f.get('identity_ms').trim() || null,
          endotoxins: f.get('endotoxins').trim() || null,
          residual_water: f.get('residual_water').trim() || null,
          lyophilized_on: f.get('lyophilized_on') || null,
          lab: f.get('lab').trim() || null,
          published: f.get('published') === 'on',
        };
        try {
          const file = $('#coaFile').files?.[0];
          if (file) payload.coa_url = await uploadCOA(payload.code, file);
          await upsertBatch(payload);
          toast('Lote guardado'); closeSheet(); viewLotes();
        } catch (e) { fail(e); }
      });
    };

    $('#newBatch').addEventListener('click', () => editBatch(null));
    $('#viewBody').onclick = ( (e) => {
      const b = e.target.closest('[data-batch]');
      if (b) editBatch(batches.find((x) => x.id === b.dataset.batch));
    });
  } catch (e) { fail(e); render(empty('No pudimos cargar los lotes.', 'alert')); }
}


/* ======================================================================
   CUPONES
   ====================================================================== */
async function viewCupones() {
  setView('Cupones', 'Descuentos y códigos promocionales',
    `<button class="btn btn-primary btn-sm" id="newCoupon">${icon('plus')} Nuevo cupón</button>`);
  loading();
  try {
    const { data, error } = await supabase.from('coupons')
      .select('*').order('created_at', { ascending: false });
    if (error) throw error;

    render(`<div class="panel">
      <div class="panel-head"><h2>Cupones</h2><span class="help">${data.length} cupón(es)</span></div>
      <div class="panel-body flush"><div class="table-wrap">
        <table class="data"><thead><tr>
          <th>Código</th><th>Descuento</th><th class="num">Mínimo</th>
          <th class="num">Usos</th><th>Vigencia</th><th>Estado</th><th></th>
        </tr></thead><tbody>
        ${data.length ? data.map((c) => `<tr>
          <td><div class="cell-main mono">${esc(c.code)}</div></td>
          <td>${c.kind === 'percent' ? `${c.value}%` : mxn(c.value)}</td>
          <td class="num">${c.min_subtotal_cents ? mxn(c.min_subtotal_cents) : '—'}</td>
          <td class="num">${c.used_count}${c.max_uses ? ` / ${c.max_uses}` : ''}</td>
          <td>${c.expires_at ? fechaMX(c.expires_at) : 'Sin límite'}</td>
          <td>${c.active ? '<span class="state active">Activo</span>'
                         : '<span class="state draft">Inactivo</span>'}</td>
          <td><div class="row-actions">
            <button class="btn btn-outline btn-sm" data-coupon="${esc(c.code)}">${icon('pencil')}</button>
            <button class="btn btn-outline btn-sm" data-coupon-del="${esc(c.code)}">${icon('trash')}</button>
          </div></td></tr>`).join('')
          : `<tr><td colspan="7">${empty('Sin cupones. Crea el primero.', 'receipt')}</td></tr>`}
        </tbody></table></div></div></div>`);

    const editCoupon = (c) => {
      const v = c ?? { kind: 'percent', active: true, value: 10, min_subtotal_cents: 0 };
      openSheet(c ? `Cupón ${c.code}` : 'Nuevo cupón', `
        <form id="cForm"><div class="form-grid">
          <div class="field"><label>Código *</label>
            <input class="input mono" name="code" required value="${esc(v.code ?? '')}"
                   ${c ? 'readonly' : ''} placeholder="BIENVENIDA" style="text-transform:uppercase"></div>
          <div class="field"><label>Tipo</label>
            <select class="select" name="kind">
              <option value="percent" ${v.kind === 'percent' ? 'selected' : ''}>Porcentaje (%)</option>
              <option value="fixed" ${v.kind === 'fixed' ? 'selected' : ''}>Monto fijo (MXN)</option>
            </select></div>
          <div class="field"><label>Valor *</label>
            <input class="input" name="value" type="number" min="1" required
                   value="${v.kind === 'fixed' ? (v.value / 100) : v.value}">
            <span class="help">En % (1–100) o en pesos según el tipo.</span></div>
          <div class="field"><label>Compra mínima (MXN)</label>
            <input class="input" name="min" type="number" min="0"
                   value="${(v.min_subtotal_cents ?? 0) / 100}"></div>
          <div class="field"><label>Usos máximos</label>
            <input class="input" name="max_uses" type="number" min="1" value="${v.max_uses ?? ''}"
                   placeholder="sin límite"></div>
          <div class="field"><label>Expira</label>
            <input class="input" name="expires" type="date"
                   value="${v.expires_at ? String(v.expires_at).slice(0, 10) : ''}"></div>
          <div class="field span-2"><label class="check">
            <input type="checkbox" name="active" ${v.active ? 'checked' : ''}> Cupón activo</label></div>
        </div></form>`,
        `<button class="btn btn-outline" data-close-sheet>Cancelar</button>
         <button class="btn btn-primary" id="saveCoupon">Guardar</button>`);

      $('#saveCoupon').addEventListener('click', async () => {
        const f = new FormData($('#cForm'));
        const kind = f.get('kind');
        const raw = Number(f.get('value'));
        if (kind === 'percent' && (raw < 1 || raw > 100)) {
          return toast('El porcentaje debe estar entre 1 y 100', 'err');
        }
        const row = {
          code: f.get('code').trim().toUpperCase(),
          kind,
          value: kind === 'fixed' ? Math.round(raw * 100) : Math.round(raw),
          min_subtotal_cents: Math.round(Number(f.get('min') || 0) * 100),
          max_uses: f.get('max_uses') ? Number(f.get('max_uses')) : null,
          expires_at: f.get('expires') || null,
          active: f.get('active') === 'on',
        };
        if (!row.code) return toast('El código es obligatorio', 'err');
        try {
          const { error } = await supabase.from('coupons').upsert(row, { onConflict: 'code' });
          if (error) throw error;
          toast('Cupón guardado'); closeSheet(); viewCupones();
        } catch (e) { fail(e); }
      });
    };

    $('#newCoupon').addEventListener('click', () => editCoupon(null));
    $('#viewBody').onclick = ((e) => {
      const ed = e.target.closest('[data-coupon]');
      if (ed) return editCoupon(data.find((c) => c.code === ed.dataset.coupon));
      const del = e.target.closest('[data-coupon-del]');
      if (del && confirm(`¿Eliminar el cupón ${del.dataset.couponDel}?`)) {
        supabase.from('coupons').delete().eq('code', del.dataset.couponDel)
          .then(() => { toast('Cupón eliminado'); viewCupones(); });
      }
    });
  } catch (e) { fail(e); render(empty('No pudimos cargar los cupones.', 'alert')); }
}

/* ======================================================================
   AJUSTES
   ====================================================================== */
async function viewAjustes() {
  setView('Ajustes', 'Envío, tienda e integraciones');
  loading();
  try {
    const { data } = await supabase.from('settings').select('*');
    const get = (k) => data?.find((s) => s.key === k)?.value ?? {};
    const ship = get('shipping'), store = get('store');
    render(`
      <div class="panel"><div class="panel-head"><h2>Envío</h2></div><div class="panel-body">
        <form id="setForm"><div class="form-grid">
          <div class="field"><label>Envío gratis desde (MXN)</label>
            <input class="input" name="free" type="number" min="0" value="${(ship.free_threshold_cents ?? 250000) / 100}"></div>
          <div class="field"><label>Costo de envío (MXN)</label>
            <input class="input" name="flat" type="number" min="0" value="${(ship.flat_cost_cents ?? 18900) / 100}"></div>
          <div class="field"><label>Correo de la tienda</label>
            <input class="input" name="email" type="email" value="${esc(store.email ?? '')}"></div>
          <div class="field"><label>WhatsApp</label>
            <input class="input" name="whatsapp" value="${esc(store.whatsapp ?? '')}"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Guardar ajustes</button></div>
        </form></div></div>

      <div class="panel"><div class="panel-head"><h2>Integraciones</h2></div><div class="panel-body">
        <table class="data" style="min-width:auto"><tbody>
          <tr><td><div class="cell-main">Resend · correos transaccionales</div>
              <div class="cell-sub">Función <code>send-email</code>. Configura el secreto <code>RESEND_API_KEY</code>.</div></td>
              <td class="num"><span class="state pending">Por configurar</span></td></tr>
          <tr><td><div class="cell-main">Skydropx · guías y rastreo</div>
              <div class="cell-sub">Funciones <code>skydropx-rates</code> y <code>skydropx-webhook</code>.
              Configura <code>SKYDROPX_API_KEY</code>.</div></td>
              <td class="num"><span class="state pending">Por configurar</span></td></tr>
          <tr><td><div class="cell-main">Stripe · pagos en línea (tarjeta y OXXO)</div>
              <div class="cell-sub">Funciones <code>stripe-checkout</code> y <code>stripe-webhook</code>.
              Configura <code>STRIPE_SECRET_KEY</code> y <code>STRIPE_WEBHOOK_SECRET</code>.</div></td>
              <td class="num"><span class="state pending">Por configurar</span></td></tr>
          <tr><td><div class="cell-main">Supabase Storage</div>
              <div class="cell-sub">Buckets <code>product-images</code> y <code>coa</code> listos.</div></td>
              <td class="num"><span class="state active">Activo</span></td></tr>
        </tbody></table>
        <p class="help" style="margin-top:14px">Los secretos se configuran en Supabase → Edge Functions → Secrets.</p>
      </div></div>`);

    $('#setForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await supabase.from('settings').upsert([
          { key: 'shipping', value: { free_threshold_cents: Math.round(Number(f.get('free')) * 100),
                                      flat_cost_cents: Math.round(Number(f.get('flat')) * 100), currency: 'MXN' } },
          { key: 'store', value: { ...store, email: f.get('email'), whatsapp: f.get('whatsapp') } },
        ]);
        toast('Ajustes guardados');
      } catch (err) { fail(err); }
    });
  } catch (e) { fail(e); render(empty('No pudimos cargar los ajustes.', 'alert')); }
}

/* ======================================================================
   ARRANQUE
   ====================================================================== */
const VIEWS = {
  resumen: viewResumen, pedidos: viewPedidos, envios: viewEnvios,
  clientes: viewClientes, productos: viewProductos, lotes: viewLotes,
  cupones: viewCupones, ajustes: viewAjustes,
};

function go(view) {
  $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#sidebar').classList.remove('show');
  $('#sideOverlay').classList.remove('show');
  location.hash = view;
  (VIEWS[view] ?? viewResumen)();
}

(async function boot() {
  injectIcons();
  PROFILE = await requireStaff();
  if (!PROFILE) return;

  $('#sideUser').textContent = `${PROFILE.full_name ?? PROFILE.email} · ${PROFILE.role}`;
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto);
    const row = e.target.closest('tr[data-order]'); if (row) openOrder(row.dataset.order);
  });

  $('#menuBtn').addEventListener('click', () => {
    $('#sidebar').classList.toggle('show');
    $('#sideOverlay').classList.toggle('show');
  });
  $('#sideOverlay').addEventListener('click', () => {
    $('#sidebar').classList.remove('show'); $('#sideOverlay').classList.remove('show');
  });
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('amx_theme', next);
  });
  $('#logoutBtn').addEventListener('click', async () => { await signOut(); location.href = 'login.html'; });

  go((location.hash || '#resumen').slice(1));
})();
