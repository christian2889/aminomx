# Aminos MX

Sitio e-commerce de **Aminos MX** — péptidos liofilizados y aminoácidos de grado
investigación en México. Pureza verificada **≥99%**, **COA** por lote y envíos a
todo el país. Bilingüe **ES/EN**. *Research use only.*

Rediseño con el lenguaje visual **Kimi** (oscuro + teal + glassmorphism) sobre la
marca Aminos MX, combinando la funcionalidad del proyecto (bilingüe, carrito, COA,
ficha de producto) con el catálogo y las secciones del diseño de Kimi.

## Estructura

```
index.html      Home: hero, categorías, catálogo (18 productos), por qué, verificación
                de COA, pagos y envíos, FAQ, footer
producto.html   Ficha de producto (BPC-157): galería, presentación, especificación
                técnica, acordeones, se compran juntos
css/styles.css  Sistema de diseño (tokens shadcn/HSL, glass, glow, molecule-bg) + PDP
                + cajón + modal + responsive
js/main.js      Catálogo data-driven bilingüe, filtros + búsqueda, quick-view,
                carrito con cajón + progreso de envío gratis + toasts, verificación COA
assets/         Favicon (marca ADN teal)
```

## Sistema de diseño

- **Modo oscuro** con fondo `hsl(215 35% 6%)` y acento **teal** `hsl(174 84% 45%)`.
- **Tipografía:** Inter (principal) + Space Mono (etiquetas técnicas / códigos).
- **Recursos:** texto con degradado (teal→cyan→azul), tarjetas *glass*, halos de luz,
  fondos de puntos tipo molécula, esquinas redondeadas (`0.75rem`).
- Marca **Aminos MX** con ícono de ADN e insignia `GRADO INVESTIGACIÓN`.

## Funcionalidad

- **Catálogo** de 18 productos en 6 categorías (pérdida de peso, recomposición,
  metabólicos, regenerativos, anti-edad, insumos), renderizado desde datos;
  las categorías sin productos se ocultan solas.
- **Búsqueda** y **filtros** por categoría; **quick-view** (modal) por producto.
- **Carrito** con cajón lateral, cantidades, progreso de envío gratis (umbral
  $3,500 MXN), subtotal/envío/total y **toasts**. Persistente en `localStorage`.
- **Ficha de producto** (BPC-157) con especificación técnica, acordeones, stepper,
  wishlist y "se compran juntos".
- **ES/EN** — el toggle intercambia todo el texto (`data-en` + datos de producto) y
  persiste el idioma.
- **Verificación de COA** por lote (p. ej. `AMX-2608`).

## Notas

- Las imágenes de producto usan una **ilustración de vial** como marcador, lista para
  sustituir por fotos reales.
- Precios, lotes y textos provienen del diseño; ajústalos al inventario real.
- Productos para uso exclusivo de investigación de laboratorio. No para consumo
  humano ni veterinario.

## Plataforma (Supabase)

El sitio ahora es una plataforma completa conectada a **Supabase**
(base de datos + auth + storage + edge functions):

- **Tienda** (`index.html`, `producto.html`) — catálogo en vivo desde la base
  (con respaldo embebido sin conexión), carrito y checkout real.
- **Checkout** (`checkout.html`) — pedido validado en servidor (RPC), cupones,
  envío gratis ≥ $3,500 MXN.
- **Cuenta del cliente** (`cuenta.html`) — pedidos con línea de tiempo,
  rastreo de guía, direcciones y perfil. Acceso en `login.html`.
- **Seguimiento sin cuenta** (`seguimiento.html`) — número de pedido + correo.
- **Panel admin** (`admin.html`) — métricas, productos con **subida de
  imágenes**, pedidos/envíos, clientes con roles, lotes/COA y ajustes.
- **Pagos con Stripe** — tarjeta y OXXO en MXN desde el checkout, o botón
  "Pagar ahora" en la cuenta; confirmación por webhook firmado.
- **Integraciones listas**: Stripe (pagos), Resend (correos) y Skydropx
  (envíos) como Edge Functions desplegadas; solo requieren sus API keys.

Detalles de operación: **[PLATAFORMA.md](PLATAFORMA.md)**.
Dónde va cada API key (spoiler: en Supabase, no en Vercel):
**[INTEGRACIONES.md](INTEGRACIONES.md)**.

## Desarrollo

Sitio estático, sin build. Para verlo en local:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Tipografías vía Google Fonts (Inter + Space Mono); el resto de recursos son SVG en
línea, sin dependencias externas.
