# Aminos MX

Sitio e-commerce de **Aminos MX** — péptidos de investigación liofilizados de alta
pureza, importados de USA y verificados por HPLC, con COA por lote. Envíos en frío
desde Baja California a todo México. Bilingüe **ES/EN**. *Research use only.*

Implementación fiel del diseño **`Aminos MX.dc.html`** (Claude Design), traducido a
un sitio web real, estático y sin dependencias.

## Estructura

```
index.html        Home (artboard 1a): hero, categorías, más vendidos, calidad/COA,
                  clientes, logística, footer
producto.html     Ficha de producto (artboard 1b): galería, presentación/precio,
                  cantidad, especificación técnica, se compran juntos
css/styles.css    Sistema de diseño (tokens, componentes) + responsive (incl. patrones
                  móviles del artboard 1c: menú, tab bar, cajón de carrito)
js/main.js        Idioma ES/EN, carrito + cajón, toast, selector de presentación y
                  precio, stepper, filtros, verificación de COA
assets/           Favicon (marca vial)
```

## Sistema de diseño

- **Color:** tinta `#0d1117`, azul `#1636d6`, naranja `#ff5a1f`, papel `#f6f5f2`,
  líneas `#e3e2dd`.
- **Tipografía (Google Fonts):** Space Grotesk (títulos), Public Sans (texto),
  Bebas Neue (precios/números), Space Mono (etiquetas).
- **Logotipo** "Aminos MX" con degradado + tagline `RESEARCH USE ONLY`.

## Funcionalidad

- **ES/EN** — el toggle intercambia todo el texto (`data-en`) y persiste en
  `localStorage`, igual que la lógica del diseño original.
- **Carrito** — añadir desde tarjetas y ficha, cajón lateral con cantidades,
  subtotal/total, barra de envío gratis (umbral $2,500 MXN) y toast. Persistente.
- **Ficha de producto** — presentación (5 mg / 10 mg / Kit) que actualiza el precio,
  stepper de cantidad, acordeones y wishlist.
- **Verificación de COA** — busca un lote (p. ej. `AMX-2608`) y muestra su resultado.
- **Filtros** de "más vendidos", menú móvil y tab bar inferior.

## Notas

- Las imágenes de producto se representan con una **ilustración de vial** como
  marcador de posición, lista para sustituir por fotos reales.
- Precios, lotes y textos provienen del diseño; ajústalos al inventario real.
- Productos para uso exclusivo de investigación de laboratorio. No para consumo
  humano ni veterinario.

## Desarrollo

Sitio estático, sin build. Para verlo en local:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Los archivos fuente del diseño (`Aminos MX.dc.html`, `Aminos MX standalone src.html`,
`Aminos MX.html`, `support.js`) son artefactos de Claude Design y no se incluyen en el
sitio desplegable.
