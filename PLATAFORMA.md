# Aminos MX — Guía de la plataforma

Plataforma e-commerce completa: tienda pública conectada a base de datos,
panel de administración y cuenta del cliente con seguimiento de pedidos.

## Arquitectura

```
Vercel (sitio estático)                Supabase (proyecto: aminomx)
┌─────────────────────────┐            ┌──────────────────────────────────┐
│ index.html   Tienda     │──anon key─▶│ Postgres + RLS                   │
│ producto.html Ficha     │            │  products / orders / shipments   │
│ checkout.html Compra    │──sesión──▶ │  profiles / batches / coupons…   │
│ cuenta.html  Cliente    │            │ Auth (email + contraseña)        │
│ admin.html   Admin      │──staff───▶ │ Storage: product-images, coa     │
│ seguimiento.html Público│            │ Edge Functions:                  │
│ login.html   Acceso     │            │  send-email (Resend)             │
└─────────────────────────┘            │  skydropx-rates / -webhook       │
                                       └──────────────────────────────────┘
```

- **Proyecto Supabase:** `aminomx` (`hsjdiwqoakmcwultfksj`, us-east-1, plan Pro $10/mes)
- **URL API:** `https://hsjdiwqoakmcwultfksj.supabase.co`
- La clave de `js/config.js` es la **publishable** (pública por diseño);
  la seguridad real la aplica **Row Level Security** en cada tabla.

## Roles y accesos

| Rol       | Acceso                                                        |
|-----------|---------------------------------------------------------------|
| `customer`| Sus pedidos, direcciones y perfil (cuenta.html)               |
| `staff`   | Todo el panel admin excepto Ajustes                           |
| `admin`   | Panel completo + Ajustes + gestión de roles                   |

- El correo **casadomoglamping@gmail.com** se convierte en `admin`
  automáticamente al registrarse (tabla `admin_allowlist`).
- Existe un usuario semilla `admin@aminosmx.com` (cámbiale la contraseña
  en cuanto entres: Supabase → Authentication → Users, o desde tu perfil).
- Cambia roles desde **Admin → Clientes** (selector de rol por fila).

## Flujo de un pedido

1. Cliente agrega al carrito → `checkout.html` (requiere cuenta).
2. RPC **`create_order`** valida en el servidor precio, stock y cupón,
   descuenta stock, calcula envío (gratis ≥ $2,500 MXN) y crea el evento
   inicial. El cliente nunca fija precios.
3. Admin lo ve en **Pedidos**: cambia estado (`pending → paid → processing →
   shipped → delivered`), registra pago y guía. Cada cambio crea un evento
   visible en la línea de tiempo del cliente.
4. Cliente sigue el pedido en **cuenta.html** o, sin cuenta, en
   **seguimiento.html** (número de pedido + correo, RPC `track_order`).

## Integración Resend (correos)

Función desplegada: `send-email` (confirmación, enviado, entregado).
Para activarla:

1. Crea una cuenta en resend.com y verifica tu dominio.
2. Supabase → **Edge Functions → Secrets**:
   - `RESEND_API_KEY` = re_…
   - `FROM_EMAIL` = `Aminos MX <pedidos@tudominio.com>`
3. Listo: el checkout envía confirmación y el panel tiene botón
   "Enviar correo" por pedido. Sin la clave, la función responde
   `skipped` y lo registra en `email_log` (no rompe nada).

## Integración Skydropx (envíos)

Funciones desplegadas: `skydropx-rates` (cotiza/crea envío desde el panel)
y `skydropx-webhook` (recibe estados y avanza el pedido + correo automático).

1. Consigue tu API key en skydropx.com.
2. Secrets: `SKYDROPX_API_KEY`, `SKYDROPX_WEBHOOK_SECRET` (inventa uno),
   y opcionales `ORIGIN_STREET`, `ORIGIN_CITY`, `ORIGIN_STATE`, `ORIGIN_ZIP`,
   `ORIGIN_PHONE`, `ORIGIN_EMAIL` (dirección de origen del envío).
3. En Skydropx registra el webhook:
   `https://hsjdiwqoakmcwultfksj.supabase.co/functions/v1/skydropx-webhook`
   con el header `x-skydropx-signature: <SKYDROPX_WEBHOOK_SECRET>`.
4. Mapa de estados: `in_transit → shipped`, `delivered → delivered`
   (con correo automático al cliente en ambos).

> Ambas integraciones están **fail-safe**: sin secretos configurados el
> sistema opera manualmente (guías a mano en el panel, sin correos).

## Base de datos (resumen)

- `products` + `product_images` (Storage `product-images`, subida desde el panel)
- `categories`, `batches` (+ COA PDF en Storage `coa`), `coupons`
- `orders` + `order_items` + `order_events` (línea de tiempo)
- `shipments` + `shipment_events` (guía, rastreo, Skydropx)
- `profiles` (roles), `addresses`, `email_log`, `settings`, `admin_allowlist`
- RPCs: `create_order`, `track_order`, `verify_batch` · Vista: `admin_stats`
- Migraciones en `supabase/migrations/` (ya aplicadas al proyecto).

## Pendientes recomendados

- [ ] Cambiar la contraseña del admin semilla.
- [ ] Registrarte con tu Gmail (quedarás como admin automáticamente).
- [ ] Configurar secretos de Resend y Skydropx (arriba).
- [ ] Activar "Leaked password protection" (Supabase → Auth → Settings).
- [ ] Pasarela de pago en línea (Stripe/Mercado Pago) — el modelo ya
      registra `payment_method` y `payment_status`.
- [ ] Sustituir ilustraciones por fotos reales (Admin → Productos → Imágenes).
