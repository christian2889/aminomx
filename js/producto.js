/* ==========================================================================
   Aminos MX — Ficha de producto dinámica
   Lee ?p=<slug> (o el primer producto destacado) y llena la plantilla desde
   Supabase: galería, precio, especificación técnica, COA del lote y relacionados.
   ========================================================================== */
import { supabase, mxn } from './db.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const lang = () => (localStorage.getItem('amx_lang') === 'en' ? 'en' : 'es');
const T = (es, en) => (lang() === 'en' ? en : es);

const vialSVG = (purity, size = 150) => `
  <svg class="vial-svg" width="${size}" height="${size * 1.27}" viewBox="0 0 64 80" fill="none"
       aria-hidden="true" style="position:relative;filter:drop-shadow(0 18px 26px rgba(0,0,0,.5))">
    <rect x="22" y="4" width="20" height="10" rx="2" fill="hsl(174 84% 45% / .9)"/>
    <rect x="24" y="14" width="16" height="6" fill="hsl(215 25% 30%)"/>
    <path d="M20 20h24v6c0 2-2 4-2 6v34a10 10 0 0 1-10 10 10 10 0 0 1-10-10V32c0-2-2-4-2-6v-6Z"
          fill="hsl(215 30% 18%)" stroke="hsl(174 84% 45% / .6)" stroke-width="1.5"/>
    <path d="M23 46h18v20a9 9 0 0 1-9 9 9 9 0 0 1-9-9V46Z" fill="hsl(174 84% 45% / .28)"/>
    <rect x="25" y="28" width="14" height="14" rx="2" fill="hsl(215 35% 8%)" stroke="hsl(215 25% 28%)"/>
    <text x="32" y="38" text-anchor="middle" font-size="6" font-weight="700"
          fill="hsl(174 84% 55%)" font-family="monospace">${esc(purity)}</text>
  </svg>`;

function notFound() {
  $('#pdp-main').innerHTML = `
    <div class="breadcrumb"></div>
    <div class="empty" style="padding:80px 20px;text-align:center">
      <h1 style="font-size:1.6rem;font-weight:800">${T('Producto no encontrado', 'Product not found')}</h1>
      <p style="margin-top:12px;color:hsl(var(--muted-fg))">
        ${T('Es posible que ya no esté disponible.', 'It may no longer be available.')}</p>
      <a class="btn btn-primary" style="margin-top:20px" href="index.html#catalogo">
        ${T('Ver catálogo', 'View catalog')}</a>
    </div>`;
}

function setSEO(p, cat) {
  const desc = (lang() === 'en' ? p.desc_en : p.desc_es) || '';
  const title = `${p.name} · Aminos MX`;
  document.title = title;
  $('[data-seo-desc]')?.setAttribute('content', desc.slice(0, 160));
  $('[data-seo-ogtitle]')?.setAttribute('content', title);
  $('[data-seo-ogdesc]')?.setAttribute('content', desc.slice(0, 200));
  const url = `${location.origin}/producto.html?p=${p.slug}`;
  $('[data-seo-canonical]')?.setAttribute('href', url);

  const img = p.images?.[0]?.url;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, sku: p.sku || p.slug, description: desc,
    category: cat?.name_es ?? undefined,
    ...(img ? { image: [img] } : {}),
    brand: { '@type': 'Brand', name: 'Aminos MX' },
    offers: {
      '@type': 'Offer', url, priceCurrency: 'MXN',
      price: (p.price_cents / 100).toFixed(2),
      availability: p.stock > 0
        ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Aminos MX' },
    },
  };
  const tag = $('[data-seo-jsonld]');
  if (tag) tag.textContent = JSON.stringify(jsonld);
}

function renderGallery(p) {
  const imgs = p.images ?? [];
  const stage = $('[data-pdp-stage]');
  const thumbs = $('[data-pdp-thumbs]');
  const purityShort = (p.purity || '').match(/\d+/)?.[0] ?? 'USP';

  const paint = (idx) => {
    const inner = imgs.length
      ? `<img src="${esc(imgs[idx].url)}" alt="${esc(p.name)}"
              style="position:relative;max-width:78%;max-height:78%;object-fit:contain;border-radius:12px">`
      : vialSVG(imgs.length ? '' : `${purityShort}%`);
    stage.innerHTML = `<span class="bgfill"></span><span class="molecule-bg"></span>${inner}
      <span class="badge badge-purity">${p.purity ? `HPLC ${esc(p.purity)}` : 'Grado USP'}</span>`;
    $$('.t', thumbs).forEach((t, i) => t.classList.toggle('active', i === idx));
  };

  thumbs.innerHTML = (imgs.length ? imgs : [null]).map((im, i) => im
    ? `<button class="t${i === 0 ? ' active' : ''}" data-thumb="${i}" aria-label="Vista ${i + 1}">
         <img src="${esc(im.url)}" alt="" style="width:100%;height:100%;object-fit:cover">
       </button>`
    : `<button class="t active" data-thumb="0" aria-label="Vista 1">
         <span class="bgfill"></span><span class="molecule-bg"></span></button>`
  ).join('') + `<button class="t pdf" data-coa-thumb>COA<br>PDF</button>`;

  paint(0);
  $$('[data-thumb]', thumbs).forEach((b) =>
    b.addEventListener('click', () => paint(Number(b.dataset.thumb))));
}

function renderSpec(p, batch) {
  const rows = [
    batch?.identity_ms && [T('Identidad MS', 'MS identity'), batch.identity_ms],
    [T('Presentación', 'Presentation'), lang() === 'en' ? p.presentation_en : p.presentation_es],
    [T('Pureza', 'Purity'), batch?.purity_hplc ? `${batch.purity_hplc} % HPLC` : p.purity],
    batch?.endotoxins && [T('Endotoxinas', 'Endotoxins'), batch.endotoxins],
    batch?.residual_water && [T('Agua residual', 'Residual water'), batch.residual_water],
    [T('Forma', 'Form'), T('Polvo liofilizado', 'Lyophilized powder')],
    [T('Almacenaje', 'Storage'), T('2–8 °C, proteger de la luz', '2–8 °C, protect from light')],
    batch?.code && [T('Lote', 'Batch'), batch.code],
  ].filter(Boolean);
  $('[data-pdp-spec]').innerHTML = rows
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v ?? '—')}</td></tr>`).join('');
}

async function renderRelated(p) {
  const box = $('[data-pdp-related]');
  if (!box) return;
  const { data } = await supabase.from('products')
    .select('slug, name, price_cents, product_images(url, position)')
    .eq('status', 'active').eq('category_id', p.category_id)
    .neq('id', p.id).limit(4);
  const list = data ?? [];
  if (!list.length) { box.closest('section')?.remove(); return; }
  box.innerHTML = list.map((r) => {
    const img = (r.product_images ?? []).sort((a, b) => a.position - b.position)[0]?.url;
    return `<a class="mini" href="producto.html?p=${encodeURIComponent(r.slug)}">
      <div class="m-thumb">${img
        ? `<img src="${esc(img)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
        : '🧪'}</div>
      <div><div class="m-name">${esc(r.name)}</div>
        <div class="m-price">${mxn(r.price_cents)}</div></div></a>`;
  }).join('');
}

(async function boot() {
  const slug = new URLSearchParams(location.search).get('p');

  let q = supabase.from('products')
    .select('*, product_images(id, url, position), categories(id, name_es, name_en)')
    .eq('status', 'active');
  q = slug ? q.eq('slug', slug) : q.eq('bestseller', true).order('sort_order');

  const { data, error } = await q.limit(1);
  const p = data?.[0];
  if (error || !p) return notFound();
  p.images = (p.product_images ?? []).sort((a, b) => a.position - b.position);

  const { data: batches } = await supabase.from('batches')
    .select('*').eq('product_id', p.id).eq('published', true)
    .order('created_at', { ascending: false }).limit(1);
  const batch = batches?.[0];
  const cat = p.categories;

  // Cabecera
  $('[data-bc-cat]').textContent = cat ? (lang() === 'en' ? cat.name_en : cat.name_es) : '—';
  $('[data-bc-name]').textContent = p.name;
  $('[data-pdp-kicker]').textContent = cat ? (lang() === 'en' ? cat.name_en : cat.name_es) : '';
  $('[data-pdp-name]').textContent = p.name;
  $('[data-pdp-desc]').textContent = (lang() === 'en' ? p.desc_en : p.desc_es) || '';
  $('[data-pdp-pres]').textContent = (lang() === 'en' ? p.presentation_en : p.presentation_es) || '—';

  // Precio
  $('[data-pdp-price]').innerHTML = `${mxn(p.price_cents)}<small>MXN</small>`;
  const cmp = $('[data-pdp-compare]');
  if (p.compare_at_cents) cmp.textContent = mxn(p.compare_at_cents); else cmp.remove();

  // Stock
  const stockEl = $('[data-pdp-stock]');
  if (p.stock <= 0) {
    stockEl.textContent = T('Agotado temporalmente', 'Temporarily out of stock');
    stockEl.closest('.pdp-stock')?.style.setProperty('color', 'hsl(var(--destructive))');
    const buy = $('[data-add-pdp]');
    buy.disabled = true; buy.style.opacity = '.5';
    buy.querySelector('span').textContent = T('Sin existencias', 'Out of stock');
  } else {
    stockEl.textContent = p.stock <= 10
      ? T(`¡Últimas ${p.stock} piezas! · sale hoy antes de la 1 pm`,
          `Only ${p.stock} left! · ships today before 1 pm`)
      : T(`${p.stock} piezas en stock · sale hoy antes de la 1 pm`,
          `${p.stock} in stock · ships today before 1 pm`);
  }

  // El botón usa el slug: main.js lo añade al carrito
  $('[data-add-pdp]').setAttribute('data-add-pdp', p.slug);

  renderGallery(p);
  renderSpec(p, batch);
  setSEO(p, cat);

  // COA del lote
  const coa = $('[data-pdp-coa]');
  if (coa) {
    coa.innerHTML = batch
      ? `${T('Lote', 'Batch')} <strong>${esc(batch.code)}</strong>${
          batch.purity_hplc ? ` · HPLC ${batch.purity_hplc}%` : ''}${
          batch.identity_ms ? ` · MS ${esc(batch.identity_ms)}` : ''}${
          batch.endotoxins ? ` · ${T('endotoxinas', 'endotoxins')} ${esc(batch.endotoxins)}` : ''}.
        ${batch.coa_url
          ? `<a href="${esc(batch.coa_url)}" target="_blank" rel="noopener">${T('Descargar PDF', 'Download PDF')}</a>`
          : T('PDF a solicitud y por el QR del vial.', 'PDF on request and via the vial QR.')}`
      : T('Certificado disponible a solicitud y por el QR del vial.',
          'Certificate available on request and via the vial QR.');
  }

  // Enlazar el thumb de COA al PDF si existe
  const coaThumb = $('[data-coa-thumb]');
  if (coaThumb && batch?.coa_url) {
    coaThumb.addEventListener('click', () => window.open(batch.coa_url, '_blank', 'noopener'));
    coaThumb.style.cursor = 'pointer';
  }

  await renderRelated(p);
})();
