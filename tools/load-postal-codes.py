#!/usr/bin/env python3
"""Carga/refresca el catálogo SEPOMEX en public.postal_codes.

Uso:
  python3 load-postal-codes.py sepomex.csv admin@aminosmx.com <password>

El CSV es el dump público (idEstado,estado,idMunicipio,municipio,ciudad,zona,
cp,asentamiento,tipo), p. ej.:
https://raw.githubusercontent.com/redrbrt/sepomex-zip-codes/master/sepomex_abril-2016.csv

Requiere una cuenta staff/admin (política postal_codes_staff_insert). Antes de
recargar, borra el contenido con la política de delete o pide un TRUNCATE.
"""
import csv, json, sys, urllib.request

BASE = "https://hsjdiwqoakmcwultfksj.supabase.co"
APIKEY = "sb_publishable_-tqa9xesQeXjw5T5OOkfsw_3nVbGtVQ"
CHUNK = 4000


def req(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(r) as resp:
        return resp.status, resp.read()


def main(csv_path, email, password):
    st, body = req(f"{BASE}/auth/v1/token?grant_type=password",
                   json.dumps({"email": email, "password": password}).encode(),
                   {"apikey": APIKEY, "Content-Type": "application/json"})
    tok = json.loads(body)["access_token"]
    H = {"apikey": APIKEY, "Authorization": f"Bearer {tok}",
         "Content-Type": "application/json", "Prefer": "return=minimal"}

    rows = []
    with open(csv_path, encoding="utf-8", errors="replace") as f:
        for c in list(csv.reader(f))[1:]:
            # El dump quita ceros iniciales (CDMX: "1000" = 01000) → zfill.
            cp = c[6].strip().zfill(5) if len(c) >= 9 else ""
            if not cp.isdigit() or len(cp) != 5:
                continue
            ciudad = c[4].strip()
            rows.append({"cp": cp, "colonia": c[7].strip(),
                         "municipio": c[3].strip(), "estado": c[1].strip(),
                         "ciudad": None if ciudad in ("", "NULL") else ciudad})
    print(f"{len(rows)} filas por insertar")

    for i in range(0, len(rows), CHUNK):
        st, _ = req(f"{BASE}/rest/v1/postal_codes",
                    json.dumps(rows[i:i + CHUNK]).encode(), H, "POST")
        if st not in (200, 201, 204):
            sys.exit(f"insert falló en {i}: HTTP {st}")
        print(f"  {min(i + CHUNK, len(rows))}/{len(rows)}", end="\r")
    print("\nlisto")


if __name__ == "__main__":
    main(*sys.argv[1:4])
