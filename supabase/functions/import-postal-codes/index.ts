// ============================================================================
// import-postal-codes — RETIRADA. El worker de Edge Functions no alcanza el
// cómputo para parsear e insertar las ~146k filas de SEPOMEX; el catálogo se
// carga por REST con tools/load-postal-codes.py (cuenta staff/admin, política
// postal_codes_staff_insert). Este stub queda para que el slug desplegado no
// confunda: responde 410 con la instrucción.
// ============================================================================
import { json } from '../_shared/cors.ts';

Deno.serve(() =>
  json({
    error: 'Retirada: carga el catálogo con tools/load-postal-codes.py del repositorio.',
  }, 410));
