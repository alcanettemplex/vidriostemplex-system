/**
 * Script: 2026-09-01_diagnostico_reintentos_updateodp.ts
 *
 * Propósito: SOLO LECTURA. Detectar efectos secundarios duplicados por reintentos de
 *            usuario durante la ventana en que `updateODP` respondía 500 aunque el
 *            cambio SÍ se había guardado.
 *
 * Contexto: el commit 6f216f9 (desplegado 2026-08-28 12:58:40 GMT-5) introdujo un
 *           segundo `await transaction.commit()` al final de updateODP. El commit real
 *           (línea ~1116) ya había pasado con éxito; el segundo reventaba y caía en el
 *           catch genérico → 500 "Error al actualizar ODP". El dato quedaba guardado,
 *           pero el usuario veía error y probablemente reintentó.
 *           Corregido por 1ea28a5 (desplegado 2026-08-31 08:55:36 GMT-5).
 *
 * Qué puede haberse duplicado (los `.create()` de updateODP):
 *   - ODPItem            → ítems nuevos (sin id en el payload) se recrean en cada intento
 *   - HistorialEstadoODP → 3 puntos de inserción (medición, cambio de estado, reactivación NC)
 *   - PedidoPV           → al declarar proveedor_vidrio
 *
 * Método: `odp_items` tiene timestamps:false, así que no se puede fechar la fila
 *         directamente. Se usa `auditoria_log` (que sí tiene `fecha`) para ubicar los
 *         INSERT dentro de la ventana, se agrupan en "lotes" por proximidad temporal
 *         (cada lote ≈ una ejecución de updateODP) y se marca como sospechoso el caso
 *         de una misma ODP con ≥2 lotes cuyas firmas de ítem se repiten entre lotes.
 *         Esto distingue el reintento (lotes separados) de lo legítimo (4 ventanas
 *         iguales cargadas de una sola vez = un solo lote).
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-01_diagnostico_reintentos_updateodp.ts
 * NO MODIFICA NADA. Solo SELECT.
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const INICIO = '2026-08-28 12:58:40-05'; // deploy de 6f216f9 (bug introducido)
const FIN = '2026-08-31 08:55:36-05';    // deploy de 1ea28a5 (bug corregido)

// Campos que definen "el mismo ítem" desde el punto de vista del usuario.
const CAMPOS_FIRMA = [
  'item', 'color', 'espesor', 'cantidad', 'ancho_mm', 'alto_mm',
  'tipo_vidrio', 'accesorios', 'prod', 'pulidos', 'pulidos_h',
  'perforaciones', 'boquetes', 'descuentos', 'otros',
];

interface FilaAudit {
  id: string;
  registro_id: string | null;
  datos_nuevos: Record<string, unknown> | null;
  usuario_id: number | null;
  usuario_nombre: string | null;
  fecha: Date;
}

function firmaDe(d: Record<string, unknown> | null): string {
  if (!d) return '(sin datos)';
  return CAMPOS_FIRMA.map((c) => String(d[c] ?? '')).join('|');
}

function agruparEnLotes<T extends { fecha: Date }>(filas: T[], gapMs = 5000): T[][] {
  const orden = [...filas].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const lotes: T[][] = [];
  let actual: T[] = [];
  for (const f of orden) {
    if (actual.length === 0) { actual = [f]; continue; }
    const prev = actual[actual.length - 1];
    if (f.fecha.getTime() - prev.fecha.getTime() <= gapMs) actual.push(f);
    else { lotes.push(actual); actual = [f]; }
  }
  if (actual.length) lotes.push(actual);
  return lotes;
}

const fmt = (d: Date) =>
  new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false });

async function run() {
  console.log('=== Diagnóstico reintentos updateODP (bug commit() duplicado) ===');
  console.log(`Ventana: ${INICIO}  →  ${FIN}  (hora Colombia)\n`);

  // ---------------------------------------------------------------------------
  // 0. Cobertura de auditoría — sin esto, todo lo demás es un falso negativo
  // ---------------------------------------------------------------------------
  const cobertura = await sequelize.query<{ min: Date | null; max: Date | null; total: string }>(
    `SELECT MIN(fecha) AS min, MAX(fecha) AS max, COUNT(*)::text AS total
       FROM auditoria_log
      WHERE fecha BETWEEN :ini AND :fin`,
    { type: QueryTypes.SELECT, replacements: { ini: INICIO, fin: FIN } }
  );
  const cob = cobertura[0];
  console.log('--- 0. Cobertura de auditoria_log en la ventana ---');
  console.log(`  Registros totales: ${cob.total}`);
  console.log(`  Primero: ${cob.min ? fmt(cob.min) : '—'}`);
  console.log(`  Último:  ${cob.max ? fmt(cob.max) : '—'}`);
  if (Number(cob.total) === 0) {
    console.log('\n  ⚠️  No hay auditoría en la ventana. El diagnóstico no puede concluir nada.');
    await sequelize.close();
    return;
  }
  console.log();

  // ---------------------------------------------------------------------------
  // 1. ODPItem — INSERTs en la ventana, agrupados en lotes por ODP
  // ---------------------------------------------------------------------------
  const inserts = await sequelize.query<FilaAudit>(
    `SELECT id::text, registro_id, datos_nuevos, usuario_id, usuario_nombre, fecha
       FROM auditoria_log
      WHERE tabla = 'odp_items'
        AND operacion = 'INSERT'
        AND fecha BETWEEN :ini AND :fin
      ORDER BY fecha ASC`,
    { type: QueryTypes.SELECT, replacements: { ini: INICIO, fin: FIN } }
  );

  console.log('--- 1. ODPItem: INSERT en la ventana ---');
  console.log(`  Total de ítems insertados: ${inserts.length}`);

  const porODP = new Map<string, FilaAudit[]>();
  for (const f of inserts) {
    const odpId = String((f.datos_nuevos as any)?.odp_id ?? 'desconocida');
    if (!porODP.has(odpId)) porODP.set(odpId, []);
    porODP.get(odpId)!.push(f);
  }
  console.log(`  ODPs afectadas: ${porODP.size}\n`);

  interface Sospecha {
    odpId: string;
    lotes: number;
    firmasRepetidas: string[];
    idsSospechosos: number[];
    detalle: { lote: number; fecha: string; usuario: string; ids: number[]; firmas: string[] }[];
  }
  const sospechas: Sospecha[] = [];

  for (const [odpId, filas] of porODP) {
    const lotes = agruparEnLotes(filas);
    if (lotes.length < 2) continue; // un solo lote = una sola ejecución, no hay reintento

    const firmasPorLote = lotes.map((l) => l.map((f) => firmaDe(f.datos_nuevos)));
    const repetidas = new Set<string>();
    for (let i = 0; i < firmasPorLote.length; i++) {
      for (let j = i + 1; j < firmasPorLote.length; j++) {
        for (const s of firmasPorLote[i]) {
          if (firmasPorLote[j].includes(s)) repetidas.add(s);
        }
      }
    }
    if (repetidas.size === 0) continue; // lotes distintos = ediciones legítimas distintas

    // ids de los lotes 2..n cuya firma ya existía en un lote anterior = las copias
    const idsSospechosos: number[] = [];
    for (let i = 1; i < lotes.length; i++) {
      const previas = firmasPorLote.slice(0, i).flat();
      lotes[i].forEach((f) => {
        if (previas.includes(firmaDe(f.datos_nuevos)) && f.registro_id) {
          idsSospechosos.push(Number(f.registro_id));
        }
      });
    }

    sospechas.push({
      odpId,
      lotes: lotes.length,
      firmasRepetidas: [...repetidas],
      idsSospechosos,
      detalle: lotes.map((l, i) => ({
        lote: i + 1,
        fecha: fmt(l[0].fecha),
        usuario: l[0].usuario_nombre ?? `id:${l[0].usuario_id ?? '?'}`,
        ids: l.map((f) => Number(f.registro_id)).filter(Boolean),
        firmas: l.map((f) => firmaDe(f.datos_nuevos)),
      })),
    });
  }

  if (sospechas.length === 0) {
    console.log('  ✅ Ninguna ODP recibió lotes de ítems repetidos. Sin duplicación por reintento.\n');
  } else {
    console.log(`  ⚠️  ${sospechas.length} ODP(s) con lotes de ítems repetidos:\n`);
    for (const s of sospechas) {
      const numero = await sequelize.query<{ numero_odp: string }>(
        `SELECT numero_odp FROM odp WHERE id = :id`,
        { type: QueryTypes.SELECT, replacements: { id: Number(s.odpId) } }
      );
      const etiqueta = numero[0]?.numero_odp ?? `(id ${s.odpId})`;
      console.log(`  ▸ ODP ${etiqueta} (id ${s.odpId}) — ${s.lotes} lotes, ${s.firmasRepetidas.length} firma(s) repetida(s)`);
      for (const d of s.detalle) {
        console.log(`      lote ${d.lote} · ${d.fecha} · ${d.usuario} · ítems ${d.ids.join(', ')}`);
      }

      // ¿siguen vivas hoy esas filas?
      if (s.idsSospechosos.length) {
        const vivos = await sequelize.query<{ id: number; item: string; ancho_mm: number; alto_mm: number; cantidad: number }>(
          `SELECT id, item, ancho_mm, alto_mm, cantidad FROM odp_items WHERE id IN (:ids)`,
          { type: QueryTypes.SELECT, replacements: { ids: s.idsSospechosos } }
        );
        console.log(`      copias candidatas: ${s.idsSospechosos.join(', ')}`);
        console.log(`      → SIGUEN EN BD HOY: ${vivos.length}/${s.idsSospechosos.length}`);
        for (const v of vivos) {
          console.log(`         · id ${v.id}: ${v.item} ${v.ancho_mm}x${v.alto_mm} cant=${v.cantidad}`);
        }
      }
      console.log();
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Estado ACTUAL: firmas repetidas dentro de una misma ODP (independiente de auditoría)
  // ---------------------------------------------------------------------------
  console.log('--- 2. odp_items HOY: firmas repetidas dentro de la misma ODP ---');
  const dupHoy = await sequelize.query<{
    odp_id: number; numero_odp: string; item: string; ancho_mm: number;
    alto_mm: number; cantidad: number; veces: string; ids: string;
  }>(
    `SELECT i.odp_id,
            o.numero_odp,
            i.item, i.ancho_mm, i.alto_mm, i.cantidad,
            COUNT(*)::text AS veces,
            string_agg(i.id::text, ', ' ORDER BY i.id) AS ids
       FROM odp_items i
       JOIN odp o ON o.id = i.odp_id
      WHERE i.id IN (
        SELECT (a.registro_id)::int
          FROM auditoria_log a
         WHERE a.tabla = 'odp_items' AND a.operacion = 'INSERT'
           AND a.fecha BETWEEN :ini AND :fin
           AND a.registro_id ~ '^[0-9]+$'
      )
      GROUP BY i.odp_id, o.numero_odp, i.item, i.ancho_mm, i.alto_mm, i.cantidad,
               COALESCE(i.color,''), COALESCE(i.espesor,''), COALESCE(i.tipo_vidrio,''),
               COALESCE(i.accesorios,''), COALESCE(i.prod,'')
     HAVING COUNT(*) > 1
      ORDER BY i.odp_id`,
    { type: QueryTypes.SELECT, replacements: { ini: INICIO, fin: FIN } }
  );
  if (dupHoy.length === 0) {
    console.log('  ✅ Ningún ítem creado en la ventana está repetido hoy dentro de su ODP.\n');
  } else {
    for (const d of dupHoy) {
      console.log(`  ⚠️  ODP ${d.numero_odp} (id ${d.odp_id}) — "${d.item}" ${d.ancho_mm}x${d.alto_mm} cant=${d.cantidad} × ${d.veces} → ids ${d.ids}`);
    }
    console.log();
  }

  // ---------------------------------------------------------------------------
  // 3. HistorialEstadoODP duplicado
  // ---------------------------------------------------------------------------
  console.log('--- 3. historial_estados_odp: transiciones idénticas repetidas ---');
  const histDup = await sequelize.query<{
    odp_id: number; numero_odp: string; estado_anterior: string; estado_nuevo: string;
    veces: string; primera: Date; ultima: Date; ids: string;
  }>(
    `SELECT h.odp_id, o.numero_odp, h.estado_anterior, h.estado_nuevo,
            COUNT(*)::text AS veces, MIN(h.fecha) AS primera, MAX(h.fecha) AS ultima,
            string_agg(h.id::text, ', ' ORDER BY h.id) AS ids
       FROM historial_estados_odp h
       JOIN odp o ON o.id = h.odp_id
      WHERE h.fecha BETWEEN :ini AND :fin
      GROUP BY h.odp_id, o.numero_odp, h.estado_anterior, h.estado_nuevo
     HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT, replacements: { ini: INICIO, fin: FIN } }
  );
  if (histDup.length === 0) {
    console.log('  ✅ Sin transiciones duplicadas en la ventana.\n');
  } else {
    for (const h of histDup) {
      console.log(`  ⚠️  ODP ${h.numero_odp} — ${h.estado_anterior} → ${h.estado_nuevo} × ${h.veces}`);
      console.log(`        ${fmt(h.primera)}  …  ${fmt(h.ultima)}   (ids ${h.ids})`);
    }
    console.log();
  }

  // ---------------------------------------------------------------------------
  // 4. PedidoPV duplicado por ODP
  // ---------------------------------------------------------------------------
  console.log('--- 4. pedido_pv: más de un pedido por ODP ---');
  const pvDup = await sequelize.query<{
    odp_id: number; numero_odp: string; veces: string; numeros: string;
  }>(
    `SELECT p.odp_id, o.numero_odp, COUNT(*)::text AS veces,
            string_agg(p.numero_pedido::text, ', ' ORDER BY p.id) AS numeros
       FROM pedido_pv p
       JOIN odp o ON o.id = p.odp_id
      WHERE p.odp_id IN (
        -- pedido_pv tiene timestamps:false → se fecha vía auditoría, igual que odp_items
        SELECT DISTINCT (a.datos_nuevos->>'odp_id')::int
          FROM auditoria_log a
         WHERE a.tabla = 'pedido_pv' AND a.operacion = 'INSERT'
           AND a.fecha BETWEEN :ini AND :fin
           AND a.datos_nuevos->>'odp_id' ~ '^[0-9]+$'
      )
      GROUP BY p.odp_id, o.numero_odp
     HAVING COUNT(*) > 1
      ORDER BY p.odp_id`,
    { type: QueryTypes.SELECT, replacements: { ini: INICIO, fin: FIN } }
  );
  if (pvDup.length === 0) {
    console.log('  ✅ Ninguna ODP con PedidoPV creado en la ventana tiene más de uno.\n');
  } else {
    for (const p of pvDup) {
      console.log(`  ⚠️  ODP ${p.numero_odp} (id ${p.odp_id}) — ${p.veces} pedidos: ${p.numeros}`);
    }
    console.log();
  }

  // ---------------------------------------------------------------------------
  // 5. Magnitud: cuántas ODPs se editaron en la ventana (denominador del riesgo)
  // ---------------------------------------------------------------------------
  const editadas = await sequelize.query<{ total: string; odps: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(DISTINCT registro_id)::text AS odps
       FROM auditoria_log
      WHERE tabla = 'odp' AND operacion = 'UPDATE'
        AND fecha BETWEEN :ini AND :fin`,
    { type: QueryTypes.SELECT, replacements: { ini: INICIO, fin: FIN } }
  );
  console.log('--- 5. Magnitud de exposición ---');
  console.log(`  UPDATEs sobre 'odp' en la ventana: ${editadas[0].total} sobre ${editadas[0].odps} ODP(s) distintas`);
  console.log('  (cada uno respondió 500 al usuario aunque el dato quedó guardado)\n');

  await sequelize.close();
  console.log('=== Fin del diagnóstico (no se modificó nada) ===');
}

run().catch(async (e) => {
  console.error('Error en el diagnóstico:', e);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
