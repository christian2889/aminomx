# Renders de vial del catálogo

`gen.py` genera los PNG 1200×1200 de los viales (marca Aminos MX, etiqueta de
color por producto, dosis, sello de pureza) que se suben a Supabase Storage
(`product-images/<product_id>/render-vial.png`) y se registran en
`product_images`.

Uso (requiere Chromium headless; en Claude Code está en /opt/pw-browsers/chromium):

```bash
# fuentes Inter (una vez): descarga los .ttf a ./fonts/inter_{400,600,700,800}.ttf
python3 gen.py                 # los 20 productos → ./out/*.png
python3 gen.py retatrutide-15  # solo uno
```

Al agregar un producto nuevo: añade su tupla a PRODUCTS (slug, líneas del
nombre, dosis, color, powder|liquid, subtexto), genera y sube el PNG desde
Admin → Productos → Imágenes (o por storage + insert en product_images).
