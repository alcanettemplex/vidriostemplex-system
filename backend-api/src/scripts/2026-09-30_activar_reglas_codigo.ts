/**
 * Script: 2026-09-30_activar_reglas_codigo.ts
 *
 * Activa las reglas de código decididas por el usuario el 2026-09-30 y las aplica a
 * la bandeja actual:
 *   · GRUPO ROLDAN (1044)        QUITAR_PREFIJO_LINEA  AUTO
 *   · VENTANAS Y PUERTAS (829)   SUFIJO_RETAL          AUTO
 *   · VEA (1051)                 IGNORAR_MANO          SUGERENCIA — el catálogo no distingue
 *                                la mano, pero aún no hay ningún par mapeado que lo pruebe
 *   · HI-TECH queda SIN regla: falta decidir si se unen anchos de rollo con precio
 *     por metro distinto.
 *
 * No reimplementa nada: invoca el handler `configurarReglaCodigo` del endpoint
 * `POST /api/proveedores/:id/regla-codigo`, así que pasa por la misma validación
 * (errores contra los mapeos humanos bloquean; AUTO exige al menos un acierto) y por
 * `vincularPendientePorRegla`, el mismo camino que usará la pantalla.
 *
 * Por defecto previsualiza; `--aplicar` escribe.
 *   npx ts-node --files src/scripts/2026-09-30_activar_reglas_codigo.ts [--aplicar]
 * Requiere la migración 2026-09-30_reglas_codigo_proveedor.ts. NO corre con `npm run dev`.
 * Después: recargar la caché del Cotizador en el backend que esté corriendo
 * (POST /api/cotizador/recargar) si el resumen reporta cambios de costo.
 */
import { sequelize } from '../models';
import { precargar } from '../cotizador/cache';
import { configurarReglaCodigo } from '../controllers/proveedor.controller';

const APLICAR = process.argv.includes('--aplicar');
const USUARIO_ROOT = 30;

const DECISIONES = [
  { id: 1044, regla: 'QUITAR_PREFIJO_LINEA', modo: 'AUTO' },
  { id: 829, regla: 'SUFIJO_RETAL', modo: 'AUTO' },
  { id: 1051, regla: 'IGNORAR_MANO', modo: 'SUGERENCIA' },
] as const;

/** Respuesta mínima de Express: captura status y cuerpo. */
function respuesta() {
  const r: any = { statusCode: 200, cuerpo: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.cuerpo = b; return r; };
  return r;
}

async function main() {
  // El recálculo del Cotizador lee su caché para respetar los productos dados de baja
  await precargar();
  console.log(`=== Reglas de código — ${APLICAR ? 'APLICANDO' : 'previsualización'} ===`);

  for (const d of DECISIONES) {
    const req: any = {
      params: { id: String(d.id) },
      body: { regla: d.regla, modo: d.modo, aplicar_bandeja: true, dry_run: !APLICAR },
      user: { id: USUARIO_ROOT, rol: 'root' },
    };
    const res = respuesta();
    await configurarReglaCodigo(req, res);
    const b = res.cuerpo ?? {};
    console.log(`\n── ${b.proveedor?.nombre ?? d.id} · ${b.regla_titulo ?? d.regla} · ${d.modo} → HTTP ${res.statusCode}`);
    if (res.statusCode !== 200) { console.log(b); continue; }
    console.log(`   Evidencia: ${b.evidencia.aciertos.length} acierto(s), ${b.evidencia.errores.length} error(es) · modos permitidos: ${b.modos_permitidos.join(', ') || 'ninguno'}`);
    if (b.bloqueo) console.log(`   BLOQUEADA: ${b.bloqueo}`);
    console.table(b.evidencia.aciertos.map((a: any) => ({ a: a.codigo_a, b: a.codigo_b, producto: a.producto?.codigo })));
    console.table(b.previsualizacion.map((p: any) => ({
      codigo: p.codigo, accion: p.accion, producto: p.producto?.codigo, modalidad: p.unidad_compra,
      via: p.via_codigo, variacion: p.variacion_pct === null ? '' : `${Number(p.variacion_pct).toFixed(1)} %`, motivo: p.motivo ?? '',
    })));
    if (APLICAR) {
      console.log(`   ${b.message}`);
      if (b.vinculados?.length) console.table(b.vinculados);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // La cola del Cotizador corre en setImmediate tras cada commit: se le da tiempo
  .finally(() => setTimeout(() => sequelize.close(), 6000));
