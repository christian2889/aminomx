#!/usr/bin/env python3
# Catálogo PDF Bio Aminos — precios y descuentos vigentes.
# Los datos vienen de Supabase (products activos) y de settings.qty_discounts.
# Solo caracteres Latin-1: las fuentes base de reportlab no traen >=, - largo
# ni subíndices, y saldrían como cajas negras.
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

TEAL = colors.HexColor("#0b7c72")
TEAL_SOFT = colors.HexColor("#eaf4f2")
INK = colors.HexColor("#12212b")
BODY = colors.HexColor("#3c4d57")
MUTED = colors.HexColor("#6b7a85")
LINE = colors.HexColor("#dde5ea")
AMBER = colors.HexColor("#9a6b00")

MARCA = "BIO AMINOS"
SITIO = "aminosmx.com"
WHATS = "+52 646 116 4390"
MAIL = "ventas@aminosmx.com"
VIGENCIA = "Septiembre 2026"

# (categoría, [(producto, presentación, precio_centavos)])
CATALOGO = [
    ("Pérdida de peso", [
        ("Retatrutide", "Vial liofilizado 5 mg", 75000),
        ("Retatrutide", "Vial liofilizado 15 mg", 190000),
        ("Retatrutide", "Vial liofilizado 20 mg", 221000),
        ("Tirzepatide", "Vial liofilizado 5 mg", 65000),
        ("Tirzepatide", "Vial liofilizado 15 mg", 109000),
        ("HGH Fragment 176-191", "Vial liofilizado 5 mg", 95000),
    ]),
    ("Recomposición corporal", [
        ("Tesamorelin", "Vial liofilizado 10 mg", 229000),
        ("Ipamorelin", "Vial liofilizado 5 mg", 75000),
        ("Blend CJC-1295 sin DAC + Ipamorelin", "Vial liofilizado 5 mg + 5 mg", 190000),
        ("PEG-MGF", "Vial liofilizado 2 mg", 115000),
        ("HGH Somatropina 191aa", "Vial liofilizado 24 UI", 145000),
    ]),
    ("Metabólicos", [
        ("MOTS-c", "Vial liofilizado 15 mg", 159000),
        ("SS-31 (Elamipretide)", "Vial liofilizado 10 mg", 190000),
    ]),
    ("Regenerativos", [
        ("Blend Glow70 (BPC-157 + GHK-Cu + TB-500)", "Vial liofilizado 70 mg (10+50+10)", 259000),
        ("KPV", "Vial liofilizado 5 mg", 69000),
        ("Cartalax", "Vial liofilizado 10 mg", 149000),
    ]),
    ("Anti-edad", [
        ("Glutatión", "Vial liofilizado 600 mg", 59000),
        ("NAD+", "Vial liofilizado 500 mg", 79000),
        ("GHK-Cu", "Vial liofilizado 50 mg", 59000),
    ]),
    ("Insumos", [
        ("Agua bacteriostática", "Vial estéril 3 mL", 6900),
        ("Agua bacteriostática", "Vial estéril 10 mL", 14900),
    ]),
]

TIERS = [(2, 7.5), (3, 12.5), (10, 30), (50, 40)]

# Porcentajes de las dos columnas de la tabla, tomados de TIERS: así un
# cambio de escalón no deja las columnas anunciando otro descuento.
PCT_COL = {q: p for q, p in TIERS}

ss = getSampleStyleSheet()


def P(n, **kw):
    kw.setdefault("fontName", "Helvetica")
    kw.setdefault("textColor", BODY)
    return ParagraphStyle(n, parent=ss["Normal"], **kw)
st_marca = P("marca", fontName="Helvetica-Bold", fontSize=26, leading=28,
             textColor=INK, spaceAfter=2)
st_tag = P("tag", fontSize=9.5, leading=13, textColor=TEAL,
           fontName="Helvetica-Bold", spaceAfter=10)
st_intro = P("intro", fontSize=9.5, leading=14, textColor=BODY)
st_cat = P("cat", fontName="Helvetica-Bold", fontSize=11.5, leading=14,
           textColor=INK, spaceBefore=13, spaceAfter=5)
st_cell = P("cell", fontSize=9, leading=11.5, textColor=INK)
st_sub = P("sub", fontSize=8.2, leading=10.5, textColor=MUTED)
st_num = P("num", fontSize=9.2, leading=11.5, textColor=INK,
           fontName="Helvetica-Bold", alignment=TA_RIGHT)
st_num_d = P("numd", fontSize=9.2, leading=11.5, textColor=TEAL,
             fontName="Helvetica-Bold", alignment=TA_RIGHT)
st_head = P("head", fontSize=7.6, leading=9.5, textColor=MUTED,
            fontName="Helvetica-Bold")
st_head_r = P("headr", fontSize=7.6, leading=9.5, textColor=MUTED,
              fontName="Helvetica-Bold", alignment=TA_RIGHT)
st_nota = P("nota", fontSize=8, leading=11.5, textColor=MUTED)
st_cond_t = P("condt", fontName="Helvetica-Bold", fontSize=9.5, leading=12,
              textColor=INK, spaceAfter=3)
st_cond = P("cond", fontSize=8.6, leading=12.5, textColor=BODY)


def mxn(cents):
    """75000 -> $750  ·  65625 -> $656 (redondeo al peso, nota al pie lo aclara)"""
    return "$" + format(int(round(cents / 100.0)), ",d")


def con_desc(cents, pct):
    return cents - (cents * pct) // 100


def banda_descuentos():
    """Los cuatro escalones, tipo ficha de producto."""
    celdas = []
    for i, (q, pct) in enumerate(TIERS):
        mas = "+" if i == len(TIERS) - 1 or TIERS[i + 1][0] > q + 1 else ""
        celdas.append([
            Paragraph(f'<font size="15" color="#0b7c72"><b>-{pct:g}%</b></font>',
                      P("t", alignment=TA_CENTER)),
            Paragraph(f'<font size="8" color="#6b7a85">desde {q}{mas} unidades</font>',
                      P("t2", alignment=TA_CENTER)),
        ])
    fila = [[c[0] for c in celdas], [c[1] for c in celdas]]
    t = Table(fila, colWidths=[4.05 * cm] * 4, rowHeights=[0.72 * cm, 0.42 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TEAL_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.6, TEAL),
        ("LINEAFTER", (0, 0), (-2, -1), 0.6, colors.white),
        ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
        ("VALIGN", (0, 1), (-1, 1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
    ]))
    return t


def tabla_categoria(filas):
    data = [[
        Paragraph("PRODUCTO", st_head),
        Paragraph("PRESENTACIÓN", st_head),
        Paragraph("PRECIO", st_head_r),
        Paragraph("3+ UDS", st_head_r),
        Paragraph("10+ UDS", st_head_r),
    ]]
    for nombre, pres, cents in filas:
        data.append([
            Paragraph(nombre, st_cell),
            Paragraph(pres, st_sub),
            Paragraph(mxn(cents), st_num),
            Paragraph(mxn(con_desc(cents, PCT_COL[3])), st_num_d),
            Paragraph(mxn(con_desc(cents, PCT_COL[10])), st_num_d),
        ])
    t = Table(data, colWidths=[6.5 * cm, 4.5 * cm, 2.2 * cm, 1.9 * cm, 2.1 * cm],
              repeatRows=1)
    estilo = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, TEAL),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 5.5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i < len(data) - 1:
            estilo.append(("LINEBELOW", (0, i), (-1, i), 0.4, LINE))
        if i % 2 == 0:
            estilo.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f7fafb")))
    t.setStyle(TableStyle(estilo))
    return t


def condiciones():
    izq = [
        Paragraph("Descuentos por volumen", st_cond_t),
        Paragraph("Aplican por producto, sumando todas sus concentraciones "
                  "(p. ej. 1 vial de 5 mg + 1 de 15 mg del mismo péptido = 2 unidades). "
                  "Se reflejan solos en el carrito. <b>No se acumulan con cupones: "
                  "se aplica el descuento mayor.</b>", st_cond),
        Spacer(1, 9),
        Paragraph("Envíos", st_cond_t),
        Paragraph("Envío gratis en pedidos desde $1,900 MXN a todo México "
                  "(Estafeta, DHL, UPS y Paquetexpress). Zonas metropolitanas 24 h, "
                  "resto del país 48-72 h. Empaque discreto, sin logotipos y con guía "
                  "rastreable.<br/>En Ensenada, B.C.: entrega en mano el mismo día "
                  "por $100 MXN, gratis desde $1,900.<br/>"
                  "<b>Mayoreo:</b> flete de $250 MXN por caja (guía generada).", st_cond),
    ]
    der = [
        Paragraph("Pagos", st_cond_t),
        Paragraph("Tarjeta de crédito/débito y efectivo en OXXO (procesados por Stripe), "
                  "o transferencia SPEI. Todos los precios están en pesos mexicanos "
                  "e incluyen IVA.", st_cond),
        Spacer(1, 9),
        Paragraph("Calidad", st_cond_t),
        Paragraph("Pureza verificada por HPLC (99%+) y confirmación de identidad por "
                  "espectrometría de masas. Certificado de análisis (COA) disponible por "
                  "lote. Inventario conservado entre 2-8 °C.", st_cond),
    ]
    t = Table([[izq, der]], colWidths=[8.6 * cm, 8.6 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 14),
        ("LEFTPADDING", (1, 0), (1, 0), 14),
        ("RIGHTPADDING", (1, 0), (-1, -1), 0),
        ("LINEBEFORE", (1, 0), (1, 0), 0.4, LINE),
    ]))
    return t


def decorar(canvas, doc):
    canvas.saveState()
    w, h = letter
    # Banda superior de marca
    canvas.setFillColor(TEAL)
    canvas.rect(0, h - 0.42 * cm, w, 0.42 * cm, stroke=0, fill=1)
    # Pie: aviso legal + paginación
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.2)
    canvas.drawString(2 * cm, 1.32 * cm,
                      "Productos destinados exclusivamente a investigación de "
                      "laboratorio. No para consumo humano ni veterinario.")
    canvas.drawString(2 * cm, 0.98 * cm,
                      f"{SITIO}   ·   WhatsApp {WHATS}   ·   {MAIL}")
    canvas.setFont("Helvetica-Bold", 7.2)
    canvas.drawRightString(w - 2 * cm, 0.98 * cm, f"Página {doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(2 * cm, 1.72 * cm, w - 2 * cm, 1.72 * cm)
    canvas.restoreState()


def build(path):
    doc = BaseDocTemplate(path, pagesize=letter,
                          leftMargin=2 * cm, rightMargin=2 * cm,
                          topMargin=1.5 * cm, bottomMargin=2.1 * cm,
                          title=f"Catálogo {MARCA} - {VIGENCIA}",
                          author=MARCA, subject="Catálogo de precios")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="std", frames=[frame], onPage=decorar)])

    s = []
    s.append(Paragraph(MARCA, st_marca))
    s.append(Paragraph("PÉPTIDOS Y AMINOÁCIDOS DE GRADO INVESTIGACIÓN", st_tag))
    s.append(Paragraph(
        f"Catálogo de precios · <b>{VIGENCIA}</b> · Moneda: pesos mexicanos (MXN), "
        f"IVA incluido. Pureza verificada por HPLC con certificado de análisis por lote.",
        st_intro))
    s.append(Spacer(1, 12))

    s.append(Paragraph("Compra más, ahorra más", st_cond_t))
    s.append(Spacer(1, 4))
    s.append(banda_descuentos())
    s.append(Spacer(1, 5))
    s.append(Paragraph(
        "Descuento aplicado por producto sumando todas sus concentraciones. "
        "No acumulable con cupones: se aplica el mayor.", st_nota))

    # Cada bloque viaja completo: ninguna categoría supera media página, así
    # que nunca queda un título solo al pie ni una tabla sin encabezado.
    for categoria, filas in CATALOGO:
        s.append(KeepTogether([Paragraph(categoria, st_cat), tabla_categoria(filas)]))

    s.append(Spacer(1, 6))
    s.append(Paragraph(
        "Precios unitarios con descuento redondeados al peso; el cálculo exacto se "
        "aplica sobre el total del pedido. Disponibilidad sujeta a existencias. "
        "Precios sujetos a cambio sin previo aviso.", st_nota))
    s.append(Spacer(1, 16))
    s.append(condiciones())

    doc.build(s)


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "catalogo-bio-aminos.pdf"
    build(out)
    print("OK:", out)
