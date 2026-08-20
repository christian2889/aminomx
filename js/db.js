/* ==========================================================================
   Aminos MX — capa de datos (Supabase)
   Módulo ES compartido por tienda, cuenta de cliente y panel admin.
   ========================================================================== */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const cfg = window.AMX_CONFIG || {};
export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ------------------------------------------------------------------ utils */
export const mxn = (cents) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
    .format((Number(cents) || 0) / 100);

export const fechaMX = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fechaHoraMX = (iso) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const ESTADO_PEDIDO = {
  pending: 'Pendiente', paid: 'Pagado', processing: 'En preparación',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado', refunded: 'Reembolsado',
};
export const ESTADO_PAGO = {
  pending: 'Pendiente', paid: 'Pagado', failed: 'Fallido', refunded: 'Reembolsado',
};

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* ------------------------------------------------------------------- auth */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  return data ?? { id: session.user.id, email: session.user.email, role: 'customer' };
}

export async function requireAuth(redirect = '/login') {
  const session = await getSession();
  if (!session) { location.href = `${redirect}?next=${encodeURIComponent(location.pathname)}`; return null; }
  return session;
}

export async function requireStaff() {
  const session = await requireAuth();
  if (!session) return null;
  const profile = await getProfile();
  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    document.body.innerHTML =
      `<div class="auth-wrap"><div class="auth-card">
        <h1>Acceso restringido</h1>
        <p class="lead">Tu cuenta (${profile?.email ?? ''}) no tiene permisos de administrador.
        Pide a un administrador que cambie tu rol a <strong>staff</strong> o <strong>admin</strong>.</p>
        <div class="auth-form">
          <a class="btn btn-outline" href="/cuenta">Ir a mi cuenta</a>
          <button class="btn btn-ghost" id="logoutBtn">Cerrar sesión</button>
        </div></div></div>`;
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await supabase.auth.signOut(); location.href = '/login';
    });
    return null;
  }
  return profile;
}

export const signOut = () => supabase.auth.signOut();

/* --------------------------------------------------------------- catálogo */
export async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function fetchProducts({ includeInactive = false } = {}) {
  let q = supabase
    .from('products')
    .select('*, product_images(id, url, position)')
    .order('sort_order');
  if (!includeInactive) q = q.eq('status', 'active');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...p,
    images: (p.product_images ?? []).sort((a, b) => a.position - b.position),
  }));
}

export async function upsertProduct(product) {
  const row = { ...product };
  delete row.product_images; delete row.images;
  if (!row.slug && row.name) row.slug = slugify(row.name);
  const { data, error } = row.id
    ? await supabase.from('products').update(row).eq('id', row.id).select().single()
    : await supabase.from('products').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

/* --------------------------------------------- imágenes (Storage + tabla) */
export async function uploadProductImage(productId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('product-images').upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);
  const { count } = await supabase.from('product_images')
    .select('id', { count: 'exact', head: true }).eq('product_id', productId);

  const { data, error } = await supabase.from('product_images')
    .insert({ product_id: productId, storage_path: path, url: pub.publicUrl, position: count ?? 0 })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteProductImage(image) {
  if (image.storage_path) {
    await supabase.storage.from('product-images').remove([image.storage_path]);
  }
  const { error } = await supabase.from('product_images').delete().eq('id', image.id);
  if (error) throw error;
}

/* ---------------------------------------------------------------- pedidos */
export async function fetchOrders({ status = null, limit = 100 } = {}) {
  let q = supabase.from('orders')
    .select('*, order_items(*), shipments(*)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchOrder(id) {
  const { data, error } = await supabase.from('orders')
    .select('*, order_items(*), shipments(*, shipment_events(*)), order_events(*)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function updateOrder(id, patch, eventNote = null) {
  const { error } = await supabase.from('orders').update(patch).eq('id', id);
  if (error) throw error;
  if (patch.status) {
    await supabase.from('order_events').insert({
      order_id: id, status: patch.status, note: eventNote ?? null,
    });
  }
}

/** Devuelve al catálogo el inventario de un pedido que no se va a cobrar.
 *  Idempotente en el servidor: llamarla dos veces no duplica el stock. */
export async function restoreOrderStock(orderId) {
  const { data, error } = await supabase.rpc('restore_order_stock', { p_order_id: orderId });
  if (error) throw error;
  return data === true;
}

export async function createOrder({ items, email, name, phone, address, coupon, notes,
                                    quoteId, rateId }) {
  const { data, error } = await supabase.rpc('create_order', {
    p_items: items, p_email: email, p_name: name ?? null,
    p_phone: phone ?? null, p_address: address ?? null,
    p_coupon: coupon ?? null, p_notes: notes ?? null,
    // Tarifa de envío elegida: solo IDs. El precio lo relee el servidor de
    // shipping_quotes; mandar montos desde el navegador no serviría de nada.
    p_quote_id: quoteId ?? null, p_rate_id: rateId ?? null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** Cotiza envío en vivo con Skydropx para un CP de destino. */
export async function quoteShipping(to) {
  const { data, error } = await supabase.functions.invoke('skydropx-rates', {
    body: { action: 'quote', to },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { quote_id, quotation_id, rates: [...] }
}

export const trackOrder = async (orderNumber, email) => {
  const { data, error } = await supabase.rpc('track_order', {
    p_order_number: orderNumber, p_email: email,
  });
  if (error) throw error;
  return data;
};

/* ----------------------------------------------------------------- envíos */
export async function upsertShipment(orderId, patch) {
  const { data, error } = await supabase.from('shipments')
    .upsert({ order_id: orderId, ...patch }, { onConflict: 'order_id' })
    .select().single();
  if (error) throw error;
  return data;
}

/* --------------------------------------------------------------- clientes */
export async function fetchCustomers() {
  const { data, error } = await supabase.from('profiles')
    .select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateProfile(id, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------ lotes / COA */
export async function fetchBatches() {
  const { data, error } = await supabase.from('batches')
    .select('*, products(name)').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertBatch(batch) {
  const { data, error } = batch.id
    ? await supabase.from('batches').update(batch).eq('id', batch.id).select().single()
    : await supabase.from('batches').insert(batch).select().single();
  if (error) throw error;
  return data;
}

export async function uploadCOA(batchCode, file) {
  const path = `${batchCode}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from('coa').upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from('coa').getPublicUrl(path).data.publicUrl;
}

/* -------------------------------------------------------------- métricas */
export async function fetchStats() {
  const { data, error } = await supabase.from('admin_stats').select('*').single();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------- pagos (Stripe) */
export async function startStripeCheckout(orderId) {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { order_id: orderId },
  });
  if (error) {
    // La función responde 501 si aún no hay STRIPE_SECRET_KEY
    let detail = '';
    try { detail = (await error.context?.json())?.error ?? ''; } catch { /* ignore */ }
    throw new Error(detail || error.message || 'No pudimos iniciar el pago');
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('Stripe no devolvió una URL de pago');
  return data.url;
}

/* --------------------------------------------------- correos (Resend Fn) */
export async function sendOrderEmail(template, orderId) {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { template, order_id: orderId },
  });
  if (error) throw error;
  return data;
}
