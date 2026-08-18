# Aminos MX

Sitio web de **Aminos MX** — aminoácidos esenciales para energía, recuperación e hidratación (nutrición deportiva, mercado mexicano).

## Estado

> ⚠️ **Primera versión (base).** El diseño original vive en Claude Design
> (`Aminos MX.dc.html` + `support.js`) y no pudo leerse automáticamente desde el
> entorno remoto: el enlace para compartir queda detrás del reto de Cloudflare y
> requiere una sesión de navegador iniciada. Esta implementación es una base
> profesional y adaptable, construida a partir de la lectura más razonable de la
> marca. En cuanto el `.dc.html` esté disponible, se alinean colores, textos y
> layout exactamente al diseño.

## Estructura

```
index.html        Página principal (una sola página, con anclas)
css/styles.css    Sistema de diseño: tokens, componentes, responsive
js/main.js        Interacciones (menú móvil, FAQ, carrito demo, newsletter, reveal)
assets/           Íconos SVG (favicon)
```

## Secciones

- **Hero** con propuesta de valor, stats y visual de producto
- **Beneficios** (energía, hidratación, recuperación, natural)
- **Productos** (3 sabores + pack)
- **Ciencia** (perfil de aminoácidos por porción)
- **Cómo tomarlo** (3 pasos)
- **Opiniones** (testimonios)
- **FAQ** (acordeón)
- **CTA / newsletter** y **footer**

## Desarrollo

Es un sitio estático sin dependencias ni build. Para verlo en local:

```bash
# cualquier servidor estático, p. ej.:
python3 -m http.server 8000
# luego abre http://localhost:8000
```

Tipografías vía Google Fonts (Sora + Inter). El resto de los recursos
(íconos, ilustraciones) son SVG en línea, sin peticiones externas.

## Notas

- Textos, precios (MXN) y testimonios son **ilustrativos** y deben reemplazarse
  con el contenido real de la marca.
- Accesible: navegación por teclado, `prefers-reduced-motion`, roles/aria en
  componentes interactivos.
