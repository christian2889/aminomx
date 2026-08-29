#!/usr/bin/env python3
# Renders de vial estilo catálogo para Aminos MX — 1200×1200 PNG por producto.
import os, subprocess, sys

BASE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/opt/pw-browsers/chromium"

# (slug, nombre_lineas, dosis, color_hex, tipo, subtexto)
# tipo: 'powder' (liofilizado) | 'liquid' (agua bacteriostática)
PRODUCTS = [
    ("retatrutide-5",  ["RETATRUTIDE"],            "5 MG",   "#7C5CE0", "powder", ""),
    ("retatrutide-15", ["RETATRUTIDE"],            "15 MG",  "#7C5CE0", "powder", ""),
    ("retatrutide-20", ["RETATRUTIDE"],            "20 MG",  "#7C5CE0", "powder", ""),
    ("tirzepatide-5",  ["TIRZEPATIDE"],            "5 MG",   "#2E6BE6", "powder", ""),
    ("tirzepatide-15", ["TIRZEPATIDE"],            "15 MG",  "#2E6BE6", "powder", ""),
    ("hgh-fragment-5", ["HGH FRAGMENT", "176-191"],"5 MG",   "#F97362", "powder", ""),
    ("tesamorelin-10", ["TESAMORELIN"],            "10 MG",  "#0EA5A0", "powder", ""),
    ("ipamorelin-5",   ["IPAMORELIN"],             "5 MG",   "#10B981", "powder", ""),
    ("cjc1295-ipamorelin-blend", ["CJC-1295", "+ IPAMORELIN"], "5+5 MG", "#047857", "powder", "BLEND"),
    ("pegmgf-2",       ["PEG-MGF"],                "2 MG",   "#F59E0B", "powder", ""),
    ("hgh-24iu",       ["HGH 191AA"],              "24 UI",  "#33415C", "powder", "SOMATROPINA"),
    ("motsc-15",       ["MOTS-C"],                 "15 MG",  "#F43F5E", "powder", ""),
    ("ss31-10",        ["SS-31"],                  "10 MG",  "#C026D3", "powder", "ELAMIPRETIDE"),
    ("glow70-blend",   ["GLOW-70"],                "70 MG",  "#EC4899", "powder", "BPC-157 · GHK-CU · TB-500"),
    ("kpv-5",          ["KPV"],                    "5 MG",   "#84CC16", "powder", ""),
    ("cartalax-10",    ["CARTALAX"],               "10 MG",  "#EA580C", "powder", "ALA-GLU-ASP"),
    ("glutation-600",  ["GLUTATIÓN"],              "600 MG", "#38BDF8", "powder", ""),
    ("nad-500",        ["NAD+"],                   "500 MG", "#06B6D4", "powder", ""),
    ("ghkcu-50",       ["GHK-CU"],                 "50 MG",  "#C2703D", "powder", ""),
    ("agua-bacteriostatica-3ml",  ["AGUA", "BACTERIOSTÁTICA"], "3 ML",  "#8B9AAE", "liquid", "ALCOHOL BENCÍLICO 0.9%"),
    ("agua-bacteriostatica-10ml", ["AGUA", "BACTERIOSTÁTICA"], "10 ML", "#8B9AAE", "liquid", "ALCOHOL BENCÍLICO 0.9%"),
]

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def mix_white(h, pct):
    r, g, b = hex_to_rgb(h)
    m = lambda c: round(c + (255 - c) * pct)
    return f"#{m(r):02x}{m(g):02x}{m(b):02x}"

def darken(h, pct):
    r, g, b = hex_to_rgb(h)
    m = lambda c: round(c * (1 - pct))
    return f"#{m(r):02x}{m(g):02x}{m(b):02x}"

def luminance(h):
    r, g, b = hex_to_rgb(h)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

def html_for(slug, lines, dose, color, tipo, sub):
    bg1, bg2 = mix_white(color, 0.90), mix_white(color, 0.78)
    label_dark = darken(color, 0.28)
    light_label = luminance(color) > 0.62
    fg = "#1e2936" if light_label else "#ffffff"
    fg_soft = "rgba(30,41,54,.72)" if light_label else "rgba(255,255,255,.82)"
    badge_bg = "rgba(30,41,54,.10)" if light_label else "rgba(255,255,255,.18)"
    badge_bd = "rgba(30,41,54,.35)" if light_label else "rgba(255,255,255,.55)"

    # Nombre y subtítulo caben en ~268px (la marca vertical ocupa la franja
    # derecha de la etiqueta); el tamaño escala con la línea más larga.
    longest = max(len(x) for x in lines)
    fsize = min(56, int(268 / (0.62 * longest)))
    y0 = 428 + 74
    name_ts = "".join(
        f'<text x="478" y="{y0 + i * (fsize + 8)}" font-family="Inter" font-weight="800" '
        f'font-size="{fsize}" letter-spacing=".5" fill="{fg}">{l}</text>'
        for i, l in enumerate(lines))
    name_bottom = y0 + (len(lines) - 1) * (fsize + 8)
    sub_size = max(13, min(21, int((268 / max(1, len(sub)) - 2.2) / 0.54))) if sub else 0
    sub_t = (f'<text x="478" y="{name_bottom + 38}" font-family="Inter" font-weight="600" font-size="{sub_size}" '
             f'letter-spacing="2.2" fill="{fg_soft}">{sub}</text>') if sub else ""
    badge_y = name_bottom + (62 if sub else 34)

    # Contenido del vial: torta liofilizada o líquido
    if tipo == "powder":
        contenido = f'''
      <path d="M428 862 q34 -10 66 -4 q42 8 80 0 q42 -9 80 2 q28 7 118 2 L772 944 q0 28 -28 28 L456 972 q-28 0 -28 -28 Z"
            fill="url(#powder)"/>
      <path d="M428 862 q34 -10 66 -4 q42 8 80 0 q42 -9 80 2 q28 7 118 2" fill="none"
            stroke="#c9ced6" stroke-width="3" opacity=".8"/>'''
    else:
        contenido = f'''
      <rect x="424" y="806" width="272" height="170" rx="22" fill="url(#liquid)" opacity=".55"/>
      <ellipse cx="560" cy="810" rx="134" ry="10" fill="#dfeaf2" opacity=".95"/>
      <ellipse cx="560" cy="810" rx="110" ry="6" fill="#ffffff" opacity=".6"/>'''

    return f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Inter; src: url("file://{BASE}/fonts/inter_400.ttf"); font-weight: 400; }}
@font-face {{ font-family: Inter; src: url("file://{BASE}/fonts/inter_600.ttf"); font-weight: 600; }}
@font-face {{ font-family: Inter; src: url("file://{BASE}/fonts/inter_700.ttf"); font-weight: 700; }}
@font-face {{ font-family: Inter; src: url("file://{BASE}/fonts/inter_800.ttf"); font-weight: 800; }}
* {{ margin: 0; padding: 0; }}
html, body {{ width: 1200px; height: 1200px; overflow: hidden; }}
</style></head><body>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".42" r=".6">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".75"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8e959f"/><stop offset=".12" stop-color="#c9ced6"/>
      <stop offset=".3" stop-color="#f4f6f8"/><stop offset=".46" stop-color="#dfe3e8"/>
      <stop offset=".62" stop-color="#aab0b9"/><stop offset=".78" stop-color="#e8ebef"/>
      <stop offset=".92" stop-color="#b9bfc8"/><stop offset="1" stop-color="#878e98"/>
    </linearGradient>
    <linearGradient id="metalTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7f9fa"/><stop offset="1" stop-color="#c3c9d1"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b9c1cc"/><stop offset=".08" stop-color="#e9edf1"/>
      <stop offset=".2" stop-color="#fbfcfd"/><stop offset=".5" stop-color="#eef1f5"/>
      <stop offset=".82" stop-color="#e2e6ec"/><stop offset=".95" stop-color="#c3cad4"/>
      <stop offset="1" stop-color="#a8b1bd"/>
    </linearGradient>
    <linearGradient id="labelShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000000" stop-opacity=".30"/>
      <stop offset=".09" stop-color="#000000" stop-opacity=".10"/>
      <stop offset=".2" stop-color="#ffffff" stop-opacity=".16"/>
      <stop offset=".3" stop-color="#ffffff" stop-opacity=".02"/>
      <stop offset=".72" stop-color="#000000" stop-opacity="0"/>
      <stop offset=".9" stop-color="#000000" stop-opacity=".14"/>
      <stop offset="1" stop-color="#000000" stop-opacity=".32"/>
    </linearGradient>
    <linearGradient id="powder" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8ebee"/>
    </linearGradient>
    <linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfe3f0"/><stop offset="1" stop-color="#a8c6dd"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="soft8" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>

  <rect width="1200" height="1200" fill="url(#bg)"/>
  <rect width="1200" height="1200" fill="url(#glow)"/>

  <!-- sombra de piso -->
  <ellipse cx="575" cy="1052" rx="320" ry="44" fill="#000" opacity=".15" filter="url(#soft)"/>
  <ellipse cx="580" cy="1046" rx="205" ry="26" fill="#000" opacity=".17" filter="url(#soft8)"/>

  <g transform="rotate(-8 600 620)">
    <!-- tapa flip-off aluminio -->
    <rect x="456" y="126" width="288" height="34" rx="16" fill="url(#metalTop)"/>
    <rect x="446" y="150" width="308" height="98" rx="14" fill="url(#metal)"/>
    <rect x="450" y="152" width="300" height="12" rx="6" fill="#ffffff" opacity=".3"/>
    <rect x="446" y="236" width="308" height="10" fill="#6b727c" opacity=".35"/>
    <circle cx="600" cy="192" r="32" fill="#dfe3e8"/>
    <circle cx="600" cy="192" r="32" fill="none" stroke="#8f96a0" stroke-width="2" opacity=".55"/>
    <circle cx="600" cy="192" r="22" fill="#eef1f4" opacity=".8"/>
    <!-- faldón crimp -->
    <rect x="440" y="244" width="320" height="30" rx="8" fill="url(#metal)"/>
    <g opacity=".35">{"".join(f'<rect x="{452 + i * 20}" y="246" width="2.5" height="26" fill="#5d646e"/>' for i in range(15))}</g>

    <!-- cuello y hombro de vidrio -->
    <path d="M472 274 L728 274 L728 300 Q744 316 752 340 L752 356 L448 356 L448 340 Q456 316 472 300 Z"
          fill="url(#glass)"/>
    <rect x="480" y="278" width="20" height="70" fill="#ffffff" opacity=".55" filter="url(#soft8)"/>

    <!-- cuerpo de vidrio -->
    <rect x="416" y="352" width="368" height="640" rx="46" fill="url(#glass)"/>
    <!-- pared interior superior -->
    <rect x="432" y="360" width="336" height="52" rx="20" fill="#f6f8fa" opacity=".7"/>

    <!-- contenido -->
    {contenido}

    <!-- etiqueta -->
    <g>
      <rect x="416" y="428" width="368" height="360" fill="{color}"/>
      <rect x="416" y="428" width="368" height="360" fill="url(#labelShade)"/>
      <rect x="416" y="428" width="368" height="4" fill="#000" opacity=".14"/>
      <rect x="416" y="784" width="368" height="4" fill="#000" opacity=".18"/>

      {name_ts}
      {sub_t}

      <!-- badge de dosis -->
      <rect x="478" y="{badge_y}" rx="26" width="{60 + len(dose) * 17}" height="52" fill="{badge_bg}"
            stroke="{badge_bd}" stroke-width="2.5"/>
      <text x="{478 + (60 + len(dose) * 17) / 2}" y="{badge_y + 35}" text-anchor="middle" font-family="Inter"
            font-weight="700" font-size="27" letter-spacing="2" fill="{fg}">{dose}</text>

      <!-- sello inferior -->
      <rect x="478" y="712" rx="19" width="196" height="38" fill="none" stroke="{badge_bd}" stroke-width="2"/>
      <text x="576" y="738" text-anchor="middle" font-family="Inter" font-weight="600" font-size="20"
            letter-spacing="1.5" fill="{fg}">PUREZA ≥ 99%</text>
      <text x="478" y="775" font-family="Inter" font-weight="600" font-size="15" letter-spacing="3.5"
            fill="{fg_soft}">RESEARCH USE ONLY</text>

      <!-- marca vertical -->
      <g transform="translate(748,776) rotate(-90)">
        <text x="0" y="0" font-family="Inter" font-weight="800" font-size="52" letter-spacing=".5" fill="{fg}">aminos<tspan opacity=".62">mx</tspan></text>
      </g>
    </g>

    <!-- reflejos de vidrio sobre todo -->
    <rect x="430" y="360" width="30" height="624" rx="15" fill="#ffffff" opacity=".45" filter="url(#soft8)"/>
    <rect x="438" y="368" width="10" height="608" rx="5" fill="#ffffff" opacity=".7"/>
    <rect x="722" y="376" width="16" height="600" rx="8" fill="#ffffff" opacity=".3" filter="url(#soft8)"/>
    <!-- base del vidrio -->
    <ellipse cx="600" cy="978" rx="176" ry="16" fill="#c8cfd8" opacity=".65"/>
    <ellipse cx="600" cy="972" rx="150" ry="10" fill="#ffffff" opacity=".5"/>
  </g>
</svg>
</body></html>'''

def render(slugs=None):
    os.makedirs(f"{BASE}/out", exist_ok=True)
    for slug, lines, dose, color, tipo, sub in PRODUCTS:
        if slugs and slug not in slugs:
            continue
        html_path = f"{BASE}/out/{slug}.html"
        png_path = f"{BASE}/out/{slug}.png"
        with open(html_path, "w") as f:
            f.write(html_for(slug, lines, dose, color, tipo, sub))
        subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
                        "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--window-size=1200,1200", f"--screenshot={png_path}",
                        f"file://{html_path}"], capture_output=True)
        print(slug, "→", os.path.getsize(png_path) if os.path.exists(png_path) else "FALLO")

if __name__ == "__main__":
    render(sys.argv[1:] or None)
