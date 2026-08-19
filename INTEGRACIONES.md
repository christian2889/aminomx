# Aminos MX — Dónde va cada llave (Vercel vs Supabase)

## Regla de oro

**Todas las llaves secretas van en Supabase → Edge Functions → Secrets.
En Vercel no se configura ninguna variable de entorno.**

¿Por qué? Vercel solo sirve archivos estáticos (HTML, CSS, JS). No hay
código de servidor ahí: una variable de entorno de Vercel nunca llegaría
al navegador, y si la inyectáramos, quedaría **visible para cualquiera**
que abra el código fuente. Todo el código que usa secretos vive en las
**Edge Functions de Supabase** (Deno), del lado del servidor.

```
Navegador  ──►  Vercel (HTML/CSS/JS estático)      ← 0 secretos
    │
    └────────►  Supabase Edge Functions (Deno)     ← TODOS los secretos
                     │
                     ├─► Stripe API
                     ├─► Resend API
                     └─► Skydropx API
```

Lo único "público" del sitio vive en `js/config.js` (committeado al repo,
no es variable de entorno): la URL de Supabase y la clave **publishable**.
Ambas son públicas por diseño; quien controla el acceso real es **Row
Level Security** en cada tabla. La `service_role` key **jamás** va ahí.

---

## Dónde configurarlos

**Supabase Dashboard → tu proyecto `aminomx` → Project Settings →
Edge Functions → Secrets → "Add new secret"**

O por CLI:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx --project-ref hsjdiwqoakmcwultfksj
supabase secrets list --project-ref hsjdiwqoakmcwultfksj
```

Después de guardar un secret **no hace falta redesplegar**: las funciones
lo toman en la siguiente invocación.

---

## Tabla completa de secretos

### Obligatorios para cobrar (Stripe)

| Secret | Valor | Lo usa |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` para probar, `sk_live_…` en producción | `stripe-checkout` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (te lo da Stripe al crear el webhook) | `stripe-webhook` |
| `SITE_URL` | `https://aminomx.vercel.app` (sin `/` final) | `stripe-checkout` — a dónde regresa el cliente |
| `ALLOWED_ORIGIN` | `https://aminomx.vercel.app` | CORS de todas las funciones |

> `ALLOWED_ORIGIN` es opcional pero **recomendado**: sin él, el CORS queda
> en `*` y cualquier sitio puede invocar las funciones (aunque el JWT y RLS
> sigan protegiendo los datos).

### Correos (Resend)

| Secret | Valor | Lo usa |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | `send-email` |
| `FROM_EMAIL` | `Aminos MX <pedidos@tudominio.com>` | `send-email` |

### Envíos (Skydropx PRO — API v2)

En Skydropx PRO ve a **Conexiones → API → Credenciales de aplicación**.
Te da **dos** valores porque la API v2 usa OAuth2:

| Secret | Valor en el panel de Skydropx | Lo usa |
|---|---|---|
| `SKYDROPX_CLIENT_ID` | **Clave de cliente (API Key)** | `skydropx-rates` |
| `SKYDROPX_CLIENT_SECRET` | **Clave secreta del cliente (API Secret key)** | `skydropx-rates` |
| `SKYDROPX_API_URL` | `https://pro.skydropx.com/api/v1` (default) · sandbox: `https://sb-pro.skydropx.com/api/v1` | `skydropx-rates` |
| `SKYDROPX_WEBHOOK_SECRET` | invéntalo tú (cadena larga y aleatoria) | `skydropx-webhook` |
| `ORIGIN_NAME` | `Aminos MX` | dirección de origen |
| `ORIGIN_STREET` | calle y número de tu bodega | dirección de origen |
| `ORIGIN_CITY` | municipio/alcaldía, p. ej. `Tijuana` | dirección de origen |
| `ORIGIN_STATE` | estado, p. ej. `Baja California` | dirección de origen |
| `ORIGIN_NEIGHBORHOOD` | colonia (opcional pero recomendado) | dirección de origen |
| `ORIGIN_ZIP` | p. ej. `22000` | dirección de origen |
| `ORIGIN_PHONE` | teléfono de contacto del remitente | dirección de origen |
| `ORIGIN_EMAIL` | `envios@tudominio.com` | dirección de origen |
| `ORIGIN_REFERENCE` | referencia de ubicación (opcional) | dirección de origen |

> La función pide el token OAuth sola (`grant_type: client_credentials`),
> lo cachea las 2 h que dura y lo renueva antes de vencer. Tú solo capturas
> el `client_id` y el `client_secret`.

### NO los configures tú

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` y
`SUPABASE_DB_URL` los **inyecta Supabase automáticamente** en cada Edge
Function. El prefijo `SUPABASE_` está reservado: si intentas crear uno, el
dashboard te lo rechaza.

---

## Paso a paso

### 1. Stripe

1. Crea la cuenta en [stripe.com](https://stripe.com) con **México** como país.
2. **Developers → API keys** → copia la *Secret key*.
   Empieza en modo **Test** (`sk_test_…`) para no cobrar de verdad.
3. Guárdala en Supabase como `STRIPE_SECRET_KEY`.
4. Guarda también `SITE_URL = https://aminomx.vercel.app`.
5. **Developers → Webhooks → Add endpoint**:
   - URL: `https://hsjdiwqoakmcwultfksj.supabase.co/functions/v1/stripe-webhook`
   - Eventos (exactamente estos 4):
     - `checkout.session.completed` — pago con tarjeta aprobado
     - `checkout.session.async_payment_succeeded` — ficha OXXO pagada
     - `checkout.session.async_payment_failed` — OXXO rechazado
     - `checkout.session.expired` — ficha OXXO vencida (libera el stock)
6. Copia el **Signing secret** (`whsec_…`) → Supabase como `STRIPE_WEBHOOK_SECRET`.
7. Prueba: compra con la tarjeta `4242 4242 4242 4242`, cualquier fecha
   futura y cualquier CVC. El pedido debe pasar a **pagado** solo.
8. Cuando todo funcione, repite con las llaves `sk_live_…` y crea el
   webhook otra vez en modo **Live** (el `whsec_` de test no sirve en live).

### 2. Resend

1. Crea la cuenta en [resend.com](https://resend.com).
2. **Domains → Add domain** con tu dominio real y agrega los registros
   DNS (SPF/DKIM) que te da Resend.
   > Estos registros van en **tu proveedor de DNS**. Si el dominio está en
   > Vercel: Vercel → Project → Domains → tu dominio → DNS Records.
   > Esto es DNS, **no** variables de entorno.
3. **API Keys → Create** → copia `re_…` → Supabase como `RESEND_API_KEY`.
4. Guarda `FROM_EMAIL` con un remitente **de ese dominio verificado**.
5. Prueba desde **Admin → Pedidos → abrir un pedido → "Enviar correo"**.

Sin `RESEND_API_KEY` la función responde `skipped` y lo anota en la tabla
`email_log`: no rompe el checkout, simplemente no manda correos.

### 3. Skydropx PRO

1. Entra a [pro.skydropx.com](https://pro.skydropx.com) → **Conexiones → API**
   → botón `…` de tu aplicación → **Credenciales de aplicación**.
2. Copia los dos valores a Supabase:
   - *Clave de cliente (API Key)* → `SKYDROPX_CLIENT_ID`
   - *Clave secreta del cliente (API Secret key)* → `SKYDROPX_CLIENT_SECRET`
3. Guarda los `ORIGIN_*` de tu dirección de bodega (sin ellos la cotización
   sale mal: Skydropx no sabe desde dónde sale el paquete).
4. En Skydropx → **Configuración → Conexiones webhook → Nuevo**:
   - **Nombre:** `AMINO MX`
   - **URL:** `https://hsjdiwqoakmcwultfksj.supabase.co/functions/v1/skydropx-webhook`
   - **Sección:** `Envíos`
   - **Eventos:** todos los de envío (Created, Picked up, In transit,
     Last mile, Delivery attempt, Delivered, Exception, Canceled…)
   - **Método de autenticación:** `Token`
   - **Token o clave secreta:** invéntalo tú, una cadena larga aleatoria
   - **Header:** déjalo en `Authorization` (el default)
5. Copia **ese mismo token** a Supabase como `SKYDROPX_WEBHOOK_SECRET`.
6. Estados: `in_transit`/`picked_up` → pedido **enviado**,
   `delivered` → pedido **entregado**, con correo automático en ambos.

> **Por qué importa el header.** Skydropx manda el token como
> `Authorization: Bearer <token>`. Ese header choca con la verificación de
> JWT de Supabase, así que `skydropx-webhook` está desplegada con
> `verify_jwt = false` y valida el token ella misma (comparación de tiempo
> constante). Si algún día la redespliegas, **no olvides el flag**: con
> `verify_jwt = true` el gateway responde `UNAUTHORIZED_INVALID_JWT_FORMAT`
> y ningún evento llega. La función también acepta el header alterno
> `x-skydropx-signature` y el token sin el prefijo `Bearer`.

**Cómo se usa desde el panel:** Admin → abre un pedido → *Envío* →
**Cotizar Skydropx**. Aparece la tabla de tarifas ordenada de más barata a
más cara; el botón **Generar guía** de la fila que elijas crea la guía,
llena paquetería / número de guía / URL de rastreo, y deja el PDF
descargable. Después das **Guardar cambios**.

> Las cotizaciones de Skydropx PRO son asíncronas: la función sondea hasta
> que `is_completed` llega en true, así que el botón tarda unos segundos.

Sin las credenciales, el panel sigue funcionando en **modo manual**:
capturas la paquetería y el número de guía a mano y el cliente los ve igual.

**Si rotas las credenciales** (recomendado si alguna vez las compartiste en
una captura o chat): Skydropx → API → regenera la aplicación y actualiza los
dos secrets en Supabase. No hace falta redesplegar la función.

---

## ¿Y en Vercel qué se configura?

Nada obligatorio. Vercel solo necesita:

1. **Dominio propio** (opcional) — Project → Settings → Domains.
2. **Deployment Protection** — si quieres que las URLs de *preview* sean
   públicas: Project → Settings → Deployment Protection → *Vercel
   Authentication* → Off para Preview.

Si cambias el dominio (`aminomx.vercel.app` → `aminosmx.com`), actualiza
**en Supabase**: `SITE_URL` y `ALLOWED_ORIGIN`; y **en el repo**: los
`<link rel="canonical">`, `og:url`, `robots.txt` y `sitemap.xml`.

---

## Verificación rápida

| Qué probar | Cómo | Resultado esperado |
|---|---|---|
| Stripe checkout | Comprar con `4242 4242 4242 4242` | Redirige a Stripe y vuelve al sitio |
| Stripe webhook | Stripe → Webhooks → *Recent deliveries* | `200 OK` en los 4 eventos |
| Pago aplicado | Admin → Pedidos | Estado de pago = **pagado** |
| Resend | Admin → Pedido → "Enviar correo" | Llega el correo; `email_log` sin error |
| Skydropx | Admin → Pedido → "Cotizar Skydropx" | Tabla con tarifas reales |
| Guía Skydropx | Botón "Generar guía" de una tarifa | Guía + PDF descargable |
| Logs de error | Supabase → Edge Functions → función → Logs | Sin `500` |
