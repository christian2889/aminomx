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
3. **Pago con Stripe** (si eligió "Pago en línea"): se redirige a Stripe
   Checkout (tarjeta u OXXO, en MXN). El webhook firmado confirma el pago,
   marca `payment_status = paid` y avanza el pedido a `paid`.
   Si prefiere SPEI/WhatsApp, el pedido queda pendiente de pago y puede
   pagarlo después desde su cuenta con el botón **Pagar ahora**.
4. Admin lo ve en **Pedidos**: cambia estado (`pending → paid → processing →
   shipped → delivered`), registra pago y guía. Cada cambio crea un evento
   visible en la línea de tiempo del cliente.
5. Cliente sigue el pedido en **cuenta.html** o, sin cuenta, en
   **seguimiento.html** (número de pedido + correo, RPC `track_order`).

## Integración Stripe (pagos en línea)

> **¿Vercel o Supabase?** Todas las llaves secretas van en **Supabase →
> Project Settings → Edge Functions → Secrets**. En Vercel no se configura
> ninguna variable de entorno. Guía completa con la tabla de todos los
> secretos: **[INTEGRACIONES.md](INTEGRACIONES.md)**.


Funciones desplegadas: `stripe-checkout` (crea la sesión de pago) y
`stripe-webhook` (confirma el pago con firma verificada).
Acepta **tarjeta** (Visa/Mastercard/AMEX) y **OXXO** (hasta $10,000 MXN),
cobrando en **MXN**.

1. Crea tu cuenta en stripe.com y activa **México** como país de la cuenta.
2. Supabase → **Edge Functions → Secrets**:
   - `STRIPE_SECRET_KEY` = `sk_live_…` (o `sk_test_…` para pruebas)
   - `SITE_URL` = `https://aminomx.vercel.app` (a dónde vuelve el cliente)
3. En Stripe → **Developers → Webhooks**, agrega el endpoint:
   `https://hsjdiwqoakmcwultfksj.supabase.co/functions/v1/stripe-webhook`
   con los eventos:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`  ← OXXO pagado
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
4. Copia el **signing secret** (`whsec_…`) al secret `STRIPE_WEBHOOK_SECRET`.

**Seguridad del cobro:** los importes se toman siempre de la base de datos
(nunca del navegador); la función valida que el pedido sea del usuario
(o de staff/admin al generar una liga de cobro), que no esté ya pagado ni
cancelado. El webhook exige firma HMAC-SHA256 válida con tolerancia de
5 minutos (anti-replay) y es idempotente: un pedido ya pagado no se
reprocesa, y nunca retrocede un pedido que ya avanzó.

**Prueba sin cobrar de verdad:** usa claves `sk_test_…` y la tarjeta
`4242 4242 4242 4242` (cualquier fecha futura y CVC).

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

Usa la **API v2 de Skydropx PRO** (OAuth2 `client_credentials`).

1. pro.skydropx.com → **Conexiones → API → Credenciales de aplicación**.
2. Secrets: `SKYDROPX_CLIENT_ID` (Clave de cliente / API Key),
   `SKYDROPX_CLIENT_SECRET` (Clave secreta del cliente),
   `SKYDROPX_WEBHOOK_SECRET` (inventa uno), y la dirección de origen
   `ORIGIN_STREET`, `ORIGIN_CITY`, `ORIGIN_STATE`, `ORIGIN_NEIGHBORHOOD`,
   `ORIGIN_ZIP`, `ORIGIN_PHONE`, `ORIGIN_EMAIL`.
3. En Skydropx → Configuración → **Conexiones webhook** registra
   `https://hsjdiwqoakmcwultfksj.supabase.co/functions/v1/skydropx-webhook`
   con método de autenticación **Token** y header `Authorization` (default).
   El token que captures ahí va igual en `SKYDROPX_WEBHOOK_SECRET`.
   La función corre con `verify_jwt = false` porque valida el token ella
   misma; con `verify_jwt = true` el gateway rechaza todo evento.
4. Mapa de estados: `picked_up`/`in_transit` → `shipped`,
   `delivered` → `delivered` (con correo automático al cliente en ambos).
   Nunca retrocede un pedido que ya avanzó.

Desde el panel: **Pedido → Envío → Cotizar Skydropx** lista las tarifas
ordenadas por precio y **Generar guía** crea la guía con la que elijas,
llenando paquetería, número de guía, rastreo y PDF de la etiqueta.

> Ambas integraciones están **fail-safe**: sin secretos configurados el
> sistema opera manualmente (guías a mano en el panel, sin correos).

## Base de datos (resumen)

- `products` + `product_images` (Storage `product-images`, subida desde el panel)
- `categories`, `batches` (+ COA PDF en Storage `coa`), `coupons`
- `orders` (+ `stripe_session_id`, `stripe_payment_intent`, `paid_at`)
  + `order_items` + `order_events` (línea de tiempo)
- `shipments` + `shipment_events` (guía, rastreo, Skydropx)
- `profiles` (roles), `addresses`, `email_log`, `settings`, `admin_allowlist`
- RPCs: `create_order`, `track_order`, `verify_batch` · Vista: `admin_stats`
- Migraciones en `supabase/migrations/` (ya aplicadas al proyecto).

## Pendientes recomendados

- [ ] Cambiar la contraseña del admin semilla.
- [ ] Registrarte con tu Gmail (quedarás como admin automáticamente).
- [ ] Configurar secretos de **Stripe**, Resend y Skydropx (arriba).
- [ ] Activar "Leaked password protection" (Supabase → Auth → Settings).
- [ ] Sustituir ilustraciones por fotos reales (Admin → Productos → Imágenes).
