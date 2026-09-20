# Catálogo PDF

Genera `catalogo-bio-aminos.pdf`: hoja de precios de 2 páginas con los
escalones por volumen, lista para mandar por WhatsApp o correo.

```bash
pip install reportlab
python3 catalogo.py catalogo-bio-aminos.pdf
```

## Actualizar precios

Los productos están en la constante `CATALOGO` del script (precios en
**centavos**, igual que en la base). Para traer los vigentes:

```sql
select c.name_es, p.name, p.presentation_es, p.price_cents
  from products p left join categories c on c.id = p.category_id
 where p.status = 'active'
 order by p.sort_order;
```

Los escalones (`TIERS`) deben coincidir con `settings.qty_discounts`, y las
columnas de descuento usan la misma división entera que `create_order`, así
que el PDF no promete un precio que el checkout no cobre.

Las fuentes base de reportlab no traen `>=`, guion largo ni subíndices: esos
caracteres salen como cajas negras. Por eso el texto usa solo Latin-1
(`99%+` en vez de `≥99%`).
